/*
 * SKY ACE 关卡模式（线性折线航图）
 * 纯 canvas 矢量 + 触摸；不加载任何 Image / 贴图 / 远程头像。
 * 接入方式同 garage.js。
 *
 *   const lv = PapaLevels.create({
 *     ctx, size, safe, storage,
 *     onExit: () => {},
 *     onEnterLevel: (node) => {},  // 战斗关
 *     onRest: (node) => {},        // 修整 → 机库
 *   });
 *   每帧 lv.frame(now)；触摸 lv.touchStart/Move/End
 *   lv.markComplete(nodeId) / lv.resetProgress()
 */
(function (root) {
  // 关卡页：纯 canvas 矢量绘制，禁止 Image / 贴图 / data-URI 头像等额外资源加载
  // v2：全员进度重置后启用；忽略旧版本地存档
  const SAVE_KEY = "papa.levels.progress.v3";
  const STAR_KEY = "papa_total_star_shards";

  const TYPE_META = {
    start: { lab: "起点", accent: "#7ad7ff" },
    encounter: { lab: "遭遇战", accent: "#7ad7ff" },
    resource: { lab: "资源争夺战", accent: "#ffe08a" },
    assault: { lab: "攻坚战", accent: "#ff5a78" },
    rest: { lab: "修整", accent: "#78ff5a" },
  };
  const LINEAR_TYPES = [
    "start",
    "encounter", "resource", "encounter", "assault",
    "resource", "resource", "assault",
    "rest", "encounter", "resource", "encounter", "assault",
  ];
  const LINEAR_TITLES = [
    "起点",
    "外环遭遇", "碎星矿带", "寂静伏击", "穿越火线",
    "断板行动", "补给截击", "要塞突袭",
    "整备锚点", "深空遭遇", "星碎争夺", "前线冲锋", "核心攻坚",
  ];

  /**
   * 每关玩法 / 过关条件（按航图 col；未实现关用类型兜底）
   * play：怎么玩；win：怎样算过关
   */
  const LEVEL_BRIEFS = {
    0: {
      play: "航线起点，整备后进入下一关。",
      win: "启航前往下一关。",
    },
    1: {
      play: "与敌机缠斗，注意走位与火力。",
      win: "击毁敌机过关；被毁失败。",
    },
    2: {
      play: "迎战敌方母舰，集中火力打击本体。",
      win: "打爆母舰过关；被毁失败。",
    },
    3: {
      play: "靠近空中地雷按拆除；碰雷会爆炸。",
      win: "拆完所有地雷过关；被毁失败。",
    },
    4: {
      play: "从左向右突进，沿途躲避突击火力。",
      win: "飞入右侧终点区过关；被毁失败。",
    },
    5: {
      play: "每颗卫星有巡逻机守护。远处可开火；靠近后剪断电板，再把卫星抓进飞船，最后飞向撤离点。",
      win: "剪断全部电板并抓取两颗卫星，飞入撤离点过关；被毁失败。",
    },
  };
  const TYPE_BRIEFS = {
    start: { play: "航线起点。", win: "进入下一关启航。" },
    encounter: { play: "遭遇敌机缠斗，利用武器与走位击毁对方。", win: "击毁全部敌机过关；被毁失败。（后续开放）" },
    resource: { play: "资源争夺：摧毁关键目标、控制战场。", win: "完成争夺目标过关；被毁失败。（后续开放）" },
    assault: { play: "攻坚战：突破防线，摧毁核心目标。", win: "摧毁核心目标过关；被毁失败。（后续开放）" },
    rest: { play: "修整停靠，可改装武器。", win: "完成修整后继续航线。" },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function briefOf(n) {
    if (!n) return TYPE_BRIEFS.encounter;
    if (LEVEL_BRIEFS[n.col]) return LEVEL_BRIEFS[n.col];
    return TYPE_BRIEFS[n.type] || TYPE_BRIEFS.encounter;
  }

  function create(host) {
    const ctx = host.ctx;
    const storage = host.storage || { get() { return null; }, set() {} };
    let W = 0, H = 0, S = { l: 0, r: 0, t: 0, b: 0, cap: 0 };

    let view = "map"; // map | preview
    let pending = null;
    let inviteCode = "";
    let scrollX = 0;
    let contentW = 800;
    let pulseT = 0;

    const map = buildMap();
    loadProgress();

    let hits = [];
    function addHit(x, y, w, h, opt) { hits.push(Object.assign({ x, y, w, h }, opt)); }
    function hitAt(x, y) {
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
      }
      return null;
    }

    const drag = { on: false, id: -1, x: 0, sx: 0, moved: false };
    const taps = new Map();

    function buildMap() {
      const list = LINEAR_TYPES.map((type, i) => {
        const stars = type === "assault" ? (i >= LINEAR_TYPES.length - 1 ? 4 : 3)
          : type === "resource" ? 2 + (i > 5 ? 1 : 0)
          : type === "encounter" ? 1 + (i > 4 ? 1 : 0)
          : 0;
        return {
          id: "n" + i, col: i, type, title: LINEAR_TITLES[i] || TYPE_META[type].lab,
          stars, accent: TYPE_META[type].accent, done: false, assist: null,
          x: 0, y: 0, next: i < LINEAR_TYPES.length - 1 ? ["n" + (i + 1)] : [],
        };
      });
      const nodes = {};
      list.forEach((n) => { nodes[n.id] = n; });
      return { list, nodes, depthMax: list.length - 1 };
    }

    function availableIds() {
      const set = new Set();
      for (let i = 1; i < map.list.length; i++) {
        if (!map.list.slice(0, i).every((n) => n.done)) break;
        set.add(map.list[i].id);
      }
      return set;
    }

    function readStars() {
      try { return Math.max(0, Number(storage.get(STAR_KEY)) || 0); } catch (e) { return 0; }
    }

    function saveProgress() {
      try {
        // 只存通关 id；助战位是会话态，不落盘（避免旧版 data-URI 头像占存储）
        storage.set(SAVE_KEY, JSON.stringify({
          done: map.list.filter((n) => n.done).map((n) => n.id),
        }));
      } catch (e) {}
    }

    function loadProgress() {
      try {
        // 丢掉旧版进度，避免重置后被本地旧档回写
        try {
          storage.set("papa.levels.progress.v1", "");
          storage.set("papa.levels.progress.v2", "");
        } catch (e) {}
        const raw = storage.get(SAVE_KEY);
        if (!raw) {
          map.list.forEach((n) => { n.done = false; n.assist = null; });
          map.list[0].done = true;
          saveProgress();
          return;
        }
        const data = JSON.parse(raw);
        const done = new Set(data.done || []);
        map.list.forEach((n) => { n.done = done.has(n.id); n.assist = null; });
        map.list[0].done = true;
      } catch (e) {
        map.list.forEach((n) => { n.done = false; n.assist = null; });
        map.list[0].done = true;
      }
    }

    function resetProgress() {
      map.list.forEach((n) => { n.done = false; n.assist = null; });
      map.list[0].done = true;
      saveProgress();
    }

    function getDoneIds() {
      const ids = map.list.filter((n) => n.done).map((n) => n.id);
      if (!ids.includes("n0")) ids.unshift("n0");
      return ids;
    }

    /** 以服务器列表为准整表覆盖（进关卡拉取）；不做本地并集 */
    function applyServerProgress(doneIds) {
      const set = new Set();
      const incoming = Array.isArray(doneIds) ? doneIds : [];
      for (const id of incoming) {
        const s = String(id || "");
        if (/^n\d{1,3}$/.test(s)) set.add(s);
      }
      set.add("n0");
      map.list.forEach((n) => { n.done = set.has(n.id); n.assist = n.assist || null; });
      map.list[0].done = true;
      saveProgress();
      return getDoneIds();
    }

    function markComplete(nodeId) {
      const n = map.nodes[nodeId];
      if (!n) return getDoneIds();
      n.done = true;
      saveProgress();
      view = "map";
      pending = null;
      const done = getDoneIds();
      try {
        if (typeof GameGlobal !== "undefined" && typeof GameGlobal.pushLevelsProgressToServer === "function") {
          GameGlobal.pushLevelsProgressToServer(done);
        }
      } catch (e) {}
      return done;
    }

    function layoutNodes() {
      const list = map.list;
      const nCount = list.length;
      const gap = 110;
      const padX = 64;
      const mapH = H - S.t - S.b - 70;
      contentW = Math.max(W - S.l - S.r, padX * 2 + (nCount - 1) * gap);
      const midY = S.t + 52 + mapH * 0.48;
      const amp = Math.min(72, mapH * 0.22);
      list.forEach((n, i) => {
        n.x = padX + i * ((contentW - padX * 2) / Math.max(1, nCount - 1));
        n.y = midY + (i % 2 === 0 ? -amp : amp);
      });
      scrollX = clamp(scrollX, 0, Math.max(0, contentW - (W - S.l - S.r)));
    }

    // ---------- 绘制 ----------
    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function bg() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0a1420");
      g.addColorStop(1, "#071018");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const rg = ctx.createRadialGradient(W * 0.15, H * 0.3, 20, W * 0.15, H * 0.3, W * 0.55);
      rg.addColorStop(0, "rgba(80,180,220,0.14)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    function drawIcon(kind, x, y, accent, scale) {
      const s = scale || 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (kind === "start" || kind === "encounter") {
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.stroke();
        [[0, -11], [0, 11], [-11, 0], [11, 0], [-8, -8], [8, 8], [8, -8], [-8, 8]].forEach((p) => {
          ctx.beginPath();
          ctx.moveTo(p[0] * 0.45, p[1] * 0.45);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        });
      } else if (kind === "resource") {
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(10, -4); ctx.lineTo(10, 6); ctx.lineTo(0, 12); ctx.lineTo(-10, 6); ctx.lineTo(-10, -4);
        ctx.closePath(); ctx.stroke();
      } else if (kind === "assault") {
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
      } else if (kind === "rest") {
        ctx.beginPath();
        ctx.moveTo(0, 11);
        ctx.bezierCurveTo(-10, 4, -10, -4, 0, -10);
        ctx.bezierCurveTo(10, -4, 10, 4, 0, 11);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawMap() {
      layoutNodes();
      const avail = availableIds();
      const ox = S.l - scrollX;
      const list = map.list;

      // 折线
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        const ax = ox + a.x, ay = a.y, bx = ox + b.x, by = b.y;
        const mx = (ax + bx) / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(mx, ay);
        ctx.lineTo(mx, by);
        ctx.lineTo(bx, by);
        if (a.done && b.done) {
          ctx.strokeStyle = "rgba(122,215,255,0.85)";
          ctx.lineWidth = 2.4;
        } else {
          ctx.strokeStyle = "rgba(120,170,210,0.32)";
          ctx.lineWidth = 2.2;
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      list.forEach((n) => {
        const x = ox + n.x, y = n.y;
        const size = n.type === "assault" ? 58 : 52;
        const half = size / 2;
        const unlocked = avail.has(n.id);
        const locked = !n.done && !unlocked && n.id !== "n0";

        ctx.save();
        if (locked) { ctx.globalAlpha = 0.35; }
        else if (n.done && !unlocked) { ctx.globalAlpha = 0.7; }

        roundRect(x - half, y - half, size, size, 12);
        ctx.fillStyle = "rgba(12,22,34,0.94)";
        ctx.fill();
        ctx.strokeStyle = unlocked
          ? n.accent
          : (n.done ? "rgba(122,215,255,0.55)" : "rgba(140,200,220,0.28)");
        ctx.lineWidth = unlocked ? 2.2 : 1.5;
        if (unlocked) {
          const glow = 0.35 + 0.2 * Math.sin(pulseT * 3);
          ctx.shadowColor = n.accent;
          ctx.shadowBlur = 12 + glow * 10;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        drawIcon(n.type, x, y, locked ? "#6a7784" : n.accent, 1.05);

        // 角标：未解锁画锁 / 已过关打勾 / 可挑战无符号
        if (n.type !== "start") {
          if (locked) {
            const lx = x + half - 11;
            const ly = y - half + 5;
            ctx.strokeStyle = "rgba(190,200,210,0.95)";
            ctx.fillStyle = "rgba(190,200,210,0.95)";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(lx + 5, ly + 3.5, 3.2, Math.PI, 0, false);
            ctx.stroke();
            roundRect(lx + 1, ly + 4.5, 8, 7, 1.5);
            ctx.fill();
          } else if (n.done) {
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#7ad7ff";
            ctx.fillText("✓", x + half - 5, y - half + 2);
          }
        }

        // 助战小头像位（仅已解锁关）
        if (!locked) {
          const as = n.assist;
          const ax = x + half - 6, ay = y + half - 6;
          ctx.beginPath();
          ctx.arc(ax, ay, 9, 0, Math.PI * 2);
          ctx.fillStyle = as ? "rgba(255,224,138,0.25)" : "rgba(0,0,0,0.45)";
          ctx.fill();
          ctx.strokeStyle = as ? "#ffe08a" : "rgba(140,200,220,0.35)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = as ? "#ffe08a" : "#9eb0c0";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(as ? "友" : "+", ax, ay + 0.5);
        }

        ctx.restore();

        // 关卡号
        ctx.fillStyle = "rgba(180,205,225,0.85)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const labY = y + (y >= list[0].y ? half + 8 : -half - 18);
        ctx.fillText(n.type === "start" ? "起点" : ("第" + n.col + "关"), x, labY);

        if (!locked || n.type === "start") {
          addHit(x - half - 4, y - half - 4, size + 8, size + 8, {
            onTap: () => {
              if (drag.moved) return;
              pending = n;
              view = "preview";
            },
          });
        }
      });
    }

    function drawHeader() {
      const cleared = map.list.filter((n) => n.type !== "start" && n.done).length;
      const total = map.list.filter((n) => n.type !== "start").length;
      ctx.fillStyle = "#e8f2f8";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("航线闯关", S.l + 14, S.t + 10);
      ctx.fillStyle = "#9eb0c0";
      ctx.font = "11px sans-serif";
      ctx.fillText("左右滑动 · 折线串关 · 通关解锁下一关", S.l + 14, S.t + 32);

      // 进度
      const chipW = 86, chipH = 28;
      const cx = W - S.r - Math.max(12, S.cap || 0) - chipW - 8;
      roundRect(cx, S.t + 10, chipW, chipH, 8);
      ctx.fillStyle = "rgba(8,14,22,0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(140,200,220,0.28)";
      ctx.stroke();
      ctx.fillStyle = "#9eb0c0";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("进度", cx + 8, S.t + 18);
      ctx.fillStyle = "#7ad7ff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(cleared + "/" + total, cx + 40, S.t + 17);

      // 返回
      roundRect(S.l + 10, H - S.b - 40, 72, 30, 8);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(140,200,220,0.28)";
      ctx.stroke();
      ctx.fillStyle = "#e8f2f8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("返回", S.l + 46, H - S.b - 25);
      addHit(S.l + 10, H - S.b - 40, 72, 30, {
        onTap: () => { if (host.onExit) host.onExit(); },
      });

      ctx.fillStyle = "#9eb0c0";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("永久星碎 " + readStars().toFixed(2), W - S.r - 14, H - S.b - 22);
    }

    function drawPanel(pw, ph) {
      const px = (W - pw) / 2, py = (H - ph) / 2;
      roundRect(px, py, pw, ph, 14);
      ctx.fillStyle = "rgba(12,28,40,0.96)";
      ctx.fill();
      ctx.strokeStyle = "rgba(140,200,220,0.28)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      return { px, py, pw, ph };
    }

    function drawBtn(x, y, w, h, lab, primary, onTap, disabled) {
      roundRect(x, y, w, h, 10);
      if (disabled) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(140,200,220,0.16)";
        ctx.stroke();
        ctx.fillStyle = "#6a7784";
      } else if (primary) {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, "#7ad7ff");
        g.addColorStop(1, "#3aa0d8");
        ctx.fillStyle = g;
        ctx.fill();
        ctx.fillStyle = "#061018";
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
        ctx.strokeStyle = "rgba(140,200,220,0.28)";
        ctx.stroke();
        ctx.fillStyle = "#e8f2f8";
      }
      ctx.font = "600 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lab, x + w / 2, y + h / 2);
      if (!disabled && onTap) addHit(x, y, w, h, { onTap });
    }

    function drawFace(x, y, r, fill, label) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();
      ctx.fillStyle = "#e8f2f8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y);
    }

    function isAssistHostOn() {
      try { return !!GameGlobal.assistHostMode; } catch (e) { return false; }
    }

    function syncAssistInviteCode() {
      try {
        if (typeof GameGlobal.getAssistMemberCount === "function") GameGlobal.getAssistMemberCount();
      } catch (e) {}
      try {
        const c = typeof GameGlobal.getAssistRoomCode === "function"
          ? GameGlobal.getAssistRoomCode()
          : (GameGlobal.assistHostCode || "");
        const dig = String(c || "").replace(/\D/g, "").slice(0, 4);
        if (dig.length === 4) inviteCode = dig;
        else if (!isAssistHostOn()) inviteCode = "";
      } catch (e) {}
      try {
        if (!isAssistHostOn()) {
          if (pending && pending.assist) {
            // 关闭助战后清掉本关助战位
            pending.assist = null;
          }
          return;
        }
        const st = GameGlobal.assistRoomState;
        const members = (st && st.members) || [];
        const guest = members.find((u) => u && !u.host && !u.you && !u.bot)
          || members.find((u) => u && !u.host && !u.bot);
        if (guest && pending) {
          if (!pending.assist) {
            pending.assist = {
              id: "assist_" + (inviteCode || "tmp"),
              name: guest.name || "助战",
              code: inviteCode,
              ready: !!guest.ready,
            };
          } else {
            pending.assist.name = guest.name || pending.assist.name;
            pending.assist.ready = !!guest.ready;
            if (inviteCode) pending.assist.code = inviteCode;
          }
        } else if (pending && pending.assist) {
          pending.assist = null;
        }
      } catch (e) {}
    }

    function startAssistInPreview(n) {
      if (!n || n.type === "rest" || n.type === "start") return;
      // 统一：星碎币不够无法助战
      try {
        if (typeof GameGlobal.guardAssistAction === "function" && !GameGlobal.guardAssistAction()) return;
      } catch (e) { return; }
      view = "preview";
      inviteCode = "";
      try {
        if (typeof GameGlobal.beginLevelAssistHost === "function") {
          GameGlobal.beginLevelAssistHost(n);
        }
      } catch (e) {}
    }

    function closeAssistInPreview(n) {
      try {
        if (typeof GameGlobal.endLevelAssistHost === "function") {
          GameGlobal.endLevelAssistHost();
        } else if (typeof GameGlobal.leaveAssistRoom === "function") {
          GameGlobal.leaveAssistRoom();
          GameGlobal.levelsOpen = true;
        }
      } catch (e) {}
      inviteCode = "";
      if (n) n.assist = null;
      try { saveProgress(); } catch (e) {}
      view = "preview";
    }

    function canEnterWithAssist(n) {
      if (!isAssistHostOn()) return true;
      return !!(n && n.assist && n.assist.ready);
    }

    function wrapTextLines(text, maxW, font) {
      const raw = String(text || "");
      if (!raw) return [];
      ctx.font = font || "12px sans-serif";
      const lines = [];
      let line = "";
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        const next = line + ch;
        if (ctx.measureText(next).width > maxW && line) {
          lines.push(line);
          line = ch;
        } else line = next;
      }
      if (line) lines.push(line);
      return lines;
    }

    function drawBriefBlock(px, y0, pw, brief) {
      const padX = 22;
      const maxW = pw - padX * 2;
      const lineH = 16;
      let y = y0;
      const sections = [
        { tag: "玩法", body: brief.play, tagColor: "#7ad7ff" },
        { tag: "过关", body: brief.win, tagColor: "#78ff5a" },
      ];
      for (const sec of sections) {
        const lines = wrapTextLines(sec.body, maxW - 40, "12px sans-serif");
        const blockH = Math.max(lineH, lines.length * lineH) + 10;
        roundRect(px + padX - 6, y - 4, pw - padX * 2 + 12, blockH + 4, 8);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fill();
        ctx.fillStyle = sec.tagColor;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(sec.tag, px + padX, y);
        ctx.fillStyle = "#d5e2ea";
        ctx.font = "12px sans-serif";
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], px + padX + 36, y + i * lineH);
        }
        y += blockH + 8;
      }
      return y;
    }

    function measureBriefH(pw, brief) {
      const maxW = pw - 44 - 40;
      const lineH = 16;
      let h = 0;
      for (const body of [brief.play, brief.win]) {
        const lines = wrapTextLines(body, maxW, "12px sans-serif");
        h += Math.max(lineH, lines.length * lineH) + 10 + 8;
      }
      return h;
    }

    function drawPreview() {
      const n = pending;
      if (!n) { view = "map"; return; }
      syncAssistInviteCode();
      const meta = TYPE_META[n.type] || TYPE_META.encounter;
      const avail = availableIds().has(n.id);
      const assistOn = isAssistHostOn();
      const brief = briefOf(n);
      let creating = false;
      let failed = false;
      try {
        creating = !!(GameGlobal.assistRoomState && GameGlobal.assistRoomState.creating);
        failed = !!GameGlobal.assistCreateFailed;
      } catch (e) {}
      const pw = Math.min(440, W - 36);
      // 先估高度：标题区 + 说明 +（助战区）+ 按钮
      const headH = n.stars > 0 ? 118 : 100;
      const briefH = measureBriefH(pw, brief);
      const assistH = assistOn ? 120 : 0;
      const phNeed = headH + briefH + assistH + 70;
      const { px, py, pw: panelW, ph } = drawPanel(pw, Math.min(phNeed, H - 24));

      // 图标
      const ix = px + panelW / 2, iy = py + 44;
      roundRect(ix - 26, iy - 26, 52, 52, 14);
      ctx.fillStyle = "rgba(10,18,28,0.9)";
      ctx.fill();
      ctx.strokeStyle = n.accent || meta.accent;
      ctx.stroke();
      drawIcon(n.type, ix, iy, n.accent || meta.accent, 1.15);

      ctx.fillStyle = "#e8f2f8";
      ctx.font = "bold 17px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const titleLab = n.type === "start"
        ? (n.title || "起点")
        : ("第" + n.col + "关 · " + (n.title || meta.lab));
      ctx.fillText(titleLab, px + panelW / 2, iy + 36);

      if (n.stars > 0) {
        ctx.fillStyle = "#ff5a5a";
        ctx.font = "13px sans-serif";
        ctx.fillText("★".repeat(n.stars), px + panelW / 2, iy + 58);
      }

      const briefTop = iy + (n.stars > 0 ? 78 : 60);
      const briefEnd = drawBriefBlock(px, briefTop, panelW, brief);

      // 助战座位 / 房号：仅开启助战后显示
      const as = n.assist;
      if (assistOn) {
        const slotY = briefEnd + 18;
        drawFace(px + panelW / 2 - 50, slotY, 22, "rgba(122,215,255,0.25)", "我");
        ctx.fillStyle = "#9eb0c0";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("房主", px + panelW / 2 - 50, slotY + 34);

        drawFace(px + panelW / 2 + 50, slotY, 22, as ? "rgba(255,224,138,0.3)" : "rgba(255,255,255,0.06)", as ? "友" : "+");
        ctx.fillStyle = as ? "#ffe08a" : "#9eb0c0";
        let friendLab = "邀请助战";
        if (as) friendLab = as.ready ? (as.name || "已准备") : (as.name || "未准备");
        ctx.fillText(friendLab, px + panelW / 2 + 50, slotY + 34);

        const codeLab = inviteCode
          ? ("房号 " + inviteCode)
          : (failed ? "开房失败" : (creating ? "开房中…" : "申请房号…"));
        ctx.fillStyle = "#ffe08a";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(codeLab, px + panelW / 2, slotY + 54);
        ctx.fillStyle = "#9eb0c0";
        ctx.font = "12px sans-serif";
        let tip = "等待好友加入并准备…";
        if (failed) tip = "开房失败，请点重试";
        else if (creating || !inviteCode) tip = "正在申请助战房号…";
        else if (as) tip = as.ready ? ("已准备：" + (as.name || "好友")) : ("已加入未准备：" + (as.name || "好友"));
        ctx.fillText(tip, px + panelW / 2, slotY + 76);
      }

      const btnY = py + ph - 52;
      const canInvite = avail && n.type !== "rest" && n.type !== "start";
      if (avail) {
        const enterOk = canEnterWithAssist(n);
        drawBtn(px + 24, btnY, 110, 34, "确定进入", true, () => {
          if (!canEnterWithAssist(n)) return;
          enterPending();
        }, !enterOk);
        if (assistOn) {
          drawBtn(px + 144, btnY, 100, 34, (failed || !inviteCode) ? "重试" : "转发邀请", false, () => {
            syncAssistInviteCode();
            if (failed || !inviteCode) {
              try { if (GameGlobal.retryAssistCreate) GameGlobal.retryAssistCreate(); } catch (e) {}
              return;
            }
            try {
              if (typeof GameGlobal.shareLevelAssist === "function") {
                GameGlobal.shareLevelAssist(inviteCode, n.id, n.title || "关卡助战");
              }
            } catch (e) {}
          });
          drawBtn(px + panelW - 24 - 100, btnY, 100, 34, "关闭助战", false, () => closeAssistInPreview(n));
        } else {
          if (canInvite) drawBtn(px + 144, btnY, 110, 34, "开启助战", false, () => startAssistInPreview(n));
          drawBtn(px + panelW - 24 - 88, btnY, 88, 34, "取消", false, () => {
            pending = null;
            view = "map";
          });
        }
      } else {
        drawBtn(px + panelW / 2 - 50, btnY, 100, 34, "关闭", false, () => {
          if (assistOn) closeAssistInPreview(n);
          pending = null;
          view = "map";
        });
      }
    }

    function enterPending() {
      const n = pending;
      if (!n || !availableIds().has(n.id)) return;
      if (!canEnterWithAssist(n)) return;
      if (n.type === "rest") {
        view = "map";
        if (host.onRest) host.onRest(n);
        else markComplete(n.id);
        return;
      }
      if (n.type === "start") return;
      view = "map";
      if (host.onEnterLevel) host.onEnterLevel(n);
      else markComplete(n.id);
    }

    // ---------- 触摸 ----------
    function touchStart(list) {
      for (const t of list) {
        if (view === "map") {
          const h = hitAt(t.x, t.y);
          if (h && h.onTap) {
            taps.set(t.id, { kind: "tap", hit: h, x: t.x, y: t.y });
            continue;
          }
          drag.on = true; drag.id = t.id; drag.x = t.x; drag.sx = scrollX; drag.moved = false;
          taps.set(t.id, { kind: "drag" });
          continue;
        }
        const h = hitAt(t.x, t.y);
        if (h && h.onTap) taps.set(t.id, { kind: "tap", hit: h, x: t.x, y: t.y });
      }
    }
    function touchMove(list) {
      for (const t of list) {
        const s = taps.get(t.id);
        if (!s) continue;
        if (s.kind === "drag" && drag.on && drag.id === t.id) {
          const dx = t.x - drag.x;
          if (Math.abs(dx) > 6) drag.moved = true;
          scrollX = clamp(drag.sx - dx, 0, Math.max(0, contentW - (W - S.l - S.r)));
        }
        s.x = t.x; s.y = t.y;
      }
    }
    function touchEnd(list) {
      for (const t of list) {
        const s = taps.get(t.id);
        if (!s) continue;
        taps.delete(t.id);
        if (s.kind === "drag") {
          drag.on = false;
          setTimeout(() => { drag.moved = false; }, 40);
        }
        if (s.kind === "tap" && !drag.moved) {
          const h = s.hit;
          if (t.x >= h.x - 8 && t.x <= h.x + h.w + 8 && t.y >= h.y - 8 && t.y <= h.y + h.h + 8) {
            try { h.onTap(); } catch (e) {}
          }
        }
      }
    }

    let last = 0;
    function frame(now) {
      const sz = host.size();
      W = sz.w; H = sz.h;
      S = Object.assign({ l: 0, r: 0, t: 0, b: 0, cap: 0 }, host.safe ? host.safe() : null);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      pulseT += dt;
      hits = [];
      if (H > W) {
        bg();
        ctx.fillStyle = "#e8f2f8";
        ctx.font = "18px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("请将手机横屏", W / 2, H / 2);
        return;
      }
      bg();
      if (view === "map") {
        drawMap();
        drawHeader();
      } else if (view === "preview") {
        drawMap();
        ctx.fillStyle = "rgba(4,8,14,0.55)";
        ctx.fillRect(0, 0, W, H);
        drawPreview();
      }
    }

    function focusCurrent() {
      layoutNodes();
      const avail = availableIds();
      const focus = map.list.find((n) => avail.has(n.id) && !n.done) || map.list.find((n) => n.done) || map.list[0];
      if (focus) scrollX = clamp(focus.x - (W - S.l - S.r) * 0.35, 0, Math.max(0, contentW - (W - S.l - S.r)));
    }

    /** 每次打开航图：滚回最左侧（起点/第1关） */
    function scrollToStart() {
      layoutNodes();
      scrollX = 0;
      view = "map";
      pending = null;
    }

    scrollToStart();

    return {
      frame, touchStart, touchMove, touchEnd,
      markComplete, resetProgress, getDoneIds, applyServerProgress, focusCurrent, scrollToStart,
      getPendingId: () => (pending && pending.id) || null,
    };
  }

  root.PapaLevels = { create };
})(typeof GameGlobal !== "undefined" ? GameGlobal : window);
