/*
 * SKY ACE 机库改装（移动横屏版）
 * 纯 canvas + 触摸，不依赖 DOM，可直接移植进微信小游戏。
 *
 * 接入：
 *   const g = PapaGarage.create({
 *     ctx,                              // 2d context（已按 DPR 缩放到逻辑像素）
 *     size: () => ({ w, h }),           // 逻辑像素尺寸
 *     safe: () => ({ l, r, t, b, cap }), // 可选：安全区内边距；cap = 顶栏右侧让给小游戏胶囊的宽度
 *     storage: { get(k), set(k, v) },   // 字符串存取（web: localStorage / 小游戏: wx.get/setStorageSync）
 *     onExit: () => {},                 // 可选：点「返回」时回调（接回小游戏大厅）
 *     onTestFly: (loadout) => {},       // 可选：点「试飞」时交给宿主（小游戏进训练场）；不传则进内置靶场
 *     onSave: (loadout) => {},          // 可选：点「保存」后回调（小游戏同步到服务器）
 *   });
 *   每帧：g.frame(performance.now())
 *   触摸：g.touchStart([{ id, x, y }]) / g.touchMove(...) / g.touchEnd(...)
 *   读方案：g.getLoadout() → { slots: [主, 副], engine }
 *   写方案：g.setLoadout({ slots, engine })（宿主从服务器拿到存档后刷新）
 */
(function (root) {
  const WEAPONS = {
    // 主炮（机头）
    gun: { name: "机关炮", color: "#39ff14", desc: "均衡 · 高射速", stat: { 火力: 2, 射速: 5, 射程: 3, 控制: 0 } },
    cannon: { name: "加农炮", color: "#ff9a3c", desc: "重炮 · 爆裂弹", stat: { 火力: 5, 射速: 1, 射程: 4, 控制: 1 } },
    gatling: { name: "双管加特林", color: "#ffe66b", desc: "越转越快 · 弹幕", stat: { 火力: 3, 射速: 5, 射程: 2, 控制: 0 } },
    // 副武器（翼下）
    laser: { name: "激光炮", color: "#ff4d6d", desc: "一炮打爆 · 穿透切石", stat: { 火力: 4, 射速: 4, 射程: 4, 控制: 0 } },
    emp: { name: "电磁脉冲炮", color: "#6ecbff", desc: "闪电团 · 5 发 · 瘫痪 4 秒", stat: { 火力: 1, 射速: 2, 射程: 2, 控制: 5 } },
    missile: { name: "导弹", color: "#ffb347", desc: "追踪 · 范围爆炸", stat: { 火力: 5, 射速: 2, 射程: 5, 控制: 1 } },
    mirv: { name: "多弹头导弹", color: "#ff7a45", desc: "发射后裂变 · 五向夹击", stat: { 火力: 5, 射速: 1, 射程: 5, 控制: 2 } },
    drone: { name: "无人机", color: "#5dffc8", desc: "双机伴飞 · 逼近拦截", stat: { 火力: 2, 射速: 5, 射程: 3, 控制: 4 } },
  };
  const SLOT_KEYS = [["gun", "cannon", "gatling"], ["laser", "emp", "missile", "mirv", "drone"]];
  const ENGINES = {
    single: { name: "单引擎", color: "#7ad7ff", desc: "轻巧灵活，转向快", max: 150, turn: 3.4, accel: 240, stat: { 速度: 2, 机动: 5 } },
    twin: { name: "双引擎", color: "#ffe08a", desc: "速度翻倍，转向偏重", max: 280, turn: 2.2, accel: 380, stat: { 速度: 5, 机动: 3 } },
  };
  const ENGINE_KEYS = ["single", "twin"];
  // 所有飞机统一为 5×3、15 帧、由 +60° 到 -60° 的透明图集。
  // 后续新增机型只需在这里登记，并放入对应 atlas.png。
  // 改装预览用接近 0° 的俯视帧（与局内 bank=0 对应，第 7 帧）。
  const CRAFT_TOP_FRAME = 7;
  const CRAFTS = {
    fbx: { name: "突击飞船", desc: "重型突击", color: "#7ad7ff", src: "res/craft-fbx-bank-game/atlas.png", frameSize: 128, cols: 5, rows: 3, drawMul: 1 },
    jgi: { name: "JGI 战机", desc: "高速制空", color: "#b8c8d8", src: "res/craft-jgi-bank-game/atlas.png", frameSize: 128, cols: 5, rows: 3, drawMul: 4 / 3 },
    jci: { name: "JCI 战机", desc: "多引擎制空", color: "#9ec8e8", src: "res/craft-jci-bank-game/atlas.png", frameSize: 128, cols: 5, rows: 3, drawMul: 1 },
  };
  const CRAFT_KEYS = Object.keys(CRAFTS);
  const CRAFT_ALIASES = { f22: "jgi" }; // 旧存档 F-22 → JGI
  // 新用户默认：机关炮 + 导弹 + 单引擎 + JCI
  const DEFAULT = { slots: ["gun", "missile"], engine: "single", craft: "jci" };
  const SAVE_KEY = "papa.garage.loadout.v2";

  /**
   * 装备权限
   * - owned：永久拥有（星碎购买 / 默认赠送）
   * - rental：限时拥有（邀请好友；新玩家点开 +48h / 老玩家 +2h，自领取起计时）
   * - trial：可试飞，不可保存
   * 新用户默认永久：机关炮、导弹、单引擎、JCI；其余可邀请限时 / 星碎买断
   */
  const ACCESS_OWNED_DEFAULT = {
    gun: true,
    missile: true,
    single: true,
    jci: true,
  };
  let ACCESS_OWNED = Object.assign({}, ACCESS_OWNED_DEFAULT);
  // key -> 到期时间戳(ms)
  let ACCESS_RENTAL_UNTIL = {};
  const ACCESS_TAG = {
    owned: { text: "已拥有", bg: "#3ddc84", fg: "#06200a" },
    rental: { text: "小时", bg: "#7ad7ff", fg: "#061820" },
    trial: { text: "可试飞", bg: "#ffe08a", fg: "#2a2000" },
  };
  const ACQUIRE_COST = 30; // 每件装备购买星碎币
  const INVITE_GRANT_NEW_H = 48; // 新玩家点开
  const INVITE_GRANT_OLD_H = 2;  // 老玩家点开
  const INVITE_PENDING_MS = 24 * 3600 * 1000; // 转发等待有效期 24 小时
  const OWNED_KEY = "papa.garage.owned.v1";
  const RENTAL_KEY = "papa.garage.rental.v1";
  const INVITE_PENDING_KEY = "papa.garage.invite.pending.v1";
  function rentalHoursLeft(until) {
    const left = Math.max(0, (Number(until) || 0) - Date.now());
    if (left <= 0) return 0;
    return Math.max(1, Math.ceil(left / 3600000));
  }
  function accessOf(key) {
    if (ACCESS_OWNED[key]) return { mode: "owned" };
    const until = Number(ACCESS_RENTAL_UNTIL[key]) || 0;
    const hours = rentalHoursLeft(until);
    if (hours > 0) return { mode: "rental", hours, until };
    return { mode: "trial" };
  }
  // 永久拥有不再邀；限时中仍可邀以叠加时长（主/副武器、引擎、飞机统一）
  function canInviteFree(key) {
    return !!key && !ACCESS_OWNED[key];
  }
  function accessBadge(key, pendingKey) {
    const a = accessOf(key);
    if (pendingKey && key === pendingKey && a.mode === "trial") {
      return { text: "待进入", bg: "#7ad7ff", fg: "#061820" };
    }
    if (a.mode === "owned") return ACCESS_TAG.owned;
    if (a.mode === "rental") {
      return { text: `${a.hours}小时`, bg: ACCESS_TAG.rental.bg, fg: ACCESS_TAG.rental.fg };
    }
    return ACCESS_TAG.trial;
  }
  function exportAccessSnapshot() {
    const owned = {};
    Object.keys(ACCESS_OWNED).forEach((k) => { if (ACCESS_OWNED[k]) owned[k] = true; });
    const rental = {};
    const now = Date.now();
    Object.keys(ACCESS_RENTAL_UNTIL).forEach((k) => {
      const u = Number(ACCESS_RENTAL_UNTIL[k]) || 0;
      if (u > now) rental[k] = u;
    });
    return { owned, rental };
  }
  /** 合并权限：永久取并集；限时取更晚到期，避免服务器空包把本地刚解锁的覆盖掉 */
  function applyAccessSnapshot(snap, replace) {
    if (!snap || typeof snap !== "object") return;
    const owned = snap.owned && typeof snap.owned === "object" ? snap.owned : {};
    const rental = snap.rental && typeof snap.rental === "object" ? snap.rental : {};
    const now = Date.now();
    if (replace) {
      ACCESS_OWNED = Object.assign({}, ACCESS_OWNED_DEFAULT);
      ACCESS_RENTAL_UNTIL = {};
    } else if (!ACCESS_OWNED || typeof ACCESS_OWNED !== "object") {
      ACCESS_OWNED = Object.assign({}, ACCESS_OWNED_DEFAULT);
    }
    Object.keys(owned).forEach((k) => { if (owned[k]) ACCESS_OWNED[k] = true; });
    Object.keys(rental).forEach((k) => {
      const u = Number(rental[k]) || 0;
      if (u <= now) return;
      const cur = Number(ACCESS_RENTAL_UNTIL[k]) || 0;
      if (u > cur) ACCESS_RENTAL_UNTIL[k] = u;
    });
    // 清掉已过期的限时
    Object.keys(ACCESS_RENTAL_UNTIL).forEach((k) => {
      if ((Number(ACCESS_RENTAL_UNTIL[k]) || 0) <= now) delete ACCESS_RENTAL_UNTIL[k];
    });
  }

  const CANNON_CD = 0.325;
  const LASER_CD = 0.62;
  const GAT_SPIN_UP = 0.9;
  const EMP_CD = 2;
  const EMP_STUN = 4.2;
  const MIS_MAX = 4;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  function create(host) {
    const ctx = host.ctx;
    const storage = host.storage || { get() { return null; }, set() {} };
    let W = 0, H = 0, S = { l: 0, r: 0, t: 0, b: 0 };

    let loadout = loadLoadout();
    let view = "garage";      // garage | arena
    let tab = 0;              // 0 主武器 1 副武器 2 引擎 3 飞机
    let focusKey = loadout.slots[0]; // 左侧预览当前点选的装备
    let toastMsg = "", toastUntil = 0;

    // 合并本地永久拥有 + 限时使用权
    try {
      const raw = JSON.parse(storage.get(OWNED_KEY) || "null");
      if (raw && typeof raw === "object") {
        ACCESS_OWNED = Object.assign({}, ACCESS_OWNED_DEFAULT, raw);
      }
    } catch (e) {}
    try {
      const rawR = JSON.parse(storage.get(RENTAL_KEY) || "null");
      if (rawR && typeof rawR === "object") {
        ACCESS_RENTAL_UNTIL = {};
        const now = Date.now();
        Object.keys(rawR).forEach((k) => {
          const u = Number(rawR[k]) || 0;
          if (u > now) ACCESS_RENTAL_UNTIL[k] = u;
        });
      }
    } catch (e) {}
    function persistOwned() {
      try { storage.set(OWNED_KEY, JSON.stringify(ACCESS_OWNED)); } catch (e) {}
    }
    function persistRental() {
      try {
        const now = Date.now();
        const out = {};
        Object.keys(ACCESS_RENTAL_UNTIL).forEach((k) => {
          const u = Number(ACCESS_RENTAL_UNTIL[k]) || 0;
          if (u > now) out[k] = u;
        });
        storage.set(RENTAL_KEY, JSON.stringify(out));
      } catch (e) {}
    }
    function persistAccess() {
      persistOwned();
      persistRental();
      if (typeof host.onAccessChange === "function") {
        try { host.onAccessChange(exportAccessSnapshot()); } catch (e) {}
      }
    }
    function readInvitePending() {
      try {
        const v = JSON.parse(storage.get(INVITE_PENDING_KEY) || "null");
        if (!v || !v.key) return null;
        const at = Number(v.at) || 0;
        if (at && Date.now() - at > INVITE_PENDING_MS) {
          storage.set(INVITE_PENDING_KEY, "");
          return null;
        }
        return { key: String(v.key), name: String(v.name || v.key), inviter: String(v.inviter || ""), at };
      } catch (e) {}
      return null;
    }
    function writeInvitePending(p) {
      try {
        if (!p) storage.set(INVITE_PENDING_KEY, "");
        else storage.set(INVITE_PENDING_KEY, JSON.stringify(p));
      } catch (e) {}
    }
    function itemNameOf(key) {
      if (WEAPONS[key]) return WEAPONS[key].name;
      if (ENGINES[key]) return ENGINES[key].name;
      if (CRAFTS[key]) return CRAFTS[key].name;
      return key;
    }
    function readStarShards() {
      if (typeof host.getStarShards === "function") {
        return Math.max(0, Number(host.getStarShards()) || 0);
      }
      try {
        const s = (typeof GameGlobal !== "undefined" && GameGlobal.playerStats) || null;
        return Math.max(0, Number(s && s.starShards) || 0);
      } catch (e) { return 0; }
    }
    function spendStarShards(n) {
      const cost = Math.max(0, Number(n) || 0);
      if (cost <= 0) return true;
      if (typeof host.spendStarShards === "function") return !!host.spendStarShards(cost);
      try {
        const s = (typeof GameGlobal !== "undefined" && GameGlobal.playerStats) || null;
        if (!s) return false;
        const bal = Math.max(0, Number(s.starShards) || 0);
        if (bal < cost) return false;
        s.starShards = Math.round((bal - cost) * 100) / 100;
        return true;
      } catch (e) { return false; }
    }

    // ---------- 存档 ----------
    function validLoadout(v) {
      return !!(v && Array.isArray(v.slots) && SLOT_KEYS[0].includes(v.slots[0]) && SLOT_KEYS[1].includes(v.slots[1]) && ENGINES[v.engine]);
    }
    function loadLoadout() {
      try {
        const v = JSON.parse(storage.get(SAVE_KEY) || "null");
        if (validLoadout(v)) {
          const craftKey = CRAFT_ALIASES[v.craft] || v.craft;
          return { slots: v.slots.slice(), engine: v.engine, craft: CRAFTS[craftKey] ? craftKey : DEFAULT.craft };
        }
      } catch (e) {}
      return { slots: DEFAULT.slots.slice(), engine: DEFAULT.engine, craft: DEFAULT.craft };
    }
    function loadoutParts() {
      return [
        { slot: "主武器", kind: "weapon", key: loadout.slots[0], name: WEAPONS[loadout.slots[0]].name },
        { slot: "副武器", kind: "weapon", key: loadout.slots[1], name: WEAPONS[loadout.slots[1]].name },
        { slot: "引擎", kind: "engine", key: loadout.engine, name: ENGINES[loadout.engine].name },
        { slot: "飞机", kind: "craft", key: loadout.craft, name: CRAFTS[loadout.craft].name },
      ];
    }
    function trialParts() {
      return loadoutParts().filter((p) => accessOf(p.key).mode === "trial");
    }
    function commitSaveLoadout() {
      try { storage.set(SAVE_KEY, JSON.stringify(loadout)); } catch (e) {}
      savedUntil = Date.now() + 1400;
      if (host.onSave) {
        try { host.onSave({ slots: loadout.slots.slice(), engine: loadout.engine, craft: loadout.craft }); } catch (e) {}
      }
    }
    let savedUntil = 0;
    let saveConfirmOpen = false;
    let acquireItem = null; // { key, name }
    let inviteWait = null; // { key, name } 等待好友进入说明窗
    let inviteUnlocked = null; // { key, name, hours, added }
    let invitePending = readInvitePending();
    if (invitePending && ACCESS_OWNED[invitePending.key]) {
      writeInvitePending(null);
      invitePending = null;
    }
    function openSaveConfirm() { acquireItem = null; inviteWait = null; saveConfirmOpen = true; }
    function closeSaveConfirm() { saveConfirmOpen = false; }
    function openAcquire(key, name) {
      if (accessOf(key).mode === "owned") { toast("已永久拥有该装备"); return; }
      saveConfirmOpen = false;
      // 始终进购买窗：星碎够就能买，不被「等待好友」挡住
      inviteWait = null;
      acquireItem = { key, name };
    }
    function closeAcquire() { acquireItem = null; }
    function closeInviteWait() { inviteWait = null; }
    function closeInviteUnlocked() { inviteUnlocked = null; }
    function myInviterId() {
      if (typeof host.getInviterId === "function") {
        try { return String(host.getInviterId() || ""); } catch (e) {}
      }
      try { return storage.get("papa.wx.openid") || storage.get("papa.pilot.token") || ""; } catch (e) { return ""; }
    }
    function beginInviteFree(key, name) {
      if (!canInviteFree(key)) {
        toast("已永久拥有");
        return;
      }
      const inviter = myInviterId();
      if (!inviter) {
        toast("登录后才能邀请");
        return;
      }
      const pending = { key, name: name || itemNameOf(key), inviter, at: Date.now() };
      writeInvitePending(pending);
      invitePending = pending;
      acquireItem = null;
      inviteWait = { key: pending.key, name: pending.name };
      if (typeof host.onInviteFreeEquip === "function") {
        try { host.onInviteFreeEquip({ key: pending.key, name: pending.name, inviter: pending.inviter }); } catch (e) {}
      }
    }
    /**
     * 本地领取（仅模拟/兜底）：自领取起叠加 hours
     * @param {number} [hours] 默认按新玩家 48h
     */
    function grantFreeEquip(key, name, hours) {
      if (!key) return false;
      if (ACCESS_OWNED[key]) {
        writeInvitePending(null);
        invitePending = null;
        inviteWait = null;
        toast("已永久拥有，无需邀请");
        return false;
      }
      const addH = Math.max(1, Number(hours) || INVITE_GRANT_NEW_H);
      const now = Date.now();
      const cur = Number(ACCESS_RENTAL_UNTIL[key]) || 0;
      const until = Math.max(now, cur) + addH * 3600000;
      ACCESS_RENTAL_UNTIL[key] = until;
      writeInvitePending(null);
      invitePending = null;
      inviteWait = null;
      acquireItem = null;
      const left = rentalHoursLeft(until);
      focusEquipTab(key);
      inviteUnlocked = {
        key,
        name: name || itemNameOf(key),
        hours: left,
        added: addH,
      };
      persistOwned();
      persistRental();
      if (typeof host.onAccessChange === "function") {
        try { host.onAccessChange(exportAccessSnapshot()); } catch (e) {}
      }
      return true;
    }
    /**
     * 好友点卡片进入（严格）：
     * - 被邀请人：只助力服务器给「转发者」加时，本机绝不发奖、不改 rental
     * - 转发者本人：不发奖（等服务器 inviteGrant 推送）
     * - 仅 simHours>0 的本地模拟可 grantFreeEquip
     */
    function applyFreeEquipEnter(info) {
      const equip = info && info.equip ? String(info.equip) : "";
      const inviter = info && info.inviter != null ? String(info.inviter) : "";
      if (!equip) return { ok: false, reason: "bad" };
      const me = String(myInviterId() || "");
      const pending = readInvitePending() || invitePending;
      const pendingName = (pending && pending.key === equip && pending.name) || itemNameOf(equip);
      const simHours = info && info.simHours != null ? Number(info.simHours) : 0;

      // 本地模拟（开发机）：才允许本机发奖
      if (simHours > 0) {
        grantFreeEquip(equip, pendingName, simHours);
        return { ok: true, role: "inviter", key: equip, hours: rentalHoursLeft(ACCESS_RENTAL_UNTIL[equip]), simulated: true };
      }

      // 无转发者 id：不能发奖（避免点开者误领）
      if (!inviter) {
        toast("邀请已失效");
        return { ok: false, reason: "no_inviter" };
      }

      // 转发者本人点开：不发奖
      if (me && inviter === me) {
        return { ok: true, role: "inviter", key: equip, skipped: true };
      }

      // 被邀请人：只上报助力
      if (typeof host.onHelpFreeEquip === "function") {
        try { host.onHelpFreeEquip({ equip, inviter }); } catch (e) {}
      }
      return { ok: true, role: "helper", key: equip };
    }
    function setAccessFromServer(snap) {
      // 合并而非整表替换，防止 get 空数据冲掉刚获取的限时
      applyAccessSnapshot(snap, false);
      persistOwned();
      persistRental();
      invitePending = readInvitePending();
      // 仅当本地限时/永久比服务器包更全时回推，避免死循环
      try {
        const local = exportAccessSnapshot();
        const remoteOwned = (snap && snap.owned) || {};
        const remoteRental = (snap && snap.rental) || {};
        let richer = false;
        Object.keys(local.owned || {}).forEach((k) => {
          if (local.owned[k] && !remoteOwned[k]) richer = true;
        });
        Object.keys(local.rental || {}).forEach((k) => {
          const lu = Number(local.rental[k]) || 0;
          const ru = Number(remoteRental[k]) || 0;
          if (lu > ru + 1000) richer = true;
        });
        if (richer && typeof host.onAccessChange === "function") {
          host.onAccessChange(local);
        }
      } catch (e) {}
    }
    function focusEquipTab(key) {
      if (!key) return;
      if (SLOT_KEYS[0].includes(key)) tab = 0;
      else if (SLOT_KEYS[1].includes(key)) tab = 1;
      else if (ENGINE_KEYS.includes(key)) tab = 2;
      else if (CRAFT_KEYS.includes(key)) tab = 3;
    }
    /** 服务器推送领取成功：更新角标 + 弹出领取面板（时长自领取起计） */
    function showInviteGranted(equip, hours, added) {
      if (!equip) return;
      inviteWait = null;
      acquireItem = null;
      focusEquipTab(equip);
      const left = rentalHoursLeft(ACCESS_RENTAL_UNTIL[equip]);
      const add = Math.max(1, Number(added) || INVITE_GRANT_OLD_H);
      const h = Math.max(1, Number(hours) || left || add);
      inviteUnlocked = {
        key: equip,
        name: itemNameOf(equip),
        hours: h,
        added: add,
      };
    }
    function toast(msg) { toastMsg = msg; toastUntil = Date.now() + 1800; }

    function equip(slot, key) {
      if (!SLOT_KEYS[slot].includes(key)) return;
      loadout.slots[slot] = key;
      focusKey = key;
      resetSlots();
    }
    function setEngine(k) { loadout.engine = k; focusKey = k; }
    function setCraft(k) { if (CRAFTS[k]) { loadout.craft = k; focusKey = k; } }
    function tabLabelOf(i) {
      if (i === 0) return "主武器";
      if (i === 1) return "副武器";
      if (i === 2) return "引擎";
      return "飞机";
    }
    function focusMeta(key) {
      const k = String(key || "");
      if (WEAPONS[k]) {
        const slot = SLOT_KEYS[0].includes(k) ? "主武器" : "副武器";
        // 当前页签优先：点在哪个 tab 就显示哪个槽位名
        const lab = (tab === 0 || tab === 1) ? tabLabelOf(tab) : slot;
        return { key: k, kind: "weapon", slot: lab, name: WEAPONS[k].name, desc: WEAPONS[k].desc, color: WEAPONS[k].color, stat: WEAPONS[k].stat || null };
      }
      if (ENGINES[k]) {
        return { key: k, kind: "engine", slot: "引擎", name: ENGINES[k].name, desc: ENGINES[k].desc, color: ENGINES[k].color, stat: ENGINES[k].stat || null };
      }
      if (CRAFTS[k]) {
        return { key: k, kind: "craft", slot: "飞机", name: CRAFTS[k].name, desc: CRAFTS[k].desc, color: CRAFTS[k].color, stat: null };
      }
      return null;
    }
    function usageTipFor(key) {
      if (key === "laser") return "按住调整方向 · 松开发射";
      if (key === "emp") return "按住瞄准 · 松开打出闪电团";
      if (key === "gatling") return "按住开火 · 越转射速越快";
      if (key === "cannon") return "点射重炮 · 注意弹速";
      if (key === "missile" || key === "mirv") return "自动追踪 · 注意弹药";
      if (key === "drone") return "放出伴飞 · 靠近敌机拦截";
      if (key === "twin") return "高速机动 · 转向偏沉";
      if (key === "single") return "灵活转向 · 极速一般";
      if (CRAFTS[key]) return "俯视机型预览 · 试飞可验证手感";
      return "A/B 切武器 · 右侧开火";
    }
    function drawFocusStatBars(x, y, w, stat, color) {
      if (!stat) return 0;
      const keys = Object.keys(stat);
      if (!keys.length) return 0;
      const rowH = 16;
      keys.forEach((lab, i) => {
        const yy = y + i * rowH;
        const v = Math.max(0, Math.min(5, Number(stat[lab]) || 0));
        text(lab, x, yy + 7, "#9eb0c0", 10, "left");
        const bx = x + 38;
        const bw = Math.max(48, w - 38);
        const bh = 7;
        rrect(bx, yy + 3, bw, bh, 3);
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fill();
        if (v > 0) {
          rrect(bx, yy + 3, Math.max(4, bw * (v / 5)), bh, 3);
          ctx.fillStyle = color || "#7ad7ff";
          ctx.fill();
        }
      });
      return keys.length * rowH;
    }
    /** 武器/引擎预览台：干净圆环 + 图标，不叠飞机 */
    function drawEquipShowcase(cx, cy, focus, now) {
      if (!focus) return;
      const pulse = 0.5 + 0.5 * Math.sin(now / 700);
      const r = 54;
      // 外圈光晕
      const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, r + 28);
      g.addColorStop(0, hexA(focus.color || "#7ad7ff", 0.22 + pulse * 0.08));
      g.addColorStop(0.55, hexA(focus.color || "#7ad7ff", 0.08));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 28, 0, Math.PI * 2);
      ctx.fill();
      // 台座环
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10,18,28,0.72)";
      ctx.fill();
      ctx.strokeStyle = hexA(focus.color || "#7ad7ff", 0.55);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // 图标
      const bob = Math.sin(now / 550) * 3;
      if (focus.kind === "engine") drawEngineIcon(focus.key, cx, cy + bob, 1.55);
      else drawWeaponIcon(focus.key, cx, cy + bob, 1.45);
    }
    function hexA(hex, a) {
      const h = String(hex || "#7ad7ff").replace("#", "");
      if (h.length !== 6) return `rgba(122,215,255,${a})`;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }

    // ---------- 命中区（每帧重建） ----------
    let hits = [];
    function addHit(x, y, w, h, opt) { hits.push(Object.assign({ x, y, w, h }, opt)); }
    function hitAt(x, y) {
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
      }
      return null;
    }

    // ---------- 触摸 ----------
    const touches = new Map();
    let stick = null; // { id, bx, by, x, y }
    const STICK_R = 54;
    function touchStart(list) {
      // 已保存成功蒙层：点任意处关闭，不穿透
      if (Date.now() < savedUntil) { savedUntil = 0; return; }
      for (const t of list) {
        const h = hitAt(t.x, t.y);
        if (h && h.hold) { touches.set(t.id, { kind: "hold", key: h.key, x: t.x, y: t.y }); continue; }
        if (h && h.onTap) { touches.set(t.id, { kind: "tap", hit: h, x: t.x, y: t.y }); continue; }
        if (view === "arena" && !stick && t.x < W * 0.5) {
          stick = { id: t.id, bx: t.x, by: t.y, x: t.x, y: t.y };
          touches.set(t.id, { kind: "stick" });
        }
      }
    }
    function touchMove(list) {
      for (const t of list) {
        const s = touches.get(t.id);
        if (!s) continue;
        s.x = t.x; s.y = t.y;
        if (s.kind === "stick" && stick) { stick.x = t.x; stick.y = t.y; }
      }
    }
    function touchEnd(list) {
      for (const t of list) {
        const s = touches.get(t.id);
        if (!s) continue;
        touches.delete(t.id);
        if (s.kind === "stick") stick = null;
        if (s.kind === "tap") {
          const h = s.hit;
          if (t.x >= h.x - 8 && t.x <= h.x + h.w + 8 && t.y >= h.y - 8 && t.y <= h.y + h.h + 8) h.onTap();
        }
      }
    }
    function held(key) {
      for (const s of touches.values()) if (s.kind === "hold" && s.key === key) return true;
      return false;
    }

    // ---------- 试飞世界 ----------
    const me = { x: 0, y: 0, h: -Math.PI / 2, spd: 0 };
    const bullets = [], missiles = [], parts = [], bolts = [], targets = [], dmgLog = [];
    const mirvStages = [];
    let laserBeam = null;
    let kills = 0, hitsN = 0;
    let slotState = [mkSlot(), mkSlot()];
    function mkSlot() { return { cd: 0, heat: 0, over: false, ammo: MIS_MAX, regen: 0, alt: false, spin: 0 }; }
    function resetSlots() { slotState = [mkSlot(), mkSlot()]; laserBeam = null; }

    function enterArena() {
      view = "arena";
      me.x = W * 0.5; me.y = H * 0.6; me.h = -Math.PI / 2; me.spd = 0;
      bullets.length = missiles.length = parts.length = bolts.length = dmgLog.length = 0;
      mirvStages.length = 0;
      kills = 0; hitsN = 0;
      resetSlots();
      targets.length = 0;
      for (let i = 0; i < 7; i++) targets.push(spawnTarget({}));
    }
    function exitArena() { view = "garage"; stick = null; touches.clear(); }

    function spawnTarget(o) {
      const pad = 50;
      let x = 0, y = 0;
      for (let n = 0; n < 20; n++) {
        x = rand(S.l + pad, W - S.r - pad);
        y = rand(S.t + 60, H - S.b - pad);
        if (Math.hypot(x - me.x, y - me.y) > 180) break;
      }
      const hover = Math.random() < 0.5;
      return Object.assign(o, { x, y, h: rand(0, Math.PI * 2), spd: hover ? 0 : rand(35, 70), hp: 100, stun: 0, dead: 0, flash: 0, wpT: 0, wpH: 0, hover, beamAcc: 0 });
    }

    // 炮口/挂点按机体单位换算到屏幕（与 drawFighter 的挂点一致）
    function nose() {
      const d = (1.6 + BARREL_LEN) * GAME_SHIP_SCALE;
      return { x: me.x + Math.cos(me.h) * d, y: me.y + Math.sin(me.h) * d };
    }
    function wingPt(side) {
      const lat = 12 * GAME_SHIP_SCALE, fwd = 0;
      return {
        x: me.x - Math.sin(me.h) * side * lat + Math.cos(me.h) * fwd,
        y: me.y + Math.cos(me.h) * side * lat + Math.sin(me.h) * fwd,
      };
    }
    function slotOrigin(slot, alt) { return slot === 0 ? nose() : wingPt(alt ? 1 : -1); }

    function pickTarget(o, h, cone, range) {
      let best = null, bestS = Infinity;
      for (const t of targets) {
        if (t.dead > 0) continue;
        const dx = t.x - o.x, dy = t.y - o.y, d = Math.hypot(dx, dy);
        if (d > range) continue;
        const da = Math.abs(angDiff(Math.atan2(dy, dx), h));
        if (da > cone) continue;
        const sc = d * (1 + da * 1.5);
        if (sc < bestS) { bestS = sc; best = t; }
      }
      return best;
    }

    function tickWeapon(slot, on, dt) {
      const key = loadout.slots[slot];
      const s = slotState[slot];
      s.cd = Math.max(0, s.cd - dt);
      if (key === "gun") {
        if (on && s.cd <= 0) {
          s.cd = 0.1;
          s.alt = !s.alt;
          const o = slotOrigin(slot, s.alt);
          const a = me.h + rand(-0.03, 0.03);
          bullets.push({ x: o.x, y: o.y, vx: Math.cos(a) * 700 + Math.cos(me.h) * me.spd, vy: Math.sin(a) * 700 + Math.sin(me.h) * me.spd, life: 0.45, dmg: 5, kind: "gun" });
          spark(o.x, o.y, "#9dff7a", 3);
        }
      } else if (key === "cannon") {
        // 重炮：慢射速、大弹体，命中带小范围爆炸
        if (on && s.cd <= 0) {
          s.cd = CANNON_CD;
          const o = nose();
          bullets.push({ x: o.x, y: o.y, vx: Math.cos(me.h) * 1040 + Math.cos(me.h) * me.spd, vy: Math.sin(me.h) * 1040 + Math.sin(me.h) * me.spd, life: 0.5, dmg: 30, kind: "shell" });
          spark(o.x, o.y, "#ffd27a", 14);
          me.spd = Math.max(0, me.spd - 40);
        }
      } else if (key === "gatling") {
        // 加特林：按住预热，射速从慢到快；两根炮管交替出弹
        s.spin = clamp(s.spin + (on ? dt / GAT_SPIN_UP : -dt / 0.5), 0, 1);
        if (on && s.cd <= 0) {
          s.cd = 0.14 - 0.095 * s.spin;
          s.alt = !s.alt;
          const side = s.alt ? 1 : -1;
          const o = nose();
          o.x += -Math.sin(me.h) * side * 2.6;
          o.y += Math.cos(me.h) * side * 2.6;
          const a = me.h + rand(-0.07, 0.07);
          bullets.push({ x: o.x, y: o.y, vx: Math.cos(a) * 760 + Math.cos(me.h) * me.spd, vy: Math.sin(a) * 760 + Math.sin(me.h) * me.spd, life: 0.36, dmg: 3, kind: "gat" });
          spark(o.x, o.y, "#fff2a8", 2);
        }
      } else if (key === "laser") {
        if (on && s.cd <= 0) { s.cd = LASER_CD; fireLaser(slot); }
      } else if (key === "emp") {
        if (on && s.cd <= 0) { s.cd = EMP_CD; fireEmp(slot); }
      } else if (key === "missile" || key === "mirv") {
        if (s.ammo < MIS_MAX) { s.regen += dt; if (s.regen >= 2.2) { s.ammo++; s.regen = 0; } } else s.regen = 0;
        if (on && s.cd <= 0 && s.ammo > 0) {
          s.cd = key === "mirv" ? 0.7 : 0.45; s.ammo--; s.alt = !s.alt;
          const o = slotOrigin(slot, s.alt);
          missiles.push({
            x: o.x, y: o.y, h: me.h + (s.alt ? 0.25 : -0.25), spd: Math.max(140, me.spd), life: 3,
            tgt: pickTarget(o, me.h, 1, 700), trail: [], age: 0,
            ox: o.x, oy: o.y,
            mirvBus: key === "mirv", mirvChild: false, scale: 1, coast: 0,
          });
        }
      } else if (key === "drone") {
        // 机库预览：点射时从两翼喷一点火花表示召唤
        if (on && s.cd <= 0) {
          s.cd = 0.8;
          const o0 = slotOrigin(slot, false);
          const o1 = slotOrigin(slot, true);
          spark(o0.x, o0.y, "#5dffc8", 3);
          spark(o1.x, o1.y, "#5dffc8", 3);
        }
      }
    }

    // 与对战同款：瞬发红色脉冲光束，穿透路径上所有目标
    function fireLaser(slot) {
      const o = slotOrigin(slot, false);
      const dx = Math.cos(me.h), dy = Math.sin(me.h);
      const len = 640;
      laserBeam = { x0: o.x, y0: o.y, x1: o.x + dx * len, y1: o.y + dy * len, t: 0.08, max: 0.08 };
      for (const t of targets) {
        if (t.dead > 0) continue;
        if (!segCircle(o.x, o.y, laserBeam.x1, laserBeam.y1, t.x, t.y, 16)) continue;
        damage(t, t.hp, false);
        for (let i = 0; i < 10; i++) parts.push({ x: t.x, y: t.y, vx: rand(-150, 150), vy: rand(-150, 150), life: 0.3, max: 0.3, c: Math.random() < 0.5 ? "#ffb3c1" : "#ff7a3d", s: 2 });
      }
      spark(o.x, o.y, "#ff8aa0", 6);
    }

    function fireEmp(slot) {
      const o = slotOrigin(slot, false);
      const t = pickTarget(o, me.h, 0.6, 300);
      const end = t ? { x: t.x, y: t.y } : { x: o.x + Math.cos(me.h) * 240, y: o.y + Math.sin(me.h) * 240 };
      const mid = { x: (o.x + end.x) / 2 + rand(-34, 34), y: (o.y + end.y) / 2 + rand(-34, 34) };
      bolts.push({ paths: [jagged(o, end, 9, 18), jagged(o, mid, 5, 11)], life: 0.32, max: 0.32 });
      spark(o.x, o.y, "#bfe9ff", 12);
      if (t) {
        t.stun = EMP_STUN;
        damage(t, 8, false);
        for (let i = 0; i < 14; i++) parts.push({ x: t.x, y: t.y, vx: rand(-140, 140), vy: rand(-140, 140), life: 0.4, max: 0.4, c: "#9fe3ff", s: 2 });
        toast("目标瘫痪 4 秒");
      }
    }

    function jagged(a, b, n, amp) {
      const pts = [{ x: a.x, y: a.y }];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      for (let i = 1; i < n; i++) {
        const k = i / n, off = rand(-amp, amp) * Math.sin(k * Math.PI);
        pts.push({ x: a.x + dx * k + nx * off, y: a.y + dy * k + ny * off });
      }
      pts.push({ x: b.x, y: b.y });
      return pts;
    }

    function spark(x, y, c, n) {
      for (let i = 0; i < n; i++) parts.push({ x, y, vx: Math.cos(me.h) * rand(60, 180) + rand(-50, 50), vy: Math.sin(me.h) * rand(60, 180) + rand(-50, 50), life: 0.12, max: 0.12, c, s: 2 });
    }

    function damage(t, amt, beam) {
      t.hp -= amt;
      t.flash = 0.08;
      dmgLog.push({ t: Date.now(), d: amt });
      if (!beam) hitsN++;
      else { t.beamAcc += amt; if (t.beamAcc >= 10) { hitsN++; t.beamAcc = 0; } }
      if (t.hp <= 0) {
        kills++;
        t.dead = 1.3;
        for (let i = 0; i < 36; i++) {
          const a = rand(0, Math.PI * 2), v = rand(40, 280);
          parts.push({ x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), max: 0.9, c: Math.random() < 0.5 ? "#ffb347" : "#ff6a3d", s: rand(2, 4) });
        }
      }
    }

    function blast(x, y, r, dmg) {
      for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2), v = rand(50, 230);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.6), max: 0.6, c: Math.random() < 0.5 ? "#ffd27a" : "#ff7a3d", s: rand(2, 4) });
      }
      parts.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: "ring", s: r });
      for (const t of targets) {
        if (t.dead > 0) continue;
        const d = Math.hypot(t.x - x, t.y - y);
        if (d < r) damage(t, dmg * (1 - d / r * 0.5), false);
      }
    }

    function segCircle(x0, y0, x1, y1, cx, cy, r) {
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
      const k = clamp(((cx - x0) * dx + (cy - y0) * dy) / L2, 0, 1);
      const ex = x0 + dx * k - cx, ey = y0 + dy * k - cy;
      return ex * ex + ey * ey < r * r;
    }

    function updateArena(dt) {
      const eng = ENGINES[loadout.engine];
      let wantSpd = eng.max * 0.45;
      if (stick) {
        const dx = stick.x - stick.bx, dy = stick.y - stick.by;
        const mag = Math.min(1, Math.hypot(dx, dy) / STICK_R);
        if (mag > 0.15) {
          me.h += clamp(angDiff(Math.atan2(dy, dx), me.h), -eng.turn * dt, eng.turn * dt);
          wantSpd = eng.max * (0.35 + 0.65 * mag);
        }
      }
      me.spd += clamp(wantSpd - me.spd, -eng.accel * dt, eng.accel * dt);
      me.x += Math.cos(me.h) * me.spd * dt;
      me.y += Math.sin(me.h) * me.spd * dt;
      const x0 = S.l + 16, x1 = W - S.r - 16, y0 = S.t + 16, y1 = H - S.b - 16;
      if (me.x < x0 || me.x > x1) { me.x = clamp(me.x, x0, x1); me.h = Math.PI - me.h; }
      if (me.y < y0 || me.y > y1) { me.y = clamp(me.y, y0, y1); me.h = -me.h; }

      tickWeapon(0, held("A"), dt);
      tickWeapon(1, held("B"), dt);
      if (laserBeam) { laserBeam.t -= dt; if (laserBeam.t <= 0) laserBeam = null; }

      for (const t of targets) {
        if (t.dead > 0) { t.dead -= dt; if (t.dead <= 0) spawnTarget(t); continue; }
        t.flash = Math.max(0, t.flash - dt);
        if (t.stun > 0) {
          t.stun -= dt;
          if (Math.random() < 0.25) parts.push({ x: t.x + rand(-12, 12), y: t.y + rand(-12, 12), vx: rand(-30, 30), vy: rand(-30, 30), life: 0.18, max: 0.18, c: "#9fe3ff", s: 1.5 });
          continue;
        }
        if (!t.hover) {
          t.wpT -= dt;
          if (t.wpT <= 0) { t.wpH = rand(0, Math.PI * 2); t.wpT = rand(1.5, 3.5); }
          t.h += clamp(angDiff(t.wpH, t.h), -1.4 * dt, 1.4 * dt);
          t.x += Math.cos(t.h) * t.spd * dt;
          t.y += Math.sin(t.h) * t.spd * dt;
          if (t.x < S.l + 30 || t.x > W - S.r - 30 || t.y < S.t + 50 || t.y > H - S.b - 30) {
            t.wpH = Math.atan2(H / 2 - t.y, W / 2 - t.x);
            t.x = clamp(t.x, S.l + 30, W - S.r - 30);
            t.y = clamp(t.y, S.t + 50, H - S.b - 30);
          }
        }
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const px = b.x, py = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        let hit = false;
        for (const t of targets) {
          if (t.dead > 0) continue;
          if (segCircle(px, py, b.x, b.y, t.x, t.y, b.kind === "shell" ? 17 : 14)) {
            damage(t, b.dmg, false);
            if (b.kind === "shell") blast(b.x, b.y, 34, 10);
            hit = true;
            parts.push({ x: b.x, y: b.y, vx: rand(-70, 70), vy: rand(-70, 70), life: 0.15, max: 0.15, c: "#d8ffc8", s: 2 });
            break;
          }
        }
        if (hit || b.life <= 0) bullets.splice(i, 1);
      }

      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        m.age = (m.age || 0) + dt;
        if (m.coast > 0) m.coast = Math.max(0, m.coast - dt);
        // 靶场：距离发射点超过约 3 个机位再解体
        if (m.mirvBus && !m.mirvChild && Math.hypot(m.x - (m.ox || m.x), m.y - (m.oy || m.y)) > 150) {
          const cs = Math.cos(m.h), sn = Math.sin(m.h), px = -sn, py = cs;
          for (const side of [-1, 1]) {
            mirvStages.push({
              kind: "tank", x: m.x + px * side * 4, y: m.y + py * side * 4,
              vx: cs * m.spd * 0.4 + px * side * 70 - cs * 40, vy: sn * m.spd * 0.4 + py * side * 70 - sn * 40,
              rot: m.h + side * 0.3, spin: side * 3, age: 0, life: 1.0,
            });
          }
          mirvStages.push({
            kind: "nozzle", x: m.x - cs * 8, y: m.y - sn * 8,
            vx: cs * m.spd * 0.25 - cs * 90, vy: sn * m.spd * 0.25 - sn * 90,
            rot: m.h + Math.PI, spin: 2, age: 0, life: 0.9,
          });
          const fan = 0.95;
          for (let k = 0; k < 5; k++) {
            const t = k / 4;
            const spread = (t - 0.5) * 2 * fan;
            const outAng = m.h + spread;
            const ox = Math.cos(outAng) * (8 + Math.abs(spread) * 14);
            const oy = Math.sin(outAng) * (8 + Math.abs(spread) * 14);
            missiles.push({
              x: m.x + ox, y: m.y + oy, h: outAng, spd: Math.max(m.spd, 180),
              life: 2.8, tgt: m.tgt, trail: [], age: 0, mirvBus: false, mirvChild: true,
              scale: 0.55, coast: 0.28,
            });
          }
          missiles.splice(i, 1);
          continue;
        }
        if (!m.tgt || m.tgt.dead > 0) m.tgt = pickTarget(m, m.h, 1.4, 600);
        const turn = m.mirvChild ? 6.2 : 4.2;
        if (m.tgt && !(m.coast > 0)) m.h += clamp(angDiff(Math.atan2(m.tgt.y - m.y, m.tgt.x - m.x), m.h), -turn * dt, turn * dt);
        m.spd = Math.min(480, m.spd + 520 * dt);
        m.x += Math.cos(m.h) * m.spd * dt;
        m.y += Math.sin(m.h) * m.spd * dt;
        m.life -= dt;
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 16) m.trail.shift();
        let boom = m.life <= 0 || m.x < 0 || m.x > W || m.y < 0 || m.y > H;
        for (const t of targets) { if (t.dead <= 0 && Math.hypot(t.x - m.x, t.y - m.y) < 16) { boom = true; break; } }
        if (boom) {
          const dmg = m.mirvChild ? 14 : 35;
          const rad = m.mirvChild ? 28 : 52;
          blast(m.x, m.y, rad, dmg);
          missiles.splice(i, 1);
        }
      }

      for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].life -= dt; if (bolts[i].life <= 0) bolts.splice(i, 1); }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt;
        if (p.life <= 0) parts.splice(i, 1);
      }
      for (let i = mirvStages.length - 1; i >= 0; i--) {
        const s = mirvStages[i];
        s.age += dt;
        if (s.age >= s.life) { mirvStages.splice(i, 1); continue; }
        s.vx *= 0.96; s.vy *= 0.96;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.rot += s.spin * dt;
      }
      const now = Date.now();
      while (dmgLog.length && now - dmgLog[0].t > 5000) dmgLog.shift();
    }

    // ---------- 绘制工具 ----------
    function rrect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
      ctx.lineTo(x + w, y + h - r);
      ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
      ctx.lineTo(x + r, y + h);
      ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
      ctx.lineTo(x, y + r);
      ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
      ctx.closePath();
    }
    function text(s, x, y, color, size, align, bold) {
      ctx.fillStyle = color;
      ctx.font = `${bold ? "bold " : ""}${size}px sans-serif`;
      ctx.textAlign = align || "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, x, y);
    }
    function poly(pts, fill) {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    function circle(x, y, r, fill) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    function button(x, y, w, h, label, primary, onTap) {
      rrect(x, y, w, h, 8);
      ctx.fillStyle = primary ? "#2f6f4a" : "rgba(42,49,58,0.95)";
      ctx.fill();
      ctx.strokeStyle = primary ? "#3f8f60" : "rgba(140,200,220,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      text(label, x + w / 2, y + h / 2, "#e8f2f8", 13, "center", primary);
      addHit(x, y, w, h, { onTap });
    }
    function board(x, y, w, h, accent, on) {
      ctx.fillStyle = on ? "rgba(30,48,66,0.95)" : "rgba(14,26,38,0.92)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = on ? accent : "rgba(140,200,220,0.22)";
      ctx.lineWidth = on ? 1.5 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (on) { ctx.fillStyle = accent; ctx.fillRect(x, y, 3, h); }
    }
    function bg() {
      ctx.fillStyle = "#0b1622";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(122,215,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < W; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y < H; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
    }

    // ---------- 机体：与小游戏 drawFighterBody 同款（单人局默认蓝色轻染） ----------
    // 小游戏实际屏幕比例 = SHIP_DRAW_SCALE 0.9 × VIEW_SCALE 0.75
    const GAME_SHIP_SCALE = 0.675;
    const BARREL_LEN = 12.6;
    const TINT = { r: 120, g: 217, b: 255 };
    const lerp = (a, b, t) => a + (b - a) * t;
    function metal(k, shade, a) {
      const amt = 0.22 + (1 - shade) * 0.1;
      const r = Math.min(255, (16 + k * 78) * shade) * (1 - amt) + TINT.r * amt;
      const g = Math.min(255, (24 + k * 92) * shade) * (1 - amt) + TINT.g * amt;
      const b = Math.min(255, (38 + k * 118) * shade) * (1 - amt) + TINT.b * amt;
      return a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    }
    function fillPts(pts, color) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    function strokePts(pts, color, width) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    function bezierPt(p0, p1, p2, p3, t) {
      const u = 1 - t;
      return {
        x: p0.x * u * u * u + p1.x * 3 * u * u * t + p2.x * 3 * u * t * t + p3.x * t * t * t,
        y: p0.y * u * u * u + p1.y * 3 * u * u * t + p2.y * 3 * u * t * t + p3.y * t * t * t,
      };
    }
    function rotOff(ox, oy, px, py, ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { x: ox + px * c - py * s, y: oy + px * s + py * c };
    }
    function ellipsePts(cx, cy, rx, ry, rot, n) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const lx = Math.cos(t) * rx, ly = Math.sin(t) * ry;
        pts.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
      }
      return pts;
    }
    function edgeColor(tL, a) {
      return `rgba(${(0.16 + tL * 0.55) * 255 | 0},${(0.27 + tL * 0.59) * 255 | 0},${(0.43 + tL * 0.57) * 255 | 0},${a})`;
    }
    function nozzleEdge(tL) {
      return `rgba(${(0.35 + tL * 0.47) * 255 | 0},${(0.55 + tL * 0.35) * 255 | 0},${(0.71 + tL * 0.27) * 255 | 0},0.55)`;
    }

    function drawGameBody(power, now) {
      const kL = 1, kR = 205 / 255;
      const span = 1.14;
      const flutter = Math.sin(now / 1000 * 18) * 0.09 * 0.18;
      const notchY = 9;
      const wingY = 20;
      const nose = { x: 0, y: -30 * lerp(0.95, 1.1, power) };
      const lt = { x: -24 * span, y: wingY };
      const rt = { x: 24 * span, y: wingY };
      if (loadout.engine === "twin") {
        for (const s of [-1, 1]) {
          const tL = s > 0 ? kR : kL;
          fillPts([
            { x: s * 0.15, y: notchY - 0.4 }, { x: s * 3.1, y: 11.6 },
            { x: s * 2.4, y: 15.2 }, { x: s * 0.1, y: notchY + 2.6 },
          ], metal(tL, 0.72));
          ctx.beginPath(); ctx.moveTo(s * 0.2, notchY + 0.6); ctx.lineTo(s * 2.8, 13.1);
          ctx.strokeStyle = edgeColor(tL, 0.85); ctx.lineWidth = 1.15; ctx.stroke();
        }
        for (const s of [-1, 1]) {
          const tw = 7.2 * span;
          const tL = s > 0 ? kR : kL;
          const ox = s * 2.7, oy = 13.1, ang = s * flutter;
          const tip = [
            rotOff(ox, oy, -s * 1.6, -2.3, ang), rotOff(ox, oy, s * (tw - 1.4), -1.4, ang),
            rotOff(ox, oy, s * (tw * 0.86 - 1.4), 3.9, ang), rotOff(ox, oy, -s * 1.1, 3.4, ang),
          ];
          fillPts(tip, metal(tL, 0.86, 0.78));
          strokePts(tip, nozzleEdge(tL), 0.7);
        }
      } else {
        const tL = (kL + kR) * 0.5;
        fillPts([
          { x: -2.8, y: notchY - 0.2 }, { x: 2.8, y: notchY - 0.2 }, { x: 3.4, y: 12.2 },
          { x: 2.6, y: 15.6 }, { x: -2.6, y: 15.6 }, { x: -3.4, y: 12.2 },
        ], metal(tL, 0.74));
        ctx.beginPath();
        ctx.moveTo(-2.2, notchY + 0.8); ctx.lineTo(-2.8, 13.4);
        ctx.moveTo(2.2, notchY + 0.8); ctx.lineTo(2.8, 13.4);
        ctx.strokeStyle = edgeColor(tL, 0.85); ctx.lineWidth = 1.15; ctx.stroke();
        const tw = 8.6 * span;
        const ox = 0, oy = 13.4, ang = flutter * 0.5;
        const tip = [
          rotOff(ox, oy, -tw * 0.42, -2.1, ang), rotOff(ox, oy, tw * 0.42, -2.1, ang),
          rotOff(ox, oy, tw * 0.36, 4.1, ang), rotOff(ox, oy, -tw * 0.36, 4.1, ang),
        ];
        fillPts(tip, metal(tL, 0.86, 0.78));
        strokePts(tip, nozzleEdge(tL), 0.7);
        fillPts(ellipsePts(ox, oy + 0.6, 2.1, 1.35, 0, 10), "rgba(8,14,22,0.85)");
        strokePts(ellipsePts(ox, oy + 0.6, 2.1, 1.35, 0, 10), "rgba(120,200,255,0.35)", 0.55);
      }

      fillPts([
        { x: -0.2, y: notchY - 2.6 }, { x: flutter * 1.2, y: notchY - 1 },
        { x: flutter * 1.2, y: notchY + 1.8 }, { x: -0.2, y: notchY + 1.4 },
      ], metal(0.72, 0.58));

      fillPts([nose, rt, { x: 0, y: notchY }], metal(kR, 0.52));
      fillPts([nose, { x: 0, y: notchY }, lt], metal(kL, 0.6));
      const spine = [];
      for (let i = 0; i <= 10; i++) spine.push(bezierPt({ x: 0, y: -27 }, { x: 3.4, y: -8 }, { x: 3.6, y: 4 }, { x: 0, y: 11.2 }, i / 10));
      for (let i = 0; i <= 10; i++) spine.push(bezierPt({ x: 0, y: 11.2 }, { x: -3.6, y: 4 }, { x: -3.4, y: -8 }, { x: 0, y: -27 }, i / 10));
      fillPts(spine, metal((kL + kR) * 0.5, 0.78));

      ctx.lineWidth = 0.65;
      ctx.beginPath(); ctx.moveTo(nose.x, nose.y); ctx.lineTo(lt.x * 0.9, lt.y * 0.9); ctx.strokeStyle = "rgba(209,230,255,0.28)"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(nose.x, nose.y); ctx.lineTo(rt.x * 0.9, rt.y * 0.9); ctx.strokeStyle = "rgba(150,191,230,0.18)"; ctx.stroke();
      ctx.strokeStyle = "rgba(5,10,15,0.5)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-3.2, -10); ctx.lineTo(lt.x * 0.52, lt.y * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3.2, -10); ctx.lineTo(rt.x * 0.52, rt.y * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.2, 2); ctx.lineTo(lt.x * 0.74, lt.y * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5.2, 2); ctx.lineTo(rt.x * 0.74, rt.y * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 8); ctx.stroke();
      strokePts([nose, rt, { x: 0, y: notchY }, lt], "rgba(79,199,255,0.22)", 1.05);

      const gy = -9.4;
      fillPts(ellipsePts(0, gy, 2.55, 5.9, 0, 18), "rgba(31,71,102,0.78)");
      strokePts(ellipsePts(0, gy, 2.55, 5.9, 0, 18), "rgba(171,214,245,0.55)", 0.55);
      fillPts(ellipsePts(-0.75, gy - 1.7, 0.85, 2.35, -0.28, 8), "rgba(255,255,255,0.42)");
      fillPts(ellipsePts(0.55, gy + 1.6, 1.05, 1.7, 0.2, 8), "rgba(20,41,61,0.28)");
    }

    // 小游戏同款机腹炮：白色炮管朝机头
    function drawBellyGun(mx, my) {
      fillPts(ellipsePts(mx, my, 2.9, 2.2, 0, 10), "#c5ccd3");
      strokePts(ellipsePts(mx, my, 2.9, 2.2, 0, 10), "rgba(242,245,248,0.95)", 0.75);
      fillPts(ellipsePts(mx, my + 0.15, 1.8, 1.4, 0, 8), "#e4e8ed");
      const root = { x: mx, y: my - 1.2 };
      const tip = { x: mx, y: my - BARREL_LEN };
      const barrel = [
        { x: root.x - 1.15, y: root.y }, { x: root.x + 1.15, y: root.y },
        { x: tip.x + 0.48, y: tip.y }, { x: tip.x - 0.48, y: tip.y },
      ];
      fillPts(barrel, "#e8ecf0");
      strokePts(barrel, "rgba(248,250,252,0.9)", 0.55);
      circle(tip.x, tip.y, 0.95, "#9aa3ab");
      circle(tip.x, tip.y, 0.42, "#1c1e20");
      ctx.fillStyle = "#d5dbe2";
      ctx.fillRect(mx - 1.15, my - 0.9, 2.3, 2.8);
    }

    function drawJetFlame(speedK) {
      const xs = loadout.engine === "twin" ? [-2.7, 2.7] : [0];
      const y0 = loadout.engine === "twin" ? 16.5 : 17.4;
      for (const fx of xs) {
        const len = 6 + speedK * 16 + Math.random() * 3;
        const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
        g.addColorStop(0, "rgba(255,255,230,0.95)");
        g.addColorStop(0.35, "rgba(255,170,60,0.85)");
        g.addColorStop(1, "rgba(255,80,30,0)");
        poly([fx - 1.9, y0, fx, y0 + len, fx + 1.9, y0], g);
      }
    }

    // 飞机（原点为机身中心，机头朝 -y；sc=1 即小游戏机体单位）
    function drawFighter(sc, speedK, now) {
      ctx.save();
      ctx.scale(sc, sc);
      drawJetFlame(speedK);
      drawGameBody(clamp(speedK, 0, 1), now);
      drawMount(loadout.slots[1], -12, 12, false, now, 0.7);
      drawMount(loadout.slots[1], 12, 12, false, now, 0.7);
      if (loadout.slots[0] === "gun") drawBellyGun(0, -1.6);
      else drawMount(loadout.slots[0], 0, -1.6, true, now, 0.9);
      ctx.restore();
    }

    function drawMount(key, x, y, isNose, now, s) {
      const c = WEAPONS[key].color;
      ctx.save();
      ctx.translate(x, y);
      if (s) ctx.scale(s, s);
      const top = isNose ? -8 : -10;
      if (key === "gun") {
        ctx.fillStyle = "#59626b"; ctx.fillRect(-1.3, top, 2.6, -top + 1);
        ctx.fillStyle = c; ctx.fillRect(-1.3, top - 1.5, 2.6, 1.6);
      } else if (key === "cannon") {
        // 粗短炮管 + 炮口制退器
        ctx.fillStyle = "#4b535c"; ctx.fillRect(-2.6, -9, 5.2, 10);
        ctx.fillStyle = "#6b747d"; ctx.fillRect(-3.6, -12, 7.2, 3.4);
        ctx.fillStyle = c; ctx.fillRect(-2.2, -12.6, 4.4, 1.2);
      } else if (key === "gatling") {
        // 双管并排
        ctx.fillStyle = "#59626b";
        ctx.fillRect(-3.4, -11, 2.2, 12);
        ctx.fillRect(1.2, -11, 2.2, 12);
        ctx.fillStyle = "#3f464d"; ctx.fillRect(-4, -3, 8, 3);
        ctx.fillStyle = c;
        ctx.fillRect(-3.4, -12.2, 2.2, 1.4);
        ctx.fillRect(1.2, -12.2, 2.2, 1.4);
      } else if (key === "laser") {
        ctx.fillStyle = "#3a3f47"; ctx.fillRect(-2.2, top + 2, 4.4, -top - 1);
        circle(0, top + 2, 2.4, c);
        circle(0, top + 2, 4.5, "rgba(255,77,109,0.25)");
      } else if (key === "emp") {
        ctx.strokeStyle = c; ctx.lineWidth = 1.3;
        const pulse = 0.6 + 0.4 * Math.sin(now / 160);
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = pulse;
          ctx.beginPath(); ctx.arc(0, top + 5 - i * 2.6, 3 - i * 0.6, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (key === "missile" || key === "mirv") {
        if (isNose) poly([0, -8, 2.5, -2, -2.5, -2], c);
        else {
          ctx.fillStyle = "#dfe5ea"; ctx.fillRect(-1.8, -10, 3.6, 13);
          poly([0, -14, 1.8, -10, -1.8, -10], c);
          if (key === "mirv") {
            for (let i = -1; i <= 1; i++) {
              ctx.fillStyle = c;
              ctx.fillRect(-1.1 + i * 1.4, -6, 0.9, 5);
            }
          }
        }
      } else if (key === "drone") {
        poly([0, -7, 4, 5, 0, 2, -4, 5], c);
      }
      ctx.restore();
    }

    function drawWeaponIcon(key, cx, cy, s) {
      const c = WEAPONS[key].color;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      if (key === "gun") {
        ctx.fillStyle = "#59626b"; ctx.fillRect(-30, -3, 30, 6); ctx.fillRect(0, -2, 10, 4);
        for (let i = 0; i < 3; i++) { ctx.globalAlpha = 1 - i * 0.3; ctx.fillStyle = c; ctx.fillRect(14 + i * 9, -2, 6, 4); }
        ctx.globalAlpha = 1;
      } else if (key === "cannon") {
        ctx.fillStyle = "#4b535c"; ctx.fillRect(-30, -6, 26, 12);
        ctx.fillStyle = "#59626b"; ctx.fillRect(-4, -4, 18, 8);
        ctx.fillStyle = "#6b747d"; ctx.fillRect(12, -6.5, 6, 13);
        circle(28, 0, 5.5, c);
        circle(28, 0, 9, "rgba(255,154,60,0.25)");
      } else if (key === "gatling") {
        ctx.fillStyle = "#3f464d"; ctx.fillRect(-30, -7, 14, 14);
        ctx.fillStyle = "#59626b";
        ctx.fillRect(-16, -5.5, 30, 4);
        ctx.fillRect(-16, 1.5, 30, 4);
        ctx.fillStyle = "#6b747d"; ctx.fillRect(-6, -7, 3, 14); ctx.fillRect(6, -7, 3, 14);
        ctx.fillStyle = c;
        for (let i = 0; i < 3; i++) { ctx.globalAlpha = 1 - i * 0.28; ctx.fillRect(17 + i * 6, -5, 3.5, 3); ctx.fillRect(19 + i * 6, 2, 3.5, 3); }
        ctx.globalAlpha = 1;
      } else if (key === "laser") {
        ctx.fillStyle = "#3a3f47"; ctx.fillRect(-30, -5, 20, 10);
        circle(-9, 0, 4, c);
        ctx.fillStyle = c; ctx.fillRect(-8, -2, 40, 4);
        ctx.fillStyle = "#fff"; ctx.fillRect(-8, -0.6, 40, 1.2);
      } else if (key === "emp") {
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-22, 0, 7, 0, Math.PI * 2); ctx.stroke();
        circle(-22, 0, 3, c);
        ctx.beginPath(); ctx.moveTo(-14, 0);
        const zz = [-6, -6, 0, 5, 7, -7, 14, 5, 22, -4, 32, 0];
        for (let i = 0; i < zz.length; i += 2) ctx.lineTo(zz[i], zz[i + 1]);
        ctx.lineWidth = 2.4; ctx.stroke();
      } else if (key === "missile") {
        ctx.fillStyle = "#dfe5ea"; ctx.fillRect(-20, -3.5, 36, 7);
        poly([16, -3.5, 26, 0, 16, 3.5], c);
        poly([-20, -3.5, -27, -9, -24, 0, -27, 9, -20, 3.5], "#9aa5ae");
        poly([-24, -2, -33, 0, -24, 2], "#ffd27a");
      } else if (key === "mirv") {
        ctx.fillStyle = "#dfe5ea"; ctx.fillRect(-16, -3.2, 28, 6.4);
        poly([12, -3.2, 22, 0, 12, 3.2], c);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI * 0.55 + i * (Math.PI * 1.1 / 4);
          const x0 = 8 + Math.cos(a) * 4;
          const y0 = Math.sin(a) * 4;
          poly([x0, y0 - 1.2, x0 + Math.cos(a) * 10, y0 + Math.sin(a) * 10, x0, y0 + 1.2], c);
        }
        poly([-16, -3.2, -23, -8, -20, 0, -23, 8, -16, 3.2], "#9aa5ae");
      } else if (key === "drone") {
        const tri = (ox) => poly([ox, -10, ox + 8, 8, ox, 3, ox - 8, 8], c);
        tri(-10);
        tri(10);
      }
      ctx.restore();
    }

    function drawEngineIcon(key, cx, cy, s) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      const xs = key === "twin" ? [-9, 9] : [0];
      for (const x of xs) {
        poly([x - 6, -12, x + 6, -12, x + 4.5, 4, x - 4.5, 4], "#aebbc6");
        poly([x - 4, 4, x, 16 + Math.random() * 3, x + 4, 4], "#ffaa3c");
      }
      ctx.restore();
    }

    const craftImages = Object.create(null);
    function craftImage(key) {
      if (!CRAFTS[key]) return null;
      if (craftImages[key]) return craftImages[key];
      try {
        const img = typeof wx !== "undefined" && wx.createImage
          ? wx.createImage()
          : (typeof Image !== "undefined" ? new Image() : null);
        if (!img) return null;
        img.src = CRAFTS[key].src;
        craftImages[key] = img;
        return img;
      } catch (e) {
        return null;
      }
    }
    function craftDrawMul(key) {
      const meta = CRAFTS[key];
      const mul = meta && Number(meta.drawMul);
      return Number.isFinite(mul) && mul > 0 ? mul : 1;
    }
    function drawCraftAtlasFrame(key, cx, cy, size, frame) {
      const meta = CRAFTS[key];
      const img = craftImage(key);
      if (!meta || !img || !(img.width > 0)) return false;
      const index = clamp(frame == null ? CRAFT_TOP_FRAME : frame, 0, meta.cols * meta.rows - 1) | 0;
      const drawSize = size * craftDrawMul(key);
      try {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(
          img,
          (index % meta.cols) * meta.frameSize,
          Math.floor(index / meta.cols) * meta.frameSize,
          meta.frameSize,
          meta.frameSize,
          cx - drawSize / 2,
          cy - drawSize / 2,
          drawSize,
          drawSize
        );
        ctx.restore();
        return true;
      } catch (e) {
        try { ctx.restore(); } catch (err) {}
        return false;
      }
    }
    function drawCraftIcon(key, cx, cy, s) {
      if (drawCraftAtlasFrame(key, cx, cy, 64 * s, CRAFT_TOP_FRAME)) return;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      poly([0, -28, 25, 18, 8, 12, 0, 24, -8, 12, -25, 18], CRAFTS[key].color);
      ctx.restore();
    }

    // ---------- 机库界面 ----------
    function drawGarage(now) {
      bg();
      const L = S.l + 14, R = W - S.r - 14, T = S.t + 10, B = H - S.b - 10;

      // 顶栏
      text("机库改装", L, T + 16, "#f4fbff", 18, "left", true);
      text("SKY ACE", L + 84, T + 17, "#7ad7ff", 11, "left");
      // 顶栏按钮靠左排在标题后，右上角留给小游戏胶囊
      let bx = L + 150;
      if (host.onExit) { button(bx, T + 2, 58, 30, "返回", false, () => host.onExit()); bx += 64; }
      button(bx, T + 2, 58, 30, "保存", false, openSaveConfirm); bx += 64;
      button(bx, T + 2, 104, 30, "试飞 ▶", true, () => {
        if (host.onTestFly) host.onTestFly({ slots: loadout.slots.slice(), engine: loadout.engine, craft: loadout.craft });
        else enterArena();
      });

      const top = T + 42;
      const leftW = Math.min(360, (R - L) * 0.44);
      const rightX = L + leftW + 12;
      const rightW = R - rightX;

      // 左：预览（占满左列）——顶部/底部展示当前点选装备与特点
      const pvH = B - top;
      board(L, top, leftW, pvH, "#7ad7ff", false);
      const eng = ENGINES[loadout.engine];
      // 保证 focus 落在当前页签合法项上
      {
        const tabKeys = tab < 2 ? SLOT_KEYS[tab] : (tab === 2 ? ENGINE_KEYS : CRAFT_KEYS);
        if (!tabKeys.includes(focusKey)) {
          focusKey = tab === 0 ? loadout.slots[0]
            : tab === 1 ? loadout.slots[1]
              : tab === 2 ? loadout.engine
                : loadout.craft;
        }
      }
      const focus = focusMeta(focusKey) || focusMeta(loadout.slots[0]);
      const showCraft = !!(focus && focus.kind === "craft");
      // 中间预览：飞机页才画机体；武器/引擎用独立展台，不再叠淡飞机
      if (showCraft) {
        ctx.save();
        ctx.translate(L + leftW / 2, top + pvH * 0.46 + Math.sin(now / 600) * 3);
        if (!drawCraftAtlasFrame(focus.key, 0, 0, Math.min(150, pvH * 0.52), CRAFT_TOP_FRAME)) {
          drawFighter(GAME_SHIP_SCALE, 0.65 + 0.25 * Math.sin(now / 300), now);
        }
        ctx.restore();
      } else if (focus) {
        drawEquipShowcase(L + leftW / 2, top + pvH * 0.42, focus, now);
      }

      // 顶部：当前点选装备名
      if (focus) {
        text(`${focus.slot}`, L + 14, top + 16, "#8aa0b0", 11, "left");
        text(focus.name, L + 14, top + 36, focus.color || "#f4fbff", 16, "left", true);
        text(focus.desc || "", L + 14, top + 56, "#cfe6f3", 12, "left");
      }

      // 左下：装备特点 + 操作
      {
        const tip = usageTipFor(focus ? focus.key : loadout.slots[0]);
        const pad = 14;
        let footY = top + pvH - pad;
        text(tip, L + pad, footY, "#b7c8d6", 11, "left");
        text("操作", L + pad, footY - 16, "#7a8b9a", 10, "left");
        footY -= 36;
        if (focus && focus.stat) {
          const n = Object.keys(focus.stat).length;
          const statH = n * 16;
          footY -= statH;
          text("装备特点", L + pad, footY - 2, "#ffe08a", 12, "left", true);
          drawFocusStatBars(L + pad, footY + 10, leftW - pad * 2, focus.stat, focus.color);
        } else if (focus && focus.kind === "craft") {
          text("装备特点", L + pad, footY - 2, "#ffe08a", 12, "left", true);
          text(focus.desc || "—", L + pad, footY + 16, "#e8f2f8", 12, "left");
        }
      }

      // 右：标签（两行：槽位名 + 截断装备名，避免溢出）
      const tabs = [
        { lab: "主武器", name: WEAPONS[loadout.slots[0]].name },
        { lab: "副武器", name: WEAPONS[loadout.slots[1]].name },
        { lab: "引擎", name: eng.name },
        { lab: "飞机", name: CRAFTS[loadout.craft].name },
      ];
      const tabGap = 6;
      const tabH = 38;
      const tabW = (rightW - tabGap * 3) / 4;
      function ellipsize(str, maxW, font) {
        const s = String(str || "");
        ctx.font = font;
        if (ctx.measureText(s).width <= maxW) return s;
        const dots = "…";
        let lo = 0;
        let hi = s.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (ctx.measureText(s.slice(0, mid) + dots).width <= maxW) lo = mid;
          else hi = mid - 1;
        }
        return (lo > 0 ? s.slice(0, lo) : s.slice(0, 1)) + dots;
      }
      tabs.forEach((t, i) => {
        const x = rightX + i * (tabW + tabGap);
        rrect(x, top, tabW, tabH, 7);
        ctx.fillStyle = tab === i ? "rgba(122,215,255,0.18)" : "rgba(42,49,58,0.92)";
        ctx.fill();
        ctx.strokeStyle = tab === i ? "#7ad7ff" : "rgba(140,200,220,0.22)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        const on = tab === i;
        const padX = 6;
        const maxTw = tabW - padX * 2;
        text(t.lab, x + tabW / 2, top + 12, on ? "#7ad7ff" : "#8aa0b0", 10, "center", on);
        const nameFs = 11;
        const nameFont = `${on ? "bold " : ""}${nameFs}px sans-serif`;
        const shown = ellipsize(t.name, maxTw, nameFont);
        text(shown, x + tabW / 2, top + 26, on ? "#f4fbff" : "#c5d2de", nameFs, "center", on);
        addHit(x, top, tabW, tabH, {
          onTap: () => {
            tab = i;
            focusKey = i === 0 ? loadout.slots[0]
              : i === 1 ? loadout.slots[1]
                : i === 2 ? loadout.engine
                  : loadout.craft;
          },
        });
      });

      // 右：方格，居中排列，一排放不下就换行
      // 角标：已拥有 / N天 / 可试飞（主武器、副武器、引擎、飞机统一）
      const gy = top + tabH + 10;
      const pendingKey = invitePending && invitePending.key;
      const items = tab < 2
        ? SLOT_KEYS[tab].map((k) => {
          const w = WEAPONS[k];
          const on = loadout.slots[tab] === k;
          const mode = accessOf(k).mode;
          return {
            key: k, name: w.name, desc: w.desc, color: w.color, on,
            trial: mode === "trial",
            rental: mode === "rental",
            badge: accessBadge(k, pendingKey),
            icon: (cx, cy, s) => drawWeaponIcon(k, cx, cy, s),
            onTap: () => equip(tab, k),
            onAcquire: () => openAcquire(k, w.name),
          };
        })
        : tab === 2 ? ENGINE_KEYS.map((k) => {
          const en = ENGINES[k];
          const mode = accessOf(k).mode;
          return {
            key: k, name: en.name, desc: `极速 ${en.max}`, color: en.color, on: loadout.engine === k,
            trial: mode === "trial",
            rental: mode === "rental",
            badge: accessBadge(k, pendingKey),
            icon: (cx, cy, s) => drawEngineIcon(k, cx, cy, s * 1.3),
            onTap: () => setEngine(k),
            onAcquire: () => openAcquire(k, en.name),
          };
        }) : CRAFT_KEYS.map((k) => {
          const craft = CRAFTS[k];
          const mode = accessOf(k).mode;
          return {
            key: k, name: craft.name, desc: craft.desc, color: craft.color, on: loadout.craft === k,
            trial: mode === "trial",
            rental: mode === "rental",
            badge: accessBadge(k, pendingKey),
            icon: (cx, cy, s) => drawCraftIcon(k, cx, cy, s),
            onTap: () => setCraft(k),
            onAcquire: () => openAcquire(k, craft.name),
          };
        });
      drawTileGrid(items, rightX, gy, rightW, B - gy);
    }

    function drawTileGrid(items, x0, y0, w, h) {
      const gap = 10;
      // 先按 96 的方格排；放不下高度就整体缩小
      let side = 96;
      let cols = Math.max(1, Math.floor((w + gap) / (side + gap)));
      let rows = Math.ceil(items.length / cols);
      while (side > 60 && rows * side + (rows - 1) * gap > h) {
        side -= 4;
        cols = Math.max(1, Math.floor((w + gap) / (side + gap)));
        rows = Math.ceil(items.length / cols);
      }
      const gridH = rows * side + (rows - 1) * gap;
      const top = y0 + Math.max(0, (h - gridH) / 2);
      items.forEach((it, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, items.length - row * cols);
        const rowW = inRow * side + (inRow - 1) * gap;
        const x = x0 + (w - rowW) / 2 + (i % cols) * (side + gap);
        const y = top + row * (side + gap);
        board(x, y, side, side, it.color, it.on);
        it.icon(x + side / 2, y + side * 0.36, side / 96);
        text(it.name, x + side / 2, y + side * 0.68, "#e8f2f8", Math.max(11, side * 0.135), "center", true);
        text(it.desc, x + side / 2, y + side * 0.85, "#9eb0c0", Math.max(8, side * 0.095), "center");
        // 可试飞：更深蒙层 + 中间「去获取」；点空白仍可选进方案试飞
        if (it.trial) {
          ctx.fillStyle = "rgba(4, 8, 14, 0.72)";
          ctx.fillRect(x + 1, y + 1, side - 2, side - 2);
          ctx.fillStyle = "rgba(255, 224, 138, 0.08)";
          ctx.fillRect(x + 1, y + 1, side - 2, side - 2);
          if (it.on) {
            ctx.strokeStyle = it.color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 0.5, y + 0.5, side - 1, side - 1);
            ctx.fillStyle = it.color;
            ctx.fillRect(x, y, 3, side);
          }
        }
        if (it.badge && it.badge.text) {
          const label = it.badge.text;
          const fs = label.length <= 2 ? 9 : 8;
          const padX = 4;
          const tw = Math.max(16, label.length * (fs * 0.92) + padX * 2);
          const th = 14;
          const bx = x + side - tw - 4;
          const by = y + 4;
          ctx.fillStyle = it.badge.bg || it.color;
          ctx.fillRect(bx, by, tw, th);
          text(label, bx + tw / 2, by + th / 2, it.badge.fg || "#0a1420", fs, "center", true);
        }
        addHit(x, y, side, side, { onTap: it.onTap });
        // 仅可试飞显示「去获取」；已有限时（N小时）则不再显示
        if (it.trial) {
          const label = "去获取";
          const fs = 9;
          ctx.font = `${fs}px sans-serif`;
          const tw = ctx.measureText(label).width;
          const tx = x + side / 2;
          const ty = y + side - 10;
          text(label, tx, ty, "#ffe08a", fs, "center");
          ctx.strokeStyle = "rgba(255, 224, 138, 0.85)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tx - tw / 2, ty + 6);
          ctx.lineTo(tx + tw / 2, ty + 6);
          ctx.stroke();
          const hitPad = 6;
          addHit(tx - tw / 2 - hitPad, ty - fs / 2 - hitPad, tw + hitPad * 2, fs + hitPad * 2 + 4, {
            onTap: () => {
              if (typeof it.onAcquire === "function") it.onAcquire();
              else openAcquire(it.key || it.name, it.name);
            },
          });
        }
      });
    }

    // ---------- 试飞界面 ----------
    function drawTarget(t, now) {
      if (t.dead > 0) return;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.save();
      ctx.rotate(t.h + Math.PI / 2);
      const stunned = t.stun > 0;
      const body = t.flash > 0 ? "#ffffff" : stunned ? (Math.sin(now / 40) > 0 ? "#6ecbff" : "#3a6d8a") : "#d0564f";
      poly([0, -15, 13, 8, 4, 6, 0, 12, -4, 6, -13, 8], body);
      if (!stunned && !t.hover) poly([-2, 11, 0, 18 + Math.random() * 4, 2, 11], "rgba(255,170,60,0.85)");
      ctx.restore();
      if (stunned) {
        ctx.strokeStyle = "rgba(110,203,255,0.8)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = rand(0, Math.PI * 2);
          ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.lineTo(Math.cos(a + 0.3) * 15, Math.sin(a + 0.3) * 15);
          ctx.lineTo(Math.cos(a - 0.1) * 21, Math.sin(a - 0.1) * 21);
        }
        ctx.stroke();
        text(`瘫痪 ${t.stun.toFixed(1)}s`, 0, -28, "#9fe3ff", 10, "center", true);
      }
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(-15, -22, 30, 3);
      ctx.fillStyle = t.hp > 35 ? "#55e487" : "#ff6868"; ctx.fillRect(-15, -22, 30 * clamp(t.hp / 100, 0, 1), 3);
      ctx.restore();
    }

    function drawEffects() {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // 机关炮
      for (const b of bullets) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        if (b.kind === "shell") {
          // 重炮弹：橙色大弹头 + 光晕
          circle(0, 0, 9, "rgba(255,154,60,0.22)");
          ctx.fillStyle = "rgba(255,154,60,0.45)"; ctx.fillRect(-18, -3, 16, 6);
          poly([-8, -3.6, 4, -3.6, 9, 0, 4, 3.6, -8, 3.6], "#ffb36b");
          ctx.fillStyle = "#fff4e0"; ctx.fillRect(-4, -1.2, 10, 2.4);
        } else if (b.kind === "gat") {
          ctx.fillStyle = "rgba(255,230,107,0.25)"; ctx.fillRect(-9, -1.8, 14, 3.6);
          poly([-7, 0, 1, -1.1, 5, 0, 1, 1.1], "#ffe66b");
          ctx.fillStyle = "#fffbe6"; ctx.fillRect(-1, -0.4, 5, 0.8);
        } else {
          ctx.fillStyle = "rgba(57,255,20,0.25)"; ctx.fillRect(-12, -2.5, 19, 5);
          poly([-10, 0, 2, -1.5, 7, 0, 2, 1.5], "#9dff7a");
          ctx.fillStyle = "#f4fff0"; ctx.fillRect(0, -0.6, 6, 1.2);
        }
        ctx.restore();
      }
      // 激光
      if (laserBeam) {
        const b = laserBeam, k = (b.t / b.max) ** 2;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1);
        ctx.strokeStyle = `rgba(255,40,55,${0.22 * k})`; ctx.lineWidth = 12; ctx.stroke();
        ctx.strokeStyle = `rgba(255,130,100,${0.4 * k})`; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = `rgba(255,240,230,${0.7 * k})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      // 闪电
      ctx.lineJoin = "round";
      for (const bo of bolts) {
        const k = bo.life / bo.max;
        bo.paths.forEach((pts, idx) => {
          for (const [w, c] of [[8, `rgba(110,203,255,${0.25 * k})`], [3, `rgba(160,225,255,${0.85 * k})`], [1.2, `rgba(255,255,255,${k})`]]) {
            ctx.strokeStyle = c;
            ctx.lineWidth = idx ? w * 0.6 : w;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
          }
        });
      }
      // 导弹尾迹
      for (const m of missiles) {
        for (let i = 1; i < m.trail.length; i++) {
          const a = i / m.trail.length;
          ctx.strokeStyle = `rgba(255,190,120,${a * 0.5})`;
          ctx.lineWidth = a * 3.5;
          ctx.beginPath(); ctx.moveTo(m.trail[i - 1].x, m.trail[i - 1].y); ctx.lineTo(m.trail[i].x, m.trail[i].y); ctx.stroke();
        }
      }
      // 粒子
      for (const p of parts) {
        const k = p.life / p.max;
        if (p.c === "ring") {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(255,200,120,${k})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - k * 0.6), 0, Math.PI * 2); ctx.stroke();
          continue;
        }
        ctx.globalAlpha = k;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      ctx.restore();
      // 导弹本体
      for (const m of missiles) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.h);
        const sc = m.scale || 1;
        ctx.scale(sc, sc);
        ctx.fillStyle = "#e6ebef"; ctx.fillRect(-6, -1.6, 10, 3.2);
        poly([8, 0, 4, -1.6, 4, 1.6], m.mirvChild ? "#ff7a45" : "#ffb347");
        poly([-6, -1.3, -11 - Math.random() * 4, 0, -6, 1.3], "rgba(255,220,140,0.9)");
        ctx.restore();
        if (m.tgt && m.tgt.dead <= 0 && !m.mirvChild) {
          ctx.strokeStyle = "rgba(255,179,71,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(m.tgt.x, m.tgt.y, 20, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // 一级推进舱脱落
      for (const s of mirvStages) {
        const u = s.age / s.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - u);
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        if (s.kind === "nozzle") {
          ctx.fillStyle = "#6a727a";
          ctx.beginPath();
          ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.lineTo(5.5, 4); ctx.lineTo(-5.5, 4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = "#c8d0d6";
          ctx.fillRect(-3.5, -8, 7, 15);
          ctx.fillStyle = "#ff8a3c";
          ctx.fillRect(-2.5, -1.5, 5, 3);
        }
        ctx.restore();
      }
    }

    function slotGauge(slot) {
      const key = loadout.slots[slot], s = slotState[slot];
      if (key === "cannon") return { pct: 1 - s.cd / CANNON_CD, label: s.cd > 0 ? "装填" : "就绪", warn: false };
      if (key === "gatling") return { pct: s.spin, label: `转速 ${Math.round(s.spin * 100)}%`, warn: false };
      if (key === "laser") return { pct: 1 - s.cd / LASER_CD, label: s.cd > 0 ? "充能" : "就绪", warn: false };
      if (key === "emp") return { pct: 1 - s.cd / EMP_CD, label: s.cd > 0 ? `${s.cd.toFixed(1)}s` : "就绪", warn: false };
      if (key === "missile" || key === "mirv") return { pct: s.ammo / MIS_MAX, label: `${s.ammo}/${MIS_MAX}`, warn: s.ammo === 0 };
      return { pct: 1, label: "∞", warn: false };
    }

    function fireButton(slot, key, cx, cy, r) {
      const wk = loadout.slots[slot];
      const w = WEAPONS[wk];
      const down = held(key);
      const g = slotGauge(slot);
      circle(cx, cy, r, down ? "rgba(255,255,255,0.22)" : "rgba(14,26,38,0.72)");
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = g.warn ? "#ff6868" : w.color;
      ctx.beginPath(); ctx.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(g.pct, 0, 1)); ctx.stroke();
      drawWeaponIcon(wk, cx, cy - r * 0.12, r / 52);
      text(g.label, cx, cy + r * 0.45, "#e8f2f8", Math.max(10, r * 0.24), "center", true);
      text(`${slot ? "副" : "主"} · ${w.name}`, cx, cy - r - 9, "#cfe6f3", 10, "center");
      addHit(cx - r, cy - r, r * 2, r * 2, { hold: true, key });
    }

    function drawArena(now) {
      bg();
      for (const t of targets) drawTarget(t, now);
      drawEffects();
      ctx.save();
      ctx.translate(me.x, me.y);
      ctx.rotate(me.h + Math.PI / 2);
      drawFighter(GAME_SHIP_SCALE, me.spd / ENGINES[loadout.engine].max, now);
      ctx.restore();

      const L = S.l + 12, R = W - S.r - 12, T = S.t + 10, B = H - S.b - 12;
      button(L, T, 74, 30, "◀ 改装", false, exitArena);
      const sum = dmgLog.reduce((a, b) => a + b.d, 0);
      text(`击落 ${kills}   命中 ${hitsN}   DPS ${Math.round(sum / 5)}   航速 ${Math.round(me.spd)}`, W / 2, T + 15, "#cfe6f3", 12, "center");

      // 摇杆
      if (stick) {
        const dx = stick.x - stick.bx, dy = stick.y - stick.by;
        const d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
        circle(stick.bx, stick.by, STICK_R, "rgba(255,255,255,0.08)");
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(stick.bx, stick.by, STICK_R, 0, Math.PI * 2); ctx.stroke();
        circle(stick.bx + dx * k, stick.by + dy * k, 22, "rgba(122,215,255,0.55)");
      } else {
        const sx = L + 70, sy = B - 70;
        ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, STICK_R, 0, Math.PI * 2); ctx.stroke();
        text("左半屏任意处拖动控制方向", sx, sy, "rgba(207,230,243,0.55)", 10, "center");
      }

      // 开火键
      const rA = clamp(H * 0.12, 38, 50);
      const rB = rA * 0.78;
      const ax = R - rA - 8, ay = B - rA - 4;
      fireButton(0, "A", ax, ay, rA);
      fireButton(1, "B", ax - rA - rB - 22, ay + rA - rB - 2, rB);
    }

    function drawToast() {
      if (Date.now() > toastUntil) return;
      ctx.font = "13px sans-serif";
      const w = ctx.measureText(toastMsg).width + 28;
      const x = (W - w) / 2, y = S.t + 48;
      rrect(x, y, w, 30, 6);
      ctx.fillStyle = "rgba(14,26,38,0.95)"; ctx.fill();
      ctx.strokeStyle = "#78ff5a"; ctx.lineWidth = 1; ctx.stroke();
      text(toastMsg, W / 2, y + 15, "#e8f2f8", 13, "center");
    }

    function drawAcquireModal() {
      if (!acquireItem) return;
      hits = [];
      const bal = readStarShards();
      const cost = ACQUIRE_COST;
      const canBuy = bal >= cost;
      const after = Math.round((bal - cost) * 100) / 100;

      ctx.fillStyle = "rgba(0,0,0,0.58)";
      ctx.fillRect(0, 0, W, H);
      addHit(0, 0, W, H, { onTap: closeAcquire });

      const allowInvite = !canBuy && canInviteFree(acquireItem.key);
      const w = Math.min(320, W - 40);
      const btnH = 36;
      const h = canBuy ? 196 : (allowInvite ? 220 : 168);
      const x = (W - w) / 2;
      const y = (H - h) / 2;
      rrect(x, y, w, h, 12);
      ctx.fillStyle = "rgba(14,26,38,0.98)";
      ctx.fill();
      ctx.strokeStyle = canBuy ? "rgba(122,215,255,0.45)" : "rgba(255,122,122,0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      addHit(x, y, w, h, { onTap: () => {} });

      if (canBuy) {
        text("获取装备", x + w / 2, y + 24, "#f4fbff", 15, "center", true);
        text(acquireItem.name, x + w / 2, y + 48, "#ffe08a", 13, "center", true);
        text("当前星碎币", x + 20, y + 78, "#8aa0b0", 11, "left");
        text(bal.toFixed(2), x + w - 20, y + 78, "#f1e2ff", 13, "right", true);
        text("本次扣除", x + 20, y + 102, "#8aa0b0", 11, "left");
        text(`-${cost}`, x + w - 20, y + 102, "#ffe08a", 13, "right", true);
        text("购买后余额", x + 20, y + 126, "#8aa0b0", 11, "left");
        text(after.toFixed(2), x + w - 20, y + 126, "#cfe6f3", 12, "right");
        const gap = 10;
        const bw = (w - 32 - gap) / 2;
        const by = y + h - btnH - 16;
        button(x + 16, by, bw, btnH, "取消", false, closeAcquire);
        button(x + 16 + bw + gap, by, bw, btnH, "确定购买", true, () => {
          const key = acquireItem.key;
          const name = acquireItem.name;
          // 优先走服务器扣币+永久拥有；失败再本地扣
          let sent = false;
          if (typeof host.buyEquip === "function") {
            try { sent = !!host.buyEquip(key); } catch (e) { sent = false; }
          }
          if (sent) {
            // 乐观本地落盘，服务器回包会再校准
            ACCESS_OWNED[key] = true;
            delete ACCESS_RENTAL_UNTIL[key];
            persistAccess();
            if (invitePending && invitePending.key === key) {
              writeInvitePending(null);
              invitePending = null;
            }
            toast(`已永久获取「${name}」`);
            closeAcquire();
            return;
          }
          if (!spendStarShards(cost)) {
            toast("星碎币不足");
            return;
          }
          ACCESS_OWNED[key] = true;
          delete ACCESS_RENTAL_UNTIL[key];
          persistAccess();
          if (invitePending && invitePending.key === key) {
            writeInvitePending(null);
            invitePending = null;
          }
          toast(`已永久获取「${name}」`);
          closeAcquire();
        });
      } else {
        text("星碎币不足，无法购买", x + w / 2, y + 26, "#ff6868", 15, "center", true);
        text(acquireItem.name, x + w / 2, y + 50, "#ffe08a", 13, "center", true);
        text("当前星碎币", x + 20, y + 78, "#8aa0b0", 11, "left");
        text(bal.toFixed(2), x + w - 20, y + 78, "#f1e2ff", 13, "right", true);
        text("所需星碎币", x + 20, y + 100, "#8aa0b0", 11, "left");
        text(String(cost), x + w - 20, y + 100, "#ff8a8a", 13, "right", true);

        if (allowInvite) {
          const btnW = w - 40;
          const inviteY = y + 122;
          rrect(x + 20, inviteY, btnW, btnH, 8);
          ctx.fillStyle = "rgba(122,215,255,0.18)";
          ctx.fill();
          ctx.strokeStyle = "#7ad7ff";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          text("邀请好友免费使用", x + w / 2, inviteY + btnH / 2, "#7ad7ff", 13, "center", true);
          addHit(x + 20, inviteY, btnW, btnH, {
            onTap: () => beginInviteFree(acquireItem.key, acquireItem.name),
          });
          const dismissLab = "知道了";
          const dismissFs = 12;
          ctx.font = `${dismissFs}px sans-serif`;
          const dismissTw = ctx.measureText(dismissLab).width;
          const dx = x + w / 2;
          const dy = inviteY + btnH + 28;
          text(dismissLab, dx, dy, "#9eb0c0", dismissFs, "center");
          ctx.strokeStyle = "rgba(158,176,192,0.75)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(dx - dismissTw / 2, dy + 7);
          ctx.lineTo(dx + dismissTw / 2, dy + 7);
          ctx.stroke();
          addHit(dx - dismissTw / 2 - 16, dy - 12, dismissTw + 32, 28, { onTap: closeAcquire });
        } else {
          const bw = 120;
          button(x + (w - bw) / 2, y + h - btnH - 16, bw, btnH, "知道了", false, closeAcquire);
        }
      }
    }

    function drawInviteWaitModal() {
      if (!inviteWait) return;
      hits = [];
      ctx.fillStyle = "rgba(0,0,0,0.58)";
      ctx.fillRect(0, 0, W, H);
      addHit(0, 0, W, H, { onTap: closeInviteWait });

      let hasWxShare = false;
      try { hasWxShare = typeof wx !== "undefined" && typeof wx.shareAppMessage === "function"; } catch (e) {}

      const w = Math.min(300, W - 40);
      const btnH = 36;
      const h = hasWxShare ? 168 : 190;
      const x = (W - w) / 2;
      const y = (H - h) / 2;
      rrect(x, y, w, h, 12);
      ctx.fillStyle = "rgba(14,26,38,0.98)";
      ctx.fill();
      ctx.strokeStyle = "rgba(122,215,255,0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      addHit(x, y, w, h, { onTap: () => {} });

      text("等待好友进入", x + w / 2, y + 26, "#7ad7ff", 15, "center", true);
      text(`新玩家点开 +${INVITE_GRANT_NEW_H}小时 · 老玩家 +${INVITE_GRANT_OLD_H}小时`, x + w / 2, y + 50, "#cfe6f3", 12, "center");
      text("时长自领取起计时", x + w / 2, y + 68, "#9eb0c0", 11, "center");

      const gap = 10;
      const bw = (w - 32 - gap) / 2;
      const by = y + 88;
      button(x + 16, by, bw, btnH, "知道了", false, closeInviteWait);
      rrect(x + 16 + bw + gap, by, bw, btnH, 8);
      ctx.fillStyle = "rgba(122,215,255,0.18)";
      ctx.fill();
      ctx.strokeStyle = "#7ad7ff";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      text("再邀请", x + 16 + bw + gap + bw / 2, by + btnH / 2, "#7ad7ff", 13, "center", true);
      addHit(x + 16 + bw + gap, by, bw, btnH, {
        onTap: () => beginInviteFree(inviteWait.key, inviteWait.name),
      });

      // 仅非微信环境：淡字模拟新/老玩家点开
      if (!hasWxShare) {
        const ySim = by + btnH + 18;
        const labNew = `模拟新玩家(+${INVITE_GRANT_NEW_H}h)`;
        const labOld = `模拟老玩家(+${INVITE_GRANT_OLD_H}h)`;
        ctx.font = "9px sans-serif";
        const twN = ctx.measureText(labNew).width;
        const twO = ctx.measureText(labOld).width;
        text(labNew, x + w * 0.28, ySim, "rgba(138,160,176,0.55)", 9, "center");
        text(labOld, x + w * 0.72, ySim, "rgba(138,160,176,0.55)", 9, "center");
        addHit(x + w * 0.28 - twN / 2 - 6, ySim - 8, twN + 12, 16, {
          onTap: () => applyFreeEquipEnter({
            equip: inviteWait.key, inviter: myInviterId(), simHours: INVITE_GRANT_NEW_H,
          }),
        });
        addHit(x + w * 0.72 - twO / 2 - 6, ySim - 8, twO + 12, 16, {
          onTap: () => applyFreeEquipEnter({
            equip: inviteWait.key, inviter: myInviterId(), simHours: INVITE_GRANT_OLD_H,
          }),
        });
      }
    }

    function drawInviteUnlockedModal() {
      if (!inviteUnlocked) return;
      hits = [];
      ctx.fillStyle = "rgba(0,0,0,0.58)";
      ctx.fillRect(0, 0, W, H);
      addHit(0, 0, W, H, { onTap: closeInviteUnlocked });

      const w = Math.min(300, W - 40);
      const btnH = 36;
      const h = 168;
      const x = (W - w) / 2;
      const y = (H - h) / 2;
      rrect(x, y, w, h, 12);
      ctx.fillStyle = "rgba(14,26,38,0.98)";
      ctx.fill();
      ctx.strokeStyle = "rgba(120,255,90,0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      addHit(x, y, w, h, { onTap: () => {} });

      text("领取成功", x + w / 2, y + 28, "#78ff5a", 16, "center", true);
      text(inviteUnlocked.name, x + w / 2, y + 54, "#ffe08a", 13, "center", true);
      const added = Math.max(1, Number(inviteUnlocked.added) || INVITE_GRANT_OLD_H);
      const hours = Math.max(1, Number(inviteUnlocked.hours) || added);
      text(`本次 +${added} 小时（自领取起计时）`, x + w / 2, y + 80, "#cfe6f3", 12, "center");
      text(`当前剩余 ${hours} 小时`, x + w / 2, y + 100, "#9eb0c0", 11, "center");
      const bw = 120;
      button(x + (w - bw) / 2, y + h - btnH - 16, bw, btnH, "知道了", true, closeInviteUnlocked);
    }

    function drawSaveConfirmModal() {
      if (!saveConfirmOpen) return;
      // 蒙层独占触摸：清掉机库底层命中，只挂弹窗按钮
      hits = [];
      const parts = loadoutParts();
      const trials = trialParts();
      const blocked = trials.length > 0;

      ctx.fillStyle = "rgba(0,0,0,0.58)";
      ctx.fillRect(0, 0, W, H);
      // 点遮罩空白关闭
      addHit(0, 0, W, H, { onTap: closeSaveConfirm });

      const w = Math.min(380, W - 40);
      const rowH = 34;
      const listH = parts.length * rowH + 8;
      const warnH = blocked ? 36 : 0;
      const btnH = 36;
      const h = 52 + listH + warnH + btnH + 28;
      const x = (W - w) / 2;
      const y = (H - h) / 2;
      rrect(x, y, w, h, 12);
      ctx.fillStyle = "rgba(14,26,38,0.98)";
      ctx.fill();
      ctx.strokeStyle = blocked ? "rgba(255,224,138,0.55)" : "rgba(122,215,255,0.45)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // 吃掉面板区域点击，避免穿透到遮罩关闭
      addHit(x, y, w, h, { onTap: () => {} });

      text(blocked ? "无法保存" : "确认保存方案", x + w / 2, y + 22, "#f4fbff", 15, "center", true);

      parts.forEach((p, i) => {
        const py = y + 44 + i * rowH;
        const badge = accessBadge(p.key);
        const iconCx = x + 28;
        const iconCy = py + rowH / 2;
        // 左侧小圆底 + 装备图标
        circle(iconCx, iconCy, 12, "rgba(122,215,255,0.10)");
        ctx.strokeStyle = "rgba(122,215,255,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, 12, 0, Math.PI * 2);
        ctx.stroke();
        if (p.kind === "weapon") drawWeaponIcon(p.key, iconCx, iconCy, 0.28);
        else if (p.kind === "engine") drawEngineIcon(p.key, iconCx, iconCy, 0.32);
        else drawCraftIcon(p.key, iconCx, iconCy, 0.30);
        text(p.slot, x + 48, py + rowH / 2, "#8aa0b0", 11, "left");
        text(p.name, x + 108, py + rowH / 2, "#e8f2f8", 12, "left", true);
        const fs = 8;
        const tw = Math.max(28, badge.text.length * 8 + 8);
        const bx = x + w - 16 - tw;
        const by = py + (rowH - 14) / 2;
        ctx.fillStyle = badge.bg;
        ctx.fillRect(bx, by, tw, 14);
        text(badge.text, bx + tw / 2, by + 7, badge.fg, fs, "center", true);
      });

      let by0 = y + 44 + listH + 4;
      if (blocked) {
        const names = trials.map((t) => t.name).join("、");
        text(`含可试飞：${names}`, x + w / 2, by0 + 10, "#ffe08a", 11, "center");
        text("试飞件不能写入存档，请先换掉", x + w / 2, by0 + 26, "#9eb0c0", 10, "center");
        by0 += warnH;
        const bw = 120;
        button(x + (w - bw) / 2, by0 + 4, bw, btnH, "知道了", false, closeSaveConfirm);
      } else {
        const gap = 10;
        const bw = (w - 32 - gap) / 2;
        button(x + 16, by0 + 4, bw, btnH, "取消", false, closeSaveConfirm);
        button(x + 16 + bw + gap, by0 + 4, bw, btnH, "确定保存", true, () => {
          closeSaveConfirm();
          commitSaveLoadout();
        });
      }
    }

    function drawSavedModal() {
      const left = savedUntil - Date.now();
      if (left <= 0) return;
      const k = Math.min(1, left / 200);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, W, H);
      const w = 168, h = 112;
      const x = (W - w) / 2, y = (H - h) / 2;
      rrect(x, y, w, h, 12);
      ctx.fillStyle = "rgba(14,26,38,0.96)"; ctx.fill();
      ctx.strokeStyle = "rgba(120,255,90,0.6)"; ctx.lineWidth = 1.2; ctx.stroke();
      const cx = W / 2, cy = y + 42;
      circle(cx, cy, 18, "rgba(120,255,90,0.16)");
      ctx.strokeStyle = "#78ff5a"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx - 2, cy + 6); ctx.lineTo(cx + 9, cy - 6); ctx.stroke();
      text("方案已保存", cx, y + 86, "#e8f2f8", 15, "center", true);
      ctx.restore();
    }

    // ---------- 主循环 ----------
    let last = 0;
    function frame(now) {
      const sz = host.size();
      W = sz.w; H = sz.h;
      S = Object.assign({ l: 0, r: 0, t: 0, b: 0, cap: 0 }, host.safe ? host.safe() : null);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      hits = [];
      if (H > W) {
        bg();
        text("请将手机横屏", W / 2, H / 2, "#e8f2f8", 18, "center", true);
        return;
      }
      if (view === "arena") {
        updateArena(dt);
        drawArena(now);
      } else drawGarage(now);
      drawSaveConfirmModal();
      drawAcquireModal();
      drawInviteWaitModal();
      drawInviteUnlockedModal();
      drawToast();
      drawSavedModal();
    }

    return {
      frame, touchStart, touchMove, touchEnd,
      getLoadout: () => ({ slots: loadout.slots.slice(), engine: loadout.engine, craft: loadout.craft }),
      setLoadout: (v) => {
        if (!validLoadout(v)) return;
        loadout = { slots: v.slots.slice(), engine: v.engine, craft: CRAFTS[v.craft] ? v.craft : DEFAULT.craft };
        resetSlots();
      },
      enterArena, exitArena,
      applyFreeEquipEnter,
      setAccessFromServer,
      showInviteGranted,
      getAccessSnapshot: () => exportAccessSnapshot(),
      getInvitePending: () => (invitePending ? { key: invitePending.key, name: invitePending.name } : null),
    };
  }

  root.PapaGarage = { create, WEAPONS, ENGINES, CRAFTS };
})(typeof GameGlobal !== "undefined" ? GameGlobal : window);
