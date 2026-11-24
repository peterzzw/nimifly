/**
 * 第5关：侦察卫星 + 太阳能板
 * 静止姿态；机械臂伸向电板根部，剪刀合拢后再断开。
 */
(function (root) {
  "use strict";

  const BODY_W = 28;
  const BODY_H = 36;
  const PANEL_LEN = 58;
  const PANEL_W = 22;
  const BOOM_LEN = 10;
  const CUT_RANGE = 150;

  function create(x, y, opts) {
    const o = opts || {};
    return {
      id: o.id || 0,
      x, y,
      // 固定朝向，不自转
      heading: o.heading != null ? o.heading : 0,
      armed: false,
      panels: [
        { side: -1, cut: false, detach: null },
        { side: 1, cut: false, detach: null },
      ],
      kind: "satellite",
    };
  }

  function panelLocal(side) {
    const sx = side < 0 ? -1 : 1;
    const boom0 = sx * (BODY_W * 0.5);
    const rootX = boom0 + sx * BOOM_LEN;
    return {
      boom0,
      rootX,
      tipX: rootX + sx * PANEL_LEN,
      midX: rootX + sx * PANEL_LEN * 0.5,
      y: 0,
      w: PANEL_W,
      len: PANEL_LEN,
      side: sx,
    };
  }

  function toWorld(sat, lx, ly) {
    const ang = sat.heading || 0;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return {
      x: sat.x + lx * c - ly * s,
      y: sat.y + lx * s + ly * c,
    };
  }

  /** 电板中心（漂浮残骸用） */
  function panelWorldPos(sat, panel) {
    if (!sat || !panel) return { x: 0, y: 0 };
    if (panel.detach) return { x: panel.detach.x, y: panel.detach.y };
    const loc = panelLocal(panel.side);
    return toWorld(sat, loc.midX, 0);
  }

  /** 铰接根部：剪刀对准这里 */
  function panelRootWorld(sat, panel) {
    if (!sat || !panel) return { x: 0, y: 0 };
    const loc = panelLocal(panel.side);
    return toWorld(sat, loc.rootX, 0);
  }

  function remainingPanels(sat) {
    if (!sat || !sat.panels) return [];
    return sat.panels.filter((p) => p && !p.cut);
  }

  function allPanelsCut(sat) {
    return remainingPanels(sat).length === 0;
  }

  function cutPanel(sat, panel, outwardHeading) {
    if (!sat || !panel || panel.cut) return false;
    const pos = panelWorldPos(sat, panel);
    const ang = outwardHeading != null
      ? outwardHeading
      : (sat.heading || 0) + (panel.side < 0 ? Math.PI : 0);
    panel.cut = true;
    panel.detach = {
      x: pos.x,
      y: pos.y,
      vx: Math.cos(ang) * (22 + Math.random() * 14) + (Math.random() - 0.5) * 8,
      vy: Math.sin(ang) * (22 + Math.random() * 14) + (Math.random() - 0.5) * 8,
      rot: sat.heading || 0,
      spin: (panel.side < 0 ? -1 : 1) * (0.7 + Math.random() * 1.1),
      age: 0,
      life: 3.2,
      side: panel.side,
    };
    return true;
  }

  function update(sat, dt) {
    if (!sat) return;
    // 不自转：heading 保持生成时的值
    for (const p of sat.panels || []) {
      if (!p || !p.detach) continue;
      const d = p.detach;
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-0.4 * dt);
      d.vy *= Math.exp(-0.4 * dt);
      d.rot += d.spin * dt;
      if (d.age >= d.life) p.detach = null;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 仅电板阵列（不含连接杆） */
  function drawPanelArray(ctx, side, alpha, opts) {
    const loc = panelLocal(side);
    const x0 = Math.min(loc.rootX, loc.tipX);
    const x1 = Math.max(loc.rootX, loc.tipX);
    const y0 = -PANEL_W / 2;
    const a = alpha == null ? 1 : alpha;
    const severed = !!(opts && opts.severed);
    ctx.save();
    ctx.globalAlpha = a;

    // 外框铝合金
    roundRect(ctx, x0, y0, x1 - x0, PANEL_W, 2.2);
    const frame = ctx.createLinearGradient(x0, y0, x0, y0 + PANEL_W);
    frame.addColorStop(0, "#c8d2dc");
    frame.addColorStop(0.5, "#8a96a4");
    frame.addColorStop(1, "#4a5664");
    ctx.fillStyle = frame;
    ctx.fill();
    ctx.strokeStyle = "rgba(30,40,50,0.65)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // 深蓝光伏格
    const pad = 2.2;
    const innerX = x0 + pad;
    const innerY = y0 + pad;
    const innerW = (x1 - x0) - pad * 2;
    const innerH = PANEL_W - pad * 2;
    roundRect(ctx, innerX, innerY, innerW, innerH, 1.2);
    const cellG = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
    cellG.addColorStop(0, "#1a3a6e");
    cellG.addColorStop(0.45, "#0c2248");
    cellG.addColorStop(1, "#061428");
    ctx.fillStyle = cellG;
    ctx.fill();

    const cols = 5;
    const rows = 3;
    ctx.strokeStyle = "rgba(90,140,200,0.45)";
    ctx.lineWidth = 0.7;
    for (let c = 1; c < cols; c++) {
      const x = innerX + (innerW * c) / cols;
      ctx.beginPath();
      ctx.moveTo(x, innerY + 0.5);
      ctx.lineTo(x, innerY + innerH - 0.5);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const y = innerY + (innerH * r) / rows;
      ctx.beginPath();
      ctx.moveTo(innerX + 0.5, y);
      ctx.lineTo(innerX + innerW - 0.5, y);
      ctx.stroke();
    }
    // 玻璃高光
    ctx.strokeStyle = "rgba(180,220,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(innerX + 2, innerY + 2);
    ctx.lineTo(innerX + innerW * 0.55, innerY + 2);
    ctx.stroke();

    // 根部铰接座
    if (!severed) {
      ctx.fillStyle = "#9aa6b2";
      ctx.fillRect(loc.rootX - side * 2.5, -3.2, side * 5, 6.4);
      ctx.strokeStyle = "rgba(40,50,60,0.55)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(loc.rootX - side * 2.5, -3.2, side * 5, 6.4);
    } else {
      // 断口毛刺
      ctx.strokeStyle = "rgba(255,200,120,0.7)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(loc.rootX, -PANEL_W * 0.35);
      ctx.lineTo(loc.rootX - side * 2, 0);
      ctx.lineTo(loc.rootX, PANEL_W * 0.35);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoom(ctx, side, cutHint) {
    const loc = panelLocal(side);
    ctx.save();
    ctx.strokeStyle = "#7a8694";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(loc.boom0, 0);
    ctx.lineTo(loc.rootX, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(210,220,230,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(loc.boom0, -0.8);
    ctx.lineTo(loc.rootX, -0.8);
    ctx.stroke();
    // 根部卡箍
    ctx.fillStyle = cutHint ? "#ffb060" : "#a8b4c0";
    ctx.beginPath();
    ctx.arc(loc.rootX, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,28,36,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawSatellite(ctx, sat, time, opts) {
    if (!ctx || !sat) return;
    const armed = !!(opts && opts.armed != null ? opts.armed : sat.armed);
    const scale = (opts && opts.scale) || 1;
    const snipSide = opts && opts.snipSide;
    ctx.save();
    ctx.rotate(sat.heading || 0);

    if (armed) {
      ctx.beginPath();
      ctx.arc(0, 0, CUT_RANGE, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120,220,255,0.2)";
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([7 / scale, 5 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const p of sat.panels || []) {
      if (!p) continue;
      if (!p.cut) {
        drawBoom(ctx, p.side, snipSide === p.side);
        drawPanelArray(ctx, p.side, 1, { severed: false });
      } else {
        // 已剪：只留短截断杆
        const loc = panelLocal(p.side);
        ctx.strokeStyle = "#5a646e";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(loc.boom0, 0);
        ctx.lineTo(loc.rootX - p.side * 2, 0);
        ctx.stroke();
        ctx.fillStyle = "#c87840";
        ctx.beginPath();
        ctx.arc(loc.rootX - p.side * 2, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // —— 星体总线（箱体）——
    const bw = BODY_W;
    const bh = BODY_H;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 3.5);
    const bus = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
    bus.addColorStop(0, "#e8eef4");
    bus.addColorStop(0.35, "#9aa8b4");
    bus.addColorStop(0.7, "#5a6874");
    bus.addColorStop(1, "#2a343e");
    ctx.fillStyle = bus;
    ctx.fill();
    ctx.strokeStyle = "rgba(20,28,36,0.7)";
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // 板缝 / 设备面
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-bw / 2 + 4, -6);
    ctx.lineTo(bw / 2 - 4, -6);
    ctx.moveTo(-bw / 2 + 4, 6);
    ctx.lineTo(bw / 2 - 4, 6);
    ctx.stroke();
    ctx.fillStyle = "#3a4652";
    roundRect(ctx, -8, -bh / 2 + 4, 16, 8, 1.5);
    ctx.fill();
    ctx.fillStyle = "#2a3848";
    roundRect(ctx, -7, bh / 2 - 11, 14, 7, 1.2);
    ctx.fill();

    // 固定天线（不转）
    ctx.strokeStyle = "#b8c4ce";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -bh / 2);
    ctx.lineTo(0, -bh / 2 - 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -bh / 2 - 14, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#6a90b0";
    ctx.fill();
    ctx.strokeStyle = "rgba(200,230,255,0.65)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // 侧向杆天线
    ctx.strokeStyle = "#9aa6b0";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-bw / 2, 8);
    ctx.lineTo(-bw / 2 - 9, 14);
    ctx.moveTo(bw / 2, 8);
    ctx.lineTo(bw / 2 + 9, 14);
    ctx.stroke();

    // 状态灯
    const blink = ((time || 0) * 1.6) % 1 < 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = blink ? (armed ? "#6dffb0" : "#ff5a48") : "#301818";
    ctx.fill();
    if (blink) {
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = armed ? "rgba(80,255,160,0.14)" : "rgba(255,70,50,0.12)";
      ctx.fill();
    }

    ctx.restore();
  }

  function drawDetachedPanel(ctx, detach, screenX, screenY, scale) {
    if (!ctx || !detach) return;
    const u = 1 - detach.age / detach.life;
    if (u <= 0) return;
    const sc = scale || 1;
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(sc, sc);
    ctx.rotate(detach.rot || 0);
    // 残骸以根部为原点再偏移到中心
    const loc = panelLocal(detach.side || 1);
    ctx.translate(-loc.midX, 0);
    drawPanelArray(ctx, detach.side || 1, Math.max(0, u), { severed: true });
    ctx.restore();
  }

  /**
   * 机械臂 + 剪刀
   * reachT 伸出；cutT 0=张开 1=完全合拢；holdT 剪断进度条
   */
  function drawScissorArm(ctx, fromX, fromY, toX, toY, reachT, cutT, holdT, opts) {
    const reach = Math.max(0, Math.min(1, reachT == null ? 1 : reachT));
    if (reach <= 0.02) return;
    const cut = Math.max(0, Math.min(1, cutT == null ? 0 : cutT));
    const hold = Math.max(0, Math.min(1, holdT == null ? 0 : holdT));
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const tipX = fromX + dx * reach;
    const tipY = fromY + dy * reach;
    const midX = fromX + (tipX - fromX) * 0.48 + Math.cos(ang + Math.PI / 2) * Math.min(22, dist * 0.1);
    const midY = fromY + (tipY - fromY) * 0.48 + Math.sin(ang + Math.PI / 2) * Math.min(22, dist * 0.1);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(fromX, fromY, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = "#8a9aaa";
    ctx.fill();
    ctx.strokeStyle = "rgba(40,50,60,0.75)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = "#5a6878";
    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(midX, midY);
    ctx.stroke();
    ctx.strokeStyle = "#b8c6d2";
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(midX, midY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#9aa8b4";
    ctx.fill();

    ctx.strokeStyle = "#4a5868";
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = "#c4d0dc";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 剪刀：张开 → 合拢剪断
    ctx.translate(tipX, tipY);
    ctx.rotate(ang);
    const open = 0.72 * (1 - cut);
    function blade(side) {
      const s = side < 0 ? -1 : 1;
      ctx.save();
      ctx.rotate(s * open);
      const metal = ctx.createLinearGradient(0, -2, 18, 2);
      metal.addColorStop(0, "#e8eef4");
      metal.addColorStop(0.5, "#a8b4c0");
      metal.addColorStop(1, "#6a7888");
      ctx.fillStyle = metal;
      ctx.strokeStyle = "rgba(20,28,36,0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1.5, 0);
      ctx.lineTo(15, s * 3.2);
      ctx.lineTo(17.5, s * 0.6);
      ctx.lineTo(3, -s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(2, s * 0.4);
      ctx.lineTo(15.2, s * 1.8);
      ctx.stroke();
      ctx.restore();
    }
    blade(-1);
    blade(1);
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#a8b6c2";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,28,36,0.7)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // 合拢瞬间火花
    if (cut > 0.92) {
      ctx.fillStyle = "rgba(255,220,120,0.85)";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + cut * 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 6, Math.sin(a) * 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (reach >= 0.98) {
      const bw = 48;
      const bh = 6;
      const bx = toX - bw / 2;
      const by = toY - 32;
      ctx.save();
      ctx.fillStyle = "rgba(8,12,16,0.72)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.strokeStyle = "rgba(200,220,235,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = "rgba(40,50,60,0.9)";
      ctx.fillRect(bx, by, bw, bh);
      const g = ctx.createLinearGradient(bx, by, bx + bw, by);
      g.addColorStop(0, "#7ad7ff");
      g.addColorStop(1, "#7dffb0");
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw * Math.max(hold, cut * 0.35), bh);
      ctx.fillStyle = "rgba(210,240,255,0.92)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const o = opts || {};
      const idle = o.labelIdle || "对准根部";
      const done = o.labelDone || "剪断！";
      ctx.fillText(cut < 0.95 ? idle : done, toX, by - 3);
      ctx.restore();
    }
  }

  /**
   * 机械抓手：伸出 → 合爪夹住 → 拖回（arm 随 tip 缩短）
   * reachT 伸出；clampT 0=张开 1=夹紧；holdT 进度条
   */
  function drawGrabClaw(ctx, fromX, fromY, toX, toY, reachT, clampT, holdT, opts) {
    const reach = Math.max(0, Math.min(1, reachT == null ? 1 : reachT));
    if (reach <= 0.02) return;
    const clamp = Math.max(0, Math.min(1, clampT == null ? 0 : clampT));
    const hold = Math.max(0, Math.min(1, holdT == null ? 0 : holdT));
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const tipX = fromX + dx * reach;
    const tipY = fromY + dy * reach;
    const midX = fromX + (tipX - fromX) * 0.5 + Math.cos(ang + Math.PI / 2) * Math.min(18, dist * 0.08);
    const midY = fromY + (tipY - fromY) * 0.5 + Math.sin(ang + Math.PI / 2) * Math.min(18, dist * 0.08);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 基座
    ctx.beginPath();
    ctx.arc(fromX, fromY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#7a8a78";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,36,28,0.8)";
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // 两节液压臂
    ctx.strokeStyle = "#4a5e52";
    ctx.lineWidth = 7.2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(midX, midY);
    ctx.stroke();
    ctx.strokeStyle = "#a8c4b0";
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(midX, midY, 4.4, 0, Math.PI * 2);
    ctx.fillStyle = "#8aaa96";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,36,28,0.7)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.strokeStyle = "#3e5248";
    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = "#b6d2c0";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 抓手：三爪（左右主爪 + 底爪），张开→夹紧
    ctx.translate(tipX, tipY);
    ctx.rotate(ang);
    const open = 0.95 * (1 - clamp);
    function finger(rot, len, thick) {
      ctx.save();
      ctx.rotate(rot);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, "#d4e8d8");
      g.addColorStop(0.45, "#7aaa88");
      g.addColorStop(1, "#3a5848");
      ctx.fillStyle = g;
      ctx.strokeStyle = "rgba(12,28,20,0.8)";
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(2, -thick * 0.35);
      ctx.lineTo(len * 0.55, -thick * 0.55);
      ctx.lineTo(len, -thick * 0.15);
      ctx.lineTo(len * 0.92, thick * 0.35);
      ctx.lineTo(len * 0.5, thick * 0.45);
      ctx.lineTo(2, thick * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 指尖勾
      ctx.beginPath();
      ctx.moveTo(len * 0.78, -thick * 0.2);
      ctx.lineTo(len + 3.5, 0);
      ctx.lineTo(len * 0.78, thick * 0.35);
      ctx.strokeStyle = "rgba(220,255,230,0.55)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
    finger(-0.55 - open, 20, 7);
    finger(0.55 + open, 20, 7);
    finger(Math.PI * 0.92 + open * 0.25, 14, 5.5);

    // 掌心圆盘
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = "#9cbca8";
    ctx.fill();
    ctx.strokeStyle = "rgba(16,32,24,0.75)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = clamp > 0.85 ? "#7dffb0" : "#5a7868";
    ctx.fill();

    if (clamp > 0.9) {
      ctx.fillStyle = "rgba(140,255,190,0.55)";
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + clamp * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 9, Math.sin(a) * 7, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (reach >= 0.55) {
      const bw = 52;
      const bh = 6;
      const bx = tipX - bw / 2;
      const by = tipY - 36;
      ctx.save();
      ctx.fillStyle = "rgba(8,16,12,0.72)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.strokeStyle = "rgba(180,235,200,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = "rgba(30,48,38,0.9)";
      ctx.fillRect(bx, by, bw, bh);
      const bar = ctx.createLinearGradient(bx, by, bx + bw, by);
      bar.addColorStop(0, "#7dffb0");
      bar.addColorStop(1, "#7ad7ff");
      ctx.fillStyle = bar;
      ctx.fillRect(bx, by, bw * Math.max(hold, clamp * 0.4), bh);
      ctx.fillStyle = "rgba(210,255,230,0.95)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const o = opts || {};
      const idle = o.labelIdle || "对准星体";
      const done = o.labelDone || "回收！";
      ctx.fillText(clamp < 0.95 ? idle : done, tipX, by - 3);
      ctx.restore();
    }
  }

  const api = {
    BODY_W,
    BODY_H,
    PANEL_LEN,
    CUT_RANGE,
    create,
    panelWorldPos,
    panelRootWorld,
    remainingPanels,
    allPanelsCut,
    cutPanel,
    update,
    drawSatellite,
    drawDetachedPanel,
    drawScissorArm,
    drawGrabClaw,
  };

  root.PapaSatellite = api;
  if (typeof GameGlobal !== "undefined") GameGlobal.PapaSatellite = api;
})(typeof GameGlobal !== "undefined" ? GameGlobal : (typeof globalThis !== "undefined" ? globalThis : this));
