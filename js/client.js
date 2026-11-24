(() => {
  const __g = (typeof GameGlobal !== "undefined" && GameGlobal) || {};
  const __w = __g;
  const __sys = (typeof wx !== "undefined" && wx.getSystemInfoSync) ? wx.getSystemInfoSync() : {};
  const document = __w.document || __g.document;
  const devicePixelRatio = Number(__w.devicePixelRatio || __g.devicePixelRatio || __sys.pixelRatio || 1);
  const innerWidth = Number(__w.innerWidth || __g.innerWidth || __sys.screenWidth || 667);
  const innerHeight = Number(__w.innerHeight || __g.innerHeight || __sys.screenHeight || 375);
  const visualViewport = __w.visualViewport || __g.visualViewport || { width: innerWidth, height: innerHeight, addEventListener() {} };
  const location = __w.location || __g.location || { protocol: "https:", host: "game.hunchun828.top", search: "", href: "https://game.hunchun828.top/" };
  const localStorage = __g.localStorage || __w.localStorage;
  const WebSocket = __g.WxWebSocket || __g.WebSocket || __w.WebSocket;
  const wxScreen = __w.screen || __g.screen || { orientation: null };
  const addEventListener = ((__w.addEventListener || __g.addEventListener || function () {})).bind(__w);
  const requestAnimationFrame = ((__w.requestAnimationFrame || __g.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); })).bind(__w);
  function scheduleFrame(cb) {
    return requestAnimationFrame(cb);
  }
  const performance = (__g.performance && typeof __g.performance.now === "function")
    ? __g.performance
    : { now() { return Date.now(); } };
  const crypto = (__g.crypto && typeof __g.crypto.randomUUID === "function")
    ? __g.crypto
    : { randomUUID() { return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`; } };
  const atob = (typeof __g.atob === "function" && __g.atob)
    || function (str) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      let output = "";
      const input = String(str || "").replace(/=+$/, "");
      for (let bc = 0, bs, buffer, i = 0; (buffer = input.charAt(i++)); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0) {
        buffer = chars.indexOf(buffer);
      }
      return output;
    };
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  // 可切换绘制目标：烘焙精灵时临时指到离屏，失败/关闭则始终等?ctx
  let paintCtx = ctx;
  const IS_MOBILE = true;
  // 主视角缩放：数值越小看得越远。导弹飞行中拉远一倍，爆炸后恢复?
  const VIEW_SCALE_BASE = 0.75;
  const VIEW_SCALE_MISSILE = VIEW_SCALE_BASE * 0.5;
  let VIEW_SCALE = VIEW_SCALE_BASE;
  const BUILD = "wx";
  // 主屏整场?WebGL 仍关闭（易掉帧）；背?陨石等继?Canvas 2D?
  const USE_MAIN_WEBGL = false;
  // 飞机 WebGL 批绘：部分真?FBO 有像素但合成?2D 全透明，导致“飞机消失”?
  // 一律走主画?2D 图集直出，保证可见?
  const USE_CRAFT_WEBGL = false;
  // 飞机改装图集：始终启用；低端只降特效密度，不再退回三角矢量机?
  const USE_CRAFT_ATLAS = true;
  // 性能轻量档：只动装饰特效密度，不改操?判定?
  let PERF_LITE = false;
  let PERF_FX_GAP = 1;
  let hudCanvasLive = true;
  try {
    const info = (typeof wx !== "undefined" && typeof wx.getDeviceInfo === "function")
      ? wx.getDeviceInfo()
      : __sys;
    const bl = Number(info && info.benchmarkLevel);
    if (!Number.isFinite(bl) || bl <= 0 || bl < 30) {
      PERF_LITE = true;
      PERF_FX_GAP = 1.45;
    }
  } catch (e) {
    PERF_LITE = true;
    PERF_FX_GAP = 1.45;
  }
  try { GameGlobal.hudCanvasLive = true; } catch (e) {}
  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");
  const statusWrap = $("statusWrap");
  const kdKillsEl = $("kdKills");
  const kdDeathsEl = $("kdDeaths");
  let myKills = 0;
  let myDeaths = 0;
  let PLAYER_MAX_HP = 100;
  let MISSILE_DAMAGE = PLAYER_MAX_HP * 0.5;
  let PAD_HEAL_RATE = PLAYER_MAX_HP * 0.2; // 与服务器 PAD_HEAL 同比?
  let lastGoodMe = { x: 0, y: 0, heading: 0, throttle: 0, hp: PLAYER_MAX_HP, respawn: 0 };
  let drawFailAt = 0;
  function renderKd() {
    if (kdKillsEl) kdKillsEl.textContent = String(myKills);
    if (kdDeathsEl) kdDeathsEl.textContent = String(myDeaths);
  }
  const offlineEl = $("offline");
  const fullModal = $("fullModal");
  const fullDetail = $("fullDetail");
  const fullRetry = $("fullRetry");
  const gearBtn = $("gearBtn");
  const mapModeBtn = $("mapModeBtn");
  if (mapModeBtn) mapModeBtn.style.display = "none";
  const lobbyEl = $("lobby");
  const waitingEl = $("waiting");
  const menuModal = $("menuModal");
  const summaryEl = $("summary");
  const summaryBody = $("summaryBody");
  const lobbyErr = $("lobbyErr");
  const waitCodeEl = $("waitCode");
  const waitListEl = $("waitList");
  const waitMetaEl = $("waitMeta");
  const teamPickEl = $("teamPick");
  const matchTimerEl = $("matchTimer");
  const btnStart = $("btnStart");
  const TEAM_COLORS = ["#78d9ff", "#ffb86b", "#9dff8a", "#ff8ab8", "#d7a5ff", "#ffe36e", "#7dffda", "#ff9d9d"];
  function normalizeTeamIndex(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  let phase = "lobby";
  let roomCode = "";
  let pendingJoinCode = "";
  let inviteJoinSent = "";
  let iAmHost = false;
  let factionPads = [];
  let matchLeft = -1;
  let matchEndAt = 0; // Date.now() 结束时刻；墙钟计时，断线/进后台回来也能追?
  let myTeam = 0;
  let localMatch = false;
  let localTestMode = false; // 测试入口开的局：机器人?testBot.js 的独立大脑，不上报战?
  let localTrainMode = false; // 训练场：只有不还手的单发靶机，不限时、不上报
  let localLevelMode = false; // 关卡模式：指定敌机配置，击毁过关 / 被毁失败
  let assistCoopMode = false; // 关卡助战双人同场
  let assistLevelBooting = false; // 开?loading ?
  let assistSnapAcc = 0;
  let assistLevelSeedVal = 0;
  let levelRunCol = 0; // 1=敌机 2=母舰?
  let levelRunResult = null; // "win" | "fail" | null
  let levelRunEnding = false;
  let levelFailCine = null; // { age, dur } 失败慢镜?
  let levelFailHold = false; // 慢镜头后停在战场 + 失败弹窗，不回首?
  let levelWinCine = null; // { age, dur, sx, sy } 过关慢镜?+ 卡片飞出
  let levelWinHold = false; // 过关弹窗停帧
  let localMotherships = []; // 关卡母舰（Steam MS-01，本地演算）
  let localAirMines = []; // ?关空中地?
  let mineArm = null; // { mineId, age, dur, mx, my }
  let mineCleared = 0;
  let localSatellites = []; // ?关卫?
  let satArm = null; // { satId, panelSide, mx, my, age, dur, reachDur, holdDur }
  let satCutCount = 0;
  let satGrabCount = 0;
  let level5Exit = null; // { x0,y0,x1,y1 } 撤离?
  const LEVEL_MINE_COUNT = 5;
  const LEVEL_SAT_COUNT = 2;
  const LEVEL_SAT_PANEL_TOTAL = 4; // 2 星 × 2 板
  const LEVEL_SAT_GRAB_TOTAL = 2;
  const LEVEL_SAT_GRAB_RANGE = 130;
  const LEVEL5_EXIT_SIZE = 280;
  const LEVEL_MOTHER_OID = 9001;
  const PapaMS01 = (typeof GameGlobal !== "undefined" && GameGlobal.PapaMS01) || null;
  const PapaAirMine = (typeof GameGlobal !== "undefined" && GameGlobal.PapaAirMine) || null;
  const PapaSatellite = (typeof GameGlobal !== "undefined" && GameGlobal.PapaSatellite) || null;
  const LEVEL_MOTHER_HP = (PapaMS01 && PapaMS01.MAX_HP) || 90;
  const LEVEL_MOTHER_HIT_R = (PapaMS01 && PapaMS01.HIT_R) || 52;
  const LEVEL_MOTHER_FIRE_R = (PapaMS01 && PapaMS01.RANGE) || 620;
  const LEVEL_MOTHER_MIS_CD = 10;      // ?10 秒发 1 发导?
  const LEVEL_MOTHER_MIS_COUNT = 1;
  const LEVEL_MOTHER_MIS_GAP = 0;
  // 机库改装方案（训练场 / 本地匹配生效）：{ main: gun|cannon|gatling, sub: missile|laser|emp|drone, engine: single|twin }
  const TRAIN_MAINS = ["gun", "cannon", "gatling"];
  const TRAIN_SUBS = ["missile", "mirv", "laser", "emp"]; // 机器人随机池（不含无人机?
  const TRAIN_SUBS_ALL = ["missile", "mirv", "laser", "emp", "drone"];
  function isMissileSub(sub) {
    return sub === "missile" || sub === "mirv";
  }
  const DRONE_AMMO = 100;
  const DRONE_COUNT = 2;
  const DRONE_HIT_R = 22; // 半尺寸机体碰撞（CRAFT_HIT_R?0?
  function droneMaxHp() { return Math.max(1, Math.round(PLAYER_MAX_HP / 3)); }
  const localDrones = []; // { x, y, heading, vx, vy, hp, maxHp, ammo, ... }
  const PLAYER_CRAFT_KEYS = ["fbx", "jgi", "jci"];
  const PLAYER_CRAFT_ALIASES = { f22: "jgi" }; // 旧存?F-22 ?JGI
  const DEFAULT_PLAYER_CRAFT = "jci"; // 新用户默认已拥有 JCI
  function normalizePlayerCraft(key) {
    const mapped = PLAYER_CRAFT_ALIASES[key] || key;
    return PLAYER_CRAFT_KEYS.includes(mapped) ? mapped : DEFAULT_PLAYER_CRAFT;
  }
  let trainLoadout = null;
  // 开房对战里被电磁脉冲瘫痪的飞机：id ?瘫痪结束时刻（performance.now 毫秒?
  const roomStunUntil = new Map();
  let trainFromGarage = false;
  let levelFromLevels = false;
  const TRAIN_TARGET_COUNT = 10;
  const TRAIN_ALLY_COUNT = 2;
  // 训练场四步纯介绍：加速推??切武??开??方向摇杆（扣洞提示，无需操作?
  // 引导蒙层期间冻结场上飞机与操作；蒙层消失后才可操?
  const TRAIN_GUIDE_STEPS = 4;
  let trainGuide = null; // { step, startedAt }
  function trainGuideWorldFrozen() {
    return !!(trainGuide && trainGuide.step < TRAIN_GUIDE_STEPS);
  }
  function publishTrainGuide() {
    try {
      GameGlobal.trainGuide = trainGuide
        ? {
          step: trainGuide.step,
          active: trainGuide.step < TRAIN_GUIDE_STEPS,
          frozen: trainGuideWorldFrozen(),
        }
        : null;
    } catch (e) {}
  }
  function beginTrainGuide() {
    trainGuide = {
      step: 0,
      startedAt: performance.now(),
    };
    publishTrainGuide();
  }
  function endTrainGuide() {
    trainGuide = null;
    publishTrainGuide();
  }
  function advanceTrainGuide() {
    if (!trainGuide || trainGuide.step >= TRAIN_GUIDE_STEPS) return;
    trainGuide.step = Math.min(TRAIN_GUIDE_STEPS, trainGuide.step + 1);
    if (trainGuide.step >= TRAIN_GUIDE_STEPS) {
      try { wx.showToast({ title: "提示", icon: "none", duration: 1400 }); } catch (e) {}
      endTrainGuide();
      return;
    }
    publishTrainGuide();
  }
  function noteTrainGuideWeapon() {}
  function noteTrainGuideLever() {}
  try {
    GameGlobal.advanceTrainGuide = () => advanceTrainGuide();
    GameGlobal.skipTrainGuide = () => endTrainGuide();
  } catch (e) {}
  let matchLost = false;
  let matchHbAt = 0;
  const MATCH_HB_MS = 10000;
  let localCrafts = [];
  let localMissiles = [];
  let localMissileSeq = 0;
  let localMatchAcc = 0;
  let localMatchStartedAt = 0;
  let localMatchPlannedSec = 0;
  let localSkillAcc = 0;
  let localShieldSpawnAcc = 0;
  // 单人匹配：子弹容量道具，?20 秒地图随机刷一?
  let localMagPickups = [];
  let localMagSpawnAcc = 0;
  const LOCAL_MAG_SPAWN_EVERY = 20;
  const LOCAL_MAG_PICK_R = 48;
  const LOCAL_MAG_BONUS = 20;
  let localRockSpawnAcc = 0;
  let historyLoading = false;
  let localShieldPickups = [];
  const LOCAL_SHIELD_SPAWN_EVERY = 10;
  const LOCAL_DIRT_ROCK_COUNT = 20; // 与线上一致：开局 20 块土陨石，不再补?
  const LOCAL_ROCK_SPAWN_EVERY = 0; // 0 = 禁用补刷
  // 陨石静止：不漂移、不自转；被打也不被推走（裂开碎片原地错开?
  const ASTEROIDS_STATIC = true;
  function lockAsteroidMotion(a) {
    if (!a || !ASTEROIDS_STATIC) return;
    a.vx = 0;
    a.vy = 0;
    a.spin = 0;
    if (a.sx != null) { a.sx = a.x; a.sy = a.y; }
    if (a.srot != null) a.srot = a.rotation || 0;
  }
  const LOCAL_SHIELD_DURATION = 15;
  // 复活后无敌时长（与服务器 SPAWN_GUARD 一致），期间飞机外圈画红色倒计时圈
  const SPAWN_GUARD_MS = 3000;
  // id ?{ dead, until }：按复活状态的变化推算各飞机的无敌结束时刻
  const spawnGuardSeen = new Map();
  const LOCAL_SHIELD_PICK_R = 36;
  let localKills = 0;
  let localDeaths = 0;
  // NPC 名：纯英文大写，?0 字符
  const LOCAL_BOT_NAMES = [
    "ACE", "NOVA", "RIX", "KITE", "ORB", "VEX", "NYX", "JOLT", "ASH", "PIO",
    "REX", "HAWK", "BOLT", "ECHO", "WOLF", "DUSK", "FANG", "IRIS", "COMET", "TALON",
  ];
  function nextBotName(used) {
    const pool = LOCAL_BOT_NAMES.filter((n) => !used.has(n));
    const src = pool.length ? pool : LOCAL_BOT_NAMES;
    let name = src[(Math.random() * src.length) | 0];
    name = String(name || "ACE").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 10) || "ACE";
    used.add(name);
    return name;
  }
  function formatMatchClock(sec) {
    const s = Math.max(0, Math.ceil(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  function setMatchDeadline(sec) {
    if (!(sec >= 0)) {
      matchLeft = -1;
      matchEndAt = 0;
      return;
    }
    matchLeft = sec;
    matchEndAt = Date.now() + sec * 1000;
  }
  function clearMatchDeadline() {
    matchLeft = -1;
    matchEndAt = 0;
  }
  /** 按墙钟刷新剩余秒；返回是否已到时 */
  function syncMatchTimerFromClock() {
    if (!(matchEndAt > 0)) return false;
    const left = Math.max(0, (matchEndAt - Date.now()) / 1000);
    const prevCeil = Math.ceil(Math.max(0, matchLeft));
    const nextCeil = Math.ceil(left);
    matchLeft = left;
    if (prevCeil !== nextCeil || left <= 0) renderMatchTimer();
    return left <= 0;
  }
  let lastCountdownSec = -1;
  function renderMatchTimer() {
    if (!matchTimerEl) return;
    if (!(matchLeft >= 0) || phase !== "playing") {
      matchTimerEl.classList.remove("show", "warn", "endcd");
      lastCountdownSec = -1;
      return;
    }
    const critical = matchLeft <= 10;
    const secLeft = Math.max(0, Math.ceil(matchLeft));
    // 最?10 秒：改成整数秒数字倒计?+ 嘀嗒音?
    matchTimerEl.textContent = critical ? String(secLeft) : formatMatchClock(matchLeft);
    matchTimerEl.classList.add("show");
    matchTimerEl.classList.toggle("warn", matchLeft <= 30);
    matchTimerEl.classList.toggle("endcd", critical);
    if (critical && secLeft > 0 && secLeft !== lastCountdownSec) {
      lastCountdownSec = secLeft;
      try { GameGlobal.SkyAceSfx?.playCountdown?.(secLeft); } catch (e) {}
    } else if (!critical) {
      lastCountdownSec = -1;
    }
  }
  function setLobbyView(view) {
    try { GameGlobal.lobbyView = view || "home"; } catch (e) {}
  }
  function setPhase(next) {
    const prev = phase;
    phase = next;
    document.documentElement.classList.toggle("ingame", next === "playing");
    if (lobbyEl) lobbyEl.style.display = next === "lobby" ? "grid" : "none";
    if (waitingEl) waitingEl.style.display = next === "waiting" ? "grid" : "none";
    if (menuModal && next !== "playing") menuModal.style.display = "none";
    if (gearBtn && next !== "playing") gearBtn.style.display = "none";
    if (mapModeBtn && next !== "playing") mapModeBtn.style.display = "none";
    if (next !== prev) spawnGuardSeen.clear();
    // 结算面板可盖在大厅上；仅进对局时强制收?
    if (summaryEl && next === "playing") summaryEl.style.display = "none";
    if (next === "playing") {
      // 失败定格中不要清掉失败弹窗（welcome/重连也会再次 setPhase playing?
      if (!(levelFailHold || levelRunResult === "fail")) hideLevelFailModal();
      // 进局强制撕掉助战准备?
      try {
        GameGlobal.assistReadyDismissed = true;
        if (typeof GameGlobal.dismissAssistReadyModalKeepGuest === "function") {
          GameGlobal.dismissAssistReadyModalKeepGuest();
        } else {
          const modal = $("assistReadyModal");
          if (modal) modal.style.display = "none";
        }
      } catch (e) {}
    }
    if (matchTimerEl && next !== "playing") matchTimerEl.classList.remove("show", "warn", "endcd");
    if (next === "lobby") setLobbyView("home");
    if (next !== "lobby") {
      try {
        destroyWxUserInfoBtn();
        closeAuthModal();
        closeSettingsModal();
        closeHistoryModal();
        wxAuthBusy = false;
        wxAuthPending = null;
      } catch (e) {}
    }
    // 开房对战（服务器演算）同样按已保存的改装方案开火；本地匹配?startLocalMatch 里设
    if (!localMatch && (next === "playing") !== (prev === "playing")) {
      trainLoadout = next === "playing" ? loadoutForMatch() : null;
      resetTrainWeapons();
      roomStunUntil.clear();
      try { GameGlobal.trainLoadout = trainLoadout; } catch (e) {}
    }
    if (next === "playing") {
      const nm = $("nameModal");
      if (nm) nm.style.display = "none";
      // 音效 / 轻量星空 / 机体精灵进局再加?
      try { ensureMapTiles(); } catch (e) {}
      try { ensureCraftSprites(); } catch (e) {}
      try { (typeof GameGlobal !== "undefined" ? GameGlobal.SkyAceSfx : null)?.ensureLoaded?.(); } catch (e) {}
    } else {
      setAutoPilot(false);
      if (prev === "playing") {
        // 离局释放：音?PCM、地图离屏、特效池占用
        try { (typeof GameGlobal !== "undefined" ? GameGlobal.SkyAceSfx : null)?.unload?.(); } catch (e) {}
        try { releaseMapTiles(); } catch (e) {}
        try { clearFxPools(); } catch (e) {}
      }
    }
  }
  function resetWorldClient() {
    latestPlayers = [];
    playerCount = 0;
    roster.clear();
    playerStatus.clear();
    entPlayers.clear();
    entMissiles.clear();
    entMotherships.clear();
    mothershipBase.clear();
    clearFxPools();
    asteroids.clear();
    medkit = null;
    gunAmmoMax = GUN_AMMO_MAX;
    gunAmmo = GUN_AMMO_MAX;
    missileAmmoMax = MISSILE_AMMO_MAX;
    missileAmmo = MISSILE_AMMO_MAX;
    publicBrawl = false;
    factionPads = [];
    WORLD_Y_LIMIT = WORLD_LIMIT;
    level4Goal = null;
    level5Exit = null;
    clearMatchDeadline();
    localMatch = false;
    localTestMode = false;
    localTrainMode = false;
    localLevelMode = false;
    assistCoopMode = false;
    assistLevelBooting = false;
    assistSnapAcc = 0;
    assistLevelSeedVal = 0;
    levelRunCol = 0;
    levelRunResult = null;
    levelRunEnding = false;
    levelFailCine = null;
    levelFailHold = false;
    levelWinCine = null;
    levelWinHold = false;
    localMotherships = [];
    localAirMines = [];
    mineArm = null;
    mineCleared = 0;
    localSatellites = [];
    satArm = null;
    satCutCount = 0;
    satGrabCount = 0;
    try {
      GameGlobal.levelFailCine = false;
      GameGlobal.levelFailHold = false;
      GameGlobal.levelWinCine = false;
      GameGlobal.levelWinHold = false;
      GameGlobal.levelMineMode = false;
      GameGlobal.mineDefuseReady = false;
      GameGlobal.mineCleared = 0;
      GameGlobal.mineTotal = LEVEL_MINE_COUNT;
      GameGlobal.levelSatMode = false;
      GameGlobal.satCutReady = false;
      GameGlobal.satGrabReady = false;
      GameGlobal.satArmActive = false;
      GameGlobal.satActLabel = "剪断";
      GameGlobal.satCutCount = 0;
      GameGlobal.satCutTotal = LEVEL_SAT_PANEL_TOTAL;
      GameGlobal.satGrabCount = 0;
      GameGlobal.satGrabTotal = LEVEL_SAT_GRAB_TOTAL;
    } catch (e) {}
    try { hideLevelWinModal(); } catch (e) {}
    matchLost = false;
    matchHbAt = 0;
    localCrafts = [];
    localMissiles = [];
    VIEW_SCALE = VIEW_SCALE_BASE;
    myMissileClaim.clear();
    seenNetMissileIds = new Set();
    missileClaimUntil = 0;
    localMissileSeq = 0;
    localMatchAcc = 0;
    localSkillAcc = 0;
    localShieldSpawnAcc = 0;
    localRockSpawnAcc = 0;
    localShieldPickups = [];
    localMagPickups = [];
    localMagSpawnAcc = 0;
    localKills = 0;
    localDeaths = 0;
    renderMatchTimer();
    net.clock = null;
    net.latestSt = 0;
    pred = null;
    play.frames.length = 0;
    play.events.length = 0;
    play.playing = false;
    play.head = 0;
    play.pose = null;
    myId = pilot.wantId || null;
  }
  let lastWaitMembers = [];
  let lastWaitTeams = 0;
  let lastWaitTeamCap = 4;
  let waitTipText = "";
  let lastWaitRallying = false;
  let waitRallyDone = false;
  let rallyLoadingToastOn = false;
  function showRallyLoadingToast() {
    if (rallyLoadingToastOn) return;
    rallyLoadingToastOn = true;
    try {
      if (typeof wx !== "undefined" && typeof wx.showToast === "function") {
        try { wx.showToast({ title: "提示", icon: "none", duration: 1400 }); } catch (e) {}
      }
    } catch (e) {}
  }
  function hideRallyLoadingToast(doneToast) {
    if (!rallyLoadingToastOn && !doneToast) return;
    rallyLoadingToastOn = false;
    try { if (typeof wx !== "undefined" && wx.hideToast) wx.hideToast(); } catch (e) {}
    if (doneToast) {
      try {
        if (typeof wx !== "undefined" && typeof wx.showToast === "function") {
          wx.showToast({ title: "召集完成", icon: "success", duration: 1200 });
        }
      } catch (e) {}
    }
  }
  const waitAvatarCache = new Map(); // url ?Image/Canvas
  function hashSeed(str) {
    let h = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  /** 微信式默认空头像（白底灰剪影），缺头像时统一用这?*/
  let wxDefaultAvatar = null;
  function makeWxDefaultAvatar() {
    if (wxDefaultAvatar) return wxDefaultAvatar;
    const size = 96;
    let c = null;
    try {
      if (typeof wx !== "undefined" && typeof wx.createOffscreenCanvas === "function") {
        c = wx.createOffscreenCanvas({ type: "2d", width: size, height: size });
      }
    } catch (e) {}
    if (!c && typeof document !== "undefined" && document.createElement) {
      try { c = document.createElement("canvas"); } catch (e) {}
    }
    if (!c || typeof c.getContext !== "function") return null;
    try { c.width = size; c.height = size; } catch (e) {}
    const g = c.getContext("2d");
    if (!g) return null;
    try {
      // ?浅灰?+ 灰色空人头剪影（接近微信默认?
      g.fillStyle = "#f3f3f3";
      g.fillRect(0, 0, size, size);
      g.fillStyle = "#d9d9d9";
      g.beginPath();
      g.arc(size * 0.5, size * 0.5, size * 0.48, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#c0c0c0";
      g.beginPath();
      g.arc(size * 0.5, size * 0.40, size * 0.18, 0, Math.PI * 2);
      g.fill();
      // 微信离屏 canvas 没有 quadraticCurveTo，肩膀用半?
      g.beginPath();
      g.arc(size * 0.5, size * 0.98, size * 0.32, Math.PI, 0);
      g.closePath();
      g.fill();
    } catch (e) {
      return null;
    }
    wxDefaultAvatar = c;
    waitAvatarCache.set("portrait:wx-default", c);
    return c;
  }
  /** 本地生成「真人感」头像（加载外链失败时兜底） */
  function makeHumanishPortrait(seedKey) {
    const key = `portrait:${seedKey || "x"}`;
    if (waitAvatarCache.has(key)) return waitAvatarCache.get(key);
    const size = 96;
    let c = null;
    try {
      if (typeof wx !== "undefined" && typeof wx.createOffscreenCanvas === "function") {
        c = wx.createOffscreenCanvas({ type: "2d", width: size, height: size });
      }
    } catch (e) {}
    if (!c && typeof document !== "undefined" && document.createElement) {
      try { c = document.createElement("canvas"); } catch (e) {}
    }
    if (!c || typeof c.getContext !== "function") return makeWxDefaultAvatar();
    try { c.width = size; c.height = size; } catch (e) {}
    const g = c.getContext("2d");
    if (!g) return makeWxDefaultAvatar();
    const h = hashSeed(seedKey);
    const skin = ["#f3d2b4", "#e8b98a", "#c98a62", "#f6dfc6", "#d4a574"][h % 5];
    const hair = ["#2b2118", "#4a3728", "#1a1a1a", "#6b4423", "#3d2b1f"][(h >>> 3) % 5];
    const bg = ["#5b8def", "#64c5a0", "#f0a05a", "#c084fc", "#5ec8e8", "#f472b6"][(h >>> 7) % 6];
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    // 肩（圆近似，兼容?ellipse 的微?canvas?
    g.fillStyle = ["#334155", "#1e293b", "#0f766e", "#7c2d12", "#312e81"][(h >>> 11) % 5];
    g.beginPath();
    g.arc(size * 0.5, size * 1.02, size * 0.40, 0, Math.PI * 2);
    g.fill();
    // ?
    g.fillStyle = skin;
    g.beginPath();
    g.arc(size * 0.5, size * 0.46, size * 0.28, 0, Math.PI * 2);
    g.fill();
    // 头发
    g.fillStyle = hair;
    g.beginPath();
    g.arc(size * 0.5, size * 0.34, size * 0.30, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.arc(size * 0.5, size * 0.28, size * 0.26, 0, Math.PI * 2);
    g.fill();
    if ((h & 1) === 0) {
      g.beginPath();
      g.arc(size * 0.28, size * 0.42, size * 0.08, 0, Math.PI * 2);
      g.arc(size * 0.72, size * 0.42, size * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    // ?
    g.fillStyle = "#1f2937";
    g.beginPath();
    g.arc(size * 0.40, size * 0.46, size * 0.035, 0, Math.PI * 2);
    g.arc(size * 0.60, size * 0.46, size * 0.035, 0, Math.PI * 2);
    g.fill();
    // ?
    g.strokeStyle = "#b45309";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(size * 0.5, size * 0.56, size * 0.08, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    waitAvatarCache.set(key, c);
    return c;
  }
  function bumpAvatarViews() {
    try {
      if (typeof GameGlobal !== "undefined" && GameGlobal.waitRoomState) {
        GameGlobal.waitRoomState.rev = (GameGlobal.waitRoomState.rev || 0) + 1;
      }
    } catch (e) {}
    try {
      if (typeof GameGlobal !== "undefined" && GameGlobal.summaryState) {
        GameGlobal.summaryState.rev = (GameGlobal.summaryState.rev || 0) + 1;
      }
    } catch (e) {}
  }
  function loadWaitAvatar(url, fallbackSeed) {
    const key = String(url || "");
    if (!key) return fallbackSeed ? makeHumanishPortrait(fallbackSeed) : null;
    if (waitAvatarCache.has(key)) return waitAvatarCache.get(key);
    const img = (typeof wx !== "undefined" && typeof wx.createImage === "function")
      ? wx.createImage()
      : (typeof Image !== "undefined" ? new Image() : null);
    if (!img) return fallbackSeed ? makeHumanishPortrait(fallbackSeed) : null;
    waitAvatarCache.set(key, img);
    img.onload = () => { bumpAvatarViews(); };
    img.onerror = () => {
      try { waitAvatarCache.delete(key); } catch (e) {}
      if (fallbackSeed) {
        const portrait = makeHumanishPortrait(fallbackSeed);
        if (portrait) waitAvatarCache.set(key, portrait);
        bumpAvatarViews();
      }
    };
    try { img.src = key; } catch (e) {}
    return img;
  }
  /** 结算/等待室：有图用图；没有就微信默认空头?*/
  function ensurePortrait(seedKey, existing) {
    if (existing && ((existing.width || 0) > 0 || (existing.height || 0) > 0 || existing.getContext || existing.src)) {
      return existing;
    }
    return makeHumanishPortrait(seedKey) || makeWxDefaultAvatar() || existing || null;
  }

  // 一进游戏就拉服务器头像池；单人匹配 / 召集机器人都从这里随机取
  const AVATAR_API = "https://game.hunchun828.top/api/avatars";
  const AVATAR_CDN = "https://game.hunchun828.top/avatars/";
  let avatarCatalog = null;
  let avatarWarmPool = []; // { url, img }
  const avatarWarming = new Set();
  const botSeatAvatarMap = new Map(); // botKey -> { url, img }
  let avatarBootStarted = false;
  function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fetchAvatarCatalog() {
    if (avatarCatalog && avatarCatalog.length) return Promise.resolve(avatarCatalog);
    return new Promise((resolve) => {
      const done = (files) => {
        avatarCatalog = Array.isArray(files) ? files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
        resolve(avatarCatalog);
      };
      try {
        if (typeof wx !== "undefined" && typeof wx.request === "function") {
          wx.request({
            url: AVATAR_API,
            method: "GET",
            timeout: 5000,
            success: (res) => done(res && res.data && res.data.files),
            fail: () => done([]),
          });
          return;
        }
      } catch (e) {}
      if (typeof fetch === "function") {
        fetch(AVATAR_API).then((r) => r.json()).then((j) => done(j && j.files)).catch(() => done([]));
        return;
      }
      done([]);
    });
  }
  function preloadOneAvatar(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(null); return; }
      if (waitAvatarCache.has(url)) {
        const hit = waitAvatarCache.get(url);
        if (hit && ((hit.width || 0) > 0 || hit.complete || hit.getContext)) {
          resolve({ url, img: hit });
          return;
        }
      }
      const img = (typeof wx !== "undefined" && typeof wx.createImage === "function")
        ? wx.createImage()
        : (typeof Image !== "undefined" ? new Image() : null);
      if (!img) { resolve(null); return; }
      waitAvatarCache.set(url, img);
      const finish = (ok) => {
        if (!ok) {
          try { waitAvatarCache.delete(url); } catch (e) {}
          resolve(null);
          return;
        }
        resolve({ url, img });
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      try { img.src = url; } catch (e) { finish(false); }
    });
  }
  /** 往热池补到 target 张（追加，不整表清空?*/
  function ensureAvatarWarmPool(target) {
    // 关卡页纯矢量 UI：不在此期间拉头像图，避免多余网?解码
    try {
      if (GameGlobal && GameGlobal.levelsOpen) return Promise.resolve(avatarWarmPool);
    } catch (e) {}
    const want = Math.max(12, Math.min(48, target | 0));
    return fetchAvatarCatalog().then((files) => {
      if (!files.length) return avatarWarmPool;
      const have = new Set(avatarWarmPool.map((r) => r.url));
      for (const u of avatarWarming) have.add(u);
      const candidates = shuffleArr(files)
        .map((f) => AVATAR_CDN + f)
        .filter((u) => !have.has(u));
      const need = Math.max(0, want - avatarWarmPool.length);
      const urls = candidates.slice(0, need);
      urls.forEach((u) => avatarWarming.add(u));
      return Promise.all(urls.map((u) => preloadOneAvatar(u).then((row) => {
        avatarWarming.delete(u);
        if (row && row.img) avatarWarmPool.push(row);
        return row;
      }))).then(() => avatarWarmPool);
    }).catch(() => avatarWarmPool);
  }
  function warmAvatarsOnBoot() {
    if (avatarBootStarted) return;
    avatarBootStarted = true;
    ensureAvatarWarmPool(36).then(() => {
      // 池偏低时后台再补一?
      if (avatarWarmPool.length < 16) ensureAvatarWarmPool(36);
    });
  }
  function takeWarmAvatar() {
    while (avatarWarmPool.length) {
      const row = avatarWarmPool.shift();
      if (row && row.img) {
        // 取走后异步补一张，保持池子有货
        if (avatarWarmPool.length < 12) ensureAvatarWarmPool(24);
        return row;
      }
    }
    if (avatarCatalog && avatarCatalog.length) ensureAvatarWarmPool(24);
    return null;
  }
  function takeLocalMatchAvatar() {
    return takeWarmAvatar();
  }
  function avatarForRallyBot(key, serverUrl) {
    const k = String(key || serverUrl || "bot");
    if (botSeatAvatarMap.has(k)) return botSeatAvatarMap.get(k);
    // 服务器下发的 URL 若已在热缓存里，直接?
    if (serverUrl && waitAvatarCache.has(serverUrl)) {
      const hit = waitAvatarCache.get(serverUrl);
      if (hit && ((hit.width || 0) > 0 || hit.complete)) {
        const row = { url: serverUrl, img: hit };
        botSeatAvatarMap.set(k, row);
        return row;
      }
    }
    const picked = takeWarmAvatar();
    if (picked) {
      botSeatAvatarMap.set(k, picked);
      return picked;
    }
    if (serverUrl) {
      const img = loadWaitAvatar(serverUrl, k);
      const row = { url: serverUrl, img: img || makeWxDefaultAvatar() };
      botSeatAvatarMap.set(k, row);
      return row;
    }
    const row = { url: "", img: makeWxDefaultAvatar() };
    botSeatAvatarMap.set(k, row);
    return row;
  }
  function clearRallyBotAvatars() {
    botSeatAvatarMap.clear();
  }
  let waitRoomPublic = false;
  function publishWaitRoomState(extraTip) {
    const tip = extraTip != null ? extraTip : waitTipText;
    const teamN = clamp(Math.round(Number(lastWaitTeams) || 2), 2, 8);
    const safeMembers = [];
    const src = Array.isArray(lastWaitMembers) ? lastWaitMembers : [];
    for (let i = 0; i < src.length; i++) {
      const u = src[i];
      if (!u || typeof u !== "object") continue;
      const team = clamp(Math.round(Number(u.team) || 0), 0, teamN - 1);
      let avatarUrl = String(u.avatarUrl || "");
      const nick = String(u.name || "");
      let avatarImg = null;
      try {
        if (u.you) {
          avatarImg = pilot.avatarImg || (avatarUrl ? loadWaitAvatar(avatarUrl, nick || "me") : null) || makeWxDefaultAvatar();
        } else if (u.bot) {
          const botKey = `${nick}|${team}|${avatarUrl || i}`;
          const row = avatarForRallyBot(botKey, avatarUrl);
          avatarUrl = row.url || avatarUrl;
          avatarImg = row.img || makeWxDefaultAvatar();
        } else {
          // 真人：只用他自己上报的头像，没有就微信默认空头像
          avatarImg = (avatarUrl ? loadWaitAvatar(avatarUrl, nick || `t${team}`) : null) || makeWxDefaultAvatar();
        }
      } catch (e) { avatarImg = makeWxDefaultAvatar(); }
      const id = u.id != null ? u.id : undefined;
      const key = u.key || (id != null ? `id:${id}` : `n:${nick}|t:${team}|b:${u.bot ? 1 : 0}|i:${i}`);
      safeMembers.push({
        id,
        key,
        team,
        name: nick,
        color: u.color || TEAM_COLORS[team % TEAM_COLORS.length],
        you: !!u.you,
        host: !!u.host,
        bot: !!u.bot,
        avatarUrl,
        avatarImg,
      });
    }
    if (!waitRoomPublic && iAmHost && !safeMembers.some((u) => u.you || u.host)) {
      safeMembers.unshift({
        id: undefined,
        key: "self-host",
        team: clamp(Math.round(Number(myTeam) || 0), 0, teamN - 1),
        color: TEAM_COLORS[0],
        you: true,
        host: true,
        bot: false,
        avatarUrl: String(pilot.avatarUrl || ""),
        avatarImg: pilot.avatarImg || null,
      });
    }
    try {
      GameGlobal.waitRoomState = {
        code: roomCode || "----",
        meta: waitMetaEl ? waitMetaEl.textContent : "",
        tip: tip || "",
        youHost: iAmHost,
        public: !!waitRoomPublic,
        teams: teamN,
        teamCap: clamp(Math.round(Number(lastWaitTeamCap) || 4), 1, 4),
        perTeam: clamp(Math.round(Number(lastWaitTeamCap) || 4), 1, 4),
        myTeam: clamp(Math.round(Number(myTeam) || 0), 0, teamN - 1),
        rallying: !!lastWaitRallying,
        rallyDone: !!waitRallyDone,
        members: safeMembers,
        rev: Date.now(),
      };
    } catch (e) {}
  }
  function renderWait(m) {
    const nextCode = m.code || roomCode;
    if (nextCode && roomCode && nextCode !== roomCode) {
      waitRallyDone = false;
      lastWaitRallying = false;
    }
    roomCode = nextCode;
    if (pendingJoinCode && roomCode === pendingJoinCode) {
      pendingJoinCode = "";
      inviteJoinSent = "";
    }
    iAmHost = !!m.youHost;
    waitRoomPublic = !!m.public;
    const teams = clamp(Math.round(Number(m.teams) || 2), 2, 8);
    lastWaitTeams = teams;
    lastWaitTeamCap = clamp(
      Math.round(Number(m.teamCap) || Number(m.perTeam) || lastWaitTeamCap || 4),
      1,
      4
    );
    const rawMembers = Array.isArray(m.members) ? m.members : [];
    lastWaitMembers = [];
    for (let i = 0; i < rawMembers.length; i++) {
      const u = rawMembers[i];
      if (!u || typeof u !== "object") continue;
      const team = clamp(Math.round(Number(u.team) || 0), 0, teams - 1);
      const id = u.id != null ? u.id : (u.pid != null ? u.pid : undefined);
      const name = u.name || "";
      const bot = !!u.bot;
      lastWaitMembers.push({
        id,
        key: id != null ? `id:${id}` : `n:${name}|t:${team}|b:${bot ? 1 : 0}|i:${i}`,
        name,
        team,
        you: !!u.you,
        host: !!u.host,
        bot,
        avatarUrl: u.avatarUrl || "",
        color: u.color || TEAM_COLORS[team % TEAM_COLORS.length],
      });
    }
    // 保底：房主回包缺席时，本地补一个自己，避免宫格空着
    if (!waitRoomPublic && iAmHost && !lastWaitMembers.some((u) => u.you || u.host)) {
      lastWaitMembers.unshift({
        id: undefined,
        key: "self-host",
        team: 0,
        you: true,
        host: true,
        bot: false,
        avatarUrl: pilot.avatarUrl || "",
        color: TEAM_COLORS[0],
        name: pilot.name || "",
      });
    }
    // 若回包有成员但没?you/host，把第一个真人标成自己（房主开房常见）
    if (!waitRoomPublic && iAmHost && lastWaitMembers.length && !lastWaitMembers.some((u) => u.you)) {
      const hostRow = lastWaitMembers.find((u) => u.host) || lastWaitMembers[0];
      hostRow.you = true;
      hostRow.host = true;
    }
    const mine = lastWaitMembers.find((u) => u.you) || lastWaitMembers.find((u) => u.host);
    myTeam = mine ? clamp(Math.round(Number(mine.team) || 0), 0, teams - 1) : 0;
    if (waitCodeEl) waitCodeEl.textContent = roomCode || "----";
    if (waitMetaEl) {
      statusEl.textContent = "关卡进行中";
      statusEl.textContent = "关卡进行中";
    }
    if (btnStart) btnStart.style.display = iAmHost ? "inline-block" : "none";
    const btnRally = $("btnRally");
    if (btnRally) {
      btnRally.style.display = iAmHost && !m.public ? "inline-block" : "none";
      statusEl.textContent = "关卡进行中";
      btnRally.disabled = !!m.rallying;
    }
    const nowRallying = !!m.rallying;
    if (nowRallying) {
      lastWaitRallying = true;
      if (waitTipText === "正在召集机器人") waitTipText = "";
      showRallyLoadingToast();
    } else {
      if (lastWaitRallying) {
        waitRallyDone = true;
        hideRallyLoadingToast(true);
      } else if (rallyLoadingToastOn) {
        hideRallyLoadingToast(false);
      }
      lastWaitRallying = false;
      if (waitTipText === "正在召集机器人") waitTipText = "";
    }
    // 先发布绘制状态，避免后面 DOM 操作异常导致房主/阵营丢失
    publishWaitRoomState();
    // 阵营色块：点选换阵营（宫格绘制读 waitRoomState?
    try {
      if (teamPickEl) {
        teamPickEl.innerHTML = "";
        if (!m.public && teams >= 2) {
          for (let i = 0; i < teams; i++) {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.team = String(i);
            b.style.background = TEAM_COLORS[i % TEAM_COLORS.length];
            b.title = `阵营 ${i + 1}`;
            if (i === myTeam) b.classList.add("on");
            b.addEventListener("click", () => {
              try { GameGlobal.requestWaitTeam && GameGlobal.requestWaitTeam(i); } catch (e) {}
            });
            teamPickEl.appendChild(b);
          }
        }
      }
      if (waitListEl) {
        waitListEl.innerHTML = "";
        for (const u of lastWaitMembers) {
          const li = document.createElement("li");
          li.dataset.team = String(u.team || 0);
          li.dataset.bot = u.bot ? "1" : "0";
          li.dataset.host = u.host ? "1" : "0";
          li.dataset.you = u.you ? "1" : "0";
          li.dataset.avatar = u.avatarUrl || "";
          li.style.color = u.color || TEAM_COLORS[(u.team || 0) % TEAM_COLORS.length] || "#d5e2ea";
          if (u.host) li.classList.add("host");
          if (u.you) li.classList.add("you");
          if (u.bot) li.classList.add("bot");
          waitListEl.appendChild(li);
        }
      }
    } catch (e) {}
  }
  let summaryEndSfxPlayed = false;
  function hideSummary() {
    if (summaryEl) summaryEl.style.display = "none";
    try { GameGlobal.summaryState = null; } catch (e) {}
    summaryEndSfxPlayed = false;
    // 组队局结束后房间已解散，结算关闭应回大厅，不能留在等待?
    if (phase === "waiting") {
      roomCode = "";
      iAmHost = false;
      setPhase("lobby");
      return;
    }
    if (phase !== "lobby") setPhase("lobby");
    else if (lobbyEl) lobbyEl.style.display = "grid";
    setLobbyView("home");
  }
  function renderSummary(board, title) {
    if (!summaryEl) return;
    // 局末掐循环?+ 结束音；本地结算会进两次，避免第二次 stopAll 掐掉结束?
    if (!summaryEndSfxPlayed) {
      summaryEndSfxPlayed = true;
      try { sfx?.stopAll?.(); } catch (e) {}
      try { sfx?.setCannon?.(false); } catch (e) {}
      try { sfx?.tickFlight?.(0, 0, false, false); } catch (e) {}
      try { sfx?.tickOthers?.(0, 0, false); } catch (e) {}
      try { sfx?.playGameEnd?.(); } catch (e) {}
    }
    const teams = Array.isArray(board) ? board : [];
    // 规范化名次，供画布两页宫格结算使?
    const normalized = teams.map((g, i) => {
      const team = clamp(Math.round(Number(g.team) || 0), 0, 7);
      return {
        team,
        rank: g.rank || (i + 1),
        color: g.color || TEAM_COLORS[team % TEAM_COLORS.length],
        kills: g.kills || 0,
        deaths: g.deaths || 0,
        players: (g.players || []).map((p) => {
          const nick = p.name || "Ace";
          let avatarUrl = String(p.avatarUrl || "");
          let avatarImg = p.avatarImg || null;
          try {
            if (p.you && pilot.avatarImg) avatarImg = pilot.avatarImg;
            if (!avatarImg && p.you && pilot.avatarUrl) avatarUrl = String(pilot.avatarUrl || avatarUrl);
            if (!avatarImg && avatarUrl) avatarImg = loadWaitAvatar(avatarUrl, nick);
            if (!avatarImg) avatarImg = ensurePortrait(nick || `p${team}`);
          } catch (e) { avatarImg = makeWxDefaultAvatar(); }
          return {
            name: nick,
            kills: p.kills || 0,
            deaths: p.deaths || 0,
            you: !!p.you,
            bot: !!p.bot,
            team: Number.isFinite(Number(p.team)) ? clamp(Math.round(Number(p.team)), 0, 7) : team,
            avatarUrl,
            avatarImg,
            avatarLetter: Array.from(String(nick || "?"))[0] || "?",
          };
        }),
      };
    });
    normalized.sort((a, b) => (a.rank || 99) - (b.rank || 99));
    try {
      GameGlobal.summaryState = {
        board: normalized,
        page: 1,
        title: title || "本局结算",
      };
    } catch (e) {}
    if (summaryBody) summaryBody.innerHTML = "";
    // 结算盖在上层：大厅先藏起来，避免透出主页
    if (lobbyEl) lobbyEl.style.display = "none";
    if (waitingEl) waitingEl.style.display = "none";
    summaryEl.style.display = "grid";
  }
  let pendingRoomAction = null;
  // 开?进房等关键动作：回包前一直保留，防止微信 send 异步 fail 后丢?
  const ROOM_ACTION_KEEP = { create: 1, join: 1, joinPublic: 1, start: 1, rally: 1 };
  function clearPendingRoomAction(types) {
    if (!pendingRoomAction) return;
    if (!types || types[pendingRoomAction.t]) pendingRoomAction = null;
  }
  function flushPendingRoomAction() {
    const act = pendingRoomAction;
    if (!act) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      const ok = ws.send(JSON.stringify(act));
      if (ok === false) return;
      // 非关键动作发完即清；create/join 等要?room/err 回包
      if (!ROOM_ACTION_KEEP[act.t]) pendingRoomAction = null;
    } catch (e) {}
  }
  function sendRoom(t, extra) {
    const payload = Object.assign({ t }, extra || {});
    if (ROOM_ACTION_KEEP[t]) pendingRoomAction = payload;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const ok = ws.send(JSON.stringify(payload));
        if (ok !== false) return true;
      } catch (e) {}
    }
    // 断线排队：不要用 name 等次要包覆盖正在等待回包?create/join
    if (ROOM_ACTION_KEEP[t] || !pendingRoomAction || !ROOM_ACTION_KEEP[pendingRoomAction.t]) {
      pendingRoomAction = payload;
    }
    if (lobbyErr && ROOM_ACTION_KEEP[t]) {
      lobbyErr.textContent = "";
    }
    try {
      if (offlineEl) {
        offlineEl.style.display = "grid";
        offlineEl.textContent = "";
      }
    } catch (e) {}
    try {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 200);
    } catch (e) {
      try { connect(); } catch (err) {}
    }
    return false;
  }
  function parseInviteCode(res) {
    if (!res) return "";
    let raw = "";
    const q = res.query;
    if (typeof q === "string") {
      const m = /(?:^|[?&])(?:room|code)=(\d{4})/i.exec(q);
      if (m) raw = m[1];
    } else if (q && typeof q === "object") {
      raw = String(q.room || q.code || "").replace(/\D/g, "").slice(0, 4);
    }
    return raw.length === 4 ? raw : "";
  }
  function parseAssistQuery(res) {
    if (!res) return null;
    const q = res.query;
    let code = "";
    let lv = "";
    let title = "";
    if (typeof q === "string") {
      const mA = /(?:^|[?&])assist=(\d{4})/i.exec(q);
      const mR = /(?:^|[?&])(?:room|code)=(\d{4})/i.exec(q);
      const mL = /(?:^|[?&])lv=([^&]+)/i.exec(q);
      const mT = /(?:^|[?&])title=([^&]+)/i.exec(q);
      const mode = /(?:^|[?&])mode=assist/i.test(q);
      code = (mA && mA[1]) || (mode && mR ? mR[1] : "") || "";
      lv = mL ? decodeURIComponent(mL[1]) : "";
      title = mT ? decodeURIComponent(mT[1]) : "";
    } else if (q && typeof q === "object") {
      code = String(q.assist || (q.mode === "assist" ? (q.room || q.code) : "") || "").replace(/\D/g, "").slice(0, 4);
      lv = String(q.lv || "");
      title = String(q.title || "");
    }
    if (code.length !== 4) return null;
    return { code, lv, title };
  }
  function parseFreeEquipQuery(res) {
    if (!res) return null;
    const q = res.query;
    let act = "";
    let equip = "";
    let inviter = "";
    if (typeof q === "string") {
      const mAct = /(?:^|[?&])act=([^&]+)/i.exec(q);
      const mEq = /(?:^|[?&])equip=([^&]+)/i.exec(q);
      const mInv = /(?:^|[?&])inviter=([^&]+)/i.exec(q);
      act = mAct ? decodeURIComponent(mAct[1]) : "";
      equip = mEq ? decodeURIComponent(mEq[1]) : "";
      inviter = mInv ? decodeURIComponent(mInv[1]) : "";
    } else if (q && typeof q === "object") {
      act = String(q.act || "");
      equip = String(q.equip || "");
      inviter = String(q.inviter || "");
    }
    if (act !== "freeEquip" || !equip) return null;
    return { equip, inviter };
  }
  function tryJoinInviteRoom() {
    if (!pendingJoinCode || localMatch) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (phase === "waiting" && roomCode === pendingJoinCode) {
      pendingJoinCode = "";
      inviteJoinSent = "";
      return;
    }
    if (phase === "playing" || (phase === "waiting" && roomCode && roomCode !== pendingJoinCode)) {
      if (inviteJoinSent !== `leave:${pendingJoinCode}`) {
        inviteJoinSent = `leave:${pendingJoinCode}`;
        hideSummary();
        sendRoom("leave");
      }
      return;
    }
    if (inviteJoinSent === pendingJoinCode) return;
    inviteJoinSent = pendingJoinCode;
    if (lobbyErr) lobbyErr.textContent = "";
    sendRoom("join", { code: pendingJoinCode });
  }
  function isMeInviterId(inviter) {
    const inv = String(inviter || "");
    if (!inv) return false;
    let oid = "";
    let tok = "";
    try {
      oid = String((pilot && pilot.openid) || localStorage.getItem("papa.wx.openid") || "");
      tok = String((pilot && pilot.token) || localStorage.getItem("papa.pilot.token") || "");
    } catch (e) {}
    return (!!oid && inv === oid) || (!!tok && inv === tok);
  }
  function flushInviteHelpPending() {
    const p = GameGlobal.__inviteHelpPending;
    if (!p || !p.equip || !p.inviter) return;
    if (!(ws && ws.readyState === WebSocket.OPEN)) return;
      // 机关炮连打：轻量叠加，封顶在死亡震以下
    if (isMeInviterId(p.inviter)) {
      GameGlobal.__inviteHelpPending = null;
      return;
    }
    GameGlobal.__inviteHelpPending = null;
    try {
      if (typeof GameGlobal.helpGarageInviteOnServer === "function") {
        GameGlobal.helpGarageInviteOnServer({ equip: p.equip, inviter: p.inviter });
      }
    } catch (e) {}
  }
  function acceptInviteQuery(res) {
    // 邀请免费装备：奖励只给转发者；点开的好友只助力、绝不领?
    const freeEquip = parseFreeEquipQuery(res);
    if (freeEquip) {
      try {
        const inviter = String(freeEquip.inviter || "");
        const equip = String(freeEquip.equip || "");
        if (!equip || !inviter) {
      try { wx.showToast({ title: "请先开启助战拿房号", icon: "none" }); } catch (e) {}
          return;
        }
        GameGlobal.__freeEquipPending = null;
        // 转发者自己点开：进机库等好友，不发奖、不助力
        if (isMeInviterId(inviter)) {
          if (typeof GameGlobal.openGarage === "function") {
          GameGlobal.openGarage(typeof openProfileHub === "function" ? openProfileHub : null, true);
          }
          return;
        }
        // 被邀请人：只向服务器给转发者加时，不进机库、不写本?rental
        GameGlobal.__inviteHelpPending = { equip, inviter };
        if (ws && ws.readyState === WebSocket.OPEN) flushInviteHelpPending();
        try { wx.showToast({ title: "已为好友助力", icon: "none", duration: 2000 }); } catch (e) {}
      } catch (e) {}
      return;
    }
    // 助战转发：停在首页准备弹窗，不直接进普通等待房 UI
    const assist = parseAssistQuery(res);
    if (assist) {
      try {
        if (typeof GameGlobal.guardAssistAction === "function") {
          GameGlobal.guardAssistAction();
          return;
        }
        if (typeof GameGlobal.openAssistReadyModal === "function") {
          GameGlobal.openAssistReadyModal(assist.code, assist.lv, assist.title || "关卡助战");
        }
      } catch (e) {}
      return;
    }
    const code = parseInviteCode(res);
    if (!code || code === "0000") return;
    pendingJoinCode = code;
    inviteJoinSent = "";
    tryJoinInviteRoom();
  }
  // 分享卡片封面：CDN，不进小游戏?
  const SHARE_CARD_IMAGE = "https://game.hunchun828.top/share/share-card.png";
  function withShareImage(payload) {
    return Object.assign({ imageUrl: SHARE_CARD_IMAGE }, payload || {});
  }
  try { GameGlobal.withShareImage = withShareImage; } catch (e) {}
  function shareInviteRoom() {
    const code = String(roomCode || "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) return;
    const payload = withShareImage({
      title: "真人组队，空战狗斗，体验拉满",
      query: `room=${code}`,
    });
    try {
      if (typeof wx !== "undefined" && typeof wx.shareAppMessage === "function") {
        wx.shareAppMessage(payload);
        return;
      }
    } catch (e) {}
  }
  function shareLevelAssist(code, levelId, title) {
    const c = String(code || assistCode || "").replace(/\D/g, "").slice(0, 4);
    if (c.length !== 4) return false;
    const lab = String(title || "关卡助战");
    const payload = withShareImage({
      title: "真人组队，空战狗斗，体验拉满",
      query: `assist=${c}&mode=assist&lv=${encodeURIComponent(levelId || "")}&title=${encodeURIComponent(lab)}`,
    });
    try {
      if (typeof wx !== "undefined" && typeof wx.shareAppMessage === "function") {
        wx.shareAppMessage(payload);
        return true;
      }
    } catch (e) {}
    try { wx.showToast({ title: `助战?${c}`, icon: "none" }); } catch (err) {}
    return false;
  }
  let assistCode = "";
  let assistMembers = [];
  let assistCreateTimer = 0;
  let assistCreateTries = 0;
  let assistCreatePending = null;
  let assistViaMatchRoom = false; // 线上暂无 assist 接口时，回退用租房拿?
  let assistJoinFallbackTimer = 0;
  function sendAssist(t, extra) {
    const payload = Object.assign({ t }, extra || {});
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
        return true;
      } catch (e) {}
    }
    // 断线排队：助战包可覆盖同族，不挤?create/join
    try {
      const cur = pendingRoomAction && String(pendingRoomAction.t || "");
      if (!pendingRoomAction || cur.indexOf("assist") === 0 || !ROOM_ACTION_KEEP[pendingRoomAction.t]) {
        pendingRoomAction = payload;
      }
    } catch (e) {}
    try { connect(); } catch (e) {}
    return false;
  }
  function publishAssistState() {
    try {
      const via = assistViaMatchRoom;
      let members = assistMembers.slice();
      if (via && GameGlobal.waitRoomState && Array.isArray(GameGlobal.waitRoomState.members)) {
        // 租房回退：成员以等待房为准；嘉宾切到?视为已准备（setAssistReady 会换队）
        members = GameGlobal.waitRoomState.members.map((u) => {
          const hostish = !!(u.host || u.you);
          const team = Number(u.team) || 0;
          return {
            name: u.name || "",
            you: !!u.you,
            host: !!u.host,
            ready: hostish ? true : team === 1,
            avatarUrl: u.avatarUrl || "",
            bot: !!u.bot,
          };
        });
      }
      GameGlobal.assistRoomState = {
        code: assistCode || "",
        members,
        creating: !!(assistCreatePending && !assistCode),
        viaMatchRoom: via,
        rev: Date.now(),
      };
      GameGlobal.assistHostCode = assistCode;
    } catch (e) {}
  }
  function clearAssistCreateWatch() {
    if (assistCreateTimer) {
      clearTimeout(assistCreateTimer);
      assistCreateTimer = 0;
    }
  }
  /** 助战开房：与多人开房同一?create/join（服务器演算+快照同步?*/
  function fallbackAssistCreateViaMatchRoom() {
    assistViaMatchRoom = true;
    try {
      GameGlobal.assistCreateFailed = false;
      GameGlobal.assistHostMode = true;
      GameGlobal.levelsOpen = true;
    } catch (e) {}
    publishAssistState();
    try {
      if ($("teamCount")) $("teamCount").value = "2";
      if ($("perTeam")) $("perTeam").value = "4";
      if ($("createDur")) $("createDur").value = "600";
    } catch (e) {}
    const n = GameGlobal.assistHostNode || assistCreatePending || {};
    const col = resolveAssistLevelCol(n);
    const seed = assistLevelSeed("", col) ^ ((Date.now() & 0xffff) << 8);
    assistLevelSeedVal = seed >>> 0;
    try {
      // 带上关卡标记，开局走服务器助战?
      sendRoom("create", {
        dur: 600,
        teams: 2,
        perTeam: 4,
        teamCap: 4,
        levelCol: col,
        assistLevel: col,
        seed: assistLevelSeedVal,
        levelId: n.id || ("n" + col),
        levelTitle: n.title || ("第" + col + "关"),
      });
    } catch (e) {
      try { sendRoom("create", { dur: 600, teams: 2, perTeam: 4, teamCap: 4, levelCol: col, seed: assistLevelSeedVal }); } catch (err) {}
    }
  }
  function applyAssistRoomFromMatch(m) {
    const code = String((m && m.code) || roomCode || "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) return false;
    clearAssistCreateWatch();
    assistCreatePending = null;
    assistCreateTries = 0;
    assistViaMatchRoom = true;
    assistCode = code;
    try { GameGlobal.assistCreateFailed = false; } catch (e) {}
    // 压制等待房界面，继续航图助战?
    phase = "waiting";
    document.documentElement.classList.remove("ingame");
    if (waitingEl) waitingEl.style.display = "none";
    if (lobbyEl) lobbyEl.style.display = "none";
    try { GameGlobal.levelsOpen = true; } catch (e) {}
    publishAssistState();
    return true;
  }
  function requestAssistCreate(node, fromRetry) {
    const n = node || assistCreatePending || {};
    assistCreatePending = {
      id: n.id || n.levelId || "",
      col: n.col != null ? n.col : n.levelCol,
      title: n.title || n.levelTitle || "关卡助战",
      type: n.type || "encounter",
    };
    if (!fromRetry) {
      assistCreateTries = 0;
      assistViaMatchRoom = false;
    }
    assistCreateTries += 1;
    const payload = {
      levelId: assistCreatePending.id,
      levelTitle: assistCreatePending.title,
      levelCol: Number(assistCreatePending.col) || 0,
    };
    const ok = sendAssist("assistCreate", payload);
    clearAssistCreateWatch();
    assistCreateTimer = setTimeout(() => {
      assistCreateTimer = 0;
      if (assistCode) return;
      // 先短重试 assist*，再回退租房拿号（兼容未部署新接口的线上服）
      if (assistCreateTries < 2) {
        requestAssistCreate(assistCreatePending, true);
        return;
      }
      fallbackAssistCreateViaMatchRoom();
    }, 1200);
    if (!ok) {
      try { wx.showToast({ title: "提示", icon: "none" }); } catch (e) {}
    }
  }
  function beginLevelAssistHost(node) {
    try {
      if (typeof GameGlobal.guardAssistAction === "function" && !GameGlobal.guardAssistAction()) return false;
    } catch (e) { return false; }
    const n = node || {};
    try {
      GameGlobal.assistHostMode = true;
      GameGlobal.assistGuestMode = false;
      GameGlobal.assistCreateFailed = false;
      GameGlobal.assistHostNode = {
        id: n.id || "",
        col: n.col,
        title: n.title || "关卡助战",
        type: n.type || "encounter",
      };
      GameGlobal.levelsOpen = true;
    } catch (e) {}
    assistCode = "";
    assistMembers = [];
    assistCreatePending = {
      id: n.id || "",
      col: n.col,
      title: n.title || "关卡助战",
      type: n.type || "encounter",
    };
    // 助战与多人开房同一原理：直接租房，不用本地 peer snap
    assistViaMatchRoom = true;
    publishAssistState();
    fallbackAssistCreateViaMatchRoom();
    return true;
  }
  function joinAssistRoom(code) {
    const c = String(code || "").replace(/\D/g, "").slice(0, 4);
    if (c.length !== 4) return;
    try {
      GameGlobal.assistGuestMode = true;
      GameGlobal.assistHostMode = false;
    } catch (e) {}
    assistCode = c;
    // 助战房号即开房码：直?join，不再先?assistJoin（会误报「助战码无效」）
    assistViaMatchRoom = true;
    assistMembers = [];
    publishAssistState();
    if (assistJoinFallbackTimer) {
      clearTimeout(assistJoinFallbackTimer);
      assistJoinFallbackTimer = 0;
    }
    try {
      if ($("roomCodeInput")) $("roomCodeInput").value = c;
    } catch (e) {}
    try { doJoinRoom(c); } catch (e) {
      try { sendRoom("join", { code: c }); } catch (err) {}
    }
    // 进房后先落到?（未准备），点准备再切队1
    setTimeout(() => {
      try {
        if (GameGlobal.assistGuestMode && assistViaMatchRoom && typeof requestWaitTeam === "function") {
          requestWaitTeam(0);
        }
      } catch (err) {}
    }, 500);
  }
  function leaveAssistRoom() {
    if (assistJoinFallbackTimer) {
      clearTimeout(assistJoinFallbackTimer);
      assistJoinFallbackTimer = 0;
    }
    sendAssist("assistLeave");
    if (assistViaMatchRoom || phase === "waiting") {
      try { sendRoom("leave"); } catch (e) {}
    }
    assistCode = "";
    assistMembers = [];
    assistViaMatchRoom = false;
    assistCreatePending = null;
    assistCreateTries = 0;
    clearAssistCreateWatch();
    publishAssistState();
    try {
      GameGlobal.assistGuestMode = false;
      GameGlobal.assistHostMode = false;
      GameGlobal.assistHostNode = null;
      GameGlobal.assistHostCode = "";
      GameGlobal.assistCreateFailed = false;
    } catch (e) {}
    try {
      if (waitingEl) waitingEl.style.display = "none";
      if (phase === "waiting") setPhase("lobby");
    } catch (e) {}
  }
  /** 房主关闭助战：踢出好友，保留关卡预览，恢复可单人进入 */
  function endLevelAssistHost() {
    clearAssistCreateWatch();
    if (assistJoinFallbackTimer) {
      clearTimeout(assistJoinFallbackTimer);
      assistJoinFallbackTimer = 0;
    }
    sendAssist("assistLeave");
    if (assistViaMatchRoom || phase === "waiting" || assistCode) {
      try { sendRoom("leave"); } catch (e) {}
    }
    assistCode = "";
    assistMembers = [];
    assistViaMatchRoom = false;
    assistCreatePending = null;
    assistCreateTries = 0;
    publishAssistState();
    try {
      GameGlobal.assistGuestMode = false;
      GameGlobal.assistHostMode = false;
      GameGlobal.assistHostNode = null;
      GameGlobal.assistHostCode = "";
      GameGlobal.assistCreateFailed = false;
      GameGlobal.levelsOpen = true;
    } catch (e) {}
    try {
      if (waitingEl) waitingEl.style.display = "none";
      if (phase === "waiting") {
        phase = "lobby";
        if (lobbyEl) lobbyEl.style.display = "grid";
      }
    } catch (e) {}
  }
  function setAssistReady(ready) {
    sendAssist("assistReady", { ready: !!ready });
    // 租房回退：用换队作为准备信号（队1=已准备），房主侧可读?
    if (assistViaMatchRoom) {
      try {
        if (typeof requestWaitTeam === "function") requestWaitTeam(ready ? 1 : 0);
      } catch (e) {}
    }
  }
  function assistLevelSeed(code, col) {
    const c = parseInt(String(code || "").replace(/\D/g, "").slice(0, 4), 10) || 1;
    const n = Number(col) || 1;
    return ((c * 10007) ^ (n * 9176) ^ 0x5f3759df) >>> 0;
  }
  function makeAssistRng(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function resolveAssistLevelCol(nodeOrCol) {
    if (typeof nodeOrCol === "number" && nodeOrCol >= 1) return nodeOrCol;
    const n = nodeOrCol || {};
    const col = Number(n.col);
    if (col >= 1) return col;
    const id = String(n.id || n.levelId || "");
    const m = /^n(\d+)$/i.exec(id);
    if (m) return Number(m[1]) || 1;
    return 1;
  }
  function sendAssistStart(extra) {
    // 兼容旧调用：真正开局走房?start（与多人开房相同）
    const payload = Object.assign({}, extra || {});
    try { sendAssist("assistStart", payload); } catch (e) {}
    try { sendRoom("start"); } catch (e) {}
  }
  /** go 之后：双?3 ?loading，再进服务器对局（发 input / 收快照） */
  function beginAssistRoomGoLoading(goMsg) {
    if (assistLevelBooting) return false;
    if (phase === "playing" && !localMatch) return false;
    assistLevelBooting = true;
    const keepGuest = !!GameGlobal.assistGuestMode;
    const keepHost = !!GameGlobal.assistHostMode;
    try {
      // 关准备弹窗，但保留助战身份（不要?closeAssistReadyModal，它会清 guest?
      GameGlobal.assistReadyDismissed = true;
      GameGlobal.assistCoopPlaying = false; // loading 中尚未进局，但禁止再弹准备?
      if (typeof GameGlobal.dismissAssistReadyModalKeepGuest === "function") {
        GameGlobal.dismissAssistReadyModalKeepGuest();
      } else {
        const modal = $("assistReadyModal");
        if (modal) modal.style.display = "none";
      }
      const joinModal = $("assistJoinModal");
      if (joinModal) joinModal.style.display = "none";
      GameGlobal.levelsOpen = false;
      GameGlobal.garageOpen = false;
      GameGlobal.lobbyView = "home";
      if (keepGuest) GameGlobal.assistGuestMode = true;
      if (keepHost) GameGlobal.assistHostMode = true;
    } catch (e) {}
    const al = (goMsg && goMsg.assistLevel) || {};
    let meta = {};
    try { meta = GameGlobal.__assistGuestMeta || {}; } catch (e) {}
    const hostNode = GameGlobal.assistHostNode || {};
    const col = resolveAssistLevelCol({
      col: al.col || goMsg && goMsg.levelCol || hostNode.col,
      id: al.levelId || meta.levelId || hostNode.id,
    });
    const seed = Number(al.seed) || Number(goMsg && goMsg.seed) || assistLevelSeedVal || assistLevelSeed(assistCode || roomCode, col);
    assistLevelSeedVal = seed;
    hideMatchLoading();
    if (lobbyErr) lobbyErr.textContent = "";
    const overlay = $("matchLoading");
    const tip = $("matchLoadingTip");
    const cancel = $("matchLoadingCancel");
    if (overlay) overlay.classList.add("show");
    if (cancel) cancel.style.display = "none";
    const tips = ["正在同步助战场", "正在部署单位", "正在校准坐标", "即将进入关卡"];
    let tipI = 0;
    if (tip) tip.textContent = tips[0];
    try { GameGlobal.matchLoadingKind = "assist"; } catch (e) {}
    // 助战倒计时同时预热机?
    try {
      for (let i = 0; i < PLAYER_CRAFT_KEYS.length; i++) ensureCraftAtlasImg(PLAYER_CRAFT_KEYS[i]);
    } catch (e) {}
    const waitMs = 3000;
    const stepMs = Math.max(400, Math.floor(waitMs / tips.length));
    clearTimeout(matchLoadingTimer);
    clearInterval(matchLoadingTipTimer);
    matchLoadingTipTimer = setInterval(() => {
      if (tipI >= tips.length - 1) {
        clearInterval(matchLoadingTipTimer);
        matchLoadingTipTimer = 0;
        return;
      }
      tipI += 1;
      if (tip) tip.textContent = tips[tipI];
    }, stepMs);
    matchLoadingTimer = setTimeout(() => {
      matchLoadingTimer = 0;
      clearInterval(matchLoadingTipTimer);
      matchLoadingTipTimer = 0;
      if (cancel) cancel.style.display = "";
      assistLevelBooting = false;
      beginCraftAssetLoading(PLAYER_CRAFT_KEYS, () => {
        enterAssistRoomPlay({
          col,
          seed,
          levelId: al.levelId || hostNode.id || meta.levelId || ("n" + col),
          levelTitle: al.levelTitle || hostNode.title || meta.title || ("第" + col + "关"),
          fromLevels: keepHost,
        });
      }, { tip: "正在加载机体", cancelable: false });
    }, waitMs);
    return true;
  }
  /** 进入助战对局：与多人开房相同——服务器演算，客户端只发 input、收快照 */
  function enterAssistRoomPlay(info) {
    const col = resolveAssistLevelCol(info && info.col != null ? info.col : info);
    const seed = Number(info && info.seed) || assistLevelSeedVal || 1;
    assistLevelSeedVal = seed;
    assistCoopMode = true;
    localMatch = false; // 关键：跟开房一样走服务器同?
    localLevelMode = true;
    localTrainMode = false;
    localTestMode = false;
    levelRunCol = col >= 1 ? col : 1;
    levelRunResult = null;
    levelRunEnding = false;
    levelFromLevels = !!(info && info.fromLevels) || !!GameGlobal.assistHostMode;
    try {
      GameGlobal.assistReadyDismissed = true;
      GameGlobal.assistCoopPlaying = true;
      GameGlobal.assistFailOnlyOk = !!GameGlobal.assistGuestMode;
      if (typeof GameGlobal.dismissAssistReadyModalKeepGuest === "function") {
        GameGlobal.dismissAssistReadyModalKeepGuest();
      } else {
        const modal = $("assistReadyModal");
        if (modal) modal.style.display = "none";
      }
      const joinModal = $("assistJoinModal");
      if (joinModal) joinModal.style.display = "none";
    } catch (e) {}
    localCrafts = [];
    localMissiles = [];
    localAirMines = [];
    localMotherships = [];
    mineArm = null;
    mineCleared = 0;
    localSatellites = [];
    satArm = null;
    satCutCount = 0;
    satGrabCount = 0;
    trainLoadout = loadoutForMatch();
    resetTrainWeapons();
    try {
      GameGlobal.trainLoadout = trainLoadout;
      GameGlobal.levelMineMode = levelRunCol === 3;
      GameGlobal.mineDefuseReady = false;
      GameGlobal.mineCleared = 0;
      GameGlobal.mineTotal = LEVEL_MINE_COUNT;
      GameGlobal.levelSatMode = levelRunCol === 5;
      GameGlobal.satCutReady = false;
      GameGlobal.satGrabReady = false;
      GameGlobal.satArmActive = false;
      GameGlobal.satActLabel = "剪断";
      GameGlobal.satCutCount = 0;
      GameGlobal.satCutTotal = LEVEL_SAT_PANEL_TOTAL;
      GameGlobal.satGrabCount = 0;
      GameGlobal.satGrabTotal = LEVEL_SAT_GRAB_TOTAL;
      GameGlobal.levelFailNode = {
        id: (info && info.levelId) || ("n" + levelRunCol),
        col: levelRunCol,
        title: (info && info.levelTitle) || ("第" + levelRunCol + "关"),
        type: "encounter",
      };
    } catch (e) {}
    // ?关地雷：双方?seed 本地叠层（服务器尚无地雷实体?
    if (levelRunCol === 3) {
      spawnLevelAirMines({ x: -420, y: 0 }, makeAssistRng(seed));
    }
    if (levelRunCol === 5) {
      spawnLevelSatellites({ x: -420, y: 0 }, makeAssistRng(seed));
    }
    clearRallyBotAvatars();
    beginCraftAssetLoading(craftAtlasKeysForOpts({ level: true, loadout: trainLoadout }), () => {
      setPhase("playing");
      renderMatchTimer();
      if (gearBtn) gearBtn.style.display = "block";
      if (statusEl) {
        statusEl.textContent = levelRunCol === 5
          ? "助战 · 第5关断板行动"
          : levelRunCol === 4
          ? "助战 · 第4关穿越火线"
          : levelRunCol === 3
          ? "助战 · 第3关拆除地雷"
          : levelRunCol === 2
          ? "助战 · 第2关打爆母舰"
          : "助战 · 第1关干爆敌机";
      }
      try {
        wx.showToast({ title: levelToastTitle(levelRunCol), icon: "none", duration: 1600 });
      } catch (e) {}
      try { sendInput({}, true); } catch (e) {}
    }, { tip: "正在加载机体…", cancelable: false });
  }
  function beginAssistLevelEnter(node) {
    const n = node || GameGlobal.assistHostNode || {};
    const col = resolveAssistLevelCol(n);
    if (!isPlayableLevelCol(col)) {
      try { wx.showToast({ title: "后续关卡开发中", icon: "none", duration: 1600 }); } catch (e) {}
      return false;
    }
    if (!roomCode && !assistCode) {
      try { wx.showToast({ title: "请先开启助战拿房号", icon: "none" }); } catch (e) {}
      return false;
    }
    hideLevelFailModal();
    try { hideLevelWinModal(); } catch (e) {}
    try {
      GameGlobal.assistHostNode = Object.assign({}, GameGlobal.assistHostNode || {}, {
        id: n.id || ("n" + col),
        col,
        title: n.title || ("第" + col + "关"),
        type: n.type || "encounter",
      });
    } catch (e) {}
    // 开战前双方归队 0（准备态可能切过队?
    try { if (typeof requestWaitTeam === "function") requestWaitTeam(0); } catch (e) {}
    // 与多人开房相同：房主 start ?服务?go ?双方 loading 后进局
    try { sendRoom("start"); } catch (e) {
      try { wx.showToast({ title: "提示", icon: "none" }); } catch (err) {}
      return false;
    }
    return true;
  }
  function onAssistLevelGoMsg(m) {
    // 兼容?assistGo；正式路径看 room ?go
    beginAssistRoomGoLoading(Object.assign({}, m, {
      assistLevel: m && m.assistLevel || {
        col: m && m.levelCol,
        seed: m && m.seed,
        levelId: m && m.levelId,
        levelTitle: m && m.levelTitle,
      },
    }));
  }
  function sendAssistPeer(t, extra) {
    const payload = Object.assign({ t }, extra || {});
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(payload)); } catch (e) {}
    }
    // 走助战通道一份（部署?assist 转发时更稳）
    if (String(t).indexOf("assist") === 0) {
      try { sendAssist(t, extra); } catch (e) {}
    }
  }
  function applyAssistSnap(m) {
    if (!assistCoopMode || !localMatch || !m) return;
    const peerId = Number(m.id);
    if (!Number.isFinite(peerId) || peerId === myId) return;
    let craft = localCrafts.find((c) => c.id === peerId);
    if (!craft) {
      craft = spawnLocalCraft(peerId, m.name || "助战", 0, { cx: -420, cy: 80, x0: -450, x1: -390, y0: 50, y1: 110 }, false);
      craft.assistPeer = true;
      craft.bot = false;
      craft.human = true;
      craft.x = Number(m.x) || -420;
      craft.y = Number(m.y) || 80;
      localCrafts.push(craft);
    }
    craft.assistPeer = true;
    if (Number.isFinite(Number(m.x))) craft.x = Number(m.x);
    if (Number.isFinite(Number(m.y))) craft.y = Number(m.y);
    if (Number.isFinite(Number(m.h))) craft.heading = Number(m.h);
    if (Number.isFinite(Number(m.vx))) craft.vx = Number(m.vx);
    if (Number.isFinite(Number(m.vy))) craft.vy = Number(m.vy);
    if (Number.isFinite(Number(m.thr))) craft.throttle = Number(m.thr);
    if (Number.isFinite(Number(m.hp))) craft.hp = Number(m.hp);
    if (Number.isFinite(Number(m.respawn))) craft.respawn = Number(m.respawn);
    if (m.name) craft.name = String(m.name).slice(0, 16);
    const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
    st.hp = craft.hp;
    st.respawn = craft.respawn || 0;
    playerStatus.set(craft.id, st);
    // 房主权威：敌?/ 母舰 / 地雷
    if (m.enemy) {
      const enemy = localCrafts.find((c) => c.bot && !c.assistPeer);
      if (enemy) {
        if (Number.isFinite(Number(m.enemy.x))) enemy.x = Number(m.enemy.x);
        if (Number.isFinite(Number(m.enemy.y))) enemy.y = Number(m.enemy.y);
        if (Number.isFinite(Number(m.enemy.h))) enemy.heading = Number(m.enemy.h);
        if (Number.isFinite(Number(m.enemy.vx))) enemy.vx = Number(m.enemy.vx);
        if (Number.isFinite(Number(m.enemy.vy))) enemy.vy = Number(m.enemy.vy);
        if (Number.isFinite(Number(m.enemy.hp))) enemy.hp = Number(m.enemy.hp);
      }
    }
    if (m.ms && localMotherships[0]) {
      const ms = localMotherships[0];
      if (Number.isFinite(Number(m.ms.x))) ms.x = Number(m.ms.x);
      if (Number.isFinite(Number(m.ms.y))) ms.y = Number(m.ms.y);
      if (Number.isFinite(Number(m.ms.hp))) ms.hp = Number(m.ms.hp);
      if (m.ms.dead) ms.dead = true;
    }
    if (Array.isArray(m.mines) && levelRunCol === 3) {
      const byId = new Map(localAirMines.map((x) => [x.id, x]));
      for (const row of m.mines) {
        if (!row) continue;
        let mine = byId.get(row.id);
        if (!mine) {
          mine = PapaAirMine
            ? PapaAirMine.create(row.x, row.y)
            : { x: row.x, y: row.y, spin: 0, armed: false, dead: false, kind: "airMine" };
          mine.id = row.id;
          localAirMines.push(mine);
          byId.set(row.id, mine);
        }
        if (Number.isFinite(Number(row.x))) mine.x = Number(row.x);
        if (Number.isFinite(Number(row.y))) mine.y = Number(row.y);
        mine.dead = !!row.dead;
      }
      localAirMines = localAirMines.filter((x) => x && !x.dead);
      if (Number.isFinite(Number(m.mineCleared))) mineCleared = Number(m.mineCleared);
      try {
        GameGlobal.mineCleared = mineCleared;
        GameGlobal.mineTotal = Math.max(mineCleared + localAirMines.length, mineCleared);
      } catch (e) {}
    }
  }
  function applyAssistMineMsg(m) {
    if (!assistCoopMode || !localMatch || !m) return;
    if (m.op === "clear" && m.id != null) {
      const mine = localAirMines.find((x) => x && x.id === m.id);
      if (mine && !mine.dead) {
        mine.dead = true;
        mineCleared += 1;
        localAirMines = localAirMines.filter((x) => x && !x.dead);
        try {
          GameGlobal.mineCleared = mineCleared;
          GameGlobal.mineTotal = Math.max(mineCleared + localAirMines.length, mineCleared);
        } catch (e) {}
        if (localAirMines.length === 0 && mineCleared > 0 && !levelRunEnding) {
          levelRunEnding = true;
          levelRunResult = "win";
          beginLevelWinCine(mine.x, mine.y, { boostBlast: true });
        }
      }
    }
  }
  function tickAssistPeerSync(dt) {
    if (!assistCoopMode || !localMatch) return;
    assistSnapAcc += dt;
    if (assistSnapAcc < 0.08) return;
    assistSnapAcc = 0;
    const me = localCrafts.find((c) => c.id === myId);
    if (!me) return;
    const payload = {
      id: myId,
      x: Math.round(me.x * 10) / 10,
      y: Math.round(me.y * 10) / 10,
      h: Math.round(me.heading * 1000) / 1000,
      vx: Math.round((me.vx || 0) * 10) / 10,
      vy: Math.round((me.vy || 0) * 10) / 10,
      thr: Math.round((me.throttle || 0) * 100) / 100,
      hp: me.hp,
      respawn: me.respawn || 0,
      name: me.name || "",
    };
    const iAmHost = !!GameGlobal.assistHostMode || myId === 1;
    if (iAmHost) {
      if (levelRunCol === 1) {
        const enemy = localCrafts.find((c) => c.bot && !c.assistPeer);
        if (enemy) {
          payload.enemy = {
            x: enemy.x, y: enemy.y, h: enemy.heading,
            vx: enemy.vx, vy: enemy.vy, hp: enemy.hp,
          };
        }
      }
      if (levelRunCol === 2 && localMotherships[0]) {
        const ms = localMotherships[0];
        payload.ms = { x: ms.x, y: ms.y, hp: ms.hp, dead: !!ms.dead };
      }
      if (levelRunCol === 3) {
        payload.mines = localAirMines.map((x) => ({
          id: x.id, x: x.x, y: x.y, dead: !!x.dead,
        }));
        payload.mineCleared = mineCleared;
      }
    }
    sendAssistPeer("assistSnap", payload);
  }
  try {
    GameGlobal.shareLevelAssist = shareLevelAssist;
    GameGlobal.beginLevelAssistHost = beginLevelAssistHost;
    GameGlobal.beginAssistLevelEnter = beginAssistLevelEnter;
    GameGlobal.joinAssistRoom = joinAssistRoom;
    GameGlobal.leaveAssistRoom = leaveAssistRoom;
    GameGlobal.endLevelAssistHost = endLevelAssistHost;
    GameGlobal.setAssistReady = setAssistReady;
    GameGlobal.sendAssistStart = sendAssistStart;
    GameGlobal.retryAssistCreate = () => {
      try { GameGlobal.assistCreateFailed = false; } catch (e) {}
      requestAssistCreate(GameGlobal.assistHostNode || assistCreatePending, false);
    };
    GameGlobal.getAssistRoomCode = () => String(assistCode || "").replace(/\D/g, "").slice(0, 4);
    GameGlobal.getAssistMemberCount = () => {
      publishAssistState();
      try {
        const st = GameGlobal.assistRoomState;
        return (st && Array.isArray(st.members)) ? st.members.length : assistMembers.length;
      } catch (e) { return assistMembers.length; }
    };
  } catch (e) {}
  try {
    if (typeof GameGlobal !== "undefined") {
      GameGlobal.onWxShow = acceptInviteQuery;
      GameGlobal.phasePlaying = () => phase === "playing";
      if (GameGlobal.__wxShowPending) acceptInviteQuery(GameGlobal.__wxShowPending);
    }
  } catch (e) {}
  try {
    if (typeof wx !== "undefined") {
      if (typeof wx.getEnterOptionsSync === "function") {
        acceptInviteQuery(wx.getEnterOptionsSync());
      } else if (typeof wx.getLaunchOptionsSync === "function") {
        acceptInviteQuery(wx.getLaunchOptionsSync());
      }
      if (typeof wx.onShareAppMessage === "function") {
        wx.onShareAppMessage(() => {
          if (GameGlobal.assistHostMode) {
            const c = String(assistCode || GameGlobal.assistHostCode || "").replace(/\D/g, "").slice(0, 4);
            const n = GameGlobal.assistHostNode || {};
            if (c.length === 4) {
              return withShareImage({
                title: "真人组队，空战狗斗，体验拉满",
                query: `assist=${c}&mode=assist&lv=${encodeURIComponent(n.id || "")}&title=${encodeURIComponent(n.title || "关卡助战")}`,
              });
            }
          }
          const code = String(roomCode || pendingJoinCode || "").replace(/\D/g, "").slice(0, 4);
          if (code.length === 4) {
            return withShareImage({
              title: "真人组队，空战狗斗，体验拉满",
              query: `room=${code}`,
            });
          }
          return withShareImage({ title: "真人组队，空战狗斗，体验拉满", query: "" });
        });
      }
    }
  } catch (e) {}
  const BARS = 10;
  const gauge = $("gauge");
  for (let i = 0; i < BARS; i++) gauge.appendChild(document.createElement("i"));
  const bars = [...gauge.children];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const angleLerp = (a, b, t) => a + angleDelta(b, a) * t;

  let W = 0, H = 0, dpr = 1, uiDpr = 1;
  let viewW = innerWidth;
  let viewH = innerHeight;
  function readWindowMetrics() {
    let info = null;
    try {
      info = (typeof wx !== "undefined" && wx.getWindowInfo) ? wx.getWindowInfo()
        : ((typeof wx !== "undefined" && wx.getSystemInfoSync) ? wx.getSystemInfoSync() : null);
    } catch (e) {}
    const vv = __w.visualViewport;
    let w = Number((info && (info.windowWidth || info.screenWidth)) || (vv && vv.width) || innerWidth || 667);
    let h = Number((info && (info.windowHeight || info.screenHeight)) || (vv && vv.height) || innerHeight || 375);
    const pr = Number((info && info.pixelRatio) || devicePixelRatio || 1);
    // 横屏锁定：逻辑画布始终?高，避免 iPhone（含 17）短暂竖屏上报把开火键/触控拧歪
    let swapped = false;
    if (h > w) {
      const t = w; w = h; h = t;
      swapped = true;
    }
    // 1.75x ?2x 少约 23% 像素填充；仍明显高于之前发虚?1.35x?
    // 真机在降?HUD 上传频率后帧率不变，说明瓶颈在主帧缓冲填充而非纹理传输?
    return { w, h, pr: Math.min(Math.max(pr, 1), 1.75), swapped };
  }
  function viewSize() {
    return { w: viewW || innerWidth, h: viewH || innerHeight };
  }
  function isPortraitView() {
    // 小游戏已锁定 landscape，不再按竖屏做触控旋?
    return false;
  }
  function resize() {
    document.documentElement.classList.remove("portrait");
    const m = readWindowMetrics();
    viewW = m.w;
    viewH = m.h;
    dpr = m.pr;
    // 清晰优先：接近设?DPR，上?2（与?Canvas 方案一致）?
    uiDpr = Math.min(dpr, 2);
    W = m.w;
    H = m.h;
    canvas.width = Math.max(1, Math.round(W * uiDpr));
    canvas.height = Math.max(1, Math.round(H * uiDpr));
    try {
      if (__w.visualViewport) {
        __w.visualViewport.width = viewW;
        __w.visualViewport.height = viewH;
      }
    } catch (e) {}
  }
  function stagePoint(e) {
    const vw = Math.max(1, viewW || W || 1);
    const vh = Math.max(1, viewH || H || 1);
    // 与逻辑画布同坐标系；不再做竖屏 90° 映射（苹果机上最容易把开火点打飞?
    return { x: Number(e.clientX) * (W / vw), y: Number(e.clientY) * (H / vh) };
  }
  const sfx = GameGlobal.SkyAceSfx;
  function unlockSfx() { sfx?.unlock(); }
  addEventListener("pointerdown", unlockSfx, { once: true });
  addEventListener("keydown", unlockSfx, { once: true });
  addEventListener("touchstart", unlockSfx, { once: true, passive: true });
  addEventListener("resize", resize);
  addEventListener("orientationchange", () => setTimeout(resize, 80));
  visualViewport?.addEventListener("resize", resize);
  resize();
  function tryLockLandscape() {
    const ori = wxScreen.orientation;
    if (!IS_MOBILE || !ori || !ori.lock) return;
    ori.lock("landscape").catch(() => {});
  }
  addEventListener("pointerdown", tryLockLandscape, { once: true });

  const PILOT_TOKEN_KEY = "papa.pilot.token";
  const PILOT_ID_KEY = "papa.pilot.id";
  const PILOT_NAME_KEY = "papa.pilot.name";
  const WX_USER_AUTH_KEY = "papa.wx.userAuthed";
  const WX_AVATAR_KEY = "papa.wx.avatarUrl";
  const WX_OPENID_KEY = "papa.wx.openid";
  const TWIN_ENGINE_KEY = "papa.craft.twin";
  // 机库改装方案：服务器为准，本地缓存一份；离线保存?dirty，连上后补传
  const LOADOUT_KEY = "papa.garage.loadout.v2";
  const LOADOUT_DIRTY_KEY = "papa.garage.loadout.dirty";
  let myLoadoutCache = null;
  function normLoadout(v) {
    const s = v && Array.isArray(v.slots) ? v.slots : [v && v.main, v && v.sub];
    return {
      slots: [TRAIN_MAINS.includes(s[0]) ? s[0] : "gun", TRAIN_SUBS_ALL.includes(s[1]) ? s[1] : "missile"],
      engine: v && v.engine === "twin" ? "twin" : "single",
      craft: normalizePlayerCraft(v && v.craft),
    };
  }
  function hasSavedLoadout() {
    try { return !!localStorage.getItem(LOADOUT_KEY); } catch (e) { return false; }
  }
  function getMyLoadout() {
    if (myLoadoutCache) return myLoadoutCache;
    try {
      const raw = localStorage.getItem(LOADOUT_KEY);
      if (raw) return (myLoadoutCache = normLoadout(JSON.parse(raw)));
    } catch (e) {}
    // 新用户：机关?+ 导弹 + 单引擎；以前连点头像解锁过双发的老用户默认双引擎
    let legacyTwin = false;
    try { legacyTwin = localStorage.getItem(TWIN_ENGINE_KEY) === "1"; } catch (e) {}
    return (myLoadoutCache = { slots: ["gun", "missile"], engine: legacyTwin ? "twin" : "single", craft: DEFAULT_PLAYER_CRAFT });
  }
  function loadoutDirty() {
    try { return localStorage.getItem(LOADOUT_DIRTY_KEY) === "1"; } catch (e) { return false; }
  }
  function setLoadoutDirty(on) {
    try { localStorage.setItem(LOADOUT_DIRTY_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function saveMyLoadout(lo, fromServer) {
    const v = normLoadout(lo);
    myLoadoutCache = v;
    try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(v)); } catch (e) {}
    if (!fromServer) {
      setLoadoutDirty(true);
      pushLoadoutToServer();
    }
    if (phase !== "playing") applyMySpeedTier(Math.max(speedTierOfName(pilot.name), v.engine === "twin" ? 2 : 1));
    // 只保留当前机型缓存，换机时丢掉旧条带?
    try {
      retainCraftFactionPacks([v.craft]);
      ensureCraftAtlasImg(v.craft);
    } catch (e) {}
    return v;
  }
  function randomBotLoadout() {
    const main = TRAIN_MAINS[(Math.random() * TRAIN_MAINS.length) | 0];
    const sub = TRAIN_SUBS[(Math.random() * TRAIN_SUBS.length) | 0];
    const engine = Math.random() < 0.3 ? "twin" : "single";
    return { main, sub, engine, craft: PLAYER_CRAFT_KEYS[(Math.random() * PLAYER_CRAFT_KEYS.length) | 0] };
  }

  function loadoutForMatch() {
    const lo = getMyLoadout();
    return { main: lo.slots[0], sub: lo.slots[1], engine: lo.engine, craft: lo.craft };
  }
  function loadoutString() {
    const lo = getMyLoadout();
    return `${lo.slots[0]},${lo.slots[1]},${lo.engine},${lo.craft}`;
  }
  function pushLoadoutToServer() {
    const lo = getMyLoadout();
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          t: "loadout:set",
          token: pilot.token,
          openid: pilot.openid || undefined,
          name: pilot.name || undefined,
          loadout: { main: lo.slots[0], sub: lo.slots[1], engine: lo.engine, craft: lo.craft },
        }));
      }
    } catch (e) {}
  }
  function syncLoadoutWithServer() {
    if (loadoutDirty()) {
      pushLoadoutToServer();
      return;
    }
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "loadout:get", token: pilot.token, openid: pilot.openid || undefined }));
      }
    } catch (e) {}
  }
  function onLoadoutMsg(m) {
    if (m.saved) {
      setLoadoutDirty(false);
      return;
    }
    if (!m.ok || loadoutDirty()) return;
    if (m.loadout) {
      // 兼容尚未升级 craft 字段的服务器：不能用缺失字段覆盖本机已选飞机?
      const craft = m.loadout.craft != null
        ? normalizePlayerCraft(m.loadout.craft)
        : getMyLoadout().craft;
      saveMyLoadout({ slots: [m.loadout.main, m.loadout.sub], engine: m.loadout.engine, craft }, true);
    }
    // 服务器还没有记录：把本机已保存过的方案补传上去（新设备没存过则不传，避免覆盖其它设备?
    else if (hasSavedLoadout()) pushLoadoutToServer();
  }

  const GARAGE_ACCESS_KEY = "papa.garage.access.server.v1";
  function syncGarageAccessWithServer() {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          t: "garage:access:get",
          token: pilot.token,
          openid: pilot.openid || undefined,
        }));
      }
    } catch (e) {}
  }
  function pushGarageAccessToServer(access) {
    try {
      if (!(ws && ws.readyState === WebSocket.OPEN)) return;
      ws.send(JSON.stringify({
        t: "garage:access:set",
        token: pilot.token,
        openid: pilot.openid || undefined,
        name: pilot.name || undefined,
        access: access || { owned: {}, rental: {} },
      }));
    } catch (e) {}
  }
  function applyGarageAccessLocal(access, opts) {
    if (!access || typeof access !== "object") return;
    try { localStorage.setItem(GARAGE_ACCESS_KEY, JSON.stringify(access)); } catch (e) {}
    try {
      if (access.owned) localStorage.setItem("papa.garage.owned.v1", JSON.stringify(access.owned));
      if (access.rental) localStorage.setItem("papa.garage.rental.v1", JSON.stringify(access.rental));
    } catch (e) {}
    try {
      if (typeof GameGlobal.applyGarageAccess === "function") {
        GameGlobal.applyGarageAccess(access, opts || null);
      }
    } catch (e) {}
  }
  function onGarageAccessMsg(m) {
    if (!m || !m.ok || !m.access) return;
    applyGarageAccessLocal(m.access, {
      inviteGrant: !!m.inviteGrant,
      added: m.added,
      equip: m.equip,
    });
  }
  function onGarageBuyMsg(m) {
    if (!m) return;
    if (m.ok && m.access) applyGarageAccessLocal(m.access);
    if (m.ok && typeof m.starShards === "number") {
      try {
        if (!GameGlobal.playerStats || typeof GameGlobal.playerStats !== "object") GameGlobal.playerStats = {};
        GameGlobal.playerStats.starShards = m.starShards;
        localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(GameGlobal.playerStats));
      } catch (e) {}
    }
  }
  function onGarageInviteHelpMsg(m) {
    if (!m) return;
    // 助力回包可能误带转发?access：被邀请人绝不落本地权?
    if (m.ok) {
      try { wx.showToast({ title: "已为好友助力", icon: "none" }); } catch (e) {}
    } else if (m.err === "duplicate") {
      try { wx.showToast({ title: "提示", icon: "none" }); } catch (e) {}
    } else if (m.err === "no_inviter") {
      try { wx.showToast({ title: "已为好友助力", icon: "none" }); } catch (e) {}
    }
  }
  try {
    GameGlobal.pushGarageAccessToServer = pushGarageAccessToServer;
    GameGlobal.syncGarageAccessWithServer = syncGarageAccessWithServer;
    GameGlobal.buyGarageEquipOnServer = (equip) => {
      try {
        if (!(ws && ws.readyState === WebSocket.OPEN)) return false;
        ws.send(JSON.stringify({
          t: "garage:buy",
          token: pilot.token,
          openid: pilot.openid || undefined,
          name: pilot.name || undefined,
          equip,
        }));
        return true;
      } catch (e) { return false; }
    };
    GameGlobal.helpGarageInviteOnServer = (info) => {
      try {
        if (!(ws && ws.readyState === WebSocket.OPEN)) return false;
        ws.send(JSON.stringify({
          t: "garage:invite:help",
          token: pilot.token,
          openid: pilot.openid || undefined,
          name: pilot.name || undefined,
          inviter: info && info.inviter,
          equip: info && info.equip,
        }));
        return true;
      } catch (e) { return false; }
    };
  } catch (e) {}

  // v3：与航图存档一并重置，忽略旧进度（手机本地旧档也作废）
  const LEVELS_SAVE_KEY = "papa.levels.progress.v3";
  try {
    localStorage.removeItem("papa.levels.progress.v1");
    localStorage.removeItem("papa.levels.progress.v2");
  } catch (e) {}
  function readLocalLevelsDone() {
    try {
      if (typeof GameGlobal.getLevelsDoneIds === "function") {
        const live = GameGlobal.getLevelsDoneIds();
        if (Array.isArray(live) && live.length) return live.slice();
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(LEVELS_SAVE_KEY);
      if (!raw) return ["n0"];
      const data = JSON.parse(raw);
      const done = Array.isArray(data && data.done) ? data.done.map(String) : [];
      if (!done.includes("n0")) done.unshift("n0");
      return done;
    } catch (e) {
      return ["n0"];
    }
  }
  function mergeLevelsDone(a, b) {
    const set = new Set();
    for (const list of [a, b]) {
      if (!Array.isArray(list)) continue;
      for (const id of list) {
        const s = String(id || "");
        if (/^n\d{1,3}$/.test(s)) set.add(s);
      }
    }
    set.add("n0");
    return Array.from(set).sort((x, y) => {
      const nx = Number(String(x).slice(1)) || 0;
      const ny = Number(String(y).slice(1)) || 0;
      return nx - ny;
    });
  }
  let pendingLevelsPush = null; // 离线待上?
  let pendingLevelsPullApply = null; // 航图未创建时暂存服务器进?
  function writeLevelsDoneLocal(doneList) {
    const done = mergeLevelsDone(doneList, []);
    try {
      let assists = [];
      try {
        const raw = localStorage.getItem(LEVELS_SAVE_KEY);
          const prev = raw ? JSON.parse(raw) : null;
        if (prev && Array.isArray(prev.assists)) assists = prev.assists;
      } catch (e) {}
      localStorage.setItem(LEVELS_SAVE_KEY, JSON.stringify({ done, assists }));
    } catch (e) {}
    return done;
  }
  function applyLevelsDoneFromServer(doneList) {
    const done = mergeLevelsDone(doneList && doneList.length ? doneList : ["n0"], []);
    writeLevelsDoneLocal(done);
    try {
      if (typeof GameGlobal.applyLevelsProgress === "function") {
        const applied = GameGlobal.applyLevelsProgress(done);
        if (applied == null) pendingLevelsPullApply = done;
        else pendingLevelsPullApply = null;
      } else {
        pendingLevelsPullApply = done;
      }
    } catch (e) {
      pendingLevelsPullApply = done;
    }
    return done;
  }
  function flushPendingLevelsPullApply() {
    if (!pendingLevelsPullApply) return;
    try {
      if (typeof GameGlobal.applyLevelsProgress === "function") {
        const applied = GameGlobal.applyLevelsProgress(pendingLevelsPullApply);
        if (applied != null) pendingLevelsPullApply = null;
      }
    } catch (e) {}
  }
  function pushLevelsProgressToServer(doneOverride) {
    const done = Array.isArray(doneOverride)
      ? mergeLevelsDone(doneOverride, [])
      : readLocalLevelsDone();
    pendingLevelsPush = done;
    writeLevelsDoneLocal(done);
    try {
      if (ws && ws.readyState === WebSocket.OPEN && pilot && pilot.token) {
        ws.send(JSON.stringify({
          t: "levels:set",
          token: pilot.token,
          openid: pilot.openid || undefined,
          name: pilot.name || undefined,
          done,
        }));
      }
    } catch (e) {}
  }
  function syncLevelsProgressWithServer() {
    try {
      if (ws && ws.readyState === WebSocket.OPEN && pilot && pilot.token) {
        ws.send(JSON.stringify({
          t: "levels:get",
          token: pilot.token,
          openid: pilot.openid || undefined,
        }));
      }
    } catch (e) {}
  }
  function onLevelsProgressMsg(m) {
    if (!m || !m.ok) return;
    // 过关上报回执：以服务器落库结果为?
    if (m.saved) {
      const saved = Array.isArray(m.done) ? m.done : pendingLevelsPush;
      if (saved) applyLevelsDoneFromServer(saved);
      pendingLevelsPush = null;
      return;
    }
    const remote = Array.isArray(m.done) ? m.done : null;
    const rem = mergeLevelsDone(remote && remote.length ? remote : ["n0"], []);
    // 有未确认的过关上报时，忽略可能过期的 get，避免刚通关被旧档盖?
    if (pendingLevelsPush) {
      const remSet = new Set(rem);
      if (pendingLevelsPush.every((id) => remSet.has(id))) {
        pendingLevelsPush = null;
        applyLevelsDoneFromServer(rem);
      }
      return;
    }
    // 进关卡拉取：服务器进度覆盖本地（不做并集回写?
    applyLevelsDoneFromServer(rem);
  }
  try {
    GameGlobal.pushLevelsProgressToServer = (done) => pushLevelsProgressToServer(done);
    GameGlobal.syncLevelsProgressWithServer = syncLevelsProgressWithServer;
    GameGlobal.flushPendingLevelsPullApply = flushPendingLevelsPullApply;
  } catch (e) {}
  try {
    GameGlobal.getMyLoadout = () => {
      const lo = getMyLoadout();
      return { slots: lo.slots.slice(), engine: lo.engine, craft: lo.craft };
    };
    GameGlobal.saveMyLoadout = (lo) => saveMyLoadout(lo, false);
  } catch (e) {}
  // 双发引擎 = 改装方案里选了双引?
  function hasTwinUnlock() {
    return getMyLoadout().engine === "twin";
  }
  function saveTwinUnlock() {
    try { localStorage.setItem(TWIN_ENGINE_KEY, "1"); } catch (e) {}
    const lo = getMyLoadout();
    if (lo.engine !== "twin") saveMyLoadout({ slots: lo.slots, engine: "twin", craft: lo.craft }, false);
  }
  function clipName(value) {
    return Array.from(String(value || "").replace(/[\u0000-\u001f]/g, "").trim()).slice(0, 10).join("");
  }
  function formatNameShort(value, max = 5) {
    const chars = Array.from(String(value || ""));
    if (chars.length <= max) return chars.join("");
    return chars.slice(0, max).join("") + "...";
  }
  const RANDOM_PILOT_NAMES = [
    "Nova", "Rex", "Hawk", "Iris", "Bolt", "Echo", "Wolf", "Dusk", "Comet", "Talon",
    "Jade", "Pike", "Vega", "Orion", "Atlas", "Lyra", "Drake", "Quinn", "Ash", "Rune",
    "Max", "Luna", "Apex", "Blade", "Fox", "Sky", "Zero", "Ace", "Raven", "Storm",
  ];
  function randomPilotName() {
    return RANDOM_PILOT_NAMES[(Math.random() * RANDOM_PILOT_NAMES.length) | 0];
  }
  function isWxUserAuthed() {
    try { return localStorage.getItem(WX_USER_AUTH_KEY) === "1"; } catch { return false; }
  }
  function markWxUserAuthed() {
    try { localStorage.setItem(WX_USER_AUTH_KEY, "1"); } catch {}
  }
  function loadPilot() {
    try {
      let token = localStorage.getItem(PILOT_TOKEN_KEY) || "";
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) {
        token = (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) || (`t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
        token = token.slice(0, 64);
        localStorage.setItem(PILOT_TOKEN_KEY, token);
      }
      const wantId = Number(localStorage.getItem(PILOT_ID_KEY));
      let name = clipName(localStorage.getItem(PILOT_NAME_KEY) || "");
      if (!name) {
        name = randomPilotName();
        localStorage.setItem(PILOT_NAME_KEY, name);
      }
      let avatarUrl = "";
      let openid = "";
      try { avatarUrl = localStorage.getItem(WX_AVATAR_KEY) || ""; } catch (e) {}
      try { openid = localStorage.getItem(WX_OPENID_KEY) || ""; } catch (e) {}
      return {
        token,
        wantId: Number.isInteger(wantId) && wantId >= 1 ? wantId : 0,
        name,
        avatarUrl,
        openid,
        avatarImg: null,
        recordRank: false,
      };
    } catch {
      return {
        token: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`,
        wantId: 0,
        name: randomPilotName(),
        avatarUrl: "",
        openid: "",
        avatarImg: null,
        recordRank: false,
      };
    }
  }
  function saveWxOpenId(openid) {
    pilot.openid = openid ? String(openid).slice(0, 64) : "";
    try {
      if (pilot.openid) localStorage.setItem(WX_OPENID_KEY, pilot.openid);
      else localStorage.removeItem(WX_OPENID_KEY);
    } catch (e) {}
    try { flushInviteHelpPending(); } catch (e) {}
  }
  let wxLoginBusy = false;
  function tryWxLogin() {
    if (wxLoginBusy) return;
    if (typeof wx === "undefined" || typeof wx.login !== "function") return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    wxLoginBusy = true;
    try {
      wx.login({
        success(res) {
          const code = res && res.code;
          if (!code) { wxLoginBusy = false; return; }
          try {
            ws.send(JSON.stringify({
              t: "wxAuth",
              code,
              token: pilot.token,
              name: pilot.name || undefined,
            }));
          } catch (e) {}
          wxLoginBusy = false;
        },
        fail() { wxLoginBusy = false; },
      });
    } catch (e) {
      wxLoginBusy = false;
    }
  }
  // 本地战绩缓存：每局结束立即写入，打开面板先显示本地，再与服务器结果合?
  const HISTORY_CACHE_KEY = "papa.history.v1";
  const HISTORY_MAX = 10;
  function loadLocalHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_CACHE_KEY);
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows.filter((r) => r && Number(r.endedAt) > 0) : [];
    } catch (e) {
      return [];
    }
  }
  function saveLocalHistory(rows) {
    try { localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(rows.slice(0, HISTORY_MAX))); } catch (e) {}
  }
  function mergeHistory(a, b) {
    const out = [];
    for (const r of [...a, ...b]) {
      if (!r || !(Number(r.endedAt) > 0)) continue;
      const kind = r.kind === "room" ? "room" : "match";
      // 同一局：本地写入时间与服务器入库时间可能差几秒
      const dup = out.find((o) => o.kind === kind && Math.abs(o.endedAt - Number(r.endedAt)) < 15000);
      if (dup) continue;
      out.push({
        endedAt: Number(r.endedAt),
        kind,
        kills: Number(r.kills) || 0,
        deaths: Number(r.deaths) || 0,
        teamRank: r.teamRank == null ? null : Number(r.teamRank),
      });
    }
    out.sort((x, y) => y.endedAt - x.endedAt);
    return out.slice(0, HISTORY_MAX);
  }
  function publishHistory(rows) {
    try {
      GameGlobal.historyRows = rows;
      if (rows.length) GameGlobal.historyTip = "";
    } catch (e) {}
  }
  // 生涯战果（含星碎币）以服务器数据库为准，本地仅缓存上次拉取结果用于先行展?
  const PLAYER_STATS_KEY = "papa.playerStats.v1";
  try {
    const cached = JSON.parse(localStorage.getItem(PLAYER_STATS_KEY) || "null");
    if (cached && typeof cached === "object") GameGlobal.playerStats = cached;
  } catch (e) {}
  function recordLocalHistory(board, kind) {
    const groups = Array.isArray(board) ? board : [];
    let row = null;
    groups.forEach((g, i) => {
      for (const p of (g && g.players) || []) {
        if (!p || !p.you) continue;
        row = {
          endedAt: Date.now(),
          kind,
          kills: Number(p.kills) || 0,
          deaths: Number(p.deaths) || 0,
          teamRank: Number(g.rank) || (i + 1),
        };
      }
    });
    if (!row) return;
    const rows = mergeHistory([row], loadLocalHistory());
    saveLocalHistory(rows);
    publishHistory(rows);
  }

  let historyReqSeq = 0;
  function requestHistory() {
    const seq = ++historyReqSeq;
    historyLoading = true;
    const cached = loadLocalHistory();
    try {
      GameGlobal.historyTip = cached.length ? "" : "加载中";
      GameGlobal.historyRows = cached;
    } catch (e) {}
    const payload = {
      t: "history",
      token: pilot.token,
      name: pilot.name || undefined,
      openid: pilot.openid || undefined,
      limit: 10,
    };
    const trySend = () => {
      if (!(ws && ws.readyState === WebSocket.OPEN)) return false;
      try {
        const ok = ws.send(JSON.stringify(payload));
        return ok !== false;
      } catch (e) {
        return false;
      }
    };
    if (trySend()) {
      setTimeout(() => {
        if (seq !== historyReqSeq || !historyLoading) return;
        // 超时后强制重连再试一?
        historyLoading = true;
        try { GameGlobal.historyTip = "重试拉取战绩"; } catch (e) {}
        try {
          clearTimeout(reconnectTimer);
          connect();
        } catch (e) {}
        setTimeout(() => {
          if (seq !== historyReqSeq) return;
          if (!trySend()) {
            historyLoading = false;
            try { GameGlobal.historyTip = "未连接服务器，无法拉取战"; } catch (e) {}
            return;
          }
          setTimeout(() => {
            if (seq !== historyReqSeq || !historyLoading) return;
            historyLoading = false;
            try {
              if (!Array.isArray(GameGlobal.historyRows) || !GameGlobal.historyRows.length) {
                GameGlobal.historyTip = "战绩加载超时，请稍后重试";
              }
            } catch (e) {}
          }, 8000);
        }, 700);
      }, 6000);
      return;
    }
    historyLoading = false;
    try { GameGlobal.historyTip = "未连接服务器，正在重连"; } catch (e) {}
    pendingRoomAction = payload;
    try {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 200);
    } catch (e) {
      try { connect(); } catch (err) {}
    }
  }
  function reportLocalMatchResult(board) {
    if (!board) return;
    const endedAt = Date.now();
    const startedAt = localMatchStartedAt || endedAt;
    const durationSec = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    // 给本人补 token/openid，便于服务端入库
    const patched = (board || []).map((g) => ({
      ...g,
      players: (g.players || []).map((p) => {
        if (!p || !p.you) return { ...p, bot: !!p.bot };
        return {
          ...p,
          bot: false,
          token: pilot.token,
          openid: pilot.openid || undefined,
          name: pilot.name || p.name,
        };
      }),
    }));
    const payload = {
      t: "matchResult",
      kind: "match",
      token: pilot.token,
      name: pilot.name,
      openid: pilot.openid || undefined,
      startedAt,
      endedAt,
      plannedSec: localMatchPlannedSec || null,
      durationSec,
      teams: patched.length || 0,
      board: patched,
    };
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    } catch (e) {}
  }
  function savePilotId(id) {
    try { if (id >= 1) localStorage.setItem(PILOT_ID_KEY, String(id)); } catch {}
  }
  function savePilotName(name) {
    try { localStorage.setItem(PILOT_NAME_KEY, name); } catch {}
  }
  function saveWxAvatarUrl(url) {
    try {
      if (url) localStorage.setItem(WX_AVATAR_KEY, String(url));
      else localStorage.removeItem(WX_AVATAR_KEY);
    } catch (e) {}
  }
  const pilot = loadPilot();
  if (!pilot.name) {
    pilot.name = randomPilotName();
    savePilotName(pilot.name);
  }
  pilot.recordRank = isWxUserAuthed();

  function syncWxProfileToGlobal() {
    try {
      GameGlobal.wxProfile = {
        authed: isWxUserAuthed() && !!pilot.recordRank,
        name: pilot.name || "",
        avatarUrl: pilot.avatarUrl || "",
        avatarImg: pilot.avatarImg || null,
      };
    } catch (e) {}
  }
  function loadWxAvatarImage(url) {
    if (!url) {
      pilot.avatarImg = null;
      syncWxProfileToGlobal();
      return;
    }
    try {
      const img = (typeof wx !== "undefined" && typeof wx.createImage === "function")
        ? wx.createImage()
        : (typeof Image !== "undefined" ? new Image() : null);
      if (!img) return;
      img.onload = () => {
        pilot.avatarImg = img;
        syncWxProfileToGlobal();
      };
      img.onerror = () => {
        pilot.avatarImg = null;
        syncWxProfileToGlobal();
      };
      img.src = url;
    } catch (e) {
      pilot.avatarImg = null;
      syncWxProfileToGlobal();
    }
  }
  if (isWxUserAuthed() && pilot.avatarUrl) loadWxAvatarImage(pilot.avatarUrl);
  syncWxProfileToGlobal();

  let wxUserInfoBtn = null;
  let wxAuthPending = null;
  let wxAuthBusy = false;
  let wxAuthRequire = false; // true：必须授权成功才执行回调（关卡进度等?
  function destroyWxUserInfoBtn() {
    if (!wxUserInfoBtn) return;
    try { wxUserInfoBtn.destroy(); } catch (e) {}
    wxUserInfoBtn = null;
  }
  function closeAuthModal() {
    const m = $("authModal");
    if (m) m.style.display = "none";
  }
  function openAuthModal() {
    const m = $("authModal");
    if (m) m.style.display = "grid";
  }
  function isValidWxNick(value) {
    const nick = clipName(value);
    if (!nick) return false;
    if (nick === "微信用户" || nick === "WeChat User" || /^user\d+$/i.test(nick)) return false;
    return true;
  }
  function ensureRandomPilotName() {
    if (isValidWxNick(pilot.name)) return;
    pilot.name = randomPilotName();
    savePilotName(pilot.name);
  }
  function applyWxUserInfo(info) {
    // 只要拿到 userInfo 就算授权成功；默认昵称「微信用户」不可用时改随机名，避免卡死建房
    if (!info) return false;
    const raw = info.nickName || info.nickname;
    const nick = clipName(raw);
    if (isValidWxNick(nick)) {
      pilot.name = nick;
      savePilotName(nick);
      applyMySpeedTier(speedTierOfName(nick));
    } else {
      ensureRandomPilotName();
      applyMySpeedTier(speedTierOfName(pilot.name));
    }
    const avatar = String(info.avatarUrl || info.avatarURL || "");
    pilot.avatarUrl = avatar;
    saveWxAvatarUrl(avatar);
    if (avatar) loadWxAvatarImage(avatar);
    markWxUserAuthed();
    pilot.recordRank = true;
    syncWxProfileToGlobal();
    try { sendRoom("name", { name: pilot.name, avatarUrl: pilot.avatarUrl || undefined }); } catch (e) {}
    // 授权昵称后立刻换 openid 并入?
    try { tryWxLogin(); } catch (e) {}
    return true;
  }
  let wantCreateAfterAuth = false;
  let wantJoinAfterAuth = "";
  function continueAfterAuthGate() {
    destroyWxUserInfoBtn();
    closeAuthModal();
    wxAuthBusy = false;
    const requireAuth = wxAuthRequire;
    wxAuthRequire = false;
    const fn = wxAuthPending;
    wxAuthPending = null;
    if (lobbyErr) lobbyErr.textContent = "";
    // 强制授权场景：未真正授权则丢弃回?
    if (requireAuth && !isWxUserAuthed()) {
      try { wx.showToast({ title: "提示", icon: "none", duration: 1600 }); } catch (e) {}
      return;
    }
    // 授权弹层/原生按钮常会打断 socket，稍晚再执行建房，并依赖 pending 重发
    setTimeout(() => {
      try {
        if (typeof fn === "function") {
          fn();
          return;
        }
        if (wantCreateAfterAuth) {
          wantCreateAfterAuth = false;
          doCreateRoom();
          return;
        }
        if (wantJoinAfterAuth) {
          const code = wantJoinAfterAuth;
          wantJoinAfterAuth = "";
          doJoinRoom(code);
        }
      } catch (e) {}
    }, 280);
  }
  function holdWxAuthButton(msg) {
    if (lobbyErr) lobbyErr.textContent = msg || "请点击授权按钮完成授";
    showWxUserInfoButton();
  }
  function showWxUserInfoButton() {
    destroyWxUserInfoBtn();
    closeAuthModal();
    if (typeof wx === "undefined" || typeof wx.createUserInfoButton !== "function") {
      // 无法拉起授权按钮
      ensureRandomPilotName();
      pilot.recordRank = false;
      syncWxProfileToGlobal();
      if (wxAuthRequire) {
        // 关卡等强制授权：不能当游客放?
        wxAuthBusy = false;
        wxAuthPending = null;
        wxAuthRequire = false;
        try { wx.showToast({ title: "提示", icon: "none", duration: 1600 }); } catch (e) {}
        return;
      }
      continueAfterAuthGate();
      return;
    }
    let info = {};
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {}
    const ww = Number(info.windowWidth || info.screenWidth || 667);
    const wh = Number(info.windowHeight || info.screenHeight || 375);
    const bw = Math.min(280, Math.max(180, ww * 0.55));
    const bh = 48;
    if (lobbyErr) lobbyErr.textContent = "";
    wxUserInfoBtn = wx.createUserInfoButton({
      type: "text",
      text: "授权微信昵称",
      style: {
        left: (ww - bw) * 0.5,
        top: Math.max(40, (wh - bh) * 0.5),
        width: bw,
        height: bh,
        lineHeight: bh,
        backgroundColor: "#1a8cff",
        color: "#ffffff",
        textAlign: "center",
        fontSize: 16,
        borderRadius: 10,
      },
      withCredentials: false,
      lang: "zh_CN",
    });
    wxUserInfoBtn.onTap((res) => {
      if (res && res.userInfo && applyWxUserInfo(res.userInfo)) {
        continueAfterAuthGate();
        return;
      }
      holdWxAuthButton("授权未完成，请再次点击授");
    });
  }
  function fetchWxUserInfoOrAskButton() {
    if (typeof wx === "undefined" || typeof wx.getUserInfo !== "function") {
      holdWxAuthButton();
      return;
    }
    wx.getUserInfo({
      withCredentials: false,
      lang: "zh_CN",
      success(res) {
        if (res && res.userInfo && applyWxUserInfo(res.userInfo)) {
          continueAfterAuthGate();
          return;
        }
        holdWxAuthButton();
      },
      fail() { holdWxAuthButton(); },
    });
  }
  function beginWxAuthorizeFlow() {
    closeAuthModal();
    const startAuth = () => {
      if (typeof wx === "undefined") {
        ensureRandomPilotName();
        pilot.recordRank = false;
        syncWxProfileToGlobal();
        continueAfterAuthGate();
        return;
      }
      if (typeof wx.getSetting === "function") {
        wx.getSetting({
          success(res) {
            const authed = !!(res && res.authSetting && res.authSetting["scope.userInfo"]);
            if (authed) fetchWxUserInfoOrAskButton();
            else holdWxAuthButton();
          },
          fail() { holdWxAuthButton(); },
        });
        return;
      }
      holdWxAuthButton();
    };
    if (typeof wx !== "undefined" && typeof wx.requirePrivacyAuthorize === "function") {
      wx.requirePrivacyAuthorize({
        success: startAuth,
        fail() {
          if (lobbyErr) lobbyErr.textContent = "需要同意隐私保护后才能授权";
          holdWxAuthButton();
        },
      });
    } else {
      startAuth();
    }
  }
  function declineWxAuthorizeAndContinue() {
    destroyWxUserInfoBtn();
    ensureRandomPilotName();
    // 未授权：不记分排?
    pilot.recordRank = false;
    syncWxProfileToGlobal();
    if (wxAuthRequire) {
      // 关卡进度等：点「否」直接取消，不执行进入回?
      closeAuthModal();
      wxAuthBusy = false;
      wxAuthPending = null;
      wxAuthRequire = false;
      if (lobbyErr) lobbyErr.textContent = "";
      try { wx.showToast({ title: "提示", icon: "none", duration: 1600 }); } catch (e) {}
      return;
    }
    continueAfterAuthGate();
  }
  /** 未授权先弹窗；选「授权」走微信授权，选「否」默认用随机名继续；opts.require 则必须授?*/
  function ensureWxUserAuth(then, opts) {
    if (typeof then !== "function") return;
    const requireAuth = !!(opts && opts.require);
    // 已授权即可继续（昵称无效时补随机名），避免「微信用户」导致反复弹窗、建房失?
    if (isWxUserAuthed()) {
      ensureRandomPilotName();
      pilot.recordRank = true;
      syncWxProfileToGlobal();
      then();
      return;
    }
    if (wxAuthBusy) {
      wxAuthPending = then;
      wxAuthRequire = requireAuth || wxAuthRequire;
      // 授权流程卡住（弹窗已关、原生按钮也没了）时重新拉起，避免点了没反应
      const modal = $("authModal");
      const modalOpen = modal && modal.style.display !== "none";
      if (!modalOpen && !wxUserInfoBtn) {
        destroyWxUserInfoBtn();
        openAuthModal();
      }
      return;
    }
    wxAuthBusy = true;
    wxAuthPending = then;
    wxAuthRequire = requireAuth;
    destroyWxUserInfoBtn();
    openAuthModal();
  }

  let ws = null;
  let myId = pilot.wantId || null;
  let connected = false;
  let reconnectTimer = null;
  let fullMessage = "";
  let roomFull = false;

  // ===== 网络渲染时间轴（插值）=====
  // 以服务器时间为统一时间轴：渲染时刻 = 最新快照时?- renderDelay?
  // renderDelay ?2~3 个快照间隔，用来吸收网络抖动；只有渲染时刻超出最新快?
  // 才做有限外推（≤150ms），避免"停顿"?瞬移"?
  const net = {
    clock: null,   // 渲染时钟（serverTime 域）
    latestSt: 0,
    interval: 50,
    delay: 130,
    lastArrive: 0,
  };
  const MAX_EXTRAPOLATE = 150;
  const TELEPORT_DIST = 120;

  const entPlayers = new Map();      // id ?{t0,x0,y0,h0,t1,x1,y1,h1,meta}
  const entMotherships = new Map();
  const entMissiles = new Map();
  const mothershipBase = new Map();  // 母舰位置静止：welcome 里记一次基?
  const asteroids = new Map();       // 客户端本地匀速推?
  let medkit = null;
  const bulletShots = new Map();     // 子弹一次性生成事??本地推算
  let bulletSeq = 0;
  const gunWakeTrails = [];          // 机关炮空气拖尾点（同两翼分链；对象来?wakePointPool?
  const missileTrails = new Map();
  const RADDEG = Math.PI / 180;
  const EFFECT_COLORS = ["#ffb45f", "#c4a27a", "#ff6f8f", "#ffe28a", "#ff7c66"];
  const roster = new Map();          // id ?{name,color}
  const playerStatus = new Map();    // id ?{gear,brake,hp,respawn}（变化时才推?
  const DEFAULT_STATUS = { gear: "F", brake: false, hp: PLAYER_MAX_HP, respawn: 0 };
  function applyServerMaxSpeed(v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) MAX_SPEED = n;
  }
  // 速度档：1=基准?=两倍最高?+ 双发尾焰（昵?Great_Man_good?
  let mySpeedTier = 1;
  const SPEED2_NAMES = new Set(["great_man_good"]);
  function clampSpeedTier(v) {
    const n = Math.round(Number(v));
    return n >= 2 ? 2 : 1;
  }
  function speedTierOfName(name) {
    const key = String(name || "").trim().toLowerCase();
    return SPEED2_NAMES.has(key) ? 2 : 1;
  }
  function applyMySpeedTier(v) {
    mySpeedTier = clampSpeedTier(v);
    if (hasTwinUnlock()) mySpeedTier = 2;
  }
  function syncTwinToServer() {
    if (!hasTwinUnlock()) return;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          t: "twin",
          on: 1,
          token: pilot.token,
          openid: pilot.openid || undefined,
          name: pilot.name || undefined,
        }));
      }
    } catch (e) {}
  }
  function grantTwinEngine(showTip) {
    const first = !hasTwinUnlock();
    saveTwinUnlock();
    applyMySpeedTier(2);
    syncTwinToServer();
    // 本地匹配中途解锁：立刻改自己机身档?
    try {
      const meCraft = localCrafts && localCrafts.find((c) => c.id === myId);
      if (meCraft) meCraft.spdTier = 2;
      const info = roster.get(myId);
      if (info) info.spd = 2;
    } catch (e) {}
    if (showTip) {
      const tip = "你已获得双发引擎更快更持久！干就完了";
      try {
        if (typeof wx !== "undefined" && typeof wx.showModal === "function") {
          wx.showModal({ title: "干就完了", content: tip, showCancel: false });
        } else if (typeof wx !== "undefined" && typeof wx.showToast === "function") {
          wx.showToast({ title: tip.slice(0, 14), icon: "none", duration: 2500 });
        } else {
          toastLobby(tip);
        }
      } catch (e) {
        try { toastLobby(tip); } catch (err) {}
      }
    }
    return first;
  }
  // 启动时按已保存引擎方案恢复速度档（拥有双引??当前一定在用）
  try {
    const lo0 = getMyLoadout();
    applyMySpeedTier(Math.max(speedTierOfName(pilot.name), lo0 && lo0.engine === "twin" ? 2 : 1));
  } catch (e) {
    applyMySpeedTier(speedTierOfName(pilot.name));
  }
  function myMaxSpeed() {
    return MAX_SPEED * mySpeedTier;
  }
  function maxSpeedForId(id) {
    if (id === myId) return myMaxSpeed();
    const info = roster.get(id);
    return MAX_SPEED * clampSpeedTier(info && info.spd);
  }
  function craftSpeedTier(player) {
    if (!player) return 1;
    if (Number.isFinite(player.spdTier)) return clampSpeedTier(player.spdTier);
    if (player.id === myId) return mySpeedTier;
    const info = roster.get(player.id);
    return clampSpeedTier(info && info.spd);
  }
  function applyServerMaxHp(mh) {
    const next = Math.round(Number(mh));
    if (!(next >= 50 && next <= 1000)) return;
    PLAYER_MAX_HP = next;
    MISSILE_DAMAGE = PLAYER_MAX_HP * 0.5;
    PAD_HEAL_RATE = PLAYER_MAX_HP * 0.2;
    DEFAULT_STATUS.hp = PLAYER_MAX_HP;
  }
  let latestPlayers = [];            // 最新快照的玩家状态（自机预测用）
  let playerCount = 0;
  let renderTime = 0;

  // 与服务器一致；开房局?welcome.maxSpd 为准（当前为原速度一半）
  let MAX_SPEED = 200;
  function craftTurnRate(speed) {
    const speedRatio = clamp(speed / MAX_SPEED, 0, 1);
    const base = 16.8 + (2.8 - 16.8) * Math.pow(speedRatio, 0.8);
    return base * (0.5 + 0.5 * clamp(speed / (MAX_SPEED * 0.22), 0, 1));
  }
  const CRUISE_RATIO = 0.6;
  const RESPAWN_TIME = 3;
  let respawnAnimT0 = 0;
  let WORLD_LIMIT = 2500;
  // Y 向半幅；默认?X 相同。第4关狭廊压成约「两屏高度?
  let WORLD_Y_LIMIT = 2500;
  let level4Goal = null; // { x0,y0,x1,y1 } 右边缘终点区
  const PAD_SIZE = 300;
  let pred = null;
  const predErr = { x: 0, y: 0, h: 0, t: 0 };
  let FRAME_MS = 30;
  const BUF_START = 5;
  const BUF_MAX = 5;
  const play = { frames: [], events: [], playing: false, head: 0, pose: null };

  const keys = { left: false, right: false, up: false, down: false, brake: false, gun: false, missile: false };
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, left: false, right: false };
  const gunStick = { active: false, angle: null, dx: 0, dy: 0 };
  const flyStick = { active: false, angle: null, mag: 0, dx: 0, dy: 0, coastAt: 0 };
  let currentWeapon = "gun";
  function gunHeld() {
    return !!(keys.gun || (pointer.right && currentWeapon === "gun") || (gunStick.active && currentWeapon === "gun"));
  }
  function missileHeld() {
    return !!(keys.missile || (pointer.right && currentWeapon === "missile") || (gunStick.active && currentWeapon === "missile"));
  }
  // 训练场激?/ 电磁脉冲：开火键按住瞄准（拖动调方向），松手发射；不锁定敌机
  function subAimMode() {
    return !!(trainLoadout && (trainLoadout.sub === "laser" || trainLoadout.sub === "emp") && currentWeapon === "missile");
  }
  function cursorAim() {
    if (IS_MOBILE) return null;
    const dx = (pointer.x - W * 0.5) / VIEW_SCALE;
    const dy = (pointer.y - H * 0.5) / VIEW_SCALE;
    if (dx * dx + dy * dy < 64) return null;
    return Math.atan2(dy, dx);
  }
  let gear = "F";
  let manualThrottle = null;
  let manualThrottleUntil = 0;
  // 左侧速度滑杆?~1；移动端用它控油门，摇杆只管转向。开局/复活?0，需自己加?
  let speedLever = 0;
  try { GameGlobal.speedLever = speedLever; } catch (e) {}
  function pushSpeedLeverIdle() {
    speedLever = 0;
    manualThrottle = 0;
    manualThrottleUntil = performance.now() + 200;
    try { GameGlobal.speedLever = speedLever; } catch (e) {}
  }
  // 兼容旧名：开局不再推满，改为熄火待?
  function pushSpeedLeverMax() {
    pushSpeedLeverIdle();
  }
  const playerVisuals = new Map();
  let lastFrameTime = performance.now();
  let fpsValue = 60;
  let fpsFrames = 0;
  let fpsWindowAt = lastFrameTime;
  function updateFps(now) {
    fpsFrames++;
    const elapsed = now - fpsWindowAt;
    if (elapsed < 500) return;
    const sampled = fpsFrames * 1000 / Math.max(1, elapsed);
    fpsValue = fpsValue * 0.35 + sampled * 0.65;
    fpsFrames = 0;
    fpsWindowAt = now;
  }
  function drawFps() {
    const safe = (typeof GameGlobal !== "undefined" && GameGlobal.safeUI) || {};
    const right = Math.max(6, Number(safe.edgeRight != null ? safe.edgeRight : safe.right) || 6);
    const bottom = Math.max(6, Number(safe.bottom) || 6);
    const label = `${Math.max(0, Math.round(fpsValue))} FPS`;
    ctx.save();
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const width = ctx.measureText(label).width + 10;
    const x = W - right - 6;
    const y = H - bottom - 4;
    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(x - width, y - 14, width + 4, 16);
    ctx.fillStyle = fpsValue >= 50 ? "#74ff8a" : (fpsValue >= 30 ? "#ffe36e" : "#ff6b6b");
    ctx.fillText(label, x, y);
    ctx.restore();
  }
  function drawFpsWebGl(world) {
    const hud = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLHud) || null;
    if (!hud || !world) return false;
    const safe = GameGlobal.safeUI || {};
    const right = Math.max(6, Number(safe.edgeRight != null ? safe.edgeRight : safe.right) || 6);
    const bottom = Math.max(6, Number(safe.bottom) || 6);
    const cpuMs = world.metrics && Number.isFinite(world.metrics.frameMs)
      ? world.metrics.frameMs
      : 0;
    const label = `${Math.max(0, Math.round(fpsValue))} FPS  ${cpuMs.toFixed(1)}ms`;
    const x = W - right - 6;
    const y = H - bottom - 4;
    const width = label.length * 6.2 + 10;
    const color = fpsValue >= 50 ? "#74ff8a" : (fpsValue >= 30 ? "#ffe36e" : "#ff6b6b");
    hud.begin(W, H, dpr)
      .roundedRect(x - width, y - 14, width + 4, 16, 3, "rgba(0,0,0,0.58)")
      .text(label, x, y, { size: 10, color, align: "right", baseline: "bottom" });
    world.setViewScale(1);
    world.setCoordinateScale(dpr);
    const drew = hud.flush(world);
    world.setCoordinateScale(1);
    return drew;
  }
  // 调试钩子：仅?URL ??debug=1 时记录诊断数据，供性能/同步排查
  const DEBUG = /[?&]debug=1/.test(location.search);
  let dbgFrame = null;
  if (DEBUG) GameGlobal.__dbg = () => dbgFrame;

  function pseudoRandom(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  // 瓦片用半分辨率烘焙（微信离屏上限更紧），屏幕侧用 MAP_TILE_SC 拉回?web 同视觉尺?
  const FAR_W = 624;
  const FAR_H = 540;
  const NEAR_W = 420;
  const NEAR_H = 420;
  const MAP_FAR_Z = 0.30;
  const MAP_NEAR_Z = 0.50;
  const MAP_FAR_SC = 1;   // 624×1 ?web ?1248×0.5
  const MAP_NEAR_SC = 0.5;
  // 纯黑?+ 程序化星空（不依赖离?width，微信更稳）；陨石等 NPC 仍照常画
  const MAP_BG = "#000";
  const MAP_DECOR_OFF = true; // 关闭旧六边形/?剪影/信标
  const MAP_SPACE_Z = 0.22;
  const MAP_SPACE_PERIOD = 520;
  const MAP_ACCENT = "#3ec8ff"; // 与贴边亮蓝同一色系
  const spaceStars = [];
  const spaceDust = [];
  (function initSpaceField() {
    let s = 918273;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const P = MAP_SPACE_PERIOD;
    for (let i = 0; i < 110; i++) {
      const bright = rnd();
      spaceStars.push({
        x: rnd() * P,
        y: rnd() * P,
        sz: bright > 0.88 ? 2 : 1,
        cyan: bright > 0.88,
        a: bright > 0.88 ? 0.9 : (0.28 + bright * 0.55),
      });
    }
    for (let i = 0; i < 5; i++) {
      spaceDust.push({
        x: rnd() * P,
        y: rnd() * P,
        r: 28 + rnd() * 42,
      });
    }
  })();
  // 远景六边形周期（?bakeFarTile 一致，供瓦片失败时的实时回退?
  const HEX_DX = FAR_W / 4;
  const HEX_DY = FAR_H / 4;
  const HEX_RX = HEX_DX / Math.sqrt(3);
  const HEX_RY = HEX_DY / 1.5;
  function makeOffscreen(w, h) {
    w = Math.max(1, Math.round(w) || 1);
    h = Math.max(1, Math.round(h) || 1);
    let c = null;
    try {
      if (typeof wx !== "undefined" && typeof wx.createOffscreenCanvas === "function") {
        c = wx.createOffscreenCanvas({ type: "2d", width: w, height: h });
      }
    } catch (e) {}
    if (!c) {
      try {
        c = wx.createOffscreenCanvas();
        c.width = w;
        c.height = h;
      } catch (e) {}
    }
    if (!c) {
      // 微信开发者工具及部分基础库没?createOffscreenCanvas?
      // 主画布创建后，后?createCanvas 返回可用的离?Canvas?
      try {
        c = wx.createCanvas();
        c.width = w;
        c.height = h;
      } catch (e) {}
    }
    if (!c) {
      try {
        c = document.createElement("canvas");
        c.width = w;
        c.height = h;
      } catch (e) {}
    }
    if (!c) return null;
    try {
      c.width = w;
      c.height = h;
    } catch (e) {}
    return c;
  }
  const FAR_LANDS = [
    [FAR_W * 0.13, FAR_H * 0.16, FAR_W * 0.085, 1.2],
    [FAR_W * 0.42, FAR_H * 0.10, FAR_W * 0.062, 3.1],
    [FAR_W * 0.71, FAR_H * 0.21, FAR_W * 0.078, 5.0],
    [FAR_W * 0.90, FAR_H * 0.43, FAR_W * 0.070, 2.4],
    [FAR_W * 0.24, FAR_H * 0.55, FAR_W * 0.075, 4.3],
    [FAR_W * 0.55, FAR_H * 0.62, FAR_W * 0.068, 6.2],
    [FAR_W * 0.82, FAR_H * 0.77, FAR_W * 0.080, 7.4],
    [FAR_W * 0.09, FAR_H * 0.88, FAR_W * 0.058, 8.6],
  ];

  function landOutline(cx, cy, r, seed) {
    const pts = [];
    for (let i = 0; i < 29; i++) {
      const a = (i / 28) * Math.PI * 2;
      const wob = 1 + 0.22 * Math.sin(a * 3 + seed) + 0.13 * Math.sin(a * 7 + seed * 1.7);
      pts.push(cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * 0.82 * wob);
    }
    return pts;
  }

  function strokePolyXY(g, xy, close) {
    g.beginPath();
    g.moveTo(xy[0], xy[1]);
    for (let i = 2; i < xy.length; i += 2) g.lineTo(xy[i], xy[i + 1]);
    if (close) g.closePath();
    g.stroke();
  }

  function fillPolyXY(g, xy) {
    g.beginPath();
    g.moveTo(xy[0], xy[1]);
    for (let i = 2; i < xy.length; i += 2) g.lineTo(xy[i], xy[i + 1]);
    g.closePath();
    g.fill();
  }

  function wrapTile(src) {
    if (!src) return null;
    const sw = src.width | 0;
    const sh = src.height | 0;
    if (!(sw > 0 && sh > 0)) return src;
    const out = makeOffscreen(sw, sh);
    if (!out) return src;
    const g = out.getContext("2d");
    if (!g) return src;
    for (const ox of [-sw, 0, sw]) {
      for (const oy of [-sh, 0, sh]) g.drawImage(src, ox, oy);
    }
    // 丢掉源位图，避免?近景各占双份离屏内存
    try { src.width = 0; src.height = 0; } catch (e) {}
    return out;
  }

  function paintHexGrid(g, w, h, dx, dy, rx, ry, stroke, lineW) {
    g.strokeStyle = stroke;
    g.lineWidth = lineW;
    g.lineJoin = "round";
    g.lineCap = "round";
    // 多画一圈，wrap/平铺时边界不断线
    for (let row = -1; row <= h / dy + 1; row++) {
      for (let col = -1; col <= w / dx + 2; col++) {
        const cx = col * dx + (row % 2 ? dx * 0.5 : 0);
        const cy = row * dy;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i - Math.PI / 6;
          const x = cx + rx * Math.cos(ang);
          const y = cy + ry * Math.sin(ang);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
      }
    }
  }

  function bakeFarTile() {
    const cnv = makeOffscreen(FAR_W, FAR_H);
    if (!cnv) return null;
    const g = cnv.getContext("2d");
    if (!g) return null;
    g.fillStyle = MAP_BG;
    g.fillRect(0, 0, FAR_W, FAR_H);
    g.fillStyle = "rgba(88,138,158,0.10)";
    for (const land of FAR_LANDS) {
      fillPolyXY(g, landOutline(land[0], land[1], land[2], land[3]));
      for (let k = 1; k <= 3; k++) {
        g.strokeStyle = `rgba(130,178,170,${0.08 - k * 0.015})`;
        g.lineWidth = 1;
        strokePolyXY(g, landOutline(land[0], land[1], land[2] * (1 - k * 0.15), land[3] + k * 1.3), true);
      }
    }
    // 对齐 web：暗绿六边形网格（略提不透明度，小屏更易辨认?
    paintHexGrid(g, FAR_W, FAR_H, HEX_DX, HEX_DY, HEX_RX, HEX_RY, "rgba(96,160,136,0.26)", 1.35);
    return wrapTile(cnv);
  }

  function bakeNearTile() {
    const cnv = makeOffscreen(NEAR_W, NEAR_H);
    if (!cnv) return null;
    const g = cnv.getContext("2d");
    if (!g) return null;
    const cell = NEAR_W / 6;
    g.strokeStyle = "rgba(112,124,190,0.16)";
    g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const t = i * cell;
      g.beginPath();
      g.moveTo(t, 0);
      g.lineTo(t, NEAR_H);
      g.stroke();
      g.beginPath();
      g.moveTo(0, t);
      g.lineTo(NEAR_W, t);
      g.stroke();
    }
    g.strokeStyle = "rgba(130,150,190,0.08)";
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if ((i + j) % 3 !== 0) continue;
        const x = i * cell + cell * 0.5;
        const y = j * cell + cell * 0.5;
        g.beginPath();
        g.moveTo(x - 4, y);
        g.lineTo(x + 4, y);
        g.moveTo(x, y - 4);
        g.lineTo(x, y + 4);
        g.stroke();
      }
    }
    return wrapTile(cnv);
  }

  let farTile = null;
  let nearTile = null;
  let mapTilesReady = false;
  function ensureMapTiles() {
    // 星空为程序化字段，无需离屏；保留接口供旧瓦?其它调用
    mapTilesReady = true;
  }
  function releaseMapTiles() {
    try {
      if (farTile) { farTile.width = 0; farTile.height = 0; }
    } catch (e) {}
    try {
      if (nearTile) { nearTile.width = 0; nearTile.height = 0; }
    } catch (e) {}
    farTile = null;
    nearTile = null;
    mapTilesReady = false;
  }
  function drawSpaceField(camera) {
    const z = MAP_SPACE_Z;
    const tw = MAP_SPACE_PERIOD;
    const th = MAP_SPACE_PERIOD;
    const vis = viewPad(8);
    const ox = ((camera.x * z) % tw + tw) % tw;
    const oy = ((camera.y * z) % th + th) % th;
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
    // 低端跳过尘斑，只留星点?
    if (!PERF_LITE) {
      ctx.fillStyle = "rgba(40, 100, 140, 0.045)";
      for (let i = 0; i < spaceDust.length; i++) {
        const d = spaceDust[i];
        let x = d.x - ox;
        let y = d.y - oy;
        while (x > vis.x0) x -= tw;
        while (y > vis.y0) y -= th;
        for (let px = x; px < vis.x1; px += tw) {
          if (px + d.r < vis.x0) continue;
          for (let py = y; py < vis.y1; py += th) {
            if (py + d.r < vis.y0) continue;
            ctx.beginPath();
            ctx.arc(px, py, d.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    // 星星：先普通后亮蓝；低端只画一半、跳过青星?
    const starStep = PERF_LITE ? 2 : 1;
    const passCount = PERF_LITE ? 1 : 2;
    for (let pass = 0; pass < passCount; pass++) {
      for (let i = 0; i < spaceStars.length; i += starStep) {
        const st = spaceStars[i];
        if (!!st.cyan !== (pass === 1)) continue;
        ctx.fillStyle = pass === 1
          ? `rgba(62, 200, 255, ${st.a})`
          : `rgba(200, 220, 240, ${st.a})`;
        let x = st.x - ox;
        let y = st.y - oy;
        while (x > vis.x0) x -= tw;
        while (y > vis.y0) y -= th;
        for (let px = x; px < vis.x1; px += tw) {
          if (px + st.sz < vis.x0) continue;
          for (let py = y; py < vis.y1; py += th) {
            if (py + st.sz < vis.y0) continue;
            ctx.fillRect(px, py, st.sz, st.sz);
          }
        }
      }
    }
  }

  const spaceGlNormal = [];
  const spaceGlAdditive = [];
  function drawSpaceFieldWebGl(camera, world) {
    if (!world) return false;
    const normal = spaceGlNormal;
    const additive = spaceGlAdditive;
    normal.length = 0;
    additive.length = 0;
    const z = MAP_SPACE_Z;
    const tw = MAP_SPACE_PERIOD;
    const th = MAP_SPACE_PERIOD;
    const vis = viewPad(8);
    const ox = ((camera.x * z) % tw + tw) % tw;
    const oy = ((camera.y * z) % th + th) % th;
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return false;
    for (let i = 0; i < spaceDust.length; i++) {
      const dust = spaceDust[i];
      let x = dust.x - ox;
      let y = dust.y - oy;
      while (x > vis.x0) x -= tw;
      while (y > vis.y0) y -= th;
      for (let px = x; px < vis.x1; px += tw) {
        if (px + dust.r < vis.x0) continue;
        for (let py = y; py < vis.y1; py += th) {
          if (py + dust.r < vis.y0) continue;
          glColorEllipse(normal, px, py, dust.r, dust.r, 0, [0.16, 0.39, 0.55, 0.045], 14);
        }
      }
    }
    for (let i = 0; i < spaceStars.length; i++) {
      const star = spaceStars[i];
      let x = star.x - ox;
      let y = star.y - oy;
      while (x > vis.x0) x -= tw;
      while (y > vis.y0) y -= th;
      const color = star.cyan
        ? [0.24, 0.78, 1, star.a]
        : [0.78, 0.86, 0.94, star.a];
      for (let px = x; px < vis.x1; px += tw) {
        if (px + star.sz < vis.x0) continue;
        for (let py = y; py < vis.y1; py += th) {
          if (py + star.sz < vis.y0) continue;
          glColorQuad(additive, px, py, Math.max(0.8, star.sz), Math.max(0.8, star.sz), 0, color);
        }
      }
    }
    let drew = false;
    if (normal.length) drew = world.drawColorTriangles(normal, false) || drew;
    if (additive.length) drew = world.drawColorTriangles(additive, true) || drew;
    return drew;
  }
  const ZONE = { tint: [86, 186, 220], sil: [132, 186, 208], fog: 0.11, grade: 0.03 };
  const ZONE_SIL = [{ z: 0.10, a: 0.075, rocks: [] }, { z: 0.22, a: 0.05, rocks: [] }];
  ZONE_SIL.forEach((layer, li) => {
    let s = 9137 + li * 733;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const n = li === 0 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      layer.rocks.push({
        nx: rnd(), ny: rnd(),
        r: li === 0 ? 22 + rnd() * 18 : 32 + rnd() * 26,
        squash: 0.7 + rnd() * 0.42,
        rot: rnd() * Math.PI * 2,
        verts: Array.from({ length: 8 }, () => 0.72 + rnd() * 0.42),
      });
    }
  });
  const mapBeacons = (() => {
    let s = 43801 >>> 0;
    const rand = () => {
      s = (Math.imul(s, 747796405) + 2891336453) >>> 0;
      let x = s;
      x = Math.imul((x >>> ((x >>> 28) + 4)) ^ x, 277803737);
      return (((x >>> 22) ^ x) >>> 0) / 4294967296;
    };
    const list = [];
    for (let i = 0; i < 40; i++) {
      list.push({
        x: (rand() - 0.5) * 6000,
        y: (rand() - 0.5) * 6000,
        r: 6 + rand() * 18,
        spin: rand() * Math.PI,
      });
    }
    return list;
  })();

  const MAP_LABELS = (() => {
    const names = [
      { x: 0, y: 0, text: "ORIGIN", big: true },
      { x: 2200, y: -2200, text: "REPAIR", big: true },
      { x: -1700, y: -900, text: "RIDGE" },
      { x: 800, y: 1400, text: "DRIFT" },
      { x: -400, y: 1800, text: "VOID" },
      { x: 1500, y: 200, text: "SHOAL" },
      { x: -1900, y: 1100, text: "SPINE" },
      { x: 400, y: -1600, text: "CALM" },
      { x: -900, y: -1800, text: "ASH" },
      { x: 1900, y: 1700, text: "RIM" },
      { x: 0, y: -2300, text: "N" },
      { x: 0, y: 2300, text: "S" },
      { x: 2300, y: 0, text: "E" },
      { x: -2300, y: 0, text: "W" },
    ];
    const step = 700;
    for (let x = -2100; x <= 2100; x += step) {
      for (let y = -2100; y <= 2100; y += step) {
        if (Math.abs(x) < 80 && Math.abs(y) < 80) continue;
        names.push({ x, y, text: `${x},${y}`, coord: true });
      }
    }
    return names;
  })();

  const BULLET_LEN = 6.4;
  const GUN_PERIOD = 0.10125; // 与服务器一致（0.2025 ?0.10125 射速加倍）
  const BURST_ROUNDS = 5;
  const GUN_AMMO_MAX = 100;
  const GUN_AMMO_HARD = 300;
  const GUN_AMMO_REGEN = 5;
  let gunAmmoMax = GUN_AMMO_MAX;
  let gunAmmo = GUN_AMMO_MAX;
  let publicBrawl = false;
  // 大乱斗弹药上?回复速度?2 倍（与服务端 gunScale 一致）
  function gunScale() {
    return publicBrawl ? 2 : 1;
  }
  const MISSILE_AMMO_MAX = 5;
  const MISSILE_AMMO_HARD = 10;
  const MISSILE_AMMO_REGEN = 1 / 5;
  let missileAmmoMax = MISSILE_AMMO_MAX;
  let missileAmmo = MISSILE_AMMO_MAX;
  const ammoWrap = $("ammoWrap");
  const ammoBar = $("ammoBar");
  const ammoText = $("ammoText");
  const missileAmmoWrap = $("missileAmmoWrap");
  const missileAmmoBar = $("missileAmmoBar");
  const missileAmmoText = $("missileAmmoText");
  function renderAmmo() {
    if (ammoWrap) ammoWrap.style.display = "";
    const n = Math.max(0, Math.floor(gunAmmo));
    if (ammoText) ammoText.textContent = String(n);
    if (ammoBar) ammoBar.style.width = `${(n / Math.max(1, gunAmmoMax)) * 100}%`;
    ammoWrap?.classList.toggle("empty", n <= 0);
    // 激光：冷却秒数；电磁脉冲：弹药数（最?5?
    if (trainLoadout && trainLoadout.sub === "laser") {
      const cd = trainW.laserCd;
      if (missileAmmoText) missileAmmoText.textContent = cd > 0 ? `${cd.toFixed(1)}s` : "就绪";
      if (missileAmmoBar) missileAmmoBar.style.width = `${clamp(1 - cd / LASER_CD, 0, 1) * 100}%`;
      missileAmmoWrap?.classList.toggle("empty", cd > 0);
      return;
    }
    if (trainLoadout && trainLoadout.sub === "emp") {
      const n = Math.max(0, Math.floor(trainW.empAmmo));
      if (missileAmmoText) missileAmmoText.textContent = `${n}/${EMP_AMMO_MAX}`;
      if (missileAmmoBar) missileAmmoBar.style.width = `${(n / Math.max(1, EMP_AMMO_MAX)) * 100}%`;
      missileAmmoWrap?.classList.toggle("empty", n <= 0 || trainW.empFireCd > 0);
      return;
    }
    if (trainLoadout && trainLoadout.sub === "drone") {
      syncDroneAmmoUi();
      const m = Math.max(0, Math.floor(missileAmmo));
      // 显示当前无人机架?/ 满编 2
      if (missileAmmoText) missileAmmoText.textContent = `${m}/${DRONE_COUNT}`;
      if (missileAmmoBar) missileAmmoBar.style.width = `${(m / Math.max(1, missileAmmoMax)) * 100}%`;
      missileAmmoWrap?.classList.toggle("empty", m <= 0);
      updateDroneFireLabel();
      return;
    }
    const m = Math.max(0, Math.floor(missileAmmo));
    if (missileAmmoText) missileAmmoText.textContent = String(m);
    if (missileAmmoBar) missileAmmoBar.style.width = `${(m / Math.max(1, missileAmmoMax)) * 100}%`;
    missileAmmoWrap?.classList.toggle("empty", m <= 0);
  }
  // 发不出弹时：对应弹药条放?+ 红边，随后自动恢复（动画中不重复触发?
  function pulseAmmoDeny(kind) {
    const wrap = kind === "missile" ? missileAmmoWrap : ammoWrap;
    if (!wrap) return;
    const now = performance.now();
    if ((Number(wrap.denyUntil) || 0) > now) return;
    const until = now + 420;
    wrap.denyUntil = until;
    wrap.classList.add("deny");
    clearTimeout(wrap._denyTimer);
    wrap._denyTimer = setTimeout(() => {
      if (wrap.denyUntil === until) {
        wrap.classList.remove("deny");
        wrap.denyUntil = 0;
      }
    }, 430);
  }
  // 击杀回满：弹药条亮闪 + 放大（CD/弹药区反馈）
  function pulseAmmoRefill() {
    const now = performance.now();
    const until = now + 720;
    for (const wrap of [ammoWrap, missileAmmoWrap]) {
      if (!wrap) continue;
      wrap.refillUntil = until;
      wrap.classList.add("refill");
      wrap.classList.remove("deny", "empty");
      clearTimeout(wrap._refillTimer);
      wrap._refillTimer = setTimeout(() => {
        if (wrap.refillUntil === until) {
          wrap.classList.remove("refill");
          wrap.refillUntil = 0;
        }
      }, 730);
    }
  }
  function applyKillAmmoRefill(ga, ma, gm) {
    if (Number.isFinite(Number(gm))) gunAmmoMax = clamp(Number(gm), GUN_AMMO_MAX, GUN_AMMO_HARD * 2);
    gunAmmo = Number.isFinite(Number(ga)) ? clamp(Number(ga), 0, gunAmmoMax) : gunAmmoMax;
    missileAmmo = Number.isFinite(Number(ma)) ? clamp(Number(ma), 0, missileAmmoMax) : missileAmmoMax;
    lastLocalMissileAt = 0;
    if (localMatch) {
      const meCraft = localCrafts.find((c) => c.id === myId);
      if (meCraft) {
        meCraft.gunAmmo = gunAmmo;
        meCraft.missileAmmo = missileAmmo;
        meCraft.missileCd = 0;
      }
    }
    renderAmmo();
    pulseAmmoRefill();
    sfx?.playSelect?.();
  }
  renderAmmo();
  // 与服务器一致：BULLET_SPEED=1070、BULLET_LIFE=0.2875s（视觉须对齐否则“看不见却还能打中”）
  const BULLET_SPEED = 1070;
  const BULLET_LIFE_MS = 287.5;
  const TOPO_G = 48;
  const MASK_PAD = 1.18;
  const pendingChips = [];
  const ROCK_GRAIN_COLORS = ["#6d645b", "#847a6f", "#9b8e80", "#5c554f", "#a2968a"];
  const DEBRIS_TEMPLATES = [
    [-1, -0.35, 0.55, -0.9, 1, 0.2, -0.15, 1, -0.95, 0.45],
    [-0.9, -0.6, 0.85, -0.55, 0.7, 0.9, -0.4, 0.75],
    [-1, 0, 0.2, -1, 0.95, -0.1, 0.35, 0.95, -0.75, 0.65],
  ];
  const MAX_DEBRIS = 220;
  const debris = Array.from({ length: MAX_DEBRIS }, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, rot: 0, spin: 0, age: 0, life: 0, template: 0, color: "", spark: false,
  }));
  let debrisCursor = 0;
  const MAX_DMG_FX = 120;
  const dmgFx = Array.from({ length: MAX_DMG_FX }, () => ({
    active: false, kind: "smoke", x: 0, y: 0, vx: 0, vy: 0, size: 0, rot: 0, spin: 0, age: 0, life: 0, hurt: 0.5,
  }));
  let dmgFxCursor = 0;

  function makeRockPts(id, r) {
    // 多一点顶点、半径起伏更缓，轮廓不会出现明显尖刺锯齿
    const n = 14 + Math.floor(pseudoRandom(id * 7.1) * 10); // 14~23
    const pts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (pseudoRandom(id * 13.3 + i) - 0.5) * 0.1;
      const sc = 0.62 + pseudoRandom(id * 17.9 + i + 3) * 0.48; // 0.62~1.10
      pts.push([Math.cos(ang) * r * sc, Math.sin(ang) * r * sc]);
    }
    return pts;
  }

  /** 闭合光滑轮廓：边中点 + 二次贝塞尔，避免折线尖角锯齿 */
  function rockOutlinePath(g, pts) {
    const n = pts.length;
    if (n < 3) return false;
    const p0 = pts[0], p1 = pts[1];
    g.moveTo((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5);
    for (let i = 1; i <= n; i++) {
      const cur = pts[i % n];
      const nxt = pts[(i + 1) % n];
      g.quadraticCurveTo(cur[0], cur[1], (cur[0] + nxt[0]) * 0.5, (cur[1] + nxt[1]) * 0.5);
    }
    g.closePath();
    return true;
  }

  function worldToRock(a, wx, wy) {
    const dx = wx - a.x;
    const dy = wy - a.y;
    const ca = Math.cos(a.rotation);
    const sa = Math.sin(a.rotation);
    rockLocScratch.x = dx * ca + dy * sa;
    rockLocScratch.y = -dx * sa + dy * ca;
    return rockLocScratch;
  }

  function pointInPts(pts, px, py) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) inside = !inside;
    }
    return inside;
  }

  function buildRockGrid(pts, r) {
    const extent = r * MASK_PAD + 2;
    const grid = new Uint8Array(TOPO_G * TOPO_G);
    const cell = (extent * 2) / TOPO_G;
    let solid = 0;
    for (let cy = 0; cy < TOPO_G; cy++) {
      const ly = -extent + (cy + 0.5) * cell;
      for (let cx = 0; cx < TOPO_G; cx++) {
        const lx = -extent + (cx + 0.5) * cell;
        if (!pointInPts(pts, lx, ly)) continue;
        grid[cy * TOPO_G + cx] = 1;
        solid++;
      }
    }
    return { grid, solid, extent };
  }

  function rockSolid(a, lx, ly) {
    const cell = (a.extent * 2) / TOPO_G;
    const cx = Math.floor((lx + a.extent) / cell);
    const cy = Math.floor((ly + a.extent) / cell);
    if (cx < 0 || cy < 0 || cx >= TOPO_G || cy >= TOPO_G) return false;
    return a.grid[cy * TOPO_G + cx] === 1;
  }

  const SHIP_ROUGH = 20;
  const SHIP_M = 30000;
  const SHIP_E_IRON = 0.82;

  function hullHitsRock(a, px, py, heading) {
    if (!a || !a.grid) return false;
    const cs = Math.cos(heading || 0);
    const sn = Math.sin(heading || 0);
    const pts = [[0, -16], [0, 10], [-12, 4], [12, 4], [-8, -6], [8, -6]];
    for (const [lx, ly] of pts) {
      const wx = px + lx * cs - ly * sn;
      const wy = py + lx * sn + ly * cs;
      if ((wx - a.x) * (wx - a.x) + (wy - a.y) * (wy - a.y) > (a.r + 2) * (a.r + 2)) continue;
      const loc = worldToRock(a, wx, wy);
      if (rockSolid(a, loc.x, loc.y)) return true;
    }
    const loc = worldToRock(a, px, py);
    return rockSolid(a, loc.x, loc.y);
  }

  // 客户端对铁陨石做与网页服同款的硬碰分离，避免穿模
  function resolveMeIronRocks(me) {
    if (!me || me.respawn > 0) return;
    for (const a of asteroids.values()) {
      if (!a.iron || a.fadeOut) continue;
      const dx = a.x - me.x;
      const dy = a.y - me.y;
      const rr = a.r + SHIP_ROUGH + 6;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (!hullHitsRock(a, me.x, me.y, me.heading)) continue;
      const nd = Math.max(0.001, Math.hypot(dx, dy));
      const nx = dx / nd;
      const ny = dy / nd;
      const vn = (me.vx || 0) * nx + (me.vy || 0) * ny;
      // 朝石头内部冲时反弹（铁陨石质量无穷大?
      if (vn > 2) {
        const jn = (1 + SHIP_E_IRON) * vn / (1 / SHIP_M);
        me.vx = (me.vx || 0) - (jn / SHIP_M) * nx;
        me.vy = (me.vy || 0) - (jn / SHIP_M) * ny;
        const cs = Math.cos(me.heading || 0);
        const sn = Math.sin(me.heading || 0);
        let fwd = me.vx * cs + me.vy * sn;
        const side = -me.vx * sn + me.vy * cs;
        fwd *= 0.55;
        me.vx = cs * fwd - sn * side;
        me.vy = sn * fwd + cs * side;
        me.throttle = Math.min(me.throttle || 0, 0.35);
        me.spd = Math.hypot(me.vx, me.vy);
        sfx?.playRockBump(clamp(vn / 220, 0.12, 1));
      }
      me.x -= nx * 3;
      me.y -= ny * 3;
    }
  }

  function sampleHitAsteroid(a, prevX, prevY, curX, curY) {
    if (a.fadeOut) return null;
    const dx = curX - prevX;
    const dy = curY - prevY;
    const moveLen = Math.hypot(dx, dy) || 0.001;
    const ux = dx / moveLen;
    const uy = dy / moveLen;
    const nx = -uy;
    const ny = ux;
    const segLen = moveLen + BULLET_LEN;
    const sx = prevX - ux * BULLET_LEN;
    const sy = prevY - uy * BULLET_LEN;
    const rBroad = a.extent;
    const pdx = prevX - a.x, pdy = prevY - a.y;
    const cdx = curX - a.x, cdy = curY - a.y;
    const tNear = clamp((pdx * dx + pdy * dy) / (dx * dx + dy * dy + 0.0001), 0, 1);
    const nearX = pdx + dx * tNear, nearY = pdy + dy * tNear;
    if (cdx * cdx + cdy * cdy > rBroad * rBroad && pdx * pdx + pdy * pdy > rBroad * rBroad && nearX * nearX + nearY * nearY > rBroad * rBroad) return null;
    const stepPx = rBroad < 22 ? 1 : 2.4;
    const steps = Math.min(72, Math.max(6, Math.ceil(segLen / stepPx)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const bx0 = sx + ux * segLen * t;
      const by0 = sy + uy * segLen * t;
      for (let s = -1; s <= 1; s++) {
        const wx = bx0 + nx * s * 1.3;
        const wy = by0 + ny * s * 1.3;
        if ((wx - a.x) * (wx - a.x) + (wy - a.y) * (wy - a.y) > rBroad * rBroad) continue;
        const loc = worldToRock(a, wx, wy);
        if (!rockSolid(a, loc.x, loc.y)) continue;
        return { x: wx, y: wy, lx: loc.x, ly: loc.y };
      }
    }
    return null;
  }

  function takeDebris() {
    const p = debris[debrisCursor];
    debrisCursor = (debrisCursor + 1) % MAX_DEBRIS;
    p.active = true;
    p.age = 0;
    p.gib = false;
    p.stretchX = 1;
    p.stretchY = 1;
    return p;
  }

  function takeDmgFx() {
    const p = dmgFx[dmgFxCursor];
    dmgFxCursor = (dmgFxCursor + 1) % MAX_DMG_FX;
    p.active = true;
    p.age = 0;
    return p;
  }

  // —?通用自由列表 / 环形池（高频特效与拖尾，避免每帧 new）—?
  function makeFreeList(seedCount, factory) {
    const free = [];
    for (let i = 0; i < seedCount; i++) free.push(factory());
    return {
      take() { return free.length ? free.pop() : factory(); },
      release(o) { if (o && free.length < seedCount * 3) free.push(o); },
      clear() { free.length = 0; },
    };
  }
  const wakePointPool = makeFreeList(256, () => ({ id: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0 }));
  const trailPointPool = makeFreeList(256, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, power: 0, jet: 0, scale: 1, blue: false }));
  const missileTrailPool = makeFreeList(128, () => ({ x: 0, y: 0, age: 0 }));
  const bulletShotPool = makeFreeList(128, () => ({
    id: 0, oid: 0, kind: 0, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
    t0: 0, t0Local: 0, life: 0, team: 0, own: false, dmg: 0, blast: 0, style: "", ci: 0,
  }));
  const recentBlastPool = makeFreeList(24, () => ({ x: 0, y: 0, t: 0 }));

  const MAX_FIRE_BLASTS = 40;
  const fireBlasts = Array.from({ length: MAX_FIRE_BLASTS }, () => ({
    active: false, x: 0, y: 0, age: 0, life: 0, size: 0, seed: 0,
  }));
  let fireBlastCursor = 0;
  function takeFireBlast() {
    const p = fireBlasts[fireBlastCursor];
    fireBlastCursor = (fireBlastCursor + 1) % MAX_FIRE_BLASTS;
    p.active = true;
    p.age = 0;
    return p;
  }

  const MAX_HEAL_BURSTS = 32;
  const healBursts = Array.from({ length: MAX_HEAL_BURSTS }, () => ({
    active: false, x: 0, y: 0, t0: 0, kind: "heal",
  }));
  let healBurstCursor = 0;
  function takeHealBurst() {
    const p = healBursts[healBurstCursor];
    healBurstCursor = (healBurstCursor + 1) % MAX_HEAL_BURSTS;
    p.active = true;
    return p;
  }

  const MAX_HIT_FLASHES = 40;
  const hitFlashes = Array.from({ length: MAX_HIT_FLASHES }, () => ({
    active: false, x: 0, y: 0, ux: 0, uy: 0, size: 0, t0: 0, life: 0,
  }));
  let hitFlashCursor = 0;
  function takeHitFlash() {
    const p = hitFlashes[hitFlashCursor];
    hitFlashCursor = (hitFlashCursor + 1) % MAX_HIT_FLASHES;
    p.active = true;
    return p;
  }

  const MAX_EFFECTS = 64;
  const effectList = Array.from({ length: MAX_EFFECTS }, () => ({
    active: false, ty: 0, x: 0, y: 0, size: 0, c: 0, t0: 0,
  }));
  let effectCursor = 0;
  function takeEffect() {
    const p = effectList[effectCursor];
    effectCursor = (effectCursor + 1) % MAX_EFFECTS;
    p.active = true;
    return p;
  }

  const SCREEN_RING_N = 128;
  const screenRing = Array.from({ length: SCREEN_RING_N }, () => ({ x: 0, y: 0 }));
  let screenRingI = 0;
  const viewPadScratch = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const rockLocScratch = { x: 0, y: 0 };
  const hudScratch = { x: 0, y: 0 };

  function clearFxPools() {
    for (let i = 0; i < MAX_FIRE_BLASTS; i++) fireBlasts[i].active = false;
    for (let i = 0; i < MAX_HEAL_BURSTS; i++) healBursts[i].active = false;
    for (let i = 0; i < MAX_HIT_FLASHES; i++) hitFlashes[i].active = false;
    for (let i = 0; i < MAX_EFFECTS; i++) effectList[i].active = false;
    for (let i = 0; i < MAX_DEBRIS; i++) debris[i].active = false;
    for (let i = 0; i < MAX_DMG_FX; i++) dmgFx[i].active = false;
    try { mirvStages.length = 0; } catch (e) {}
    for (const p of gunWakeTrails) wakePointPool.release(p);
    gunWakeTrails.length = 0;
    for (const b of bulletShots.values()) bulletShotPool.release(b);
    bulletShots.clear();
    for (const vis of playerVisuals.values()) {
      if (!vis) continue;
      if (vis.trail) {
        for (const pt of vis.trail) trailPointPool.release(pt);
        vis.trail.length = 0;
      }
    }
    for (const trail of missileTrails.values()) {
      for (const pt of trail) missileTrailPool.release(pt);
    }
    missileTrails.clear();
  }

  // 每架飞机最近一次机关炮开火时间（枪管伸长动画?
  const gunFireAt = new Map();
  const BARREL_LEN = 12.6;
  function barrelExtOf(player) {
    const t = gunFireAt.get(player.id);
    if (!t) return 0;
    const since = performance.now() - t;
    return since < 160 ? 1 : Math.max(0, 1 - (since - 160) / 100);
  }

  function putBulletShot(id, data) {
    const b = bulletShotPool.take();
    b.id = id;
    b.oid = data.oid || 0;
    b.kind = data.kind || 0;
    b.x = data.x || 0;
    b.y = data.y || 0;
    b.vx = data.vx || 0;
    b.vy = data.vy || 0;
    b.ax = data.ax;
    b.ay = data.ay;
    b.t0 = data.t0 || 0;
    b.t0Local = data.t0Local || 0;
    b.life = data.life || 0;
    b.team = data.team || 0;
    b.own = !!data.own;
    b.dmg = data.dmg || 0;
    b.blast = data.blast || 0;
    b.style = data.style || "";
    b.ci = data.ci != null ? data.ci : 0;
    if (!b.kind && b.oid && b.style !== "ms01") gunFireAt.set(b.oid, performance.now());
    bulletShots.set(id, b);
    return b;
  }
  function dropBulletShot(id) {
    const b = bulletShots.get(id);
    if (!b) return;
    bulletShots.delete(id);
    bulletShotPool.release(b);
  }

  function spawnCraftSparks(x, y, ix, iy, countOverride) {
    let nx = ix;
    let ny = iy;
    const nlen = Math.hypot(nx, ny);
    if (nlen < 0.01) { nx = 1; ny = 0; }
    else { nx /= nlen; ny /= nlen; }
    const tx = -ny;
    const ty = nx;
    const count = countOverride || (6 + (Math.random() * 4 | 0));
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const dx = tx * side * (0.55 + Math.random() * 0.7) - nx * (0.15 + Math.random() * 0.55);
      const dy = ty * side * (0.55 + Math.random() * 0.7) - ny * (0.15 + Math.random() * 0.55);
      const dlen = Math.hypot(dx, dy) || 1;
      const spd = 160 + Math.random() * 340;
      const p = takeDebris();
      p.x = x + (Math.random() - 0.5) * 3;
      p.y = y + (Math.random() - 0.5) * 3;
      p.vx = dx / dlen * spd;
      p.vy = dy / dlen * spd;
      p.size = 0.55 + Math.random() * 1.35;
      p.life = 0.12 + Math.random() * 0.22;
      p.rot = 0;
      p.spin = 0;
      p.template = 0;
      p.color = "#fff7e8";
      p.spark = true;
      p.gib = false;
      p.stretchX = 1;
      p.stretchY = 1;
    }
  }

  const GIB_PALETTE = {
    fighter: ["#d8dde2", "#8fa0b8", "#4d5c72", "#e8eef4", "#c44b3a", "#6b7c90"],
    blade: ["#1a2428", "#2c3c42", "#4a6a68", "#7ec8b0", "#ff8a3a", "#0e1418"],
  };

  const recentBlasts = [];
  function spawnFireBlast(x, y, scale) {
    const now = performance.now();
    for (const r of recentBlasts) {
      if (now - r.t < 140 && (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y) < 320) return;
    }
    const rb = recentBlastPool.take();
    rb.x = x; rb.y = y; rb.t = now;
    recentBlasts.push(rb);
    if (recentBlasts.length > 24) recentBlastPool.release(recentBlasts.shift());
    const e = takeFireBlast();
    e.x = x;
    e.y = y;
    e.life = 0.5 + Math.random() * 0.12;
    e.size = scale;
    e.seed = Math.random() * 12;
    spawnDeathSparks(x, y, 0, 0, Math.round(28 * scale));
  }

  function popMissileBlast(x, y, scale) {
    spawnFireBlast(x, y, scale);
    // 爆炸?boom（不?hit）；主画面或导弹特写里能听到
    if (sfxAudibleAt(x, y, 160)) sfx?.playBoom?.();
  }

  function spawnHealBurst(x, y, kind) {
    const h = takeHealBurst();
    h.x = x;
    h.y = y;
    h.t0 = performance.now();
    h.kind = kind || "heal";
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 140;
      const p = takeDebris();
      p.spark = true;
      p.gib = false;
      p.stretchX = 1;
      p.stretchY = 1;
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.size = 0.8 + Math.random() * 1.6;
      p.life = 0.28 + Math.random() * 0.32;
      p.rot = 0;
      p.spin = 0;
      p.template = 0;
      p.color = Math.random() < 0.45 ? "#ffffff" : "#6dffb0";
    }
  }

  function spawnDeathSparks(x, y, vx, vy, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 380;
      const p = takeDebris();
      p.spark = true;
      p.gib = false;
      p.stretchX = 1;
      p.stretchY = 1;
      p.x = x + (Math.random() - 0.5) * 8;
      p.y = y + (Math.random() - 0.5) * 8;
      p.vx = vx * 0.35 + Math.cos(ang) * spd;
      p.vy = vy * 0.35 + Math.sin(ang) * spd;
      p.size = 0.7 + Math.random() * 1.8;
      p.life = 0.22 + Math.random() * 0.38;
      p.rot = 0;
      p.spin = 0;
      p.template = 0;
      p.color = Math.random() < 0.5 ? "#fff4c8" : "#ff9a3a";
    }
  }

  function burstCraftDeath(x, y, vx, vy, heading, kind, opts) {
    const slow = !!(opts && opts.slowMo);
    const lifeMul = slow ? 2.6 : 1;
    const spdMul = slow ? 0.42 : 1;
    const pal = GIB_PALETTE[kind] || GIB_PALETTE.fighter;
    if (!(opts && opts.silent) && sfxAudibleAt(x, y, 160)) {
      try { sfx?.playBoom?.(); } catch (e) {}
    }
    spawnFireBlast(x, y, slow ? 1.85 : 1.25);
    spawnDeathSparks(x, y, vx, vy, slow ? 72 : 52);
    spawnCraftSparks(x, y, Math.cos(heading), Math.sin(heading));
    spawnCraftSparks(x, y, -Math.cos(heading), -Math.sin(heading));
    const gibN = slow ? 28 : 18;
    const limbN = slow ? 11 : 7;
    for (let i = 0; i < gibN; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (70 + Math.random() * 220) * spdMul;
      const p = takeDebris();
      p.spark = false;
      p.gib = true;
      p.x = x + (Math.random() - 0.5) * 16;
      p.y = y + (Math.random() - 0.5) * 16;
      p.vx = vx * 0.45 * spdMul + Math.cos(ang) * spd;
      p.vy = vy * 0.45 * spdMul + Math.sin(ang) * spd;
      p.size = 2.1 + Math.random() * 4.5;
      p.stretchX = 0.7 + Math.random() * 0.8;
      p.stretchY = 0.7 + Math.random() * 0.8;
      p.life = (0.85 + Math.random() * 1.15) * lifeMul;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * (slow ? 10 : 22);
      p.template = (Math.random() * DEBRIS_TEMPLATES.length) | 0;
      p.color = pal[(Math.random() * pal.length) | 0];
    }
    for (let i = 0; i < limbN; i++) {
      const along = heading + (Math.random() - 0.5) * 1.8;
      const spd = (110 + Math.random() * 200) * spdMul;
      const p = takeDebris();
      p.spark = false;
      p.gib = true;
      p.x = x + Math.cos(along) * (6 + Math.random() * 10);
      p.y = y + Math.sin(along) * (6 + Math.random() * 10);
      p.vx = vx * 0.5 * spdMul + Math.cos(along) * spd + (Math.random() - 0.5) * 40 * spdMul;
      p.vy = vy * 0.5 * spdMul + Math.sin(along) * spd + (Math.random() - 0.5) * 40 * spdMul;
      p.size = 3.4 + Math.random() * 5.5;
      p.stretchX = 2.1 + Math.random() * 2.4;
      p.stretchY = 0.22 + Math.random() * 0.28;
      p.life = (1.05 + Math.random() * 1.25) * lifeMul;
      p.rot = along + Math.PI / 2;
      p.spin = (Math.random() - 0.5) * (slow ? 8 : 18);
      p.template = (Math.random() * DEBRIS_TEMPLATES.length) | 0;
      p.color = pal[(Math.random() * pal.length) | 0];
    }
    for (let i = 0; i < (slow ? 28 : 16); i++) {
      const ang = Math.random() * Math.PI * 2;
      const p = takeDebris();
      p.spark = true;
      p.gib = false;
      p.stretchX = 1;
      p.stretchY = 1;
      p.x = x;
      p.y = y;
      p.vx = vx * 0.3 * spdMul + Math.cos(ang) * (160 + Math.random() * 280) * spdMul;
      p.vy = vy * 0.3 * spdMul + Math.sin(ang) * (160 + Math.random() * 280) * spdMul;
      p.size = 1.1 + Math.random() * 1.3;
      p.life = (0.18 + Math.random() * 0.22) * (slow ? 3.2 : 1);
      p.rot = 0;
      p.spin = 0;
      p.template = 0;
      p.color = Math.random() < 0.5 ? "#fff4c8" : "#ff9a3a";
    }
  }

  function rockLocalToWorld(a, lx, ly) {
    const ca = Math.cos(a.rotation || 0);
    const sa = Math.sin(a.rotation || 0);
    return {
      x: a.x + lx * ca - ly * sa,
      y: a.y + lx * sa + ly * ca,
    };
  }

  function ejectRockGrains(a, lx, ly, radius, dirX, dirY) {
    const count = clamp(Math.round(radius * 2.4), 12, 34);
    const bspd = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / bspd;
    const uy = dirY / bspd;
    const ca = Math.cos(a.rotation || 0);
    const sa = Math.sin(a.rotation || 0);
    const cs = 0.5;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius;
      const llx = lx + Math.cos(ang) * d;
      const lly = ly + Math.sin(ang) * d;
      const ox = llx * ca - lly * sa;
      const oy = llx * sa + lly * ca;
      const outA = Math.atan2(oy, ox) + (Math.random() - 0.5) * 1.15;
      const spd = (45 + Math.random() * 150) * cs;
      const p = takeDebris();
      p.x = a.x + ox;
      p.y = a.y + oy;
      p.vx = (a.vx || 0) + Math.cos(outA) * spd + ux * (25 + Math.random() * 95) * cs;
      p.vy = (a.vy || 0) + Math.sin(outA) * spd + uy * (25 + Math.random() * 95) * cs;
      p.size = (1.5 + Math.random() * 2.6) * cs;
      p.life = 0.7 + Math.random() * 1.1;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 16;
      p.template = (Math.random() * DEBRIS_TEMPLATES.length) | 0;
      p.color = a.iron
        ? ["#e8eef4", "#c5d0dc", "#9aa8b4", "#d8e4f0"][(Math.random() * 4) | 0]
        : ROCK_GRAIN_COLORS[(Math.random() * ROCK_GRAIN_COLORS.length) | 0];
      p.spark = false;
    }
  }

  function spawnRockChipSmoke(a, lx, ly, radius, dirX, dirY) {
    const w = rockLocalToWorld(a, lx, ly);
    const bspd = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / bspd;
    const uy = dirY / bspd;
    const n = clamp(Math.round(radius * 1.35), 8, 18);
    for (let i = 0; i < n; i++) {
      const p = takeDmgFx();
      const ang = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.55;
      p.kind = "smoke";
      p.x = w.x + Math.cos(ang) * d;
      p.y = w.y + Math.sin(ang) * d;
      p.vx = (a.vx || 0) * 0.2 - ux * (18 + Math.random() * 40) + (Math.random() - 0.5) * 28;
      p.vy = (a.vy || 0) * 0.2 - uy * (18 + Math.random() * 40) + (Math.random() - 0.5) * 28;
      p.life = 0.45 + Math.random() * 0.7;
      p.size = 3.2 + Math.random() * 5.5 + radius * 0.08;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 2.4;
      p.hurt = 0.55 + Math.random() * 0.35;
    }
  }

  function erodeRockClient(a, lx, ly, radius) {
    if (!a || !a.grid) return 0;
    const cell = (a.extent * 2) / TOPO_G;
    const r2 = radius * radius;
    const cx0 = Math.max(0, Math.floor((lx - radius + a.extent) / cell));
    const cx1 = Math.min(TOPO_G - 1, Math.floor((lx + radius + a.extent) / cell));
    const cy0 = Math.max(0, Math.floor((ly - radius + a.extent) / cell));
    const cy1 = Math.min(TOPO_G - 1, Math.floor((ly + radius + a.extent) / cell));
    let removed = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      const lly = -a.extent + (cy + 0.5) * cell;
      for (let cx = cx0; cx <= cx1; cx++) {
        const llx = -a.extent + (cx + 0.5) * cell;
        if ((llx - lx) * (llx - lx) + (lly - ly) * (lly - ly) > r2) continue;
        const i = cy * TOPO_G + cx;
        if (a.grid[i] === 1) {
          a.grid[i] = 0;
          a.solid--;
          removed++;
        }
      }
    }
    return removed;
  }

  function weldColor(heat) {
    const h = clamp(heat, 0, 1);
    const mix = (c0, c1, t) => [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    if (h > 0.55) return mix([1.0, 0.42, 0.16], [0.92, 0.12, 0.05], (1 - h) / 0.45);
    if (h > 0.18) return mix([0.92, 0.12, 0.05], [0.38, 0.07, 0.05], 1 - (h - 0.18) / 0.37);
    return mix([0.38, 0.07, 0.05], [0.14, 0.08, 0.07], 1 - h / 0.18);
  }

  const WELD_SCAR = [0.20, 0.09, 0.07];

  function stampWeldBlob(a, lx, ly, radius, heat0) {
    if (!rockSolid(a, lx, ly)) return;
    const hot = weldColor(heat0 * 0.75);
    const cold = [
      WELD_SCAR[0] + (hot[0] - WELD_SCAR[0]) * 0.35,
      WELD_SCAR[1] + (hot[1] - WELD_SCAR[1]) * 0.35,
      WELD_SCAR[2] + (hot[2] - WELD_SCAR[2]) * 0.35,
    ];
    if (!a.scars) a.scars = [];
    a.scars.push({
      x: lx, y: ly,
      rx: Math.max(0.6, radius * (0.7 + Math.random() * 0.65)),
      ry: Math.max(0.6, radius * (0.55 + Math.random() * 0.65)),
      rot: Math.random() * Math.PI * 2,
      cold,
      heat: heat0,
      heat0,
    });
    if (a.scars.length > 64) a.scars.shift();
    if (!a.welds) a.welds = [];
    a.welds.push({ x: lx, y: ly, heat: heat0 });
    if (a.welds.length > 48) a.welds.shift();
  }

  // ?Godot _brand_metal_hit：铁陨石不挖洞，?1~2 块焊痕，先红后黑
  function brandMetalHit(a, lx, ly, radius, heat) {
    const scatter = radius * (0.35 + Math.random() * 0.8);
    const ang = Math.random() * Math.PI * 2;
    lx += Math.cos(ang) * scatter;
    ly += Math.sin(ang) * scatter;
    const blobs = 1 + (Math.random() * 2 | 0);
    for (let b = 0; b < blobs; b++) {
      const bAng = Math.random() * Math.PI * 2;
      const bOff = Math.random() * radius * 0.7;
      stampWeldBlob(a, lx + Math.cos(bAng) * bOff, ly + Math.sin(bAng) * bOff, radius * (0.35 + Math.random() * 0.6), heat == null ? 0.62 + Math.random() * 0.38 : heat);
    }
  }

  function tickMetalWelds(a, dt) {
    const welds = a.welds;
    for (let i = welds.length - 1; i >= 0; i--) {
      welds[i].heat -= dt / 2.6;
      if (welds[i].heat <= 0) welds.splice(i, 1);
    }
    if (a.scars) {
      for (const s of a.scars) if (s.heat > 0) s.heat = Math.max(0, s.heat - dt / 2.6);
    }
  }

  // cut：激光切割，铁陨石也挖掉（其它武器打铁陨石只烙焊痕）
  function addRockHole(a, lx, ly, r, dirX, dirY, silent, cut) {
    if (!a || !a.grid) return false;
    if (a.iron && cut) {
      erodeRockClient(a, lx, ly, r);
      recordIronCut(a, lx, ly, r, dirX, dirY);
      a.flash = 0.12;
      if (!silent) {
        const w = rockLocalToWorld(a, lx, ly);
        spawnCraftSparks(w.x, w.y, dirX, dirY, 2);
      }
      return true;
    }
    if (a.iron) {
      const heavy = r > (a.r || 20) * 0.3;
      brandMetalHit(a, lx, ly, heavy ? 3.6 : 2.3, silent ? 0 : undefined);
      a.vx = 0;
      a.vy = 0;
      a.spin = 0;
      if (!silent) {
        a.flash = 0.16;
        const w = rockLocalToWorld(a, lx, ly);
        spawnCraftSparks(w.x, w.y, dirX, dirY, 3 + (Math.random() * 3 | 0));
      }
      return true;
    }
    if (!a.holes) a.holes = [];
    for (const h of a.holes) {
      if ((h.x - lx) * (h.x - lx) + (h.y - ly) * (h.y - ly) < 64 && Math.abs(h.r - r) < Math.max(6, r * 0.7)) return false;
    }
    a.holes.push({ x: lx, y: ly, r });
    if (a.holes.length > 24) a.holes.shift();
    const removed = erodeRockClient(a, lx, ly, r);
    if (removed <= 0) return false;
    a.blocky = true;
    a.flash = 0.12;
    if (!ASTEROIDS_STATIC) {
      const bspd = Math.hypot(dirX, dirY) || 1;
      a.vx = (a.vx || 0) + (dirX / bspd) * (10 + r * 0.02);
      a.vy = (a.vy || 0) + (dirY / bspd) * (10 + r * 0.02);
      a.spin = (a.spin || 0) + (Math.random() - 0.5) * 0.4;
    } else {
      lockAsteroidMotion(a);
    }
    if (!silent) {
      ejectRockGrains(a, lx, ly, r, dirX, dirY);
      spawnRockChipSmoke(a, lx, ly, r, dirX, dirY);
    }
    return true;
  }

  // 同一发激光沿线的切割点串成一条槽（局部坐标），绘制时按网页版圆头槽挖?
  let laserCutSerial = 0;
  function recordIronCut(a, lx, ly, r, dirX, dirY) {
    if (!a.cuts) a.cuts = [];
    const last = a.cuts[a.cuts.length - 1];
    if (last && last.serial === laserCutSerial && Math.hypot(lx - last.x1, ly - last.y1) < r * 1.9) {
      last.x1 = lx;
      last.y1 = ly;
      return;
    }
    // 方向转到陨石局部坐标（铁陨石不转，rotation 通常?0?
    const ca = Math.cos(a.rotation || 0), sa = Math.sin(a.rotation || 0);
    let ux = dirX * ca + dirY * sa, uy = -dirX * sa + dirY * ca;
    const ul = Math.hypot(ux, uy);
    if (ul > 1e-6) { ux /= ul; uy /= ul; } else { ux = 0; uy = 0; }
    a.cuts.push({ x0: lx, y0: ly, x1: lx, y1: ly, r, ux, uy, serial: laserCutSerial });
    if (a.cuts.length > 64) a.cuts.shift();
  }

  function flushChips() {
    laserCutSerial++;
    for (const c of pendingChips) addRockHole(c.a, c.lx, c.ly, c.r, c.vx, c.vy, false, c.cut);
    pendingChips.length = 0;
  }

  const pendingSplits = [];
  const pendingSplitRm = [];
  const pendingSplitScatter = [];
  const rockShapes = new Map();

  function rememberRock(a) {
    if (a && a.pts && a.extent) rockShapes.set(a.id, { pts: a.pts, extent: a.extent });
  }

  // wx 端用 grid/pts 直接绘制，无需 mask；保留接口供本地生成岩石调用?
  // 注意：完整初始石不要?blocky，否则会走格子台阶边；打缺后再由 addRockHole ?true?
  function paintMaskFromGrid(_a) {}

  function unpackGridBits(s) {
    const g = new Uint8Array(TOPO_G * TOPO_G);
    if (!s) return g;
    const bin = atob(s);
    for (let i = 0; i < g.length; i++) {
      const b = bin.charCodeAt(i >> 3);
      if (b & (1 << (i & 7))) g[i] = 1;
    }
    return g;
  }

  function rockInkRClient(a) {
    const cell = (a.extent * 2) / TOPO_G;
    let maxD2 = 0;
    for (let cy = 0; cy < TOPO_G; cy++) {
      const ly = -a.extent + (cy + 0.5) * cell;
      for (let cx = 0; cx < TOPO_G; cx++) {
        if (a.grid[cy * TOPO_G + cx] !== 1) continue;
        const lx = -a.extent + (cx + 0.5) * cell;
        const d2 = lx * lx + ly * ly;
        if (d2 > maxD2) maxD2 = d2;
      }
    }
    return Math.max(6, Math.sqrt(maxD2) + cell * 0.85 + 2);
  }

  function gridSplitDir(grid, extent, rot) {
    let sx = 0, sy = 0, n = 0;
    const cell = (extent * 2) / TOPO_G;
    for (let cy = 0; cy < TOPO_G; cy++) {
      const ly = -extent + (cy + 0.5) * cell;
      for (let cx = 0; cx < TOPO_G; cx++) {
        if (!grid[cy * TOPO_G + cx]) continue;
        sx += -extent + (cx + 0.5) * cell;
        sy += ly;
        n++;
      }
    }
    if (!n) return { x: 0, y: 0 };
    const lx = sx / n;
    const ly = sy / n;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    const wx = lx * ca - ly * sa;
    const wy = lx * sa + ly * ca;
    const len = Math.hypot(wx, wy) || 1;
    return { x: wx / len, y: wy / len };
  }

  function flushSplits() {
    const born = performance.now();
    for (const s of pendingSplits) {
      const parent = asteroids.get(s.parentId) || rockShapes.get(s.parentId);
      const pts = parent && parent.pts;
      const extent = s.extent || (parent && parent.extent);
      if (!pts || !extent) continue;
      const grid = unpackGridBits(s.grid);
      let solid = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i]) solid++;
      const rot = Number.isFinite(s.rotation) ? s.rotation : (parent.rotation || 0);
      const dir = gridSplitDir(grid, extent, rot);
      const rock = {
        id: s.id,
        x: Number.isFinite(s.x) ? s.x : parent.x,
        y: Number.isFinite(s.y) ? s.y : parent.y,
        vx: ASTEROIDS_STATIC ? 0 : s.vx,
        vy: ASTEROIDS_STATIC ? 0 : s.vy,
        r: s.r || (parent.r || extent),
        spin: ASTEROIDS_STATIC ? 0 : s.spin,
        rotation: rot,
        pts,
        holes: [],
        flash: 0.22,
        grid,
        solid,
        solidMax: solid,
        extent,
        blocky: true, // 切开碎块直接用格子边?
        splitBorn: born,
        splitDx: dir.x,
        splitDy: dir.y,
      };
      rock.r = rockInkRClient(rock);
      // 静止：裂片留在母体位置，不做弹开
      if (ASTEROIDS_STATIC) {
        rock.splitDx = 0;
        rock.splitDy = 0;
        lockAsteroidMotion(rock);
      }
      rememberRock(rock);
      asteroids.set(s.id, rock);
    }
    const scatter = new Set(pendingSplitScatter);
    pendingSplits.length = 0;
    for (const id of pendingSplitRm) {
      const a = asteroids.get(id);
      if (!a) continue;
      if (scatter.has(id)) {
        const r = Math.max(5, (a.r || 20) * 0.62);
        ejectRockGrains(a, 0, 0, r, a.vx || 0, a.vy || 0);
        asteroids.delete(id);
      } else {
        a.fadeOut = born;
        a.vx = 0;
        a.vy = 0;
      }
    }
    pendingSplitRm.length = 0;
    pendingSplitScatter.length = 0;
  }

  function updateDebris(dt) {
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const p = debris[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) { p.active = false; continue; }
      if (p.spark) {
        p.vy += 26 * dt;
        const damp = Math.exp(-3.2 * dt);
        p.vx *= damp;
        p.vy *= damp;
      } else {
        p.vy += (p.gib ? 6 : 14) * dt;
        const damp = Math.exp((p.gib ? -0.7 : -1.7) * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    try { updateMirvStages(dt); } catch (e) {}
    for (let i = 0; i < MAX_DMG_FX; i++) {
      const p = dmgFx[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) { p.active = false; continue; }
      const damp = Math.exp(-1.1 * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  // 渲染延迟?~3 个快照间?+ 抖动余量?0Hz 世界 tick ?130ms?0Hz ?100ms?
  function computeDelay() {
    return clamp(net.interval * 3.4 + 50, 130, 240);
  }

  let socketGen = 0;
  let lastSockErr = "";
  function connect() {
    clearTimeout(reconnectTimer);
    // 微信真机 socket 路数很少：重连前必须拆掉旧连接，否则会一直「连接已断开?
    try {
      if (ws) {
        const old = ws;
        old.onopen = null;
        old.onmessage = null;
        old.onerror = null;
        old.onclose = null;
        try { old.close(); } catch (e) {}
      }
    } catch (e) {}
    ws = null;
    connected = false;
    const gen = ++socketGen;
    const protocol = location.protocol === "https:" ? "wss://" : "ws://";
    const url = (typeof GameGlobal !== "undefined" && GameGlobal.WS_URL) || (protocol + location.host);
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      if (gen !== socketGen || ws !== sock) return;
      connected = true;
      lastSockErr = "";
      fullMessage = "";
      roomFull = false;
      offlineEl.style.display = "none";
      if (fullModal) fullModal.style.display = "none";
      if (lobbyErr && /未连接|重连/.test(lobbyErr.textContent || "")) lobbyErr.textContent = "";
      try {
        sock.send(JSON.stringify({
          t: "hello",
          token: pilot.token,
          wantId: pilot.wantId || undefined,
          name: pilot.name || undefined,
          openid: pilot.openid || undefined,
          avatarUrl: pilot.avatarUrl || undefined,
          twin: hasTwinUnlock() ? 1 : undefined,
          lo: loadoutString(),
        }));
      } catch (e) {}
      // hello 发出后再补发排队中的开?进房，避免服务端尚无身份
      setTimeout(() => {
        if (gen !== socketGen || ws !== sock) return;
        flushPendingRoomAction();
        syncTwinToServer();
        syncLoadoutWithServer();
        // 仅起点也上传一次，建立服务端记录
        if (pendingLevelsPush) pushLevelsProgressToServer(pendingLevelsPush);
        syncLevelsProgressWithServer();
      }, 60);
      tryWxLogin();
      updateStatus();
    };
    sock.onmessage = (event) => {
      if (gen !== socketGen || ws !== sock) return;
      try {
        const raw = event && event.data;
        handleMessage(typeof raw === "string" ? JSON.parse(raw) : raw);
      } catch (e) {}
    };
    sock.onclose = () => {
      if (gen !== socketGen) return;
      if (ws === sock) ws = null;
      connected = false;
      if (localMatch) {
        updateStatus();
        if (offlineEl) offlineEl.style.display = "none";
        if (!matchLost) reconnectTimer = setTimeout(connect, 1200);
        return;
      }
      latestPlayers = [];
      playerCount = 0;
      entPlayers.clear();
      entMissiles.clear();
      clearFxPools();
      net.clock = null;
      net.latestSt = 0;
      pred = null;
      predErr.x = predErr.y = predErr.h = predErr.t = 0;
      play.frames.length = 0;
      play.events.length = 0;
      play.playing = false;
      play.head = 0;
      play.pose = null;
      lastPongAt = 0;
      rttSamples.length = 0;
      updateStatus();
      if (roomFull) {
        offlineEl.style.display = "none";
        if (fullModal) fullModal.style.display = "grid";
        return;
      }
      offlineEl.style.display = "grid";
      try {
        if (lastSockErr) offlineEl.textContent = "";
        else offlineEl.textContent = "";
      } catch (e) {}
      reconnectTimer = setTimeout(connect, 1600);
    };
    sock.onerror = (err) => {
      if (gen !== socketGen || ws !== sock) return;
      lastSockErr = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message).slice(0, 48) : "socket error";
      try { sock.close(); } catch (e) {}
    };
  }
  // 延后建连：先让大厅首帧画出来，避免启动期?JS 解析抢主线程
  let connectBooted = false;
  function bootConnect() {
    if (connectBooted) return;
    connectBooted = true;
    try { warmAvatarsOnBoot(); } catch (e) {}
    try { connect(); } catch (e) {}
  }
  requestAnimationFrame(() => requestAnimationFrame(bootConnect));
  setTimeout(bootConnect, 120);
  // 首帧后立刻拉头像池，不跟建连抢时?
  setTimeout(() => { try { warmAvatarsOnBoot(); } catch (e) {} }, 60);
  if (fullRetry) {
    fullRetry.addEventListener("click", () => {
      roomFull = false;
      fullMessage = "";
      if (fullModal) fullModal.style.display = "none";
      connect();
    });
  }
  offlineEl?.addEventListener("click", () => {
    try {
      offlineEl.textContent = "";
      clearTimeout(reconnectTimer);
      connect();
    } catch (e) {}
  });
  function beginMatch() {
    if (lobbyErr) lobbyErr.textContent = "";
    sendRoom("joinPublic");
  }
  let matchLoadingTimer = 0;
  let matchLoadingTipTimer = 0;
  let craftLoadingSeq = 0;
  let craftLoadingCancel = null;
  function matchTips() {
    return ["正在寻找可用对局", "正在分配阵营席位", "正在同步战场参数", "即将进入对局"];
  }
  function hideMatchLoading() {
    clearTimeout(matchLoadingTimer);
    clearInterval(matchLoadingTipTimer);
    matchLoadingTimer = 0;
    matchLoadingTipTimer = 0;
    craftLoadingCancel = null;
    try { GameGlobal.matchLoadingKind = ""; } catch (e) {}
    $("matchLoading")?.classList.remove("show");
    const cancel = $("matchLoadingCancel");
    if (cancel) cancel.style.display = "";
    const btn = $("btnMatch");
    if (btn) btn.disabled = false;
  }
  /** 进战斗前等机体图集：复用 matchLoading，避免首帧三角机闪一?*/
  function beginCraftAssetLoading(keys, onReady, opts) {
    const o = opts || {};
    const list = Array.isArray(keys) && keys.length ? keys : PLAYER_CRAFT_KEYS;
    for (let i = 0; i < list.length; i++) ensureCraftAtlasImg(normalizePlayerCraft(list[i]));
    const finish = () => {
      hideMatchLoading();
      try { onReady && onReady(); } catch (e) {}
    };
    // 已就绪：先关 loading 再进，避?show 残留
    let allReady = true;
    for (let i = 0; i < list.length; i++) {
      if (!craftAtlasIsReady(normalizePlayerCraft(list[i]))) {
        allReady = false;
        break;
      }
    }
    if (allReady) {
      finish();
      return;
    }
    const seq = ++craftLoadingSeq;
    if (lobbyErr) lobbyErr.textContent = "";
    const overlay = $("matchLoading");
    const tip = $("matchLoadingTip");
    const cancel = $("matchLoadingCancel");
    const btn = $("btnMatch");
    if (btn) btn.disabled = true;
    try { GameGlobal.matchLoadingKind = "craft"; } catch (e) {}
    if (overlay) overlay.classList.add("show");
    if (tip) tip.textContent = o.tip || "正在加载机体";
    if (cancel) cancel.style.display = o.cancelable === false ? "none" : "";
    craftLoadingCancel = () => {
      craftLoadingSeq += 1;
      hideMatchLoading();
      try { o.onCancel && o.onCancel(); } catch (e) {}
    };
    whenCraftAtlasesReady(list, () => {
      if (seq !== craftLoadingSeq) return;
      finish();
    });
  }
  function beginMatchLoading(opts) {
    if (matchLoadingTimer || craftLoadingCancel) return;
    if (lobbyErr) lobbyErr.textContent = "";
    const overlay = $("matchLoading");
    const tip = $("matchLoadingTip");
    const btn = $("btnMatch");
    if (btn) btn.disabled = true;
    try { GameGlobal.matchLoadingKind = "match"; } catch (e) {}
    if (overlay) overlay.classList.add("show");
    let tipI = 0;
    const tips = matchTips();
    if (tip) tip.textContent = tips[0];
    const waitMs = (1000 + Math.random() * 2000) | 0; // 匹配等待 1~3 ?
    const stepMs = Math.max(350, Math.floor(waitMs / tips.length));
    // 进游戏时已预热头像池；匹配前再补一点，保证够分
    ensureAvatarWarmPool(24);
      // 进局强制撕掉助战准备窗
    try {
      const keys = craftAtlasKeysForOpts(opts);
      for (let i = 0; i < keys.length; i++) ensureCraftAtlasImg(keys[i]);
    } catch (e) {}
    matchLoadingTipTimer = setInterval(() => {
      if (tipI >= tips.length - 1) {
        clearInterval(matchLoadingTipTimer);
        matchLoadingTipTimer = 0;
        return;
      }
      tipI += 1;
      if (tip) tip.textContent = tips[tipI];
    }, stepMs);
    matchLoadingTimer = setTimeout(() => {
      matchLoadingTimer = 0;
      clearInterval(matchLoadingTipTimer);
      matchLoadingTipTimer = 0;
      // 战场?startLocalMatch 里先建好；真?setPhase(playing) 前再等机体图?
      startLocalMatch(opts);
    }, waitMs);
  }
  $("btnPublic")?.addEventListener("click", () => ensureWxUserAuth(beginMatch));
  $("btnLobbySolo")?.addEventListener("click", () => {
    if (lobbyErr) lobbyErr.textContent = "";
    setLobbyView("solo");
  });
  $("btnLobbyParty")?.addEventListener("click", () => {
    if (lobbyErr) lobbyErr.textContent = "";
    setLobbyView("party");
  });
  $("btnLobbyBack")?.addEventListener("click", () => {
    if (lobbyErr) lobbyErr.textContent = "";
    setLobbyView("home");
  });
  $("btnMatch")?.addEventListener("click", () => ensureWxUserAuth(() => beginMatchLoading()));
  // 主页连点昵称 5 次：显示测试入口（本次启动有效）
  let homeNameTapN = 0;
  let homeNameTapAt = 0;
  $("homeNameBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(GameGlobal && GameGlobal.lobbyView === "home")) return;
    const now = Date.now();
    if (now - homeNameTapAt > 1200) homeNameTapN = 0;
    homeNameTapAt = now;
    homeNameTapN += 1;
    if (homeNameTapN < 5) return;
    homeNameTapN = 0;
    try { GameGlobal.testEntryOn = true; } catch (err) {}
  });
  $("btnLobbyTrain")?.addEventListener("click", () => {
    if (!(GameGlobal && GameGlobal.lobbyView === "home")) return;
    ensureWxUserAuth(() => startLocalMatch({ train: true }));
  });
  $("btnLobbyLevels")?.addEventListener("click", () => {
    if (!(GameGlobal && GameGlobal.lobbyView === "home")) return;
    // 关卡进度走服务器：必须微信授权，点「否」不能进航图
    ensureWxUserAuth(() => {
      if (!isWxUserAuthed()) {
        try { wx.showToast({ title: "提示", icon: "none" }); } catch (e) {}
        return;
      }
      if (typeof GameGlobal.openLevels === "function" && GameGlobal.openLevels()) return;
        try { wx.showToast({ title: "需要微信授权", icon: "none" }); } catch (e) {}
    }, { require: true });
  });
  $("btnLobbyAssist")?.addEventListener("click", () => {
    if (!(GameGlobal && GameGlobal.lobbyView === "home")) return;
    try {
      if (typeof GameGlobal.guardAssistAction === "function") GameGlobal.guardAssistAction();
      else if (typeof GameGlobal.openAssistStarShortageModal === "function") GameGlobal.openAssistStarShortageModal();
    } catch (e) {}
  });
  $("btnAssistStarOk")?.addEventListener("click", () => {
    try { GameGlobal.closeAssistStarShortageModal?.(); } catch (e) {}
  });
  $("btnAssistJoinCancel")?.addEventListener("click", () => {
    try { GameGlobal.closeAssistJoinModal?.(); } catch (e) {}
  });
  $("btnAssistJoinOk")?.addEventListener("click", () => {
    // 助战统一拦截
    try {
      GameGlobal.closeAssistJoinModal?.();
      if (typeof GameGlobal.guardAssistAction === "function") {
        GameGlobal.guardAssistAction();
        return;
      }
    } catch (e) {}
    const code = String($("assistCodeInput")?.value || "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) {
      try { wx.showToast({ title: "请输?位邀请码", icon: "none" }); } catch (e) {}
      return;
    }
    try { GameGlobal.closeAssistJoinModal?.(); } catch (e) {}
    ensureWxUserAuth(() => {
      try { GameGlobal.openAssistReadyModal?.(code, "", "关卡助战"); } catch (e) {}
    });
  });
  $("btnAssistReady")?.addEventListener("click", () => {
    try { GameGlobal.toggleAssistReady?.(); } catch (e) {}
  });
  $("btnAssistGarage")?.addEventListener("click", () => {
    // 未准备时可改装；改装期间先收起准备窗
    try {
      GameGlobal.closeAssistReadyModal?.(false);
      GameGlobal.openGarage?.(() => {
        GameGlobal.openAssistReadyModal?.(
          GameGlobal.__assistGuestMeta?.code || assistGuestCodeFallback(),
          GameGlobal.__assistGuestMeta?.levelId || "",
          GameGlobal.__assistGuestMeta?.title || "关卡助战"
        );
      }, true);
    } catch (e) {}
  });
  function assistGuestCodeFallback() {
    try { return String(GameGlobal.assistGuestCode || roomCode || "").replace(/\D/g, "").slice(0, 4); } catch (e) { return ""; }
  }
  $("btnAssistLeave")?.addEventListener("click", () => {
    try { GameGlobal.closeAssistReadyModal?.(true); } catch (e) {}
  });
  // 机库「试飞」：带改装方案进训练场，退出后回到机库
  GameGlobal.startTrainWithLoadout = (lo) => {
    if (phase === "playing") return false;
    const main = TRAIN_MAINS.includes(lo && lo.slots && lo.slots[0]) ? lo.slots[0] : "gun";
    const sub = TRAIN_SUBS_ALL.includes(lo && lo.slots && lo.slots[1]) ? lo.slots[1] : "missile";
    const engine = lo && lo.engine === "twin" ? "twin" : "single";
    const craft = normalizePlayerCraft(lo && lo.craft);
    startLocalMatch({ train: true, loadout: { main, sub, engine, craft } });
    trainFromGarage = true;
    return true;
  };
  // 关卡模式?敌机 / 2母舰 / 3地雷 / 4穿越火线 / 5断板卫星
  function levelToastTitle(col) {
    if (col === 5) return "第5关 · 断板抓星";
    if (col === 4) return "??· 穿越火线";
    if (col === 3) return "??· 拆除空中地雷";
    if (col === 2) return "??· 打爆母舰过关";
    return "??· 干爆敌机过关";
  }
  function isPlayableLevelCol(col) {
    return col === 1 || col === 2 || col === 3 || col === 4 || col === 5;
  }
  GameGlobal.startLevelRun = (node) => {
    if (phase === "playing") return false;
    const col = node && Number(node.col);
    if (!isPlayableLevelCol(col)) {
      try { wx.showToast({ title: "后续关卡开发中", icon: "none", duration: 1600 }); } catch (e) {}
      return false;
    }
    hideLevelFailModal();
    try { hideLevelWinModal(); } catch (e) {}
    try {
      GameGlobal.levelFailNode = {
        id: node && node.id,
        col,
        title: (node && node.title) || ("第" + col + "关"),
        type: (node && node.type) || "encounter",
      };
    } catch (e) {}
    levelFromLevels = true;
    startLocalMatch({ level: true, nodeId: node && node.id, levelCol: col });
    try {
      wx.showToast({ title: levelToastTitle(col), icon: "none", duration: 1800 });
    } catch (e) {}
    return true;
  };
  $("matchLoadingCancel")?.addEventListener("click", () => {
    if (craftLoadingCancel) {
      try { craftLoadingCancel(); } catch (e) {}
      return;
    }
    hideMatchLoading();
    destroyWxUserInfoBtn();
    closeAuthModal();
    wxAuthBusy = false;
    wxAuthPending = null;
    wxAuthRequire = false;
  });
  $("btnAuthYes")?.addEventListener("click", () => {
    if (!wxAuthBusy) return;
    beginWxAuthorizeFlow();
  });
  $("btnAuthNo")?.addEventListener("click", () => {
    if (!wxAuthBusy) return;
    declineWxAuthorizeAndContinue();
  });
  function toastLobby(msg) {
    const text = String(msg || "").trim();
    if (!text) return;
    if (lobbyErr) lobbyErr.textContent = text;
    try {
      if (typeof wx !== "undefined" && typeof wx.showToast === "function") {
        wx.showToast({ title: text.slice(0, 14), icon: "none", duration: 1600 });
      }
    } catch (e) {}
  }
  let createRoomWatchTimer = 0;
  function clearCreateRoomWatch() {
    if (createRoomWatchTimer) {
      clearTimeout(createRoomWatchTimer);
      createRoomWatchTimer = 0;
    }
  }
  function doCreateRoom() {
    clearCreateRoomWatch();
    wantCreateAfterAuth = false;
    ensureRandomPilotName();
    const dur = clamp(Math.round(Number($("createDur")?.value || $("matchDur")?.value) || 300), 30, 3600);
    let teamsRaw = Number($("teamCount")?.value);
    if (!Number.isFinite(teamsRaw)) {
      try { teamsRaw = Number(document.getElementById("teamCount")?.value); } catch (e) {}
    }
    const teams = clamp(Math.round(teamsRaw || 2), 2, 2);
    let perTeamRaw = Number($("perTeam")?.value);
    if (!Number.isFinite(perTeamRaw)) {
      try { perTeamRaw = Number(document.getElementById("perTeam")?.value); } catch (e) {}
    }
    const perTeam = clamp(Math.round(perTeamRaw || 4), 1, 4);
    lastWaitTeamCap = perTeam;
    if (lobbyErr) lobbyErr.textContent = "";
    // 先排队，再发；即便本?send 异步失败，重连后仍会 flush 建房（不弹「正在创建」）
    pendingRoomAction = { t: "create", dur, teams, perTeam, teamCap: perTeam };
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "name", name: pilot.name, avatarUrl: pilot.avatarUrl || undefined }));
      }
    } catch (e) {}
    const ok = sendRoom("create", { dur, teams, perTeam, teamCap: perTeam });
    if (!ok) toastLobby("网络已断开，正在重连");
    createRoomWatchTimer = setTimeout(() => {
      createRoomWatchTimer = 0;
      if (phase === "waiting" && roomCode) return;
      try {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 120);
      } catch (e) {
        try { connect(); } catch (err) {}
      }
      createRoomWatchTimer = setTimeout(() => {
        createRoomWatchTimer = 0;
        if (phase === "waiting" && roomCode) return;
        toastLobby("网络异常，请再点一");
      }, 3200);
    }, 2800);
  }
  function doJoinRoom(code) {
    wantJoinAfterAuth = "";
    toastLobby("正在加入房间");
    pendingRoomAction = { t: "join", code };
    const ok = sendRoom("join", { code });
    if (!ok) toastLobby("未连接服务器，正在重连");
  }
  function requestCreateRoom() {
    try { closeHistoryModal(); closeSettingsModal(); } catch (e) {}
    // 未授权只弹授权窗；授权完成后直接建房，全程不弹「正在创建?
    if (!isWxUserAuthed()) {
      clearCreateRoomWatch();
      wantCreateAfterAuth = true;
      if (lobbyErr) lobbyErr.textContent = "";
      try { wx.hideToast && wx.hideToast(); } catch (e) {}
    }
    ensureWxUserAuth(() => doCreateRoom());
  }
  function requestJoinRoom() {
    const code = String($("roomCodeInput")?.value || "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) {
      toastLobby("请输?位房");
      return;
    }
    try { closeHistoryModal(); closeSettingsModal(); } catch (e) {}
    if (!isWxUserAuthed()) wantJoinAfterAuth = code;
    ensureWxUserAuth(() => doJoinRoom(code));
  }
  $("btnCreate")?.addEventListener("click", () => requestCreateRoom());
  $("btnJoin")?.addEventListener("click", () => requestJoinRoom());
  function kickWaitMember(target) {
    if (!iAmHost || phase !== "waiting") return;
    if (!target || typeof target !== "object") return;
    if (target.you || target.host) return;
    const payload = {
      name: String(target.name || ""),
      team: clamp(Math.round(Number(target.team) || 0), 0, 7),
      bot: !!target.bot,
    };
    if (target.id != null) payload.id = target.id;
    sendRoom("kick", payload);
    // 乐观剔除：下一?room 快照会校?
    const key = target.key;
    let removed = false;
    lastWaitMembers = lastWaitMembers.filter((u) => {
      if (!u || u.you || u.host) return true;
      let drop = false;
      if (key && u.key === key) drop = true;
      else if (target.id != null && u.id != null && u.id === target.id) drop = true;
      else if (
        !key && target.id == null
        && String(u.name || "") === payload.name
        && (Number(u.team) || 0) === payload.team
        && !!u.bot === payload.bot
      ) drop = true;
      if (drop) removed = true;
      return !drop;
    });
    if (removed) {
      waitTipText = "";
      publishWaitRoomState("");
    }
  }
  function requestWaitTeam(team) {
    if (phase !== "waiting" || waitRoomPublic) return;
    const t = clamp(Math.round(Number(team) || 0), 0, Math.max(1, lastWaitTeams || 2) - 1);
    if (t === myTeam) return;
    let n = 0;
    for (const u of lastWaitMembers) {
      if ((u.team | 0) === t) n++;
    }
    const cap = clamp(Math.round(Number(lastWaitTeamCap) || 4), 1, 4);
    if (n >= cap) {
      toastLobby(`该阵营已满（最?{cap}人）`);
      return;
    }
    waitTipText = "";
    publishWaitRoomState("");
    sendRoom("team", { team: t });
  }
  try {
    GameGlobal.requestCreateRoom = requestCreateRoom;
    GameGlobal.requestJoinRoom = requestJoinRoom;
    GameGlobal.requestWaitTeam = requestWaitTeam;
    GameGlobal.kickWaitMember = kickWaitMember;
  } catch (e) {}
  $("roomCodeInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btnJoin")?.click();
  });
  btnStart?.addEventListener("click", () => {
    if (!iAmHost) return;
    const teams = Math.max(2, lastWaitTeams || 0);
    const counts = new Array(teams).fill(0);
    for (const u of lastWaitMembers) {
      const t = clamp(Math.round(Number(u.team) || 0), 0, teams - 1);
      counts[t]++;
    }
    const empty = counts.findIndex((n) => n <= 0);
    if (empty >= 0) {
      waitTipText = "";
      publishWaitRoomState("");
      toastLobby("阵营为空无法开");
      return;
    }
    waitTipText = "";
    publishWaitRoomState("");
    sendRoom("start");
  });
  $("btnRally")?.addEventListener("click", () => {
    if (!iAmHost) return;
    waitTipText = "";
    lastWaitRallying = true;
    waitRallyDone = false;
    try { ensureAvatarWarmPool(32); } catch (e) {}
    showRallyLoadingToast();
    publishWaitRoomState("");
    sendRoom("rally");
  });
  $("btnInvite")?.addEventListener("click", () => shareInviteRoom());
  function openLeaveConfirmModal() {
    const m = $("leaveConfirmModal");
    if (m) m.style.display = "grid";
  }
  function closeLeaveConfirmModal() {
    const m = $("leaveConfirmModal");
    if (m) m.style.display = "none";
  }
  function confirmHostLeaveRoom() {
    closeLeaveConfirmModal();
    hideSummary();
    waitTipText = "";
    hideRallyLoadingToast(false);
    lastWaitRallying = false;
    waitRallyDone = false;
    sendRoom("leave", { dissolve: true });
  }
  $("btnWaitLeave")?.addEventListener("click", () => {
    if (phase === "waiting" && iAmHost && !publicBrawl) {
      openLeaveConfirmModal();
      return;
    }
    closeLeaveConfirmModal();
    hideSummary();
    waitTipText = "";
    hideRallyLoadingToast(false);
    lastWaitRallying = false;
    waitRallyDone = false;
    sendRoom("leave");
  });
  $("btnLeaveConfirmYes")?.addEventListener("click", () => confirmHostLeaveRoom());
  $("btnLeaveConfirmNo")?.addEventListener("click", () => closeLeaveConfirmModal());
  $("btnSummaryOk")?.addEventListener("click", hideSummary);
  $("btnSummaryNext")?.addEventListener("click", () => {
    const st = (typeof GameGlobal !== "undefined" && GameGlobal.summaryState) || null;
    if (!st) return;
    st.page = st.page === 2 ? 1 : 2;
  });
  gearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuModal) menuModal.style.display = "grid";
  });
  $("btnCancel")?.addEventListener("click", () => {
    if (menuModal) menuModal.style.display = "none";
  });
  $("btnLeave")?.addEventListener("click", () => {
    if (menuModal) menuModal.style.display = "none";
    hideSummary();
    if (localMatch) {
      endLocalMatch(false);
      return;
    }
    sendRoom("leave");
  });
  const nameGear = $("nameGear");
  const nameModal = $("nameModal");
  const nameInput = $("nameInput");
  const SFX_MUTE_KEY = "papa.sfx.muted";
  function syncSfxMuteUi() {
    const on = !!(sfx && sfx.isMuted && sfx.isMuted());
    try { GameGlobal.sfxMuted = on; } catch (e) {}
    try { localStorage.setItem(SFX_MUTE_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function applySavedSfxMute() {
    let want = false;
    try { want = localStorage.getItem(SFX_MUTE_KEY) === "1"; } catch (e) {}
    try { sfx?.setMuted?.(want); } catch (e) {}
    syncSfxMuteUi();
  }
  applySavedSfxMute();
  function openNameModal() {
    if (phase === "playing") return;
    if (nameInput) nameInput.value = pilot.name || "";
    if (nameModal) nameModal.style.display = "grid";
    nameInput?.focus();
  }
  function closeNameModal() {
    if (nameModal) nameModal.style.display = "none";
  }
  function saveNameFromModal() {
    const name = clipName(nameInput ? nameInput.value : "");
    if (!name) return;
    pilot.name = name;
    savePilotName(name);
    applyMySpeedTier(speedTierOfName(name));
    sendRoom("name", { name });
    closeNameModal();
  }
  const settingsModal = $("settingsModal");
  function openSettingsModal() {
    if (phase === "playing") return;
    if (settingsModal) settingsModal.style.display = "grid";
    syncSfxMuteUi();
  }
  function closeSettingsModal() {
    if (settingsModal) settingsModal.style.display = "none";
  }
  // 主页设置：打开弹窗改静音；游戏?gearBtn 仍是原菜单，不动
  nameGear?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettingsModal();
  });
  $("btnMuteToggle")?.addEventListener("click", () => {
    try { sfx?.unlock?.(); } catch (err) {}
    try {
      if (sfx && typeof sfx.toggleMute === "function") sfx.toggleMute();
      else if (sfx && typeof sfx.setMuted === "function") sfx.setMuted(!sfx.isMuted?.());
    } catch (err) {}
    syncSfxMuteUi();
    if (!sfx?.isMuted?.()) sfx?.playSelect?.();
  });
  $("btnSettingsClose")?.addEventListener("click", closeSettingsModal);
  const historyModal = $("historyModal");
  function openHistoryModal() {
    if (phase === "playing") return;
    if (historyModal) historyModal.style.display = "grid";
    requestHistory();
  }
  function closeHistoryModal() {
    if (historyModal) historyModal.style.display = "none";
  }
  // 个人中心：历史对?/ 战果统计 / 武器改装
  const profileHub = $("profileHub");
  const statsModal = $("statsModal");
  function openProfileHub() {
    if (phase === "playing") return;
    if (historyModal) historyModal.style.display = "none";
    if (statsModal) statsModal.style.display = "none";
    if (profileHub) profileHub.style.display = "grid";
    requestHistory();
  }
  function closeProfileHub() {
    if (profileHub) profileHub.style.display = "none";
  }
  $("btnHubClose")?.addEventListener("click", closeProfileHub);
  $("btnHubHistory")?.addEventListener("click", () => {
    closeProfileHub();
    openHistoryModal();
  });
  $("btnHubStats")?.addEventListener("click", () => {
    closeProfileHub();
    if (statsModal) statsModal.style.display = "grid";
    requestHistory();
  });
  $("btnHubGarage")?.addEventListener("click", () => {
    if (phase === "playing") return;
    if (typeof GameGlobal.openGarage === "function" && GameGlobal.openGarage(openProfileHub)) {
      closeProfileHub();
      return;
    }
    try { wx.showToast({ title: "武器改装加载失败", icon: "none" }); } catch (err) {}
  });
  $("btnStatsClose")?.addEventListener("click", openProfileHub);
  $("profileBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 已授权：打开个人中心；未授权：跳过确认弹窗，直接唤起微信授权
    if (isWxUserAuthed() && isValidWxNick(pilot.name)) {
      openProfileHub();
      return;
    }
    const afterAuth = () => {
      if (isWxUserAuthed() && isValidWxNick(pilot.name)) openProfileHub();
    };
    if (wxAuthBusy) {
      wxAuthPending = afterAuth;
      return;
    }
    wxAuthBusy = true;
    wxAuthPending = afterAuth;
    destroyWxUserInfoBtn();
    beginWxAuthorizeFlow();
  });
  // 主页头像连点 5 下：解锁双发引擎
  let homeAvatarTapN = 0;
  let homeAvatarTapAt = 0;
  $("homeAvatarBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(isWxUserAuthed() && GameGlobal && GameGlobal.lobbyView === "home")) return;
    const now = Date.now();
    if (now - homeAvatarTapAt > 1200) homeAvatarTapN = 0;
    homeAvatarTapAt = now;
    homeAvatarTapN += 1;
    if (homeAvatarTapN < 5) return;
    homeAvatarTapN = 0;
    grantTwinEngine(true);
  });
  $("btnHistoryClose")?.addEventListener("click", openProfileHub);
  $("btnNameSave")?.addEventListener("click", saveNameFromModal);
  $("btnNameCancel")?.addEventListener("click", closeNameModal);
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveNameFromModal();
    if (e.key === "Escape") closeNameModal();
  });

  function handleMessage(m) {
    if (localMatch) {
      // 匹配局本地演算：忽略对战快照，但必须收战绩/鉴权/助战回包
      if (m.t === "pong") {
        matchHbAt = performance.now();
        onPong(m);
        return;
      }
      if (m.t === "welcome") {
        matchHbAt = performance.now();
        return;
      }
      if (
        m.t === "assistRoom" || m.t === "assistGo" || m.t === "assistErr" || m.t === "assistLobby"
        || m.t === "assistSnap" || m.t === "assistMine" || m.t === "assistFail"
      ) {
        // 落到下方 switch，不 early-return
      } else if (
        m.t !== "history" && m.t !== "wxAuth" && m.t !== "loadout" && m.t !== "levelsProgress"
        && m.t !== "garageAccess" && m.t !== "garageBuy" && m.t !== "garageInviteHelp"
      ) {
        return;
      }
    }
    switch (m.t) {
      case "welcome": onWelcome(m); break;
      case "loadout": onLoadoutMsg(m); break;
      case "garageAccess": onGarageAccessMsg(m); break;
      case "garageBuy": onGarageBuyMsg(m); break;
      case "garageInviteHelp": onGarageInviteHelpMsg(m); break;
      case "lobby":
        resetWorldClient();
        try { closeLeaveConfirmModal(); } catch (e) {}
        if (lobbyErr && !/解散/.test(lobbyErr.textContent || "")) lobbyErr.textContent = "";
        setPhase("lobby");
        if (pendingJoinCode) {
          if (String(inviteJoinSent).startsWith("leave:")) inviteJoinSent = "";
          tryJoinInviteRoom();
        }
        break;
      case "room":
        clearCreateRoomWatch();
        clearPendingRoomAction({ create: 1, join: 1, joinPublic: 1 });
        wantCreateAfterAuth = false;
        wantJoinAfterAuth = "";
        if (lobbyErr) lobbyErr.textContent = "";
        try {
          // 新房间清掉上一房间的机器人头像映射
          if (m && m.code && String(m.code) !== String(roomCode || "")) clearRallyBotAvatars();
          renderWait(m);
          // 助战回退租房：只取房号，不进普通等待房界面
          if (GameGlobal.assistHostMode && (assistViaMatchRoom || !assistCode || assistCreatePending)) {
            applyAssistRoomFromMatch(m);
            publishAssistState();
            break;
          }
          if (GameGlobal.assistHostMode && assistViaMatchRoom) {
            publishAssistState();
            break;
          }
          if (GameGlobal.assistGuestMode) {
            assistViaMatchRoom = true;
            assistCode = String(m.code || roomCode || "").replace(/\D/g, "").slice(0, 4);
            publishAssistState();
            // 已开?loading 中：绝不再把准备弹窗捞回?
            if (assistLevelBooting || assistCoopMode || phase === "playing") {
              try {
                const modal = $("assistReadyModal");
                if (modal) modal.style.display = "none";
              } catch (err) {}
              break;
            }
            phase = "waiting";
            document.documentElement.classList.remove("ingame");
            if (waitingEl) waitingEl.style.display = "none";
            if (lobbyEl) lobbyEl.style.display = "grid";
            try {
              GameGlobal.lobbyView = "home";
              GameGlobal.levelsOpen = false;
            } catch (err) {}
            try {
              const modal = $("assistReadyModal");
              if (modal && modal.style.display === "none" && typeof GameGlobal.openAssistReadyModal === "function") {
                GameGlobal.openAssistReadyModal(assistCode, "", "关卡助战");
              }
            } catch (err) {}
            break;
          }
          setPhase("waiting");
        } catch (e) {
          // 保底：即便渲染异常也要切到等待房
          try { setPhase("waiting"); } catch (err) {}
          toastLobby("已进入房");
        }
        break;
      // —?关卡助战回包（与 room/go 分离）—?
      case "assistRoom": {
        clearAssistCreateWatch();
        assistCreatePending = null;
        assistCreateTries = 0;
        try { GameGlobal.assistCreateFailed = false; } catch (e) {}
        assistCode = String(m.code || "").replace(/\D/g, "").slice(0, 4);
        assistMembers = Array.isArray(m.members) ? m.members.slice() : [];
        publishAssistState();
        try {
          if (m.youHost) {
            GameGlobal.assistHostMode = true;
            GameGlobal.levelsOpen = true;
            if (m.levelId || m.levelTitle) {
              GameGlobal.assistHostNode = Object.assign({}, GameGlobal.assistHostNode || {}, {
                id: m.levelId || (GameGlobal.assistHostNode && GameGlobal.assistHostNode.id) || "",
                title: m.levelTitle || (GameGlobal.assistHostNode && GameGlobal.assistHostNode.title) || "关卡助战",
                col: m.levelCol || (GameGlobal.assistHostNode && GameGlobal.assistHostNode.col) || 0,
              });
            }
          } else {
            GameGlobal.assistGuestMode = true;
            try {
              const modal = $("assistReadyModal");
              if (modal && modal.style.display === "none" && typeof GameGlobal.openAssistReadyModal === "function") {
                GameGlobal.openAssistReadyModal(assistCode, m.levelId || "", m.levelTitle || "关卡助战");
              }
            } catch (e) {}
          }
        } catch (e) {}
        break;
      }
      case "assistGo": {
        try {
          if (GameGlobal.assistGuestMode || (!GameGlobal.assistHostMode && assistCode)) {
            onAssistLevelGoMsg(m);
          }
        } catch (e) {}
        break;
      }
      case "assistSnap": {
        applyAssistSnap(m);
        break;
      }
      case "assistMine": {
        applyAssistMineMsg(m);
        break;
      }
      case "assistFail": {
        try { triggerAssistLevelFail(true); } catch (e) {}
        break;
      }
      case "assistErr": {
        const tip = m.msg || "助战失败";
        try { wx.showToast({ title: String(tip).slice(0, 16), icon: "none" }); } catch (e) {}
        if (m.code === "dissolved" || m.code === "missing") {
          try { GameGlobal.closeAssistReadyModal?.(false); } catch (e) {}
          assistCode = "";
          assistMembers = [];
          publishAssistState();
          try {
            GameGlobal.assistGuestMode = false;
            GameGlobal.assistHostMode = false;
          } catch (e) {}
        }
        break;
      }
      case "assistLobby": {
        assistCode = "";
        assistMembers = [];
        publishAssistState();
        try {
          GameGlobal.assistGuestMode = false;
          GameGlobal.assistHostMode = false;
        } catch (e) {}
        break;
      }
      case "go":
        // 助战：与多人开房相同收?go，先 3 ?loading 再进服务器对局
        if (GameGlobal.assistGuestMode || GameGlobal.assistHostMode || (m && m.assistLevel)) {
          try { beginAssistRoomGoLoading(m); } catch (e) {}
          break;
        }
        clearRallyBotAvatars();
        beginCraftAssetLoading(PLAYER_CRAFT_KEYS, () => {
          setPhase("playing");
          renderMatchTimer();
        }, { tip: "正在加载机体", cancelable: false });
        break;
      case "ended":
        clearRallyBotAvatars();
        resetWorldClient();
        roomCode = "";
        iAmHost = false;
        publicBrawl = false;
        // 服务端已解散房间：结算期间不画大厅，点返回主页再?lobby
        roomCode = "";
        iAmHost = false;
        if (waitingEl) waitingEl.style.display = "none";
        if (lobbyEl) lobbyEl.style.display = "none";
        phase = "lobby";
        document.documentElement.classList.remove("ingame");
        recordLocalHistory(m.board, "room");
        renderSummary(m.board, "本局结算");
        break;
      case "err":
        clearCreateRoomWatch();
        clearPendingRoomAction({ create: 1, join: 1, joinPublic: 1, start: 1, rally: 1 });
        if (pendingJoinCode && inviteJoinSent === pendingJoinCode) inviteJoinSent = "";
        {
          const msg = m.msg || "无法加入";
          const tip = m.code === "emptyTeam" || /阵营为空/.test(msg)
            ? "阵营为空无法开"
            : (m.code === "teamFull" || /阵营已满/.test(msg)
              ? `该阵营已满（最?{clamp(Math.round(Number(lastWaitTeamCap) || 4), 1, 4)}人）`
              : (m.code === "kicked" || /移出房间|踢出/.test(msg)
                ? "你已被房主移出房"
                : (m.code === "dissolved" || /解散/.test(msg)
                  ? "房主已解散房"
                  : (/not found|missing/i.test(msg) ? "房间不存在或已解" : msg))));
          waitTipText = "";
          if (phase === "waiting") publishWaitRoomState("");
          toastLobby(tip);
        }
        break;
      case "r": onRoster(m); break;
      case "u": onStatus(m); break;
      case "full":
        roomFull = true;
        fullMessage = "当前人数已满";
        if (fullDetail) fullDetail.textContent = `房间上限 ${m.max || 20} 人`;
        if (fullModal) fullModal.style.display = "grid";
        offlineEl.style.display = "none";
        updateStatus();
        break;
      case "s": onSnapshot(m); break;
      case "e": onEvents(m); break;
      case "a": onAsteroidEvents(m); break;
      case "pong": onPong(m); break;
      case "wxAuth":
        if (m.ok && m.openid) {
          saveWxOpenId(m.openid);
          syncWxProfileToGlobal();
          // 补发 hello，确保服务端 hello 会话也挂?openid
          try {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                t: "hello",
                token: pilot.token,
                wantId: pilot.wantId || undefined,
                name: pilot.name || undefined,
                openid: pilot.openid || undefined,
                avatarUrl: pilot.avatarUrl || undefined,
                twin: hasTwinUnlock() ? 1 : undefined,
                lo: loadoutString(),
              }));
            }
          } catch (e) {}
          syncTwinToServer();
          syncLoadoutWithServer();
          if (pendingLevelsPush) pushLevelsProgressToServer(pendingLevelsPush);
          syncLevelsProgressWithServer();
          syncGarageAccessWithServer();
        }
        break;
      case "levelsProgress":
        try { onLevelsProgressMsg(m); } catch (e) {}
        break;
      case "history":
        historyLoading = false;
        try {
          const serverRows = m.ok && Array.isArray(m.rows) ? m.rows : [];
          const rows = mergeHistory(serverRows, loadLocalHistory());
          if (m.ok) saveLocalHistory(rows);
          if (m.stats && typeof m.stats === "object") {
            GameGlobal.playerStats = m.stats;
            try { localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(m.stats)); } catch (err) {}
          }
          GameGlobal.historyRows = rows;
          GameGlobal.historyTip = rows.length
            ? ""
            : (m.ok ? "暂无完整对局记录（中途退出不计入" : "战绩加载失败");
        } catch (e) {}
        break;
    }
  }

  function onWelcome(m) {
    // 单人匹配进行中：忽略服务?welcome，避?myId 被改掉导致结算认不出「我?
    if (localMatch) return;
    try { flushInviteHelpPending(); } catch (e) {}
    pushSpeedLeverMax();
    myId = m.id;
    pilot.wantId = m.id;
    savePilotId(m.id);
    publicBrawl = !!m.pub;
    if (Number.isFinite(m.mh)) applyServerMaxHp(m.mh);
    if (Number.isFinite(m.maxSpd)) applyServerMaxSpeed(m.maxSpd);
    if (Number.isFinite(m.mySpd)) applyMySpeedTier(m.mySpd);
    else applyMySpeedTier(speedTierOfName(pilot.name));
    if (Number.isFinite(m.gm)) gunAmmoMax = clamp(Number(m.gm), GUN_AMMO_MAX, GUN_AMMO_HARD * 2);
    if (Number.isFinite(m.ga)) gunAmmo = clamp(Number(m.ga), 0, gunAmmoMax);
    if (Number.isFinite(m.ma)) missileAmmo = clamp(Number(m.ma), 0, MISSILE_AMMO_MAX);
    renderAmmo();
    myKills = Array.isArray(m.kd) ? (m.kd[0] || 0) : 0;
    myDeaths = Array.isArray(m.kd) ? (m.kd[1] || 0) : 0;
    renderKd();
    if (Number.isFinite(m.world) && m.world > 0) WORLD_LIMIT = m.world;
    posScale = Math.pow(10, m.prec ?? 0);
    if (Number.isFinite(m.frame) && m.frame > 0) FRAME_MS = m.frame;
    play.frames.length = 0;
    play.events.length = 0;
    play.playing = false;
    play.head = 0;
    play.pose = null;
    net.interval = FRAME_MS;
    net.delay = computeDelay();
    net.clock = null;
    net.latestSt = 0;
    roster.clear();
    playerStatus.clear();
    for (const r of m.roster || []) {
      const team = normalizeTeamIndex(r[4]);
      const color = (team != null ? TEAM_COLORS[team % TEAM_COLORS.length] : null) || r[2];
      const spd = clampSpeedTier(r[5] != null ? r[5] : speedTierOfName(r[1]));
      roster.set(r[0], {
        name: r[1], color, team, spd,
        craft: normalizePlayerCraft(r[6]),
      });
      if (r[3] !== undefined) playerStatus.set(r[0], statusOf(r[3]));
      if (r[0] === myId) {
        if (team != null) myTeam = team;
        applyMySpeedTier(spd);
      }
    }
    asteroids.clear();
    for (const a of m.ast || []) setAsteroid(a);
    applyMedkit(m.pk);
    factionPads = Array.isArray(m.pads) ? m.pads : [];
    if (Number.isFinite(m.te) && Number(m.te) > 0) {
      matchEndAt = Number(m.te);
      matchLeft = Math.max(0, (matchEndAt - Date.now()) / 1000);
    } else if (Number.isFinite(m.tl)) setMatchDeadline(Number(m.tl));
    else clearMatchDeadline();
    renderMatchTimer();
    entPlayers.clear();
    entMissiles.clear();
    entMotherships.clear();
    mothershipBase.clear();
    clearFxPools();
    latestPlayers = [];
    for (const s of m.ms || []) {
      const base = { x: s[1] / 10, y: s[2] / 10, h: s[3] / 100 };
      mothershipBase.set(s[0], base);
      pushSample(entMotherships, s[0], m.st, base.x, base.y, base.h, { turret: s[4] / 100, shotsLeft: s[5], cd: s[6] / 10 });
    }
    updateStatus();
    const skins = PLAYER_CRAFT_KEYS.slice();
    try {
      for (const r of m.roster || []) {
        const c = normalizePlayerCraft(r[6]);
        if (c && skins.indexOf(c) < 0) skins.push(c);
      }
    } catch (e) {}
    beginCraftAssetLoading(skins, () => {
      setPhase("playing");
      renderMatchTimer();
    }, { tip: "正在加载机体", cancelable: false });
  }

  function onRoster(m) {
    for (const r of m.add || []) {
      const team = normalizeTeamIndex(r[4]);
      const color = (team != null ? TEAM_COLORS[team % TEAM_COLORS.length] : null) || r[2];
      const spd = clampSpeedTier(r[5] != null ? r[5] : speedTierOfName(r[1]));
      roster.set(r[0], {
        name: r[1], color, team, spd,
        craft: normalizePlayerCraft(r[6]),
      });
      if (r[3] !== undefined) playerStatus.set(r[0], statusOf(r[3]));
      if (r[0] === myId) {
        if (team != null) myTeam = team;
        applyMySpeedTier(spd);
      }
    }
    for (const id of m.rm || []) {
      roster.delete(id);
      playerStatus.delete(id);
      entPlayers.delete(id);
      playerVisuals.delete(id);
    }
    updateStatus();
  }

  function onStatus(m) {
    if (!m.u) return;
    for (const part of m.u.split(";")) {
      const f = part.split(",");
      const id = +f[0];
      const st = statusOf(+f[1]);
      const prev = playerStatus.get(id);
      playerStatus.set(id, st);
      // 匹配/开房：自己刚复??油门归零，需自己加?
      if (id === myId && prev && prev.respawn > 0 && st && !(st.respawn > 0)) {
        pushSpeedLeverIdle();
      }
      // 助战：真人进入重?坠机??双方失败
      if ((assistCoopMode || GameGlobal.assistCoopPlaying || GameGlobal.assistHostMode || GameGlobal.assistGuestMode)
        && st && (st.hp <= 0 || st.respawn > 0)) {
        if (!prev || !(prev.respawn > 0) || (prev.hp > 0 && st.hp <= 0)) {
          noteAssistAllyDown(id);
        }
      }
    }
  }

  // 玩家元组（服务端 v3）：id,x,y,航向°,油门(0-9),s
  // s = ((hp*4 + flags) << 4) | respawn(1/6s)
  function statusOf(s) {
    return {
      gear: (s >> 4) & 1 ? "R" : "F",
      brake: ((s >> 4) & 2) !== 0,
      hp: s >> 6,
      respawn: (s & 15) / 5,
    };
  }

  // ?中距：id,x,y,航向°（hp/档位等低频状态走 "u" 变更消息?
  // 坐标按服务器 prec 放大为整数传输，这里还原成世界单?
  let posScale = 1;
  function parseNear(str) {
    const out = [];
    if (!str) return out;
    for (const part of str.split(";")) {
      const f = part.split(",");
      const id = +f[0];
      const x = +f[1] / posScale;
      const y = +f[2] / posScale;
      const heading = +f[3] * Math.PI / 1800;
      if (!Number.isFinite(id) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(heading)) continue;
      out.push({
        id,
        x,
        y,
        heading,
        thr: f[4] !== undefined ? clamp(+f[4] / 9, 0, 1) : 0,
      });
    }
    return out;
  }

  function pushPlayer(st, p) {
    pushSample(entPlayers, p.id, st, p.x, p.y, p.heading, null);
  }

  // 远距只给 id/x/y/朝向
  function pushFar(st, str) {
    for (const part of str.split(";")) {
      const f = part.split(",");
      pushSample(entPlayers, +f[0], st, +f[1] / posScale, +f[2] / posScale, +f[3] * Math.PI / 1800, null);
    }
  }

  // 每个实体保留一小段样本环（?300ms 历史）?
  // 渲染时刻通常落后最新快?130~150ms，必须保?? 个样本才能真正落在两样本之间插值；
  // 只留 2 个样本会导致"?50ms 跳一??20Hz 抽帧感?
  const SAMPLE_HISTORY = 12;

  function pushSample(store, id, st, x, y, h, meta) {
    let e = store.get(id);
    if (!e) {
      e = { s: [], meta };
      store.set(id, e);
    }
    const last = e.s[e.s.length - 1];
    if (last && st <= last.t) return; // 重复/乱序样本
    // 重生/瞬移：丢弃历史，直接用新样本重新起算，不做跨地图插?
    if (last && Math.hypot(x - last.x, y - last.y) > TELEPORT_DIST) {
      e.s.length = 0;
      e.vis = null;
    }
    e.s.push({ t: st, x, y, h });
    if (e.s.length > SAMPLE_HISTORY) e.s.shift();
    e.meta = meta;
  }

  function sampleEntity(e, rt, smooth) {
    const s = e.s;
    const n = s.length;
    const first = s[0];
    const last = s[n - 1];
    if (n === 1 || rt <= first.t) return { x: first.x, y: first.y, h: first.h, spd: 0, meta: e.meta };
    if (rt >= last.t) {
      // 超出最新样本：用最后一段速度做有限外推（?50ms），不做无限漂移
      const prev = s[n - 2];
      // 玩家位置?上报阶梯"（服务器只在收到输入时更新），末段速度容易?0 或双倍，
      // 这里用跨两段的速度，避免外推阶段出现一顿一?
      const ref = smooth && n >= 3 ? s[n - 3] : prev;
      const span = last.t - ref.t;
      const spd = span > 1 ? Math.hypot(last.x - ref.x, last.y - ref.y) / span : 0;
      if (span < 1) return { x: last.x, y: last.y, h: last.h, spd: 0, meta: e.meta };
      const over = Math.min(rt - last.t, MAX_EXTRAPOLATE);
      return {
        x: last.x + ((last.x - ref.x) / span) * over,
        y: last.y + ((last.y - ref.y) / span) * over,
        h: last.h + angleDelta(last.h, prev.h) * (over / (last.t - prev.t || 1)),
        spd,
        meta: e.meta,
      };
    }
    let i = n - 2;
    while (i > 0 && s[i].t > rt) i--;
    const a = s[i];
    const b = s[i + 1];
    const span = b.t - a.t || 1;
    const u = (rt - a.t) / span;
    const spd = Math.hypot(b.x - a.x, b.y - a.y) / span;
    // 远端玩家：位置来?客户端上报阶?（每个上报周期位置不变、到点跳一下）?
    // 直接线性插值会得到 0/双倍交替的帧间位移（看着就是一顿一冲）?
    // ?Catmull-Rom/Hermite：端点速度取中心差分，把阶梯磨平，且不增加延迟?
    if (smooth && n >= 3) {
      const p0 = s[i - 1] || a;
      const p1 = s[i + 2] || b;
      const d01 = b.t - p0.t || span;
      const d12 = p1.t - a.t || span;
      const vaX = (b.x - p0.x) / d01;
      const vaY = (b.y - p0.y) / d01;
      const vbX = (p1.x - a.x) / d12;
      const vbY = (p1.y - a.y) / d12;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return {
        x: h00 * a.x + h10 * span * vaX + h01 * b.x + h11 * span * vbX,
        y: h00 * a.y + h10 * span * vaY + h01 * b.y + h11 * span * vbY,
        h: angleLerp(a.h, b.h, u),
        spd,
        meta: e.meta,
      };
    }
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), h: angleLerp(a.h, b.h, u), spd, meta: e.meta };
  }

  function chaseRemote(e, target, dt) {
    if (!e.vis) {
      e.vis = { x: target.x, y: target.y, h: target.h, spd: target.spd || 0 };
      return e.vis;
    }
    const k = 1 - Math.exp(-16 * dt);
    e.vis.x += (target.x - e.vis.x) * k;
    e.vis.y += (target.y - e.vis.y) * k;
    e.vis.h += angleDelta(target.h, e.vis.h) * k;
    e.vis.spd += ((target.spd || 0) - e.vis.spd) * k;
    return e.vis;
  }

  function parseBlades(str) {
    const map = new Map();
    if (!str) return map;
    for (const t of str.split(";")) {
      const f = String(t).split(",");
      map.set(+f[0], {
        id: +f[0],
        x: +f[1] / posScale,
        y: +f[2] / posScale,
        heading: +f[3] * Math.PI / 1800,
        h: +f[3] * Math.PI / 1800,
        thr: f[4] !== undefined ? clamp(+f[4] / 9, 0, 1) : 0.7,
        hp: f[5] !== undefined ? +f[5] : 30,
        name: f[6] || "ACE",
        blade: true,
      });
    }
    return map;
  }

  function parseMissiles(str) {
    const map = new Map();
    if (!str) return map;
    for (const t of str.split(";")) {
      const f = String(t).split(",");
      const id = +f[0];
      if (!Number.isFinite(id)) continue;
      map.set(id, {
        id,
        x: +f[1] / posScale,
        y: +f[2] / posScale,
        h: +f[3] * RADDEG,
        spd: +f[4] || 0,
        // 新协议第 6 段为 ownerId；旧服没有则 0（客户端再用开火启发式认领?
        ownerId: f[5] != null && f[5] !== "" ? (+f[5] || 0) : 0,
      });
    }
    return map;
  }

  function onSnapshot(m) {
    net.latestSt = m.st;
    net.lastArrive = performance.now();
    const plist = parseNear(m.p);
    const players = new Map();
    for (const p of plist) players.set(p.id, p);
    play.frames.push({
      st: m.st,
      players,
      missiles: parseMissiles(typeof m.i === "string" ? m.i : ""),
      blades: parseBlades(typeof m.b === "string" ? m.b : ""),
    });
    play.frames.sort((a, b) => a.st - b.st);
    if (play.playing && play.frames.length > BUF_MAX) {
      play.frames.splice(0, play.frames.length - BUF_MAX);
      if (play.head < play.frames[0].st) play.head = play.frames[0].st;
    }
    if (!play.playing && play.frames.length >= BUF_START) {
      play.playing = true;
      play.head = play.frames[0].st;
    }
    playerCount = roster.size;
    latestPlayers = plist;
    if (typeof m.k === "string" && m.k) {
      for (const part of m.k.split(";")) {
        const f = part.split(",");
        const ast = asteroids.get(+f[0]);
        if (!ast || ast.fadeOut || ast.iron) continue;
        const sx = +f[1] / 10;
        const sy = +f[2] / 10;
        if (ASTEROIDS_STATIC) {
          // 静止模式：只校正过大跳变，不跟服务器漂移/自转
          const jump = Math.hypot(sx - ast.x, sy - ast.y);
          if (jump > 160) {
            ast.x = sx;
            ast.y = sy;
          }
          lockAsteroidMotion(ast);
          continue;
        }
        ast.vx = +f[3] / 10;
        ast.vy = +f[4] / 10;
        ast.spin = +f[6] / 1000;
        ast.srot = +f[5] / 1000;
        const jump = Math.hypot(sx - ast.x, sy - ast.y);
        if (jump > 160 || ast.sx == null) {
          ast.x = sx;
          ast.y = sy;
          ast.rotation = ast.srot;
        }
        ast.sx = sx;
        ast.sy = sy;
      }
    }
    if (Array.isArray(m.kd)) {
      myKills = m.kd[0] || 0;
      myDeaths = m.kd[1] || 0;
      renderKd();
    }
    if (m.pk !== undefined) applyMedkit(m.pk);
    if (Number.isFinite(m.gm)) gunAmmoMax = clamp(Number(m.gm), GUN_AMMO_MAX, GUN_AMMO_HARD * 2);
    if (Number.isFinite(m.ga)) gunAmmo = clamp(Number(m.ga), 0, gunAmmoMax);
    if (Number.isFinite(m.ma)) missileAmmo = clamp(Number(m.ma), 0, MISSILE_AMMO_MAX);
    if (Number.isFinite(m.te) && Number(m.te) > 0) {
      matchEndAt = Number(m.te);
      matchLeft = Math.max(0, (matchEndAt - Date.now()) / 1000);
      renderMatchTimer();
    } else if (Number.isFinite(m.tl)) {
      setMatchDeadline(Number(m.tl));
      renderMatchTimer();
    }
    // 母舰慢包：只更炮塔角/弹数（位置以 welcome.ms 为准?
    if (Array.isArray(m.m)) {
      for (const row of m.m) {
        if (!row || !row.length) continue;
        const id = row[0];
        const base = mothershipBase.get(id);
        if (!base) continue;
        pushSample(entMotherships, id, m.st, base.x, base.y, base.h, {
          turret: (row[1] || 0) * Math.PI / 180,
          shotsLeft: row[2] || 0,
          cd: (row[3] || 0) / 2,
        });
      }
    }
    renderAmmo();
    updateStatus();
  }

  function applyMedkit(raw) {
    if (raw == null || raw === "") {
      medkit = null;
      return;
    }
    if (Array.isArray(raw) && raw.length >= 2) {
      medkit = { x: Number(raw[0]) / 10, y: Number(raw[1]) / 10, kind: Number(raw[2]) || 0 };
      return;
    }
    const f = String(raw).split(",");
    if (f.length < 2) {
      medkit = null;
      return;
    }
    medkit = { x: Number(f[0]) / posScale, y: Number(f[1]) / posScale, kind: Number(f[2]) || 0 };
  }

  function setAsteroid(a) {
    const id = a[0];
    const r = a[5];
    const x = a[1] / 10;
    const y = a[2] / 10;
    // welcome: [..., holes[], spin, iron, grid?, glyph?]
    // 事件刷石: [..., spin, iron]（无 holes?
    const welcomeFmt = Array.isArray(a[8]);
    const holes = welcomeFmt ? a[8].map((h) => ({ x: h[0] / 10, y: h[1] / 10, r: h[2] / 10 })) : [];
    const iron = welcomeFmt ? Number(a[10]) === 1 : Number(a[9]) === 1;
    const spin = (welcomeFmt ? (a[9] || 0) : (a[8] || 0)) / 1000;
    let gridPacked = null;
    if (welcomeFmt) {
      if (typeof a[11] === "string" && a[11].length > 1) gridPacked = a[11];
      else if (typeof a[10] === "string" && a[10].length > 1) gridPacked = a[10];
      // a[12]/单字?glyph 已废弃：不再生成字形陨石
    } else if (typeof a[10] === "string" && a[10].length > 1) {
      gridPacked = a[10];
    }
    const pts = makeRockPts(id, r);
    const occ = buildRockGrid(pts, r);
    const rock = {
      id, x, y,
      vx: (iron || ASTEROIDS_STATIC) ? 0 : (a[3] || 0) / 10,
      vy: (iron || ASTEROIDS_STATIC) ? 0 : (a[4] || 0) / 10,
      r,
      spin: (iron || ASTEROIDS_STATIC) ? 0 : spin,
      rotation: (a[6] || 0) / 1000, pts, holes: [], flash: 0, iron,
      grid: occ.grid, solid: occ.solid, extent: occ.extent, solidMax: occ.solid, blocky: false,
    };
    asteroids.set(id, rock);
    rememberRock(rock);
    lockAsteroidMotion(rock);
    // 铁陨石带格子下发 = 被激光切过：孔洞记录按切槽还?
    laserCutSerial++;
    for (const h of holes) addRockHole(rock, h.x, h.y, h.r, 0, 0, true, iron && !!gridPacked);
    if (gridPacked) {
      rock.grid = unpackGridBits(gridPacked);
      let solid = 0;
      for (let i = 0; i < rock.grid.length; i++) if (rock.grid[i]) solid++;
      rock.solid = solid;
      rock.solidMax = Math.max(rock.solidMax || 0, solid);
      if (iron || solid < rock.solidMax) rock.blocky = true;
      rock.r = rockInkRClient(rock);
    }
  }

  function onAsteroidEvents(m) {
    for (const a of m.l || []) setAsteroid(a);
    for (const id of m.rm || []) asteroids.delete(id);
  }

  function onEvents(m) {
    play.events.push({ st: m.st, fx: m.fx || [], b: m.b || "" });
    play.events.sort((a, b) => a.st - b.st);
  }

  function drainPlayEvents(head) {
    while (play.events.length && play.events[0].st <= head) {
      const ev = play.events.shift();
      for (const f of ev.fx) {
        if (f[0] === 2) {
          const ast = asteroids.get(f[4]);
          if (ast) pendingChips.push({ a: ast, lx: (f[5] || 0) / 10, ly: (f[6] || 0) / 10, r: (f[3] || 40) / 10, vx: f[7] || 0, vy: f[8] || 0, cut: f[9] === 1 });
          if (ast && ast.iron) sfx?.playMetalPing();
          else sfx?.playRockChip();
          continue;
        }
        if (f[0] === 3) {
          pendingSplits.push({
            parentId: f[1], id: f[2],
            x: (f[3] || 0) / 10, y: (f[4] || 0) / 10,
            vx: (f[5] || 0) / 10, vy: (f[6] || 0) / 10,
            spin: (f[7] || 0) / 1000, rotation: (f[8] || 0) / 1000,
            r: (f[9] || 0) / 10, extent: (f[10] || 0) / 10,
            grid: f[11] || "",
          });
          continue;
        }
        if (f[0] === 4) {
          pendingSplitRm.push(f[1]);
          if (f[2]) pendingSplitScatter.push(f[1]);
          continue;
        }
        if (f[0] === 5) {
          spawnCraftSparks(f[1], f[2], f[3], f[4], 6 + (Math.random() * 4 | 0));
          playHitOnView(f[1], f[2]);
          {
            const dx = Number(f[1]) - (lastGoodMe.x || 0);
            const dy = Number(f[2]) - (lastGoodMe.y || 0);
            if (dx * dx + dy * dy < 42 * 42) bumpGunHitFeel(0.45);
          }
          continue;
        }
        if (f[0] === 6) {
          sfx?.playRockBump((f[3] || 50) / 100);
          continue;
        }
        if (f[0] === 7) {
          // silent：后面统一 playBoom，避免与 burst 内音效叠两次
          burstCraftDeath(f[1], f[2], (f[4] || 0) / 10, (f[5] || 0) / 10, (f[3] || 0) * Math.PI / 1800, f[6] === 1 ? "blade" : "fighter", { silent: true });
          sfx?.playBoom();
          {
            const dx = Number(f[1]) - (lastGoodMe.x || 0);
            const dy = Number(f[2]) - (lastGoodMe.y || 0);
            // 仅自己爆炸才大震，敌机爆炸不?
            if (dx * dx + dy * dy < 36 * 36) bumpDeathFeel();
          }
          continue;
        }
        if (f[0] === 8) {
          popMissileBlast(f[1], f[2], (f[3] || 70) / 100);
          continue;
        }
        if (f[0] === 9) {
          if (Number(f[1]) === Number(myId) && Number(f[1]) !== Number(f[2])) {
            if (f[4] != null) myKills = Number(f[4]);
            applyKillAmmoRefill(f[6], f[7], f[8]);
          }
          if (Number(f[2]) === Number(myId) && Number(f[3]) === 0 && f[5] != null) myDeaths = Number(f[5]);
          // 助战：任一真人阵亡（f[3]===0）双方失?
          if (Number(f[3]) === 0) noteAssistAllyDown(f[2]);
          renderKd();
          continue;
        }
        if (f[0] === 10) {
          medkit = null;
          spawnHealBurst(f[1], f[2], "heal");
          sfx?.playSelect();
          continue;
        }
        if (f[0] === 11) {
          medkit = null;
          spawnHealBurst(f[1], f[2], "mag");
          if (Number(f[3]) === Number(myId)) {
            if (Number.isFinite(Number(f[4]))) gunAmmoMax = clamp(Number(f[4]), GUN_AMMO_MAX, GUN_AMMO_HARD * 2);
            if (Number.isFinite(Number(f[5]))) gunAmmo = clamp(Number(f[5]), 0, gunAmmoMax);
            renderAmmo();
          }
          sfx?.playSelect();
          continue;
        }
        if (f[0] === 12) {
          // 激光束 [12, x0, y0, 开火? x1, y1]；自己的已在松手时本地画?
          if (Number(f[3]) === Number(myId)) continue;
          const x0 = +f[1], y0 = +f[2], x1 = +f[4], y1 = +f[5];
          const len = Math.hypot(x1 - x0, y1 - y0) || 1;
          const beam = { x0, y0, x1, y1, ux: (x1 - x0) / len, uy: (y1 - y0) / len, len, age: 0, hitSfx: true };
          trainW.beams.push(beam);
          if (trainW.beams.length > 8) trainW.beams.shift();
          spawnLaserGhosts(beam);
          if (worldOnView((x0 + x1) / 2, (y0 + y1) / 2, len / 2)) sfx?.playLaser?.();
          continue;
        }
        if (f[0] === 13) {
          // 电磁闪电团发?[13, x, y, 开火? angMilli]
          const own = Number(f[3]) === Number(myId);
          if (!own) {
            const ang = (+f[4] || 0) / 1000;
            spawnEmpBall(+f[1], +f[2], ang, Number(f[3]) || 0, null, false);
            if (worldOnView(+f[1], +f[2], 120)) sfx?.playEmp?.();
          }
          continue;
        }
        if (f[0] === 14) {
          // 电磁闪电团命?[14, x, y, 目标id]
          const tid = Number(f[3]) || 0;
          if (tid) {
            roomStunUntil.set(tid, performance.now() + EMP_STUN * 1000);
            if (tid === Number(myId) || worldOnView(+f[1], +f[2], 80)) sfx?.playEmpZap?.();
          }
          continue;
        }
        if (f[0] === 0) continue;
        {
          const efx = takeEffect();
          efx.ty = f[0]; efx.x = f[1]; efx.y = f[2]; efx.size = f[3] / 100; efx.c = f[4]; efx.t0 = performance.now();
        }
        if (f[0] === 1) sfx?.playBoom();
      }
      if (!ev.b) continue;
      for (const part of ev.b.split(";")) {
        const f = part.split(",");
        const oid = +f[0];
        const kind = oid === 0 ? 1 : 0;
        if (oid === myId && kind === 0) continue;
        if (kind !== 0) sfx?.playMissile?.(oid || undefined);
        const rad = +f[3] * RADDEG;
        const speed = kind ? 330 : (Number.isFinite(+f[4]) ? +f[4] : BULLET_SPEED);
        // ?6 段：改装主炮弹种 1=加农?2=加特?
        const style = f[5] === "1" ? "cannon" : f[5] === "2" ? "gatling" : undefined;
        if (style === "cannon" && worldOnView(+f[1], +f[2], 80)) sfx?.playCannon?.();
        const id = ++bulletSeq;
        putBulletShot(id, {
          oid, kind,
          x: +f[1], y: +f[2],
          vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed,
          ax: Math.cos(rad), ay: Math.sin(rad),
          t0: ev.st, t0Local: performance.now(), own: false,
          life: kind ? 2200 : BULLET_LIFE_MS * (style === "cannon" ? 1.3 : style === "gatling" ? 0.85 : 1),
          style,
        });
      }
    }
  }

  function lerpEntity(a, b, u) {
    if (!a) return b;
    if (!b) return a;
    return {
      id: a.id,
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      heading: angleLerp(a.heading ?? a.h, b.heading ?? b.h, u),
      h: angleLerp(a.heading ?? a.h, b.heading ?? b.h, u),
      thr: lerp(a.thr || 0, b.thr || 0, u),
      spd: lerp(a.spd || 0, b.spd || 0, u),
      hp: lerp(a.hp != null ? a.hp : 30, b.hp != null ? b.hp : 30, u),
      blade: !!(a.blade || b.blade),
      name: b.name || a.name || "",
      ownerId: (b.ownerId != null ? b.ownerId : a.ownerId) || 0,
    };
  }

  function stepPlayback(dt) {
    if (!play.playing) {
      if (play.frames.length >= BUF_START) {
        play.playing = true;
        play.head = play.frames[0].st;
      } else {
        const f = play.frames[0] || play.pose;
        return f || { st: 0, players: new Map(), missiles: new Map(), blades: new Map() };
      }
    }
    play.head += dt * 1000;
    while (play.frames.length >= 2 && play.frames[1].st <= play.head) play.frames.shift();
    if (play.frames.length > BUF_MAX) {
      play.frames.splice(0, play.frames.length - BUF_MAX);
      play.head = play.frames[0].st;
    }
    if (play.frames.length === 0) {
      play.playing = false;
      return play.pose || { st: 0, players: new Map(), missiles: new Map(), blades: new Map() };
    }
    if (play.frames.length < 2) {
      const f = play.frames[0];
      play.head = f.st;
      play.pose = f;
      drainPlayEvents(play.head);
      return f;
    }
    const a = play.frames[0];
    const b = play.frames[1];
    const u = clamp((play.head - a.st) / (b.st - a.st || FRAME_MS), 0, 1);
    play.pose = a;
    drainPlayEvents(play.head);
    const players = new Map();
    for (const id of new Set([...a.players.keys(), ...b.players.keys()])) {
      players.set(id, lerpEntity(a.players.get(id), b.players.get(id), u));
    }
    const missiles = new Map();
    for (const id of new Set([...a.missiles.keys(), ...b.missiles.keys()])) {
      missiles.set(id, lerpEntity(a.missiles.get(id), b.missiles.get(id), u));
    }
    const blades = new Map();
    const aBlades = a.blades || new Map();
    const bBlades = b.blades || new Map();
    for (const id of new Set([...aBlades.keys(), ...bBlades.keys()])) {
      blades.set(id, lerpEntity(aBlades.get(id), bBlades.get(id), u));
    }
    return { st: play.head, players, missiles, blades, u };
  }

  // 渲染时钟：以 ±15% 的轻微变速把渲染时刻维持?最新快?- renderDelay"附近
  function updateClock(dt) {
    if (!net.latestSt) return;
    if (net.clock === null) net.clock = net.latestSt - net.delay;
    const target = net.latestSt - net.delay;
    const drift = net.clock - target;
    const speed = clamp(1 - drift / 1200, 0.94, 1.06);
    net.clock += dt * 1000 * speed;
    const maxClock = net.latestSt + MAX_EXTRAPOLATE;
    if (net.clock > maxClock) net.clock = maxClock;
    if (net.clock < target - 500) net.clock = target - 500;
    renderTime = net.clock;
  }

  // ===== 延迟探针（每秒一?ping，服务端原样?pong?====
  function saveRejoin(_v) {}
  function showSkillToast(_text) {}
  function showMatchLost() {
    if (matchLost) return;
    matchLost = true;
    setAutoPilot(false);
    const modal = $("matchLostModal");
    if (modal) modal.style.display = "grid";
    if (offlineEl) offlineEl.style.display = "none";
    updateStatus();
  }
  function hideMatchLost() {
    matchLost = false;
    const modal = $("matchLostModal");
    if (modal) modal.style.display = "none";
  }
  function showLevelFailModal() {
    const modal = $("levelFailModal");
    if (modal) modal.style.display = "grid";
  }
  function hideLevelFailModal() {
    const modal = $("levelFailModal");
    if (modal) modal.style.display = "none";
  }
  function showLevelWinModal() {
    const modal = $("levelWinModal");
    if (modal) modal.style.display = "grid";
  }
  function hideLevelWinModal() {
    const modal = $("levelWinModal");
    if (modal) modal.style.display = "none";
  }
  function silenceLevelEndSfx() {
    try { sfx?.setGatling?.(0, false, 0); } catch (e) {}
    try { sfx?.setCannon?.(false); } catch (e) {}
    try { sfx?.tickFlight?.(0, 0, false, false); } catch (e) {}
    try { sfx?.tickOthers?.(0, 0, false); } catch (e) {}
    try { sfx?.stopAll?.(); } catch (e) {}
  }
  function beginLevelWinCine(focusX, focusY, opts) {
    levelWinHold = false;
    const meCraft = localCrafts.find((c) => c.id === myId);
    const sx = meCraft && Number.isFinite(meCraft.x) ? meCraft.x : (Number.isFinite(lastGoodMe.x) ? lastGoodMe.x : focusX);
    const sy = meCraft && Number.isFinite(meCraft.y) ? meCraft.y : (Number.isFinite(lastGoodMe.y) ? lastGoodMe.y : focusY);
    const fx = Number.isFinite(focusX) ? focusX : sx;
    const fy = Number.isFinite(focusY) ? focusY : sy;
    // 定格 ?镜头推到目标 ?看爆??结算窗（不再弹中间纸卡）
    const holdDur = 0.1;
    const panDur = 0.58;
    const blastDur = 0.9;
    levelWinCine = {
      age: 0,
      holdDur,
      panDur,
      blastDur,
      dur: holdDur + panDur + blastDur,
      sx,
      sy,
      fx,
      fy,
      boostBlast: !!(opts && opts.boostBlast),
      sfxFocus: false,
    };
    try {
      GameGlobal.levelWinCine = true;
      GameGlobal.levelWinHold = false;
    } catch (e) {}
    // 过关立刻掐掉加特?机炮循环，避免定格期间还在响
    silenceLevelEndSfx();
  }

  function levelWinCamPos(cine) {
    if (!cine) return null;
    const hold = cine.holdDur || 0.1;
    const pan = Math.max(0.05, cine.panDur || 0.55);
    const age = cine.age || 0;
    if (age <= hold) return { x: cine.sx, y: cine.sy };
    if (age < hold + pan) {
      const u = easeInOutCubic(clamp((age - hold) / pan, 0, 1));
      return {
        x: cine.sx + (cine.fx - cine.sx) * u,
        y: cine.sy + (cine.fy - cine.sy) * u,
      };
    }
    return { x: cine.fx, y: cine.fy };
  }
  function enterLevelWinHold() {
    levelWinCine = null;
    levelWinHold = true;
    try {
      GameGlobal.levelWinCine = false;
      GameGlobal.levelWinHold = true;
    } catch (e) {}
    silenceLevelEndSfx();
    try { sfx?.playLevelWin?.(); } catch (e) {}
    try { sfx?.playLevelWinLand?.(); } catch (e) {}
    showLevelWinModal();
  }
  function clearLevelWinHold() {
    levelWinHold = false;
    levelWinCine = null;
    try {
      GameGlobal.levelWinCine = false;
      GameGlobal.levelWinHold = false;
    } catch (e) {}
    hideLevelWinModal();
  }
  $("btnLevelWinMap")?.addEventListener("click", () => {
    clearLevelWinHold();
    levelFromLevels = true;
    // 保留 win 结果?endLocalMatch ?completeLevelRun(true)
    endLocalMatch(false);
  });
  function isAssistHumanAlly(id) {
    const pid = Number(id);
    if (!Number.isFinite(pid)) return false;
    if (pid === Number(myId)) return true;
    const info = roster.get(pid);
    if (!info) return false;
    const team = normalizeTeamIndex(info.team);
    // 助战真人强制?0；队 1 为敌?占位机器?
    return team === 0;
  }
  /** 助战 1~3 关：任一真人飞机爆炸 ?双方失败 */
  function triggerAssistLevelFail(fromPeer) {
    // 恢复上下文：防止 flag 被清掉后失败弹窗出不?
    try {
      if (!assistCoopMode && (GameGlobal.assistCoopPlaying || GameGlobal.assistHostMode || GameGlobal.assistGuestMode)) {
        assistCoopMode = true;
      }
      if (!localLevelMode && assistCoopMode) localLevelMode = true;
      if (!(levelRunCol >= 1 && levelRunCol <= 3)) {
        const n = GameGlobal.assistHostNode || GameGlobal.levelFailNode || {};
        levelRunCol = resolveAssistLevelCol(n) || 1;
      }
    } catch (e) {}
    if (!assistCoopMode) return;
    if (levelRunEnding && levelRunResult === "fail" && levelFailHold) return;
    levelRunEnding = true;
    levelRunResult = "fail";
    try {
      GameGlobal.assistReadyDismissed = true;
      GameGlobal.assistCoopPlaying = true;
      GameGlobal.assistFailOnlyOk = !!GameGlobal.assistGuestMode;
      GameGlobal.levelFailCine = true;
      if (typeof GameGlobal.dismissAssistReadyModalKeepGuest === "function") {
        GameGlobal.dismissAssistReadyModalKeepGuest();
      }
      const ready = $("assistReadyModal");
      if (ready) ready.style.display = "none";
    } catch (e) {}
    if (!levelFailHold) {
      try {
        burstCraftDeath(lastGoodMe.x || 0, lastGoodMe.y || 0, 0, 0, lastGoodMe.heading || 0, "fighter", { slowMo: true });
      } catch (e) {}
      // 助战失败：短慢镜后立刻弹窗；先把 modal display 拉起来，避免被后?hide 漏掉
      levelFailCine = { age: 0, dur: 0.55 };
      try { showLevelFailModal(); } catch (e) {}
      setTimeout(() => {
        try {
          if (levelRunResult === "fail" && !levelFailHold) enterLevelFailHold();
        } catch (e) {}
      }, 560);
    } else {
      try { showLevelFailModal(); } catch (e) {}
    }
    if (!fromPeer) {
      try { sendAssistPeer("assistFail", { col: levelRunCol }); } catch (e) {}
    }
  }
  function noteAssistAllyDown(id) {
    if (!(assistCoopMode || GameGlobal.assistCoopPlaying || GameGlobal.assistHostMode || GameGlobal.assistGuestMode)) return;
    if (!isAssistHumanAlly(id)) return;
    triggerAssistLevelFail(false);
  }
  function enterLevelFailHold() {
    levelFailCine = null;
    levelFailHold = true;
    try {
      GameGlobal.levelFailCine = false;
      GameGlobal.levelFailHold = true;
      if (assistCoopMode) GameGlobal.assistFailOnlyOk = !!GameGlobal.assistGuestMode;
    } catch (e) {}
    silenceLevelEndSfx();
    showLevelFailModal();
  }
  function clearLevelFailHold() {
    levelFailHold = false;
    levelFailCine = null;
    try {
      GameGlobal.levelFailCine = false;
      GameGlobal.levelFailHold = false;
    } catch (e) {}
  }
  function exitAssistFailToHome() {
    hideLevelFailModal();
    clearLevelFailHold();
    try {
      GameGlobal.assistFailOnlyOk = false;
      GameGlobal.assistCoopPlaying = false;
      GameGlobal.assistReadyDismissed = false;
      GameGlobal.assistGuestMode = false;
      GameGlobal.assistHostMode = false;
      GameGlobal.levelsOpen = false;
      GameGlobal.lobbyView = "home";
    } catch (e) {}
    assistCoopMode = false;
    localLevelMode = false;
    levelRunEnding = false;
    levelRunResult = null;
    levelFromLevels = false;
    try { sendRoom("leave"); } catch (e) {}
    try { leaveAssistRoom(); } catch (e) {}
    try { setPhase("lobby"); } catch (e) {}
  }
  function exitAssistFailToLevels() {
    hideLevelFailModal();
    clearLevelFailHold();
    try {
      GameGlobal.assistFailOnlyOk = false;
      GameGlobal.assistCoopPlaying = false;
      GameGlobal.assistReadyDismissed = false;
      GameGlobal.assistHostMode = false;
      GameGlobal.levelsOpen = true;
    } catch (e) {}
    assistCoopMode = false;
    localLevelMode = false;
    levelRunEnding = false;
    levelRunResult = null;
    levelFromLevels = true;
    try { sendRoom("leave"); } catch (e) {}
    try {
      if (typeof GameGlobal.completeLevelRun === "function") GameGlobal.completeLevelRun(false);
    } catch (e) {}
    try { setPhase("lobby"); } catch (e) {}
  }
  $("btnLevelRetry")?.addEventListener("click", () => {
    // 再来一次：整关重开一局
    hideLevelFailModal();
    clearLevelFailHold();
    const node = GameGlobal && GameGlobal.levelFailNode;
    const col = node && Number(node.col);
    if (isPlayableLevelCol(col)) {
      try { GameGlobal.levelsOpen = false; } catch (e) {}
      levelFromLevels = true;
      levelRunResult = null;
      levelRunEnding = false;
      startLocalMatch({ level: true, nodeId: node && node.id, levelCol: col });
      try {
        wx.showToast({ title: levelToastTitle(col), icon: "none", duration: 1400 });
      } catch (e) {}
      return;
    }
    if (typeof GameGlobal.completeLevelRun === "function") GameGlobal.completeLevelRun(false);
  });
  $("btnLevelRevive")?.addEventListener("click", () => {
  // 启动时恢复双发解锁
    if (assistCoopMode || GameGlobal.assistCoopPlaying || GameGlobal.assistFailOnlyOk) return;
    // 复活：启?3 秒倒计时后回场，不重开关卡
    beginLevelRevive();
  });
  $("btnLevelFailMap")?.addEventListener("click", () => {
    // 助战嘉宾：只有「确定」→ 回首?
    if (GameGlobal.assistFailOnlyOk || (assistCoopMode && GameGlobal.assistGuestMode)) {
      exitAssistFailToHome();
      return;
    }
    // 助战房主失败：回航图
    if (assistCoopMode && GameGlobal.assistHostMode) {
      exitAssistFailToLevels();
      return;
    }
    hideLevelFailModal();
    clearLevelFailHold();
    // 离开战场回航图（不记通关），不要回首页大?
    levelRunResult = null;
    levelRunEnding = false;
    levelFromLevels = true;
    endLocalMatch(false);
  });

  function respawnLevelCraft(craft) {
    if (!craft) return;
    craft.guardUntil = performance.now() + SPAWN_GUARD_MS;
    craft.x = -420 + (Math.random() - 0.5) * 40;
    craft.y = (Math.random() - 0.5) * 40;
    craft.heading = 0;
    craft.vx = 0;
    craft.vy = 0;
    craft.throttle = 0;
    craft.hp = PLAYER_MAX_HP;
    craft.respawn = 0;
    craft.shieldT = 0;
    craft.stunT = 0;
    craft.gunAmmo = craft.id === myId ? gunAmmoMax : GUN_AMMO_MAX;
    craft.missileAmmo = MISSILE_AMMO_MAX;
    if (craft.id === myId) {
      gunAmmo = craft.gunAmmo;
      missileAmmo = craft.missileAmmo;
      renderAmmo();
      pushSpeedLeverIdle();
    }
    const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
    st.hp = craft.hp;
    st.respawn = 0;
    playerStatus.set(craft.id, st);
  }

  function beginLevelRevive() {
    if (assistCoopMode || GameGlobal.assistCoopPlaying) return;
    if (!localLevelMode || !localMatch) return;
    hideLevelFailModal();
    clearLevelFailHold();
    levelRunEnding = false;
    levelRunResult = null;
    const craft = localCrafts.find((c) => c.id === myId);
    if (!craft) return;
    craft.hp = 0;
    craft.respawn = RESPAWN_TIME;
    craft.throttle = 0;
    craft.vx = 0;
    craft.vy = 0;
    const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
    st.hp = 0;
    st.respawn = RESPAWN_TIME;
    playerStatus.set(craft.id, st);
    respawnAnimT0 = 0;
  }
  function syncMatchNetFromBrowser(isOnline) {
    if (!localMatch) return;
    if (isOnline === false) {
      showMatchLost();
      return;
    }
    if (matchLost) {
      hideMatchLost();
      updateStatus();
      if (!connected) connect();
    }
  }
  $("matchLostHome")?.addEventListener("click", () => {
    hideMatchLost();
    endLocalMatch(false);
    if (!connected) connect();
  });
  try {
    if (typeof wx !== "undefined" && wx.onNetworkStatusChange) {
      wx.onNetworkStatusChange((res) => {
        syncMatchNetFromBrowser(!!(res && res.isConnected));
      });
    }
  } catch (e) {}
  try {
    if (typeof wx !== "undefined" && wx.onShow) {
      wx.onShow(() => {
        if (localMatch && matchEndAt > 0 && syncMatchTimerFromClock()) {
          endLocalMatch(true);
          return;
        }
        if (!localMatch && matchEndAt > 0) syncMatchTimerFromClock();
        try {
          if (typeof wx.getNetworkType === "function") {
            wx.getNetworkType({
              success: (r) => {
                const online = r && r.networkType && r.networkType !== "none";
                syncMatchNetFromBrowser(!!online);
              },
            });
          }
        } catch (e) {}
      });
    }
  } catch (e) {}
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (localMatch && matchEndAt > 0 && syncMatchTimerFromClock()) endLocalMatch(true);
    else if (!localMatch && matchEndAt > 0) syncMatchTimerFromClock();
  });

  let autoPilot = false;
  let lastAutoCmd = null;
  const autoBadge = $("autoBadge");
  // 机器人智?1=现行顶尖 / 2=瞄准差一?/ 3=准度?+ 切武?开火更?
  // aimEvery>0：每隔这么多毫秒才重新瞄一次目标（不预判），其余时间枪口锁旧方?
  // aimLag：枪口瞄敌机 aimLag 毫秒之前的位?
  const BOT_IQ = {
    1: { aimNoise: 0.02, gunRate: 1.00, shootCone: 1.00, burstPause: 1.00, burstGap: 1.00, misThink: 1.00, gunPeriod: 1.00, misCd: 1.00, fireWarm: 0.00, aimEvery: 0, aimLag: 200 },
    2: { aimNoise: 0.14, gunRate: 0.62, shootCone: 0.82, burstPause: 1.25, burstGap: 1.20, misThink: 1.35, gunPeriod: 1.15, misCd: 1.25, fireWarm: 0.12, aimEvery: 200, aimLag: 300 },
    3: { aimNoise: 0.26, gunRate: 0.42, shootCone: 0.68, burstPause: 1.85, burstGap: 1.55, misThink: 2.20, gunPeriod: 1.55, misCd: 1.85, fireWarm: 0.28, aimEvery: 200, aimLag: 500 },
  };
  // 敌机轨迹（所有机器人共用），?aimLag 回看
  const BOT_HIST_KEEP_MS = 1000; // 覆盖激?EMP 最?600ms 回看
  const botPosHist = new Map(); // id -> [{ t, x, y }]
  function recordBotFoeHist(foes, now) {
    for (const p of foes) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      let arr = botPosHist.get(p.id);
      if (!arr) { arr = []; botPosHist.set(p.id, arr); }
      const last = arr[arr.length - 1];
      if (last && now - last.t < 8) continue;
      // 复活瞬移：旧轨迹作废
      if (last && Math.hypot(p.x - last.x, p.y - last.y) > 400) arr.length = 0;
      arr.push({ t: now, x: p.x, y: p.y });
      while (arr.length && now - arr[0].t > BOT_HIST_KEEP_MS) arr.shift();
    }
  }
  /** 激?EMP：瞄目标 300~600ms 前的位置 */
  function botSubWeaponAim(craft, targetId, now) {
    let prey = null;
    if (targetId != null) {
      prey = localCrafts.find((c) => c && c.id === targetId && !(c.respawn > 0));
    }
    if (!prey) {
      let best = Infinity;
      for (const c of localCrafts) {
        if (!c || c.id === craft.id || c.respawn > 0 || c.team === craft.team) continue;
        const d = (c.x - craft.x) ** 2 + (c.y - craft.y) ** 2;
        if (d < best) { best = d; prey = c; }
      }
    }
    if (!prey) return Number.isFinite(craft.heading) ? craft.heading : 0;
    const lag = 300 + Math.random() * 300;
    const past = botPastPos(prey, now, lag);
    return Math.atan2(past.y - craft.y, past.x - craft.x);
  }
  function botPastPos(p, now, lagMs) {
    const lag = Math.max(0, Number(lagMs) || 0);
    const arr = botPosHist.get(p.id);
    const want = now - lag;
    const vx = Number.isFinite(p.vx) ? p.vx : 0;
    const vy = Number.isFinite(p.vy) ? p.vy : 0;
    // 轨迹不够久时用速度反推，保证激?EMP 真能瞄到 300~600ms ?
    const rewindFrom = (x, y, t0, evx, evy) => {
      const sec = Math.max(0, (t0 - want) / 1000);
      return { x: x - evx * sec, y: y - evy * sec };
    };
    if (!arr || !arr.length) return rewindFrom(p.x, p.y, now, vx, vy);
    if (want < arr[0].t) {
      let evx = vx;
      let evy = vy;
      if (arr.length > 1) {
        const dt = (arr[1].t - arr[0].t) / 1000;
        if (dt > 0.001) {
          evx = (arr[1].x - arr[0].x) / dt;
          evy = (arr[1].y - arr[0].y) / dt;
        }
      }
      return rewindFrom(arr[0].x, arr[0].y, arr[0].t, evx, evy);
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const a = arr[i - 1];
      const c = arr[i];
      if (a.t <= want && want <= c.t) {
        const k = c.t > a.t ? (want - a.t) / (c.t - a.t) : 0;
        return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k };
      }
    }
    const l = arr[arr.length - 1];
    return { x: l.x, y: l.y };
  }
  function botIqCfg(iq) {
    return BOT_IQ[iq] || BOT_IQ[1];
  }
  // 拟人代打状态：反应延迟、黏目标、点射节奏、油门平滑、瞄准抖?
  const autoPilotCtx = {
    me: null, foes: [], rocks: [], dt: 0.016,
    style: 0.55, // 0 保守 ?1 ?
    iq: 1,
    targetId: null, targetUntil: 0, retacquireAt: 0,
    noseAim: null, gunAim: null, thr: 0.55,
    roamT: 0, roamSide: 0, orbitSide: 1, orbitFlipAt: 0,
    burstLeft: 0, burstPause: 0, misThink: 0,
    reactAt: 0, panicUntil: 0, wobble: 0, wobbleT: 0,
    lastSeenX: 0, lastSeenY: 0, memoryUntil: 0,
    fireWarm: 0,
  };

  function resetHumanBot() {
    const s = 0.35 + Math.random() * 0.55;
    autoPilotCtx.style = s;
    autoPilotCtx.iq = 1;
    autoPilotCtx.fireWarm = 0;
    autoPilotCtx.targetId = null;
    autoPilotCtx.targetUntil = 0;
    autoPilotCtx.reacquireAt = 0;
    autoPilotCtx.noseAim = null;
    autoPilotCtx.gunAim = null;
    autoPilotCtx.thr = 0.88 + s * 0.08;
    autoPilotCtx.roamT = 2.5 + Math.random() * 2;
    autoPilotCtx.roamSide = 0;
    autoPilotCtx.orbitSide = Math.random() < 0.5 ? -1 : 1;
    autoPilotCtx.orbitFlipAt = performance.now() + 5000 + Math.random() * 5000;
    autoPilotCtx.burstLeft = 0.2;
    autoPilotCtx.burstPause = 0;
    autoPilotCtx.misThink = 0.2 + Math.random() * 0.4;
    autoPilotCtx.reactAt = 0;
    autoPilotCtx.panicUntil = 0;
    autoPilotCtx.wobble = 0;
    autoPilotCtx.wobbleT = 0;
    autoPilotCtx.memoryUntil = 0;
  }

  function setAutoPilot(on) {
    autoPilot = !!on;
    if (autoBadge) autoBadge.classList.toggle("on", autoPilot);
    if (autoPilot) {
      keys.up = keys.down = keys.left = keys.right = keys.brake = keys.gun = keys.missile = false;
      pointer.left = pointer.right = false;
      resetHumanBot();
      lastAutoCmd = {
        up: true, down: false, brake: false, turn: 0,
        aim: autoPilotCtx.me && Number.isFinite(autoPilotCtx.me.heading) ? autoPilotCtx.me.heading : null,
        gunAim: autoPilotCtx.me && Number.isFinite(autoPilotCtx.me.heading) ? autoPilotCtx.me.heading : null,
        throttle: Math.max(0.92, autoPilotCtx.thr || 0.92),
        fireGun: false, fireMissile: false, missileTarget: null,
      };
    } else {
      lastAutoCmd = null;
    }
  }

  function autoAheadRock(me) {
    const hx = Math.cos(me.heading);
    const hy = Math.sin(me.heading);
    let best = null;
    let bestClear = 9e9;
    for (const a of autoPilotCtx.rocks) {
      if (!a || a.fadeOut) continue;
      const dx = a.x - me.x;
      const dy = a.y - me.y;
      const fwd = dx * hx + dy * hy;
      if (fwd < 16 || fwd > 620) continue;
      const side = -dx * hy + dy * hx;
      const rr = (a.extent || a.r || 40) + 36;
      if (Math.abs(side) > rr) continue;
      const ang = Math.atan2(side, fwd);
      if (Math.abs(ang) > 0.72) continue;
      const clear = fwd - (a.r || 40);
      if (clear < bestClear) {
        bestClear = clear;
        best = { clear, side };
      }
    }
    return best;
  }

  function isAutoFoe(p) {
    if (!p || p.id === myId || p.respawn > 0) return false;
    // 大乱?ACE（blade）也要打；私人房队友除外
    if (!p.blade && isTeammate(p)) return false;
    return true;
  }

  function foeById(id) {
    if (id == null) return null;
    for (const p of autoPilotCtx.foes) {
      if (p && p.id === id && isAutoFoe(p)) return p;
    }
    return null;
  }

  function scorePrey(me, p) {
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    // 全图找敌人，不设距离上限；真人优先（等效距离?1200?
    const bear = Math.atan2(p.y - me.y, p.x - me.x);
    const facing = 1 - Math.min(1, Math.abs(angleDelta(bear, me.heading)) / Math.PI);
    const bladeBonus = p.blade ? 0.08 : 0;
    const humanBonus = p.human ? 1.2 : 0;
    return Math.max(0, 10000 - d) * 0.001 + facing * 0.6 + bladeBonus + humanBonus + (p.id === autoPilotCtx.targetId ? 0.4 : 0);
  }

  function pickHumanPrey(me, now) {
    const stuck = foeById(autoPilotCtx.targetId);
    if (stuck && now < autoPilotCtx.targetUntil) {
      const d = Math.hypot(stuck.x - me.x, stuck.y - me.y);
      let interrupt = null;
      let interruptD = 280;
      for (const p of autoPilotCtx.foes) {
        if (!isAutoFoe(p) || p.id === stuck.id) continue;
        const dd = Math.hypot(p.x - me.x, p.y - me.y);
        if (dd < interruptD) { interruptD = dd; interrupt = p; }
      }
      if (!interrupt || d < interruptD + 90) return stuck;
    }
    if (now < autoPilotCtx.reacquireAt) return stuck;
    let best = null;
    let bestScore = -1;
    for (const p of autoPilotCtx.foes) {
      if (!isAutoFoe(p)) continue;
      const s = scorePrey(me, p);
      if (s > bestScore) { bestScore = s; best = p; }
    }
    if (best) {
      const hold = 1200 + Math.random() * 2200 + autoPilotCtx.style * 800;
      autoPilotCtx.targetId = best.id;
      autoPilotCtx.targetUntil = now + hold;
      autoPilotCtx.reacquireAt = now + 200 + Math.random() * 350;
    } else {
      autoPilotCtx.targetId = null;
    }
    return best;
  }

  function slewAngle(cur, want, maxRate, dt) {
    if (!Number.isFinite(cur)) return want;
    const d = angleDelta(want, cur);
    const step = clamp(d, -maxRate * dt, maxRate * dt);
    return cur + step;
  }

  function softThr(cur, want, dt) {
    const rate = 3.2 + autoPilotCtx.style * 1.0;
    if (want > cur) return Math.min(want, cur + rate * dt);
    return Math.max(want, cur - (rate * 1.15) * dt);
  }

  function tickBurstFire(canShoot, dt) {
    const iq = botIqCfg(autoPilotCtx.iq);
    if (autoPilotCtx.burstPause > 0) {
      autoPilotCtx.burstPause -= dt;
      return false;
    }
    if (!canShoot) {
      if (autoPilotCtx.burstLeft > 0 && Math.random() < 0.08) {
        autoPilotCtx.burstLeft = 0;
        autoPilotCtx.burstPause = (0.12 + Math.random() * 0.25) * iq.burstPause;
      }
      autoPilotCtx.fireWarm = 0;
      return false;
    }
    if (iq.fireWarm > 0) {
      autoPilotCtx.fireWarm += dt;
      if (autoPilotCtx.fireWarm < iq.fireWarm) return false;
    }
    if (autoPilotCtx.burstLeft <= 0) {
      const rounds = Math.max(2, (3 + (Math.random() * 7 | 0)) - (autoPilotCtx.iq >= 3 ? 2 : autoPilotCtx.iq >= 2 ? 1 : 0));
      autoPilotCtx.burstLeft = rounds * 0.03 * iq.burstGap;
      return true;
    }
    autoPilotCtx.burstLeft -= dt;
    if (autoPilotCtx.burstLeft <= 0) {
      autoPilotCtx.burstPause = (0.12 + Math.random() * 0.38 + (1 - autoPilotCtx.style) * 0.15) * iq.burstPause;
      autoPilotCtx.fireWarm = 0;
      return false;
    }
    return true;
  }

  function computeAutoPilot() {
    const me = autoPilotCtx.me;
    const now = performance.now();
    const dt = clamp(autoPilotCtx.dt || 0.016, 0.008, 0.05);
    if (!me || !Number.isFinite(me.x) || me.respawn > 0) {
      lastAutoCmd = {
        up: false, down: false, brake: false, turn: 0,
        aim: null, gunAim: null, throttle: 0.15,
        fireGun: false, fireMissile: false, missileTarget: null,
      };
      return lastAutoCmd;
    }
    if (!Number.isFinite(autoPilotCtx.noseAim)) autoPilotCtx.noseAim = me.heading;
    if (!Number.isFinite(autoPilotCtx.gunAim)) autoPilotCtx.gunAim = me.heading;

    const iq = botIqCfg(autoPilotCtx.iq);
    autoPilotCtx.wobbleT -= dt;
    if (autoPilotCtx.wobbleT <= 0) {
      autoPilotCtx.wobbleT = 1.2 + Math.random() * 1.8;
      autoPilotCtx.wobble = (Math.random() - 0.5) * (0.03 + iq.aimNoise * 0.35);
    }

    const rock = autoAheadRock(me);
    const margin = 180 + (1 - autoPilotCtx.style) * 40;
    const nearEdge = me.x < -WORLD_LIMIT + margin || me.x > WORLD_LIMIT - margin
      || me.y < -WORLD_Y_LIMIT + margin || me.y > WORLD_Y_LIMIT - margin;

    let desireNose = me.heading;
    let desireGun = me.heading;
    let desireThr = 0.94;
    let brake = false;
    let fireGun = false;
    let fireMissile = false;
    let missileTarget = null;
    let panic = now < autoPilotCtx.panicUntil;
    let hardTurn = false;

    // 战斗/漫游：机头少拧，靠直线加速；枪口单独?
    recordBotFoeHist(autoPilotCtx.foes || [], now);
    const prey = pickHumanPrey(me, now);
    if (prey) {
      autoPilotCtx.lastSeenX = prey.x;
      autoPilotCtx.lastSeenY = prey.y;
      autoPilotCtx.memoryUntil = now + 1100 + Math.random() * 700;

      const dist = Math.hypot(prey.x - me.x, prey.y - me.y);
      const pvx = Number.isFinite(prey.vx) ? prey.vx : Math.cos(prey.heading || 0) * (prey.spd || 0);
      const pvy = Number.isFinite(prey.vy) ? prey.vy : Math.sin(prey.heading || 0) * (prey.spd || 0);
      const spd = Math.hypot(me.vx || 0, me.vy || 0);
      const eta = dist / Math.max(spd, 80);
      const leadBias = 0.45 + autoPilotCtx.style * 0.25;
      const lead = clamp(eta * leadBias, 0, 0.4);

      const toLead = Math.atan2(prey.y + pvy * lead - me.y, prey.x + pvx * lead - me.x);
      const past = botPastPos(prey, now, iq.aimLag || 200);
      const toGun = Math.atan2(past.y - me.y, past.x - me.x);

      // 高速狗斗：全程油门，近距切开通过再回咬，绝不贴脸刹停
      if (now >= autoPilotCtx.orbitFlipAt) {
        autoPilotCtx.orbitSide = autoPilotCtx.orbitSide < 0 ? 1 : -1;
        autoPilotCtx.orbitFlipAt = now + 1800 + Math.random() * 2600;
      }
      desireThr = 1;
      if (dist < 260) {
        // 贴身切开：大侧偏转弯穿过，枪口仍瞄敌
        desireNose = toLead + autoPilotCtx.orbitSide * (0.85 + autoPilotCtx.style * 0.35) + autoPilotCtx.wobble;
        hardTurn = true;
      } else if (dist < 520) {
        desireNose = toLead + autoPilotCtx.orbitSide * 0.42 + autoPilotCtx.wobble * 0.35;
        hardTurn = Math.abs(angleDelta(desireNose, me.heading)) > 0.45;
      } else if (dist < 980) {
        desireNose = toLead + autoPilotCtx.orbitSide * 0.16 + autoPilotCtx.wobble * 0.2;
      } else {
        desireNose = toLead + autoPilotCtx.wobble * 0.15;
      }

      const aimEvery = autoPilotCtx.aimEvery > 0 ? autoPilotCtx.aimEvery : iq.aimEvery;
      if (aimEvery > 0) {
        if (!Number.isFinite(autoPilotCtx.aimHold) || now >= autoPilotCtx.aimHoldAt || autoPilotCtx.aimHoldId !== prey.id) {
          autoPilotCtx.aimHold = toGun + (Math.random() - 0.5) * iq.aimNoise;
          autoPilotCtx.aimHoldAt = now + aimEvery;
          autoPilotCtx.aimHoldId = prey.id;
        }
        desireGun = autoPilotCtx.aimHold;
      } else {
        desireGun = toGun + autoPilotCtx.wobble * 0.25 + (Math.random() - 0.5) * iq.aimNoise;
      }
      const aimNow = Number.isFinite(autoPilotCtx.gunAim) ? autoPilotCtx.gunAim : me.heading;
      const aimErr = Math.abs(angleDelta(desireGun, aimNow));
      const noseErr = Math.abs(angleDelta(desireNose, me.heading));
      const canShoot = gunAmmo >= 1 && dist < 1250 && aimErr < (0.55 + autoPilotCtx.style * 0.35) * iq.shootCone;
      const spray = Math.random() < (0.04 + autoPilotCtx.style * 0.04) * (autoPilotCtx.iq >= 3 ? 0.55 : autoPilotCtx.iq >= 2 ? 0.75 : 1);
      fireGun = tickBurstFire(canShoot || spray, dt);

      missileTarget = prey.id;
      autoPilotCtx.misThink -= dt;
      if (autoPilotCtx.misThink <= 0) {
        autoPilotCtx.misThink = (0.45 + Math.random() * 0.9) * iq.misThink;
        const sub = (autoPilotCtx.lo && autoPilotCtx.lo.sub) || "missile";
        const misChance = (0.45 + autoPilotCtx.style * 0.3) * (autoPilotCtx.iq >= 3 ? 0.55 : autoPilotCtx.iq >= 2 ? 0.8 : 1);
        if (sub === "laser" || sub === "emp") {
          // 激?电磁：按 300~600ms 前位置判瞄，再开?
          const subAim = botSubWeaponAim(me, prey.id, now);
          const subErr = Math.abs(angleDelta(subAim, Number.isFinite(autoPilotCtx.gunAim) ? autoPilotCtx.gunAim : me.heading));
          fireMissile = dist > 180 && dist < 1200 && subErr < 0.95 * iq.shootCone && Math.random() < misChance;
        } else {
          const goodMis = missileAmmo >= 1 && dist > 220 && dist < 1200 && aimErr < 0.9 * iq.shootCone && noseErr < 1.1;
          fireMissile = goodMis && Math.random() < misChance;
        }
      }
    } else if (now < autoPilotCtx.memoryUntil) {
      desireNose = Math.atan2(autoPilotCtx.lastSeenY - me.y, autoPilotCtx.lastSeenX - me.x) + autoPilotCtx.wobble * 0.3;
      desireGun = desireNose;
      desireThr = 0.94;
      tickBurstFire(false, dt);
    } else if (nearEdge) {
      desireNose = Math.atan2(-me.y, -me.x);
      desireGun = desireNose;
      desireThr = 0.9;
      tickBurstFire(false, dt);
    } else {
      autoPilotCtx.roamT -= dt;
      if (autoPilotCtx.roamT <= 0) {
        autoPilotCtx.roamT = 3.5 + Math.random() * 4.5;
        const r = Math.random();
        // 大半时间直行，偶尔一点点?
        autoPilotCtx.roamSide = r < 0.18 ? -1 : r > 0.82 ? 1 : 0;
      }
      desireNose = me.heading + autoPilotCtx.roamSide * 0.12 + autoPilotCtx.wobble;
      desireGun = desireNose;
      desireThr = 0.96;
      tickBurstFire(false, dt);
    }

    // 避障：只在很近才大幅改航向；平时保持高?
    if (rock && rock.clear < 280) {
      if (!panic && rock.clear < 160) autoPilotCtx.panicUntil = now + 280 + Math.random() * 220;
      panic = now < autoPilotCtx.panicUntil;
      const dodge = (rock.side >= 0 ? -1 : 1) * (0.45 + Math.random() * 0.35);
      if (rock.clear < 150) {
        const mix = rock.clear < 100 ? 0.9 : 0.55;
        desireNose = desireNose * (1 - mix) + (me.heading + dodge) * mix;
        hardTurn = rock.clear < 110;
        desireThr = Math.min(desireThr, rock.clear < 90 ? 0.55 : 0.78);
        if (rock.clear < 70 && Math.random() < 0.25) brake = true;
      } else {
        desireNose += dodge * 0.2;
        desireThr = Math.min(desireThr, 0.88);
      }
      if (!prey) desireGun = desireNose;
    }

    // 狗斗时允许更快拧机头；枪口仍单独?
    const noseRate = (hardTurn ? 2.6 : 1.55) + autoPilotCtx.style * 0.7;
    const gunRate = (4.8 + autoPilotCtx.style * 2.0) * iq.gunRate;
    autoPilotCtx.noseAim = slewAngle(autoPilotCtx.noseAim, desireNose, noseRate, dt);
    autoPilotCtx.gunAim = slewAngle(autoPilotCtx.gunAim, desireGun, gunRate, dt);
    // 战斗油门底线抬高；仅极端撞岩才允许掉?
    const thrFloor = rock && rock.clear < 90 ? 0.55 : 0.94;
    const thrWant = clamp(Math.max(desireThr, thrFloor), thrFloor, 1);
    autoPilotCtx.thr = softThr(autoPilotCtx.thr, thrWant, dt);
    if (!(rock && rock.clear < 90) && autoPilotCtx.thr < 0.94) autoPilotCtx.thr = 0.94;
    // 狗斗不踩刹；仅近岩紧?
    if (!(rock && rock.clear < 70)) brake = false;

    const nose = autoPilotCtx.noseAim;
    const gun = autoPilotCtx.gunAim;
    const turnErr = angleDelta(nose, me.heading);
    const turn = hardTurn && Math.abs(turnErr) > 0.16 ? (turnErr > 0 ? 1 : -1) : 0;

    lastAutoCmd = {
      up: true,
      down: false,
      brake,
      turn,
      aim: nose,
      gunAim: gun,
      throttle: autoPilotCtx.thr,
      fireGun,
      fireMissile,
      missileTarget,
    };
    return lastAutoCmd;
  }

  function inputPayload(overrides = {}) {
    if (autoPilot) {
      // 发送前若上下文空，用最新快照兜底，避免“完全不动?
      if (!autoPilotCtx.me || !Number.isFinite(autoPilotCtx.me.x)) {
        const snap = latestPlayers.find((p) => p.id === myId);
        if (snap) {
          autoPilotCtx.me = {
            id: myId, x: snap.x, y: snap.y, heading: snap.heading,
            vx: 0, vy: 0, spd: 0, throttle: snap.thr || 0, respawn: 0,
          };
        }
      }
      const bot = computeAutoPilot();
      return {
        type: "input",
        up: !!bot.up,
        down: !!bot.down,
        brake: !!bot.brake,
        turn: bot.turn || 0,
        aim: bot.aim,
        gunAim: bot.gunAim,
        missileAim: bot.gunAim,
        throttle: Number.isFinite(bot.throttle) ? bot.throttle : 0.7,
        fireGun: !!bot.fireGun,
        fireMissile: !!bot.fireMissile,
        missileTarget: bot.missileTarget,
        gear: "F",
        ...overrides,
      };
    }
    const manualActive = manualThrottle !== null && performance.now() < manualThrottleUntil;
    const flyAim = flyStick.active && Number.isFinite(flyStick.angle) ? flyStick.angle : null;
    const pointerAim = !IS_MOBILE && pointer.left && !gunStick.active ? Math.atan2(pointer.y - H / 2, pointer.x - W / 2) : null;
    return {
      type: "input",
      up: keys.up,
      down: keys.down,
      brake: keys.brake,
      turn: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      aim: flyAim ?? pointerAim,
      gunAim: Number.isFinite(gunStick.angle) ? gunStick.angle : cursorAim(),
      missileAim: !IS_MOBILE && pointer.right ? cursorAim() : null,
      throttle: IS_MOBILE
        ? speedLever
        : (manualActive ? manualThrottle : null),
      fireGun: gunHeld(),
      fireMissile: missileHeld(),
      missileTarget: missileFocus,
      gear: "F",
      ...overrides,
    };
  }
  function emptyBotCtx(iq) {
    const s = 0.35 + Math.random() * 0.55;
    const tier = iq === 2 || iq === 3 ? iq : 1;
    const cfg = botIqCfg(tier);
    return {
      style: s, iq: tier, fireWarm: 0, targetId: null, targetUntil: 0, reacquireAt: 0,
      noseAim: null, gunAim: null, thr: 0.88 + s * 0.08,
      roamT: 2.5 + Math.random() * 2, roamSide: 0,
      orbitSide: Math.random() < 0.5 ? -1 : 1,
      orbitFlipAt: performance.now() + 5000 + Math.random() * 5000,
      burstLeft: 0.2, burstPause: 0, misThink: (0.2 + Math.random() * 0.4) * cfg.misThink,
      reactAt: 0, panicUntil: 0, wobble: 0, wobbleT: 0,
      lastSeenX: 0, lastSeenY: 0, memoryUntil: 0,
      aimHold: null, aimHoldAt: 0, aimHoldId: null, aimEvery: 0,
    };
  }

  function pullBotFields(dst) {
    const keys = [
      "style", "iq", "fireWarm", "targetId", "targetUntil", "reacquireAt", "noseAim", "gunAim", "thr",
      "roamT", "roamSide", "orbitSide", "orbitFlipAt", "burstLeft", "burstPause", "misThink",
      "reactAt", "panicUntil", "wobble", "wobbleT", "lastSeenX", "lastSeenY", "memoryUntil",
      "aimHold", "aimHoldAt", "aimHoldId", "aimEvery",
    ];
    for (const k of keys) dst[k] = autoPilotCtx[k];
  }

  function pushBotFields(src) {
    if (!src) return;
    for (const k of Object.keys(src)) autoPilotCtx[k] = src[k];
  }
  function localPadBox(team, teams, slot, rot) {
    const n = Math.max(1, teams);
    const ang = ((slot % n) / n) * Math.PI * 2 - Math.PI / 2 + (rot || 0);
    // 距中?= 半图 2/3；两队时 rot=0 一上一下、rot=π/2 一左一?
    const orbit = WORLD_LIMIT * 2 / 3;
    const cx = Math.cos(ang) * orbit;
    const cy = Math.sin(ang) * orbit;
    const half = PAD_SIZE * 0.5;
    return {
      team,
      color: TEAM_COLORS[team % TEAM_COLORS.length],
      x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half,
      cx, cy,
    };
  }

  function shuffleLocalSlots(n) {
    const slots = Array.from({ length: n }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = slots[i];
      slots[i] = slots[j];
      slots[j] = tmp;
    }
    return slots;
  }


  // 地图中央：真字形铁陨石（Canvas 字体成形，对?Godot?
  const SKYACE_TEXT = "SkyAceBlitz";
  const SKYACE_GLYPHS = {
  S: [".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###."],
  k: ["#....", "#...#", "#..#.", "###..", "#..#.", "#...#", "#...#"],
  y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", ".##.."],
  A: ["..#..", ".#.#.", "#...#", "#...#", "#####", "#...#", "#...#"],
  c: [".....", ".###.", "#...#", "#....", "#....", "#...#", ".###."],
  e: [".....", ".###.", "#...#", "#####", "#....", "#...#", ".###."],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  l: ["##", "##", "##", "##", "##", "##", "##"],
  i: ["##", "..", "##", "##", "##", "##", "##"],
  t: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..##."],
  z: [".....", "#####", "...#.", "..#..", ".#...", "#####", "....."],
};
  const SKYACE_LETTER_H = 210;
  const SKYACE_LETTER_GAP = 28;
  const SKYACE_ALPHA = 40;

  function skyAceBlitzLetterPlan() {
    const letters = [];
    let totalW = 0;
    for (const ch of SKYACE_TEXT) {
      const g = SKYACE_GLYPHS[ch] || SKYACE_GLYPHS.A;
      const cols = Math.max(...g.map((r) => r.length));
      const rows = g.length;
      const w = SKYACE_LETTER_H * (cols / rows);
      letters.push({ ch, w });
      totalW += w + SKYACE_LETTER_GAP;
    }
    totalW -= SKYACE_LETTER_GAP;
    let cursor = -totalW / 2;
    const out = [];
    for (const L of letters) {
      out.push({ ch: L.ch, x: cursor + L.w / 2, y: 0 });
      cursor += L.w + SKYACE_LETTER_GAP;
    }
    return { letters: out, halfW: totalW / 2 + 90, halfH: SKYACE_LETTER_H / 2 + 90 };
  }

  function buildCanvasGlyphOccupancy(ch, targetH) {
    const REF = 220;
    let tmp;
    try {
      tmp = document.createElement("canvas");
      if (!tmp || typeof tmp.getContext !== "function") return null;
      tmp.width = Math.ceil(REF * 2.4);
      tmp.height = Math.ceil(REF * 2.4);
    } catch (e) { return null; }
    const tg = tmp.getContext("2d");
    if (!tg || typeof tg.getImageData !== "function") return null;
    tg.font = `900 ${REF}px "Segoe UI", "Arial Black", "Impact", "Microsoft YaHei", sans-serif`;
    tg.textAlign = "center";
    tg.textBaseline = "middle";
    tg.fillStyle = "#fff";
    tg.strokeStyle = "#fff";
    // 加粗描边，字母铁陨石更有辨识?
    tg.lineWidth = REF * 0.085;
    tg.lineJoin = "round";
    tg.miterLimit = 2;
    tg.strokeText(ch, tmp.width / 2, tmp.height / 2);
    tg.fillText(ch, tmp.width / 2, tmp.height / 2);
    tg.lineWidth = REF * 0.035;
    tg.strokeText(ch, tmp.width / 2, tmp.height / 2);
    const data = tg.getImageData(0, 0, tmp.width, tmp.height).data;
    let x0 = tmp.width, y0 = tmp.height, x1 = -1, y1 = -1;
    for (let y = 0; y < tmp.height; y++) {
      for (let x = 0; x < tmp.width; x++) {
        if (data[(y * tmp.width + x) * 4 + 3] > SKYACE_ALPHA) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0) return null;
    const inkW = x1 - x0 + 1;
    const inkH = y1 - y0 + 1;
    const s = targetH / inkH;
    const drawW = Math.max(1, Math.round(inkW * s));
    const drawH = Math.max(1, Math.round(inkH * s));
    const pad = Math.max(8, Math.round(targetH * 0.08));
    const size = Math.max(drawW, drawH) + pad * 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(tmp, x0, y0, inkW, inkH, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
    const img = g.getImageData(0, 0, size, size).data;
    const grid = new Uint8Array(TOPO_G * TOPO_G);
    const cell = size / TOPO_G;
    let solid = 0;
    for (let cy = 0; cy < TOPO_G; cy++) {
      for (let cx = 0; cx < TOPO_G; cx++) {
        let hit = false;
        for (let sy = 0; sy < 3 && !hit; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const px = Math.min(size - 1, Math.round((cx + 0.2 + sx * 0.3) * cell));
            const py = Math.min(size - 1, Math.round((cy + 0.2 + sy * 0.3) * cell));
            if (img[(py * size + px) * 4 + 3] > SKYACE_ALPHA) { hit = true; break; }
          }
        }
        if (hit) {
          grid[cy * TOPO_G + cx] = 1;
          solid++;
        }
      }
    }
    const extent = size / 2;
    return { grid, solid, extent, canvas, inkW: drawW, inkH: drawH };
  }

  function makeGlyphAsteroid(id, ch, x, y, opts) {
    return null;
    const asIron = !!(opts && opts.iron);
    const occ = buildCanvasGlyphOccupancy(ch, SKYACE_LETTER_H);
    if (!occ || occ.solid < 8) return null;
    const rock = {
      id, x, y, vx: 0, vy: 0,
      r: 1, spin: 0, rotation: 0,
      pts: [[0, -1], [1, 0], [0, 1], [-1, 0]].map((p) => [p[0] * occ.extent * 0.9, p[1] * occ.extent * 0.9]),
      holes: [], flash: 0,
      grid: occ.grid, solid: occ.solid, extent: occ.extent,
      iron: asIron, glyphChar: ch, glyphCanvas: occ.canvas,
      scars: [], welds: [], generation: 0, erosion: 0,
      area: Math.max(60, occ.solid * ((occ.extent * 2) / TOPO_G) ** 2),
      noFracture: true, lastVx: 0, lastVy: 0,
      mask: null, mctx: null, maskScale: 1,
    };
    rock.r = rockInkRClient(rock);
    rememberRock(rock);
    rock.blocky = true;
    rock.glyphChar = ch;
    // wx ?grid 块绘制字形；mask 可选（铁银?/ 土褐?
    try {
      const px = Math.max(48, Math.round(occ.extent * 2));
      const cnv = document.createElement("canvas");
      if (cnv && typeof cnv.getContext === "function") {
        cnv.width = px;
        cnv.height = px;
        const g = cnv.getContext("2d");
        if (g) {
          const grd = g.createRadialGradient(px * 0.35, px * 0.3, px * 0.08, px * 0.5, px * 0.5, px * 0.55);
          if (asIron) {
            grd.addColorStop(0, "#e8eef4");
            grd.addColorStop(0.4, "#9aa8b4");
            grd.addColorStop(1, "#3a444c");
          } else {
            grd.addColorStop(0, "#d7c4a8");
            grd.addColorStop(0.38, "#a3896c");
            grd.addColorStop(1, "#5a4636");
          }
          g.fillStyle = grd;
          g.fillRect(0, 0, px, px);
          g.globalCompositeOperation = "destination-in";
          g.drawImage(occ.canvas, 0, 0, px, px);
          g.globalCompositeOperation = "source-over";
          rock.mask = cnv;
          rock.mctx = g;
          rock.maskScale = px / (occ.extent * 2);
        }
      }
    } catch (e) {}
    return rock;
  }
  function makeGlyphIronAsteroid(id, ch, x, y) {
    return makeGlyphAsteroid(id, ch, x, y, { iron: true });
  }

  let localRockSeq = 10000;

  function makeLocalAsteroid(id, fixed) {
    let x, y, r, iron;
    if (fixed) {
      x = fixed.x; y = fixed.y; r = fixed.r; iron = !!fixed.iron;
    } else {
      // 半径?2 倍（与线上开局土陨石一致）
      r = (30 + (id % 7) * 10 + pseudoRandom(id * 3.7) * 34) * 2;
      const ang = pseudoRandom(id * 9.1) * Math.PI * 2;
      const rad = 280 + pseudoRandom(id * 5.3) * (WORLD_LIMIT * 0.72);
      x = Math.cos(ang) * rad;
      y = Math.sin(ang) * rad;
      // 默认土陨石；少量固定铁石?fixed 指定
      iron = false;
    }
    const pts = makeRockPts(id + 9000, r);
    const built = buildRockGrid(pts, r);
    const cell = (built.extent * 2) / TOPO_G;
    const rock = {
      id, x, y, vx: 0, vy: 0, r,
      spin: (iron || ASTEROIDS_STATIC) ? 0 : (pseudoRandom(id) - 0.5) * 0.15,
      rotation: iron ? 0 : pseudoRandom(id * 2.2) * Math.PI * 2,
      pts, holes: [], flash: 0, grid: built.grid, solid: built.solid, extent: built.extent,
      solidMax: built.solid, blocky: false,
      iron, scars: [], welds: [], generation: 0, erosion: 0,
      area: Math.max(60, built.solid * cell * cell),
      noFracture: !!iron, lastVx: 0, lastVy: 0,
    };
    rememberRock(rock);
    paintMaskFromGrid(rock);
    lockAsteroidMotion(rock);
    return rock;
  }

  function spawnLocalRockChild(parent, grid, solid, vx, vy, spin) {
    const id = ++localRockSeq;
    const dir = gridSplitDir(grid, parent.extent, parent.rotation || 0);
    const rock = {
      id,
      x: parent.x,
      y: parent.y,
      vx: ASTEROIDS_STATIC ? 0 : vx,
      vy: ASTEROIDS_STATIC ? 0 : vy,
      r: parent.r,
      spin: ASTEROIDS_STATIC ? 0 : spin,
      rotation: parent.rotation || 0,
      pts: parent.pts, holes: [], flash: 0.22,
      grid, solid, extent: parent.extent,
      iron: false, scars: [], welds: [],
      generation: (parent.generation || 0) + 1,
      erosion: 0, noFracture: true,
      area: Math.max(60, solid * ((parent.extent * 2) / TOPO_G) ** 2),
      lastVx: vx, lastVy: vy,
      splitBorn: performance.now(),
      // 静止：不弹开；仍记方向供绘制淡入
      splitDx: ASTEROIDS_STATIC ? 0 : dir.x,
      splitDy: ASTEROIDS_STATIC ? 0 : dir.y,
      mask: null, mctx: null, maskScale: 1,
    };
    rock.r = rockInkRClient(rock);
    rememberRock(rock);
    paintMaskFromGrid(rock);
    lockAsteroidMotion(rock);
    asteroids.set(id, rock);
    return rock;
  }

  function shatterLocalRock(a, vx, vy) {
    if (!a || a.fadeOut || a.iron) return;
    a.lastVx = vx;
    a.lastVy = vy;
    const ext = a.extent;
    const cell = (ext * 2) / TOPO_G;
    const ang = Math.atan2(vy || a.vy || 0, vx || a.vx || 1) - (a.rotation || 0);
    const sc = Math.sin(ang);
    const cc = Math.cos(ang);
    const halves = [];
    for (const side of [-1, 1]) {
      const childGrid = new Uint8Array(TOPO_G * TOPO_G);
      let solid = 0;
      for (let cy = 0; cy < TOPO_G; cy++) {
        const ly = -ext + (cy + 0.5) * cell;
        for (let cx = 0; cx < TOPO_G; cx++) {
          if (a.grid[cy * TOPO_G + cx] !== 1) continue;
          const lx = -ext + (cx + 0.5) * cell;
          const v = lx * sc + ly * cc;
          if ((side > 0 && v >= 0) || (side < 0 && v <= 0)) {
            childGrid[cy * TOPO_G + cx] = 1;
            solid++;
          }
        }
      }
      if (solid < 8) continue;
      const bulletAng = Math.atan2(vy || 0.01, vx || 1);
      const px = Math.cos(bulletAng + Math.PI * 0.5) * side;
      const py = Math.sin(bulletAng + Math.PI * 0.5) * side;
      const speed = ASTEROIDS_STATIC ? 0 : (14 + Math.random() * 12);
      halves.push({
        grid: childGrid, solid,
        vx: ASTEROIDS_STATIC ? 0 : ((a.vx || 0) + px * speed),
        vy: ASTEROIDS_STATIC ? 0 : ((a.vy || 0) + py * speed),
        spin: ASTEROIDS_STATIC ? 0 : ((a.spin || 0) + (Math.random() * 2 - 1) * 0.08),
      });
    }
    ejectRockGrains(a, 0, 0, Math.max(10, (a.r || 20) * 0.55), vx, vy);
    if (!halves.length) {
      a.fadeOut = performance.now();
      a.vx = 0;
      a.vy = 0;
      return;
    }
    a.fadeOut = performance.now();
    a.vx = 0;
    a.vy = 0;
    for (const h of halves) spawnLocalRockChild(a, h.grid, h.solid, h.vx, h.vy, h.spin);
    sfx?.playRockChip?.();
  }

  function applyLocalRockHit(a, hit, vx, vy, heavy) {
    if (!a || a.fadeOut) return;
    const cannon = heavy === "cannon";
    const erase = cannon
      ? clamp(a.r * (0.4 + Math.random() * 0.08), 12, a.r * 0.52)
      : heavy
        ? clamp(a.r * (0.32 + Math.random() * 0.08), 8, a.r * 0.45)
        : clamp(a.r * (0.15 + Math.random() * 0.1), 4, a.r * 0.25);
    a.lastVx = vx;
    a.lastVy = vy;
    addRockHole(a, hit.lx, hit.ly, erase, vx, vy, false);
    if (a.iron) {
      sfx?.playMetalPing?.();
      return;
    }
    sfx?.playRockChip?.();
    const disk = Math.PI * erase * erase;
    a.area = a.area || Math.max(60, (a.solid || 60) * ((a.extent * 2) / TOPO_G) ** 2);
    a.erosion = Math.min(1, (a.erosion || 0) + disk / Math.max(a.area, 1));
    if ((a.generation || 0) > 0 && (a.solid || 0) < 14) {
      ejectRockGrains(a, hit.lx, hit.ly, Math.max(6, erase), vx, vy);
      a.fadeOut = performance.now();
      a.vx = 0;
      a.vy = 0;
      return;
    }
    if (!a.noFracture && a.erosion >= (cannon ? 0.32 : heavy ? 0.4 : 0.55)) shatterLocalRock(a, vx, vy);
  }

  function nearestLocalEnemy(craft, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const o of localCrafts) {
      if (!o || o.id === craft.id || o.respawn > 0 || o.team === craft.team) continue;
      const d = Math.hypot(o.x - craft.x, o.y - craft.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  const MISSILE_MAX_SPEED = 420;
  const MISSILE_MIN_LAUNCH = 180; // 静止/倒飞也有初速，避免 0×2 永远不动
  const MISSILE_BOOST_DELAY = 0.3; // 先跟机速飞 300ms
  const MISSILE_BOOST_STEP = 0.2; // 之后?200ms 速度翻一?

  function missileLaunchSpeed(vx, vy, heading) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const along = Math.max(0, (vx || 0) * cos + (vy || 0) * sin);
    return Math.max(MISSILE_MIN_LAUNCH, along);
  }

  function missileSpeedAtAge(launchSpeed, age) {
    let spd = Math.max(MISSILE_MIN_LAUNCH, launchSpeed || 0);
    if (!(age >= MISSILE_BOOST_DELAY)) return spd;
    const stages = 1 + Math.floor((age - MISSILE_BOOST_DELAY) / MISSILE_BOOST_STEP);
    for (let i = 0; i < stages; i++) {
      spd = Math.min(MISSILE_MAX_SPEED, spd * 2);
      if (spd >= MISSILE_MAX_SPEED) break;
    }
    return spd;
  }

  // 飞离发射点超?3 个机位才解体（机身长?8?
  const MIRV_SPLIT_DIST = 48 * 3;
  const MIRV_CHILD_N = 5;
  const MIRV_CHILD_DMG = 0.4;
  const MIRV_CHILD_SCALE = 0.55;
  const MIRV_CHILD_COAST = 0.28; // 先向外冲一段再折向目标
  const MIRV_CHILD_SEP = 42;

  function spawnLocalMissile(craft, targetId, opts) {
    if (!craft) return null;
    let target = localCrafts.find((c) => c.id === targetId && !(c.respawn > 0) && c.team !== craft.team);
    if (!target) target = nearestLocalEnemy(craft, 1200);
    const cos = Math.cos(craft.heading);
    const sin = Math.sin(craft.heading);
    const muzzleK = 18 * (0.95 + 0.15 * clamp(craft.throttle || 0, 0, 1));
    const x = craft.x + cos * muzzleK;
    const y = craft.y + sin * muzzleK;
    const launchSpeed = missileLaunchSpeed(craft.vx, craft.vy, craft.heading);
    const mirv = !!(opts && opts.mirv);
    const m = {
      id: ++localMissileSeq,
      ownerId: craft.id,
      targetId: target ? target.id : null,
      x, y, prevX: x, prevY: y,
      heading: craft.heading,
      launchSpeed,
      speed: launchSpeed,
      age: 0,
      life: mirv ? 4.5 : 5,
      trail: [],
      mirvBus: mirv,
      mirvChild: false,
      drawScale: 1,
      dmgScale: 1,
      originX: x,
      originY: y,
    };
    localMissiles.push(m);
    if (localMissiles.length > 80) localMissiles.splice(0, localMissiles.length - 80);
    if (worldOnView(x, y, 140)) sfx?.playMissile?.(craft.id);
    return m;
  }

  // 多弹头一级推进舱脱落：燃料舱/尾喷管翻滚后飘，无爆?
  const mirvStages = [];
  function spawnMirvStageSep(bus) {
    if (!bus) return;
    try { sfx?.playMirvSep?.(); } catch (e) {}
    const h = bus.heading || 0;
    const cs = Math.cos(h);
    const sn = Math.sin(h);
    const px = -sn;
    const py = cs;
    const spd = Math.max(bus.speed || 0, 140);
    // 左右燃料舱：侧向剥离 + 相对航迹减速后?
    for (const side of [-1, 1]) {
      const kick = 55 + Math.random() * 35;
      mirvStages.push({
        kind: "tank",
        x: bus.x + px * side * 5 - cs * 4,
        y: bus.y + py * side * 5 - sn * 4,
        vx: cs * spd * 0.42 + px * side * kick - cs * (35 + Math.random() * 25),
        vy: sn * spd * 0.42 + py * side * kick - sn * (35 + Math.random() * 25),
        rot: h + side * 0.35,
        spin: side * (2.8 + Math.random() * 1.6),
        age: 0,
        life: 1.15 + Math.random() * 0.25,
        side,
      });
    }
    // 助战房主失败：回航图
    mirvStages.push({
      kind: "nozzle",
      x: bus.x - cs * 10,
      y: bus.y - sn * 10,
      vx: cs * spd * 0.28 - cs * (90 + Math.random() * 40) + px * (Math.random() - 0.5) * 30,
      vy: sn * spd * 0.28 - sn * (90 + Math.random() * 40) + py * (Math.random() - 0.5) * 30,
      rot: h + Math.PI,
      spin: (Math.random() - 0.5) * 5,
      age: 0,
      life: 1.0,
      side: 0,
    });
    // 分离面冷?残燃白烟（不是爆炸）
    for (let i = 0; i < 10; i++) {
      const p = takeDmgFx();
      const ang = h + Math.PI + (Math.random() - 0.5) * 1.2;
      p.kind = "smoke";
      p.x = bus.x + (Math.random() - 0.5) * 8;
      p.y = bus.y + (Math.random() - 0.5) * 8;
      p.vx = Math.cos(ang) * (20 + Math.random() * 50) + cs * spd * 0.15;
      p.vy = Math.sin(ang) * (20 + Math.random() * 50) + sn * spd * 0.15;
      p.life = 0.35 + Math.random() * 0.45;
      p.size = 2.5 + Math.random() * 4;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 2;
      p.hurt = 0.25 + Math.random() * 0.2;
    }
    // 舱体小火花（分离销崩开?
    for (let i = 0; i < 8; i++) {
      const p = takeDebris();
      const ang = h + Math.PI * 0.5 * (i % 2 === 0 ? 1 : -1) + (Math.random() - 0.5) * 0.8;
      p.active = true;
      p.spark = true;
      p.x = bus.x;
      p.y = bus.y;
      p.vx = Math.cos(ang) * (40 + Math.random() * 80) + cs * spd * 0.2;
      p.vy = Math.sin(ang) * (40 + Math.random() * 80) + sn * spd * 0.2;
      p.size = 0.7 + Math.random() * 0.6;
      p.age = 0;
      p.life = 0.18 + Math.random() * 0.2;
      p.rot = 0;
      p.spin = 0;
      p.color = "#ffd29a";
      p.template = 0;
    }
    if (mirvStages.length > 24) mirvStages.splice(0, mirvStages.length - 24);
  }
  function updateMirvStages(dt) {
    for (let i = mirvStages.length - 1; i >= 0; i--) {
      const s = mirvStages[i];
      s.age += dt;
      if (s.age >= s.life) {
        mirvStages.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-1.35 * dt);
      s.vx *= damp;
      s.vy *= damp;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      s.spin *= Math.exp(-0.8 * dt);
      // 池偏低时后台再补一轮
      if (s.kind === "tank" && Math.random() < 0.35) {
        const p = takeDmgFx();
        p.kind = "smoke";
        p.x = s.x - Math.cos(s.rot) * 6;
        p.y = s.y - Math.sin(s.rot) * 6;
        p.vx = s.vx * 0.3 + (Math.random() - 0.5) * 12;
        p.vy = s.vy * 0.3 + (Math.random() - 0.5) * 12;
        p.life = 0.25 + Math.random() * 0.25;
        p.size = 2 + Math.random() * 2.5;
        p.rot = Math.random() * Math.PI * 2;
        p.spin = (Math.random() - 0.5) * 1.5;
        p.hurt = 0.2;
      }
    }
  }
  function drawMirvStages(camera) {
    for (let i = 0; i < mirvStages.length; i++) {
      const s = mirvStages[i];
      const p = screen(s.x, s.y, camera);
      const vis = viewPad(40);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
      const u = s.age / s.life;
      const alpha = u < 0.12 ? 1 : Math.pow(1 - (u - 0.12) / 0.88, 1.15);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(s.rot + Math.PI / 2);
      if (s.kind === "nozzle") {
        ctx.fillStyle = "#6a727a";
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.lineTo(5, -3);
        ctx.lineTo(7, 5);
        ctx.lineTo(-7, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#3a4046";
        ctx.fillRect(-4, 4, 8, 3);
        // 残焰口微?
        ctx.globalAlpha = alpha * (0.35 + 0.4 * (1 - u));
        ctx.fillStyle = "#ffb068";
        ctx.beginPath();
        ctx.moveTo(-3, 7);
        ctx.lineTo(0, 12 + Math.random() * 3);
        ctx.lineTo(3, 7);
        ctx.closePath();
        ctx.fill();
      } else {
        // 燃料舱筒?
        ctx.fillStyle = "#c8d0d6";
        ctx.fillRect(-4.2, -11, 8.4, 20);
        ctx.fillStyle = "#9aa4ae";
        ctx.fillRect(-4.2, -11, 8.4, 3.5);
        ctx.fillRect(-4.2, 6, 8.4, 3);
        ctx.fillStyle = "#ff8a3c";
        ctx.fillRect(-3.2, -2.5, 6.4, 4);
      // 无法拉起授权按钮
        ctx.strokeStyle = "rgba(255,240,210,0.85)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-4.2, -11);
        ctx.lineTo(4.2, -11);
        ctx.stroke();
        // 舱尾小喷口余?
        if (u < 0.55) {
          ctx.globalAlpha = alpha * (0.5 - u);
          ctx.fillStyle = "#ffcc77";
          ctx.beginPath();
          ctx.moveTo(-2, 11);
          ctx.lineTo(0, 16 + (1 - u) * 4);
          ctx.lineTo(2, 11);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /** 多弹头母弹无爆裂变：沿分离前航向扇形散开，再折向目标 */
  function splitLocalMirv(bus) {
    if (!bus) return;
    spawnMirvStageSep(bus);
    const baseH = bus.heading || 0;
    const childSpeed = Math.max(bus.speed || 0, 180);
    // 相对前进方向左右扇开（保持前向，不做环向乱散?
    const fan = 0.95; // 总扇角约 ±54°
    for (let i = 0; i < MIRV_CHILD_N; i++) {
      const t = MIRV_CHILD_N <= 1 ? 0.5 : i / (MIRV_CHILD_N - 1);
      const spread = (t - 0.5) * 2 * fan;
      const outAng = baseH + spread;
      const ox = Math.cos(outAng) * (10 + Math.abs(spread) * 18);
      const oy = Math.sin(outAng) * (10 + Math.abs(spread) * 18);
      localMissiles.push({
        id: ++localMissileSeq,
        ownerId: bus.ownerId,
        targetId: bus.targetId,
        x: bus.x + ox,
        y: bus.y + oy,
        prevX: bus.x + ox,
        prevY: bus.y + oy,
        heading: outAng,
        launchSpeed: childSpeed,
        speed: childSpeed,
        age: 0,
        life: 4.8,
        trail: [],
        mirvBus: false,
        mirvChild: true,
        drawScale: MIRV_CHILD_SCALE,
        dmgScale: MIRV_CHILD_DMG,
        turnRate: 7.4,
        mirvCoast: MIRV_CHILD_COAST,
      });
    }
    if (localMissiles.length > 80) localMissiles.splice(0, localMissiles.length - 80);
  }

  function missileDamageOf(m) {
    return MISSILE_DAMAGE * (m && Number.isFinite(m.dmgScale) ? m.dmgScale : 1);
  }

  // —?认领自己的联机导弹（主镜头拉远用；小地图常驻全图，不再切特写）—?
  const myMissileClaim = new Set(); // ?ownerId 旧服时，用开火启发式认领的导?id
  let missileClaimUntil = 0;
  let seenNetMissileIds = new Set();

  function noteMissileFireClaim() {
    missileClaimUntil = performance.now() + 900;
  }

  /** 场上没有自己的导弹在飞时?00ms 过渡缩回主镜?*/
  const VIEW_ZOOM_MS = 0.1;
  function anyMyMissileFlying() {
    if (localMatch) return localMissiles.some((m) => m && m.ownerId === myId);
    return myMissileClaim.size > 0;
  }
  function updateMissileViewZoom(dt) {
    const target = anyMyMissileFlying() ? VIEW_SCALE_MISSILE : VIEW_SCALE_BASE;
    const t = Math.max(0, Number(dt) || 0.016);
    const range = Math.abs(VIEW_SCALE_BASE - VIEW_SCALE_MISSILE);
    const step = range * (t / VIEW_ZOOM_MS);
    const diff = target - VIEW_SCALE;
    if (Math.abs(diff) <= step) VIEW_SCALE = target;
    else VIEW_SCALE += Math.sign(diff) * step;
  }

  /** 匹配/开房：从服务器导弹列表认领自己的弹（仅用于主镜头拉远） */
  function syncMyMissileClaims(missiles, mePos) {
    const list = missiles || [];
    const now = performance.now();
    const nextSeen = new Set();
    for (const m of list) {
      nextSeen.add(m.id);
      if (m.ownerId === myId) {
        myMissileClaim.add(m.id);
        continue;
      }
      // 旧服?ownerId：开火后短窗内、出生在机头附近的新导弹认领为我?
      if (
        now < missileClaimUntil
        && !seenNetMissileIds.has(m.id)
        && !(m.ownerId > 0 && m.ownerId !== myId)
        && mePos
      ) {
        const d = Math.hypot(m.x - mePos.x, m.y - mePos.y);
        if (d < 90) myMissileClaim.add(m.id);
      }
    }
    for (const id of [...myMissileClaim]) {
      if (!nextSeen.has(id)) myMissileClaim.delete(id);
    }
    seenNetMissileIds = nextSeen;
  }

  // 所有武器（子弹/炮弹/导弹/激光）打飞机的判定半径，与服务器一?
  const CRAFT_HIT_R = 40;
  function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const fx = x0 - cx;
    const fy = y0 - cy;
    const a = dx * dx + dy * dy || 1;
    const t = clamp(-(fx * dx + fy * dy) / a, 0, 1);
    const px = fx + dx * t;
    const py = fy + dy * t;
    return px * px + py * py <= r * r;
  }

  function grantLocalSkill() {
    const craft = localCrafts.find((c) => c.id === myId);
    if (!craft || craft.respawn > 0) return;
    const pool = [
      {
        id: "gun10",
        label: "技?· 机关?+10",
        apply() {
          gunAmmo = Math.min(gunAmmoMax, gunAmmo + 10);
          craft.gunAmmo = gunAmmo;
        },
      },
      {
        id: "mis2",
        label: "技?· 导弹 +2",
        apply() {
          missileAmmo = Math.min(missileAmmoMax, missileAmmo + 2);
          craft.missileAmmo = missileAmmo;
        },
      },
      {
        id: "heal",
        label: "技?· 血量回",
        apply() {
          craft.hp = PLAYER_MAX_HP;
          const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
          st.hp = PLAYER_MAX_HP;
          playerStatus.set(craft.id, st);
        },
      },
      {
        id: "misCap",
        label: "技?· 导弹上限 10",
        apply() {
          missileAmmoMax = MISSILE_AMMO_HARD;
          missileAmmo = Math.min(missileAmmo, missileAmmoMax);
          craft.missileAmmo = missileAmmo;
        },
      },
    ];
    const pick = pool[(Math.random() * pool.length) | 0];
    pick.apply();
    showSkillToast(pick.label);
    renderAmmo();
    sfx?.playSelect?.();
  }

  function tickLocalSkills(dt) {
    if (!localMatch) return;
    localSkillAcc += dt;
    while (localSkillAcc >= 20) {
      localSkillAcc -= 20;
      grantLocalSkill();
    }
  }

  function spawnLocalDirtRock() {
    if (!localMatch) return;
    if (asteroids.size >= 220) return;
    const id = ++localRockSeq;
    const rock = makeLocalAsteroid(id);
    // 避开维修?
    for (const pad of factionPads) {
      if (!pad) continue;
      if (rock.x >= pad.x0 - 40 && rock.x <= pad.x1 + 40 && rock.y >= pad.y0 - 40 && rock.y <= pad.y1 + 40) {
        rock.x = (Math.random() * 2 - 1) * (WORLD_LIMIT - 200);
        rock.y = (Math.random() * 2 - 1) * (WORLD_LIMIT - 200);
        break;
      }
    }
    if (!ASTEROIDS_STATIC) {
      rock.vx = (Math.random() - 0.5) * 18;
      rock.vy = (Math.random() - 0.5) * 18;
      rock.spin = (Math.random() - 0.5) * 0.2;
    } else {
      lockAsteroidMotion(rock);
    }
    asteroids.set(id, rock);
  }

  function tickLocalDirtRocks(dt) {
    // 开局种完后不再补刷（与线上一致）
    if (!LOCAL_ROCK_SPAWN_EVERY || LOCAL_ROCK_SPAWN_EVERY <= 0) return;
    if (!localMatch || localLevelMode || localTrainMode) return;
    localRockSpawnAcc += dt;
    while (localRockSpawnAcc >= LOCAL_ROCK_SPAWN_EVERY) {
      localRockSpawnAcc -= LOCAL_ROCK_SPAWN_EVERY;
      spawnLocalDirtRock();
    }
  }

  function randomLocalPickupPos() {
    let x = 0;
    let y = 0;
    for (let t = 0; t < 16; t++) {
      x = (Math.random() * 2 - 1) * (WORLD_LIMIT - 140);
      y = (Math.random() * 2 - 1) * (WORLD_LIMIT - 140);
      let blocked = false;
      for (const pad of factionPads) {
        if (!pad) continue;
        if (x >= pad.x0 - 40 && x <= pad.x1 + 40 && y >= pad.y0 - 40 && y <= pad.y1 + 40) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (x * x + y * y < 280 * 280) continue;
      let near = false;
      for (const c of localCrafts) {
        if (!c || c.respawn > 0) continue;
        const dx = c.x - x;
        const dy = c.y - y;
        if (dx * dx + dy * dy < 160 * 160) { near = true; break; }
      }
      if (near) continue;
      break;
    }
    return { x, y };
  }

  function spawnLocalShieldPickup() {
    const pos = randomLocalPickupPos();
    localShieldPickups.push({ x: pos.x, y: pos.y, life: LOCAL_SHIELD_SPAWN_EVERY * 2.5 });
    if (localShieldPickups.length > 6) localShieldPickups.splice(0, localShieldPickups.length - 6);
  }

  function tickLocalMagPickups(dt) {
    if (!localMatch) return;
    if (!(localLevelMode || localTrainMode)) {
      localMagSpawnAcc += dt;
      while (localMagSpawnAcc >= LOCAL_MAG_SPAWN_EVERY) {
        localMagSpawnAcc -= LOCAL_MAG_SPAWN_EVERY;
        const pos = randomLocalPickupPos();
        localMagPickups.push({ x: pos.x, y: pos.y, life: LOCAL_MAG_SPAWN_EVERY * 3 });
        if (localMagPickups.length > 4) localMagPickups.splice(0, localMagPickups.length - 4);
      }
    }
    const r2 = LOCAL_MAG_PICK_R * LOCAL_MAG_PICK_R;
    for (let i = localMagPickups.length - 1; i >= 0; i--) {
      const pk = localMagPickups[i];
      pk.life -= dt;
      if (pk.life <= 0) {
        localMagPickups.splice(i, 1);
        continue;
      }
      for (const craft of localCrafts) {
        if (!craft || craft.respawn > 0) continue;
        const dx = craft.x - pk.x;
        const dy = craft.y - pk.y;
        if (dx * dx + dy * dy > r2) continue;
        if (craft.id === myId) {
          gunAmmoMax = Math.min(GUN_AMMO_HARD, gunAmmoMax + LOCAL_MAG_BONUS);
          gunAmmo = Math.min(gunAmmoMax, gunAmmo + LOCAL_MAG_BONUS);
          craft.gunAmmo = gunAmmo;
          renderAmmo();
          showSkillToast(`技?· 子弹容量 +${LOCAL_MAG_BONUS}`);
        }
        spawnHealBurst(pk.x, pk.y, "mag");
        sfx?.playSelect?.();
        localMagPickups.splice(i, 1);
        break;
      }
    }
  }

  function tickLocalShieldPickups(dt) {
    if (!localMatch) return;
    for (const c of localCrafts) {
      if (!c) continue;
      if (c.respawn > 0) c.shieldT = 0;
      else if (c.shieldT > 0) c.shieldT = Math.max(0, c.shieldT - dt);
    }
    if (localLevelMode || localTrainMode) return;
    localShieldSpawnAcc += dt;
    while (localShieldSpawnAcc >= LOCAL_SHIELD_SPAWN_EVERY) {
      localShieldSpawnAcc -= LOCAL_SHIELD_SPAWN_EVERY;
      spawnLocalShieldPickup();
    }
    const r2 = LOCAL_SHIELD_PICK_R * LOCAL_SHIELD_PICK_R;
    for (let i = localShieldPickups.length - 1; i >= 0; i--) {
      const pk = localShieldPickups[i];
      pk.life -= dt;
      if (pk.life <= 0) {
        localShieldPickups.splice(i, 1);
        continue;
      }
      for (const craft of localCrafts) {
        if (!craft || craft.respawn > 0) continue;
        const dx = craft.x - pk.x;
        const dy = craft.y - pk.y;
        if (dx * dx + dy * dy > r2) continue;
        craft.shieldT = LOCAL_SHIELD_DURATION;
        if (craft.id === myId) showSkillToast("技?· 保护");
        spawnHealBurst(pk.x, pk.y, "shield");
        sfx?.playSelect?.();
        localShieldPickups.splice(i, 1);
        break;
      }
    }
  }

  function stepLocalMissiles(dt) {
    for (let i = localMissiles.length - 1; i >= 0; i--) {
      const missile = localMissiles[i];
      missile.life -= dt;
      if (missile.life <= 0) {
        popMissileBlast(missile.x, missile.y, missile.mirvChild ? 0.45 : 0.7);
        localMissiles.splice(i, 1);
        continue;
      }
      missile.age = (missile.age || 0) + dt;
      if (missile.mirvCoast > 0) missile.mirvCoast = Math.max(0, missile.mirvCoast - dt);
      // 多弹头母弹：距离发射点超?3 个机位才裂变
      if (missile.mirvBus && !missile.mirvChild) {
        const ox = Number.isFinite(missile.originX) ? missile.originX : missile.x;
        const oy = Number.isFinite(missile.originY) ? missile.originY : missile.y;
        if (Math.hypot(missile.x - ox, missile.y - oy) > MIRV_SPLIT_DIST) {
          splitLocalMirv(missile);
          localMissiles.splice(i, 1);
          continue;
        }
      }
      const owner = localCrafts.find((c) => c.id === missile.ownerId);
      const fromMother = missile.ownerId === LEVEL_MOTHER_OID;
      const coasting = missile.mirvChild && missile.mirvCoast > 0;
      if (!missile.dumbfire && !coasting) {
        const target = localCrafts.find((c) => c.id === missile.targetId && !(c.respawn > 0));
        if (target && owner && target.team === owner.team) missile.targetId = null;
        else if (target) {
          const desired = Math.atan2(target.y - missile.y, target.x - missile.x);
          const turn = Number.isFinite(missile.turnRate) ? missile.turnRate : 5.2;
          missile.heading += clamp(angleDelta(desired, missile.heading), -turn * dt, turn * dt);
        } else if (!fromMother) {
          // 子弹无飞机目标时改追母舰
          if (missile.mirvChild) {
            let best = null;
            let bestD = 1e9;
            for (const ms of localMotherships) {
              if (!ms || ms.dead || ms.alive === false) continue;
              const d = Math.hypot(ms.x - missile.x, ms.y - missile.y);
              if (d < bestD) { bestD = d; best = ms; }
            }
            if (best) {
              const desired = Math.atan2(best.y - missile.y, best.x - missile.x);
              const turn = Number.isFinite(missile.turnRate) ? missile.turnRate : 5.2;
              missile.heading += clamp(angleDelta(desired, missile.heading), -turn * dt, turn * dt);
            } else missile.targetId = null;
          } else {
            missile.targetId = null;
          }
        }
      }

      if (!Number.isFinite(missile.launchSpeed)) missile.launchSpeed = missile.speed || 0;
      missile.speed = missileSpeedAtAge(missile.launchSpeed, missile.age);
      missile.prevX = missile.x;
      missile.prevY = missile.y;
      const inheritedVx = missile.dumbfire ? (missile.inheritVx || 0) : 0;
      const inheritedVy = missile.dumbfire ? (missile.inheritVy || 0) : 0;
      missile.x += (Math.cos(missile.heading) * missile.speed + inheritedVx) * dt;
      missile.y += (Math.sin(missile.heading) * missile.speed + inheritedVy) * dt;

      let consumed = false;
      let blast = missile.mirvChild ? 0.85 : 1.35;
      const dmg = missileDamageOf(missile);
      for (const a of asteroids.values()) {
        if (a.fadeOut) continue;
        const hit = sampleHitAsteroid(a, missile.prevX, missile.prevY, missile.x, missile.y);
        if (!hit) continue;
        applyLocalRockHit(
          a, hit,
          Math.cos(missile.heading) * missile.speed,
          Math.sin(missile.heading) * missile.speed,
          true
        );
        consumed = true;
        blast = missile.mirvChild ? 1.1 : 1.7;
        break;
      }
      if (!consumed) {
        for (const craft of localCrafts) {
          if (craft.id === missile.ownerId || craft.respawn > 0) continue;
          if (owner && craft.team === owner.team) continue;
          if (!segmentHitsCircle(missile.prevX, missile.prevY, missile.x, missile.y, craft.x, craft.y, CRAFT_HIT_R)) continue;
          damageLocalCraft(craft, dmg, missile.ownerId);
          craft.vx = (craft.vx || 0) + Math.cos(missile.heading) * (missile.mirvChild ? 10 : 18);
          craft.vy = (craft.vy || 0) + Math.sin(missile.heading) * (missile.mirvChild ? 10 : 18);
          spawnCraftSparks(missile.x, missile.y, Math.cos(missile.heading), Math.sin(missile.heading), missile.mirvChild ? 5 : 8);
          consumed = true;
          break;
        }
      }
      // 敌方导弹也可打掉玩家无人?
      {
        const meCraft = localCrafts.find((c) => c && c.id === myId);
        const myT = meCraft && Number.isInteger(meCraft.team) ? meCraft.team : 0;
        if (!consumed && missile.ownerId !== myId && !(owner && owner.team === myT)) {
          for (let di = localDrones.length - 1; di >= 0; di--) {
            const dr = localDrones[di];
            if (!dr || dr.hp <= 0) continue;
            if (!segmentHitsCircle(missile.prevX, missile.prevY, missile.x, missile.y, dr.x, dr.y, DRONE_HIT_R)) continue;
            damageTrainDrone(dr, dmg, missile.ownerId);
            spawnCraftSparks(missile.x, missile.y, Math.cos(missile.heading), Math.sin(missile.heading), 7);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && missile.ownerId === myId) {
        for (const m of localMotherships) {
          if (m.dead || m.alive === false) continue;
          if (!segmentHitsCircle(missile.prevX, missile.prevY, missile.x, missile.y, m.x, m.y, LEVEL_MOTHER_HIT_R)) continue;
          damageLocalMothership(m, dmg, missile.x, missile.y);
          consumed = true;
          blast = missile.mirvChild ? 1.1 : 1.7;
          break;
        }
      }
      if (consumed) {
        popMissileBlast(missile.x, missile.y, blast);
        localMissiles.splice(i, 1);
      }
    }
  }

  function randomSpeedTier() {
    return Math.random() < 0.5 ? 2 : 1;
  }
  function spawnLocalCraft(id, name, team, pad, bot) {
    const jitter = () => (Math.random() - 0.5) * 70;
    const iq = bot ? (1 + (Math.random() * 3 | 0)) : 1;
    // 真人按昵?双发解锁；机器人随机单发/双发
    const spdTier = bot
      ? randomSpeedTier()
      : Math.max(speedTierOfName(name), hasTwinUnlock() ? 2 : 1);
    const craft = {
      id, name, team, color: TEAM_COLORS[team % TEAM_COLORS.length],
      x: pad.cx + jitter(), y: pad.cy + jitter(),
      heading: Math.atan2(-pad.cy, -pad.cx) + (Math.random() - 0.5) * 0.4,
      vx: 0, vy: 0, throttle: bot ? 0.9 : 0, hp: PLAYER_MAX_HP, respawn: 0,
      brake: false, bot: !!bot, iq, brain: bot ? emptyBotCtx(iq) : null,
      gunAmmo: GUN_AMMO_MAX, gunAcc: 0, gunBurst: 0, gunHeldPrev: false,
      missileAmmo: MISSILE_AMMO_MAX, missileCd: 0,
      empAmmo: EMP_AMMO_MAX, empFireCd: 0,
      shieldT: 0,
      spdTier,
      input: null, kills: 0, deaths: 0,
      avatarUrl: "",
      avatarImg: null,
      human: !bot,
    };
    if (bot) {
      const picked = takeLocalMatchAvatar();
      if (picked) {
        craft.avatarUrl = picked.url;
        craft.avatarImg = picked.img;
      } else {
        craft.avatarImg = makeWxDefaultAvatar();
      }
    }
    const myCraft = trainLoadout
      ? normalizePlayerCraft(trainLoadout.craft)
      : getMyLoadout().craft;
    if (!bot) {
      craft.lo = trainLoadout
        ? { main: trainLoadout.main, sub: trainLoadout.sub, engine: trainLoadout.engine, craft: myCraft }
        : loadoutForMatch();
      craft.craftSkin = myCraft;
    }
    roster.set(id, {
      name, color: craft.color, team, spd: spdTier,
      craft: bot ? DEFAULT_PLAYER_CRAFT : myCraft,
    });
    playerStatus.set(id, { gear: "F", brake: false, hp: PLAYER_MAX_HP, respawn: 0 });
    if (id === myId) applyMySpeedTier(spdTier);
    return craft;
  }

  function buildLocalMatchBoard() {
    const byTeam = new Map();
    for (const c of localCrafts) {
      if (!c) continue;
      const team = Number.isInteger(c.team) ? c.team : 0;
      if (!byTeam.has(team)) {
        byTeam.set(team, {
          team,
          color: c.color || TEAM_COLORS[team % TEAM_COLORS.length],
          kills: 0,
          deaths: 0,
          players: [],
        });
      }
      const g = byTeam.get(team);
      const k = c.kills || 0;
      const d = c.deaths || 0;
      g.kills += k;
      g.deaths += d;
      // human 标记优先，避免匹配中?myId 被服务器 welcome 冲掉
      const isYou = !!c.human || Number(c.id) === Number(myId);
      const nick = c.name || (c.bot ? "ACE" : "PILOT");
      const avatarUrl = isYou ? (pilot.avatarUrl || "") : String(c.avatarUrl || "");
      let avatarImg = null;
      try {
        if (isYou) {
          avatarImg = pilot.avatarImg || (avatarUrl ? loadWaitAvatar(avatarUrl, nick) : null) || makeWxDefaultAvatar();
        } else if (c.avatarImg && ((c.avatarImg.width || 0) > 0 || c.avatarImg.src || c.avatarImg.getContext)) {
          avatarImg = c.avatarImg;
        } else if (avatarUrl) {
          avatarImg = loadWaitAvatar(avatarUrl, nick) || makeWxDefaultAvatar();
        } else {
          avatarImg = makeWxDefaultAvatar();
        }
      } catch (e) {
        avatarImg = makeWxDefaultAvatar();
      }
      g.players.push({
        name: nick,
        kills: k,
        deaths: d,
        you: isYou,
        bot: !!c.bot && !isYou,
        team,
        avatarUrl,
        avatarImg,
      });
    }
    for (const g of byTeam.values()) {
      g.players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    }
    const board = [...byTeam.values()];
    board.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.team - b.team);
    board.forEach((g, i) => { g.rank = i + 1; });
    return board;
  }

  function endLocalMatch(showSummary) {
    if (localTrainMode || localLevelMode) showSummary = false;
    try { sfx?.stopAll?.(); } catch (e) {}
    try { sfx?.setCannon?.(false); } catch (e) {}
    try { sfx?.tickFlight?.(0, 0, false, false); } catch (e) {}
    try { sfx?.tickOthers?.(0, 0, false); } catch (e) {}
    saveRejoin(null);
    const board = showSummary ? buildLocalMatchBoard() : null;
    // 仅完整打完才上报；中途退出不记录
    if (showSummary && board && !localTestMode) {
      reportLocalMatchResult(board);
      recordLocalHistory(board, "match");
    }
    const levelWon = localLevelMode && levelRunResult === "win";
    const wasAssistCoop = assistCoopMode;
    if (wasAssistCoop) {
      try {
        sendAssist("assistLeave");
        if (assistViaMatchRoom || phase === "waiting" || phase === "playing") {
          sendRoom("leave");
        }
      } catch (e) {}
      try {
        GameGlobal.assistGuestMode = false;
        GameGlobal.assistHostMode = false;
        GameGlobal.assistHostNode = null;
      } catch (e) {}
    }
    localMatch = false;
    localTestMode = false;
    localTrainMode = false;
    localLevelMode = false;
    endTrainGuide();
    assistCoopMode = false;
    assistLevelBooting = false;
    assistSnapAcc = 0;
    assistLevelSeedVal = 0;
    levelRunEnding = false;
    levelFailCine = null;
    levelFailHold = false;
    levelWinCine = null;
    levelWinHold = false;
    localAirMines = [];
    mineArm = null;
    mineCleared = 0;
    localSatellites = [];
    satArm = null;
    satCutCount = 0;
    satGrabCount = 0;
    try {
      GameGlobal.levelFailCine = false;
      GameGlobal.levelFailHold = false;
      GameGlobal.levelWinCine = false;
      GameGlobal.levelWinHold = false;
      GameGlobal.levelMineMode = false;
      GameGlobal.mineDefuseReady = false;
      GameGlobal.mineCleared = 0;
      GameGlobal.levelSatMode = false;
      GameGlobal.satCutReady = false;
      GameGlobal.satGrabReady = false;
      GameGlobal.satArmActive = false;
      GameGlobal.satActLabel = "剪断";
      GameGlobal.satCutCount = 0;
      GameGlobal.satGrabCount = 0;
    } catch (e) {}
    try { hideLevelWinModal(); } catch (e) {}
    const backToGarage = trainFromGarage;
    const backToLevels = levelFromLevels;
    levelRunResult = null;
    if (trainLoadout) {
      try {
        const lo = getMyLoadout();
        applyMySpeedTier(Math.max(speedTierOfName(pilot.name), lo && lo.engine === "twin" ? 2 : 1));
      } catch (e) {
        applyMySpeedTier(speedTierOfName(pilot.name));
      }
    }
    trainLoadout = null;
    trainFromGarage = false;
    levelFromLevels = false;
    resetTrainWeapons();
    clearTrainDrones();
    try { GameGlobal.trainLoadout = null; } catch (e) {}
    matchLost = false;
    matchHbAt = 0;
    localMatchStartedAt = 0;
    localMatchPlannedSec = 0;
    hideMatchLost();
    setAutoPilot(false);
    if (showSummary && board) {
      phase = "lobby";
      document.documentElement.classList.remove("ingame");
      if (lobbyEl) lobbyEl.style.display = "none";
      if (waitingEl) waitingEl.style.display = "none";
      renderSummary(board, "匹配结算");
    } else {
      setPhase("lobby");
    }
    resetWorldClient();
    // reset 会清状态，结算面板要重新显?
    if (showSummary && board && summaryEl) {
      if (lobbyEl) lobbyEl.style.display = "none";
      if (waitingEl) waitingEl.style.display = "none";
      renderSummary(board, "匹配结算");
    }
    if (offlineEl && connected) offlineEl.style.display = "none";
    // 匹配刚结束立刻恢复真实心跳；半开连接则重连，避免随后战绩/开房全失败
    try {
      if (!connected || !ws || ws.readyState !== WebSocket.OPEN || (performance.now() - lastPongAt > 4000)) {
        clearTimeout(reconnectTimer);
        connect();
      } else {
        ws.send(JSON.stringify({ t: "ping", ts: Math.round(performance.now()) }));
      }
    } catch (e) {
      try { connect(); } catch (err) {}
    }
    if (backToLevels && typeof GameGlobal.completeLevelRun === "function") {
      if (levelWon) {
        GameGlobal.completeLevelRun(true);
      } else {
        // 失败弹窗已在战场上展示；这里只处理「返回航图」或中途退?
        GameGlobal.completeLevelRun(false);
      }
    } else if (backToGarage && typeof GameGlobal.openGarage === "function") {
      GameGlobal.openGarage(openProfileHub, true);
    }
  }

  function startLocalMatch(opts) {
    const o = opts || {};
    if (lobbyErr) lobbyErr.textContent = "";
    // 开战前确保机体图集分包；测试局还需 feature 里的 PapaTestBot
    try {
      if (typeof GameGlobal.ensureCraftPkg === "function") GameGlobal.ensureCraftPkg();
      if (o.test && typeof GameGlobal.ensureFeaturePkg === "function") GameGlobal.ensureFeaturePkg();
    } catch (e) {}
    const keepAssistLink = !!(o.assistCoop);
    resetWorldClient();
    pushSpeedLeverMax();
    localMatch = true;
    localTestMode = !!(o.test && GameGlobal.PapaTestBot);
    localTrainMode = !!(o.train);
    localLevelMode = !!(o.level);
    assistCoopMode = keepAssistLink;
    assistSnapAcc = 0;
    levelRunCol = localLevelMode ? (Number(o.levelCol) || 1) : 0;
    assistLevelSeedVal = Number(o.seed) || assistLevelSeedVal || assistLevelSeed(assistCode || roomCode, levelRunCol);
    levelRunResult = null;
    levelRunEnding = false;
    levelWinCine = null;
    levelWinHold = false;
    try { GameGlobal.levelWinCine = false; GameGlobal.levelWinHold = false; } catch (e) {}
    try { hideLevelWinModal(); } catch (e) {}
    localMotherships = [];
    localAirMines = [];
    mineArm = null;
    mineCleared = 0;
    localSatellites = [];
    satArm = null;
    satCutCount = 0;
    satGrabCount = 0;
    trainLoadout = localTrainMode && o.loadout ? { ...o.loadout } : loadoutForMatch();
    try {
      const craft = normalizePlayerCraft(
        (trainLoadout && trainLoadout.craft) || getMyLoadout().craft || DEFAULT_PLAYER_CRAFT
      );
      // 对局里机器人也可能用随机机型：把会出现的机型都留下?
      const keep = [craft];
      for (let i = 0; i < PLAYER_CRAFT_KEYS.length; i++) keep.push(PLAYER_CRAFT_KEYS[i]);
      retainCraftFactionPacks(localTrainMode || localLevelMode ? [craft] : keep);
      ensureCraftAtlasImg(craft);
      if (!(localTrainMode || localLevelMode)) {
        for (let i = 0; i < PLAYER_CRAFT_KEYS.length; i++) ensureCraftAtlasImg(PLAYER_CRAFT_KEYS[i]);
      }
    } catch (e) {}
    trainFromGarage = false;
    if (!o.level) levelFromLevels = false;
    resetTrainWeapons();
    try {
      GameGlobal.trainLoadout = trainLoadout;
      GameGlobal.levelMineMode = !!(localLevelMode && levelRunCol === 3);
      GameGlobal.mineDefuseReady = false;
      GameGlobal.mineCleared = 0;
      GameGlobal.mineTotal = LEVEL_MINE_COUNT;
      GameGlobal.levelSatMode = !!(localLevelMode && levelRunCol === 5);
      GameGlobal.satCutReady = false;
      GameGlobal.satGrabReady = false;
      GameGlobal.satArmActive = false;
      GameGlobal.satActLabel = "剪断";
      GameGlobal.satCutCount = 0;
      GameGlobal.satCutTotal = LEVEL_SAT_PANEL_TOTAL;
      GameGlobal.satGrabCount = 0;
      GameGlobal.satGrabTotal = LEVEL_SAT_GRAB_TOTAL;
    } catch (e) {}
    matchLost = false;
    const hbNow = performance.now();
    matchHbAt = hbNow;
    lastPongAt = hbNow;
    hideMatchLost();
    // 助战同场：保留房间链路以便同步，不要 leave
    if (!keepAssistLink) sendRoom("leave");
    if (offlineEl) offlineEl.style.display = "none";
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) connect();
    const iAmAssistHost = !!o.assistHost || !!(keepAssistLink && GameGlobal.assistHostMode);
    myId = keepAssistLink ? (iAmAssistHost ? 1 : 2) : 1;
    myTeam = 0;
    myKills = 0;
    myDeaths = 0;
    renderKd();
    const teams = 2;
    const allowed = new Set([180, 300, 600]);
    const durSel = Math.round(Number($("matchDur")?.value) || 300);
    const planned = allowed.has(durSel) ? durSel : 300;
    if (localLevelMode || localTrainMode) {
      clearMatchDeadline();
      localMatchPlannedSec = 0;
    } else {
      setMatchDeadline(planned);
      localMatchPlannedSec = planned;
    }
    localMatchStartedAt = Date.now();
    saveRejoin(null);
    localMatchAcc = 0;
    publicBrawl = false;
    WORLD_LIMIT = 2500;
    WORLD_Y_LIMIT = 2500;
    level4Goal = null;
    level5Exit = null;
    // 两阵营：随机一上一下或一左一右，玩家随机在哪一?
    const padRot = Math.random() < 0.5 ? 0 : Math.PI / 2;
    const padSlots = shuffleLocalSlots(teams);
    factionPads = [];
    for (let t = 0; t < teams; t++) factionPads.push(localPadBox(t, teams, padSlots[t], padRot));

    localCrafts = [];
    const hostName = (keepAssistLink && !iAmAssistHost)
      ? "房主"
      : (pilot.name || randomPilotName());
    localCrafts.push(spawnLocalCraft(1, hostName, 0, factionPads[0], false));
    if (trainLoadout && myId === 1) {
      const tier = Math.max(speedTierOfName(pilot.name), trainLoadout.engine === "twin" ? 2 : 1);
      localCrafts[0].spdTier = tier;
      mySpeedTier = tier;
      const ro = roster.get(1);
      if (ro) ro.spd = tier;
    }
    let nextId = 2;
    const usedBotNames = new Set();
    if (localLevelMode) {
      factionPads = [];
      const hostCraft = localCrafts[0];
      hostCraft.x = -420;
      hostCraft.y = 0;
      hostCraft.heading = 0;
      hostCraft.vx = 0;
      hostCraft.vy = 0;
      hostCraft.throttle = 0;
      const rng = makeAssistRng(assistLevelSeedVal || 1);
      if (keepAssistLink) {
        // 助战双人：房?id1，助?id2，同阵营
        let guestName = "助战";
        try {
          const st = GameGlobal.assistRoomState;
          const members = (st && st.members) || [];
          const g = members.find((u) => u && !u.host && !u.you && !u.bot);
          if (g && g.name) guestName = g.name;
          else if (!iAmAssistHost) guestName = pilot.name || guestName;
        } catch (e) {
          if (!iAmAssistHost) guestName = pilot.name || guestName;
        }
        const guest = spawnLocalCraft(2, guestName, 0, { cx: -420, cy: 90, x0: -460, x1: -380, y0: 50, y1: 130 }, false);
        guest.x = -420;
        guest.y = 90;
        guest.heading = 0;
        guest.vx = 0;
        guest.vy = 0;
        guest.throttle = 0;
        guest.assistPeer = iAmAssistHost; // 房主视角?2 号是远端；嘉宾视角下 1 号是远端
        hostCraft.assistPeer = !iAmAssistHost;
        if (!iAmAssistHost && trainLoadout) {
          const tier = Math.max(speedTierOfName(pilot.name), trainLoadout.engine === "twin" ? 2 : 1);
          guest.spdTier = tier;
          mySpeedTier = tier;
          const ro = roster.get(2);
          if (ro) ro.spd = tier;
        }
        localCrafts.push(guest);
        nextId = 3;
      }
      const me = localCrafts.find((c) => c.id === myId) || hostCraft;
      if (levelRunCol === 4) {
        setupLevelCrossfire(me, rng, () => nextId++);
      } else if (levelRunCol === 2) {
        // ?关：Steam MS-01（尾?炮塔），范围内发炮，不放无人?
        const mx = 780 + (rng() - 0.5) * 40;
        const my = 40 + (rng() - 0.5) * 40;
        localMotherships.push(spawnLevelMothership(mx, my, me));
      } else if (levelRunCol === 3) {
        // ?关：地图分散 5 枚空中地雷（助战双方?seed?
        spawnLevelAirMines(me, rng);
      } else if (levelRunCol === 5) {
        // 第5关：2 颗卫星各 1 架巡逻机；剪板 → 抓星 → 撤离点过关
        spawnLevelSatellites(me, rng);
        spawnLevelSatPatrols(me, rng, () => nextId++);
      } else {
        // ?关：1 架敌机朝玩家冲来
        const enemy = spawnLocalCraft(nextId++, "敌机", 1, { cx: 780, cy: 40, x0: 740, x1: 820, y0: 0, y1: 80 }, true);
        enemy.iq = 3;
        enemy.spdTier = 1;
        enemy.testBot = false;
        enemy.brain = emptyBotCtx(3);
        enemy.brain.style = 0.9;
        enemy.brain.roamT = 0;
        enemy.brain.aimEvery = 200;
        enemy.brain.fireWarm = 0;
        enemy.brain.targetId = me.id;
        enemy.brain.targetUntil = performance.now() + 20000;
        enemy.gunAmmo = GUN_AMMO_MAX;
        enemy.missileAmmo = MISSILE_AMMO_MAX;
        enemy.x = 780 + (rng() - 0.5) * 20;
        enemy.y = 60 + (rng() - 0.5) * 20;
        enemy.heading = Math.atan2(me.y - enemy.y, me.x - enemy.x);
        enemy.throttle = 1;
        enemy.vx = Math.cos(enemy.heading) * MAX_SPEED * 0.55;
        enemy.vy = Math.sin(enemy.heading) * MAX_SPEED * 0.55;
        const ero = roster.get(enemy.id);
        if (ero) ero.spd = 1;
        localCrafts.push(enemy);
      }
    } else if (localTrainMode) {
      // 训练场：只留己方停机坪，不限时；一半靶机悬停、一半自由飞；另放绿名队友供辨认
      factionPads = [factionPads[0]];
      const mePad = factionPads[0];
      const allyNames = ["队友·甲", "队友·乙"];
      for (let i = 0; i < TRAIN_ALLY_COUNT; i++) {
        const ally = spawnLocalCraft(nextId++, allyNames[i] || ("队友" + (i + 1)), 0, mePad, true);
        ally.trainKind = "ally";
        ally.iq = 0;
        ally.x = mePad.cx + (i === 0 ? -90 : 90);
        ally.y = mePad.cy + (i === 0 ? 70 : -70);
        ally.heading = Math.atan2(-ally.y, -ally.x);
        ally.vx = 0;
        ally.vy = 0;
        ally.throttle = 0;
        localCrafts.push(ally);
      }
      for (let i = 0; i < TRAIN_TARGET_COUNT; i++) {
        const c = spawnLocalCraft(nextId++, nextBotName(usedBotNames), 1, factionPads[0], true);
        c.trainKind = i < TRAIN_TARGET_COUNT / 2 ? "static" : "free";
        localCrafts.push(c);
        placeTrainTarget(c);
      }
    } else {
      // 每队人数：大厅「每队人数」选择?~4，含玩家）；双方人数一?
      let perRaw = Number(o.perTeam);
      if (!Number.isFinite(perRaw)) perRaw = Number($("perTeam")?.value);
      const perTeam = clamp(Math.round(perRaw || 4), 1, 4);
      for (let t = 0; t < teams; t++) {
        const nBots = perTeam - (t === 0 ? 1 : 0);
        for (let i = 0; i < nBots; i++) {
          localCrafts.push(spawnLocalCraft(nextId++, nextBotName(usedBotNames), t, factionPads[t], true));
        }
      }
      // 档位 / 武器方案各异；中?下档各自随机 50~400ms 才瞄一?
      const bots = localCrafts.filter((c) => c.bot && !c.trainKind).sort(() => Math.random() - 0.5);
      bots.forEach((c) => {
        c.iq = 1 + (Math.random() * 3 | 0);
        c.testBot = localTestMode;
        c.brain = localTestMode ? GameGlobal.PapaTestBot.newBrain(c.iq) : emptyBotCtx(c.iq);
        if (c.iq >= 2) c.brain.aimEvery = 50 + Math.random() * 350;
        const lo = randomBotLoadout();
        c.lo = lo;
        c.cannonCd = 0;
        c.gatSpin = 0;
        c.gatAcc = 0;
        c.gatSide = 1;
        c.laserCd = 0;
        c.empCd = 0;
        c.empAmmo = EMP_AMMO_MAX;
        c.empFireCd = 0;
        c.spdTier = lo.engine === "twin" ? 2 : 1;
        const ro = roster.get(c.id);
        if (ro) ro.spd = c.spdTier;
      });
    }

    asteroids.clear();
    let rockId = 1;
    // 关卡对决先不刷陨石，训练/匹配仍刷土陨?
    if (!localLevelMode) {
      for (let n = 0; n < LOCAL_DIRT_ROCK_COUNT; n++) {
        const rock = makeLocalAsteroid(rockId);
        asteroids.set(rockId, rock);
        rockId++;
      }
    }
    localRockSeq = Math.max(localRockSeq, rockId + 1);
    localRockSpawnAcc = 0;

    gunAmmo = GUN_AMMO_MAX;
    gunAmmoMax = GUN_AMMO_MAX;
    missileAmmoMax = MISSILE_AMMO_MAX;
    missileAmmo = missileAmmoMax;
    lastLocalMissileAt = 0;
    missileHeldPrev = false;
    localMissiles = [];
    VIEW_SCALE = VIEW_SCALE_BASE;
    myMissileClaim.clear();
    seenNetMissileIds = new Set();
    missileClaimUntil = 0;
    localMissileSeq = 0;
    localSkillAcc = 0;
    localShieldSpawnAcc = 0;
    localShieldPickups = [];
    localMagPickups = [];
    localMagSpawnAcc = 0;
    playerCount = localCrafts.length;
    latestPlayers = localCrafts.map((c) => ({ id: c.id, x: c.x, y: c.y, heading: c.heading, thr: c.throttle }));
    const craftKeys = craftAtlasKeysForOpts(o);
    const enterPlay = () => {
      setPhase("playing");
      renderMatchTimer();
      if (gearBtn) gearBtn.style.display = "block";
      if (statusEl) {
        const LO_NAMES = { gun: "机关炮", cannon: "加农炮", gatling: "双管加特林", missile: "导弹", mirv: "多弹头导弹", laser: "激光炮", emp: "电磁脉冲炮", drone: "无人机" };
        statusEl.textContent = localLevelMode
          ? (levelRunCol === 5
            ? "第5关 · 剪板抓星 · 撤离点过关"
            : levelRunCol === 4
            ? "第4关 · 穿越火线 · 到达右端终点区过关"
            : levelRunCol === 3
            ? "第3关 · 靠近拆除 · 超距脱落需重拆 · 碰触爆炸"
            : levelRunCol === 2
            ? "第2关 · 打爆母舰过关 · 被打爆则失败"
            : "第1关 · 干爆敌机过关 · 被干爆则失败")
          : localTrainMode
          ? (trainLoadout
            ? `试飞 · ${LO_NAMES[trainLoadout.main]} + ${LO_NAMES[trainLoadout.sub]} · ${trainLoadout.engine === "twin" ? "双引擎" : "单引擎"}`
            : `训练场 · ${TRAIN_TARGET_COUNT} 架靶机`)
          : (trainLoadout && trainLoadout.sub === "drone"
            ? `本地匹配 · 无人机伴飞 · ${localCrafts.length} 机`
            : `本地匹配 · ${teams} 阵营 · ${localCrafts.length} 机`);
      }
      // 训练场开局必出引导；改装含无人机则再召唤满编（不覆盖引导）
      if (localTrainMode) {
        beginTrainGuide();
      } else {
        endTrainGuide();
      }
      if (localMatch && !localLevelMode && trainLoadout && trainLoadout.sub === "drone") {
        try { ensureTrainDrones(localCrafts.find((c) => c && c.id === myId)); } catch (e) {}
      }
    };
    beginCraftAssetLoading(craftKeys, enterPlay, {
      tip: "正在加载机体",
      cancelable: true,
      onCancel: () => {
        try {
          localMatch = false;
          localTestMode = false;
          localTrainMode = false;
          localLevelMode = false;
          assistCoopMode = false;
          trainLoadout = null;
          resetWorldClient();
          setPhase("lobby");
        } catch (e) {}
      },
    });
  }

  // 机身长度（世界单位）×2 = 拆除距离
  const LEVEL_CRAFT_LEN = 48;
  const LEVEL_DEFUSE_RANGE = LEVEL_CRAFT_LEN * 2;
  const LEVEL_MINE_TOUCH_R = (PapaAirMine && PapaAirMine.MINE_R) || 20;

  // ?关「穿越火线」：场景 10000×800；每 1000 距离一架突击飞?
  const LEVEL4_W = 10000;
  const LEVEL4_H = 800;
  const LEVEL4_X_HALF = LEVEL4_W / 2;
  const LEVEL4_Y_HALF = LEVEL4_H / 2;
  const LEVEL4_GOAL_SIZE = 300; // 右边缘终点区 300×300
  const LEVEL4_SHIP_GAP = 1000;
  const LEVEL4_FIRE_X = 300; // |玩家x - NPC x| ?此值才发射
  const LEVEL4_MIS_CD = 1.05;
  const LEVEL4_MIRV_CD = 2.35;

  function setupLevelCrossfire(me, rngFn, nextIdFn) {
    const rnd = typeof rngFn === "function" ? rngFn : Math.random;
    WORLD_LIMIT = LEVEL4_X_HALF;
    WORLD_Y_LIMIT = LEVEL4_Y_HALF;
    // 通关：飞入右边缘居中 300×300 矩形
    const half = LEVEL4_GOAL_SIZE / 2;
    level4Goal = {
      x0: WORLD_LIMIT - LEVEL4_GOAL_SIZE,
      x1: WORLD_LIMIT,
      y0: -half,
      y1: half,
    };
    // 玩家从左边缘出发，朝?
    const startX = -WORLD_LIMIT + 120;
    const startY = (rnd() - 0.5) * WORLD_Y_LIMIT * 0.2;
    for (const c of localCrafts) {
      if (!c || c.bot) continue;
      c.x = startX;
      c.y = startY + (c.id === 2 ? 55 : 0);
      c.heading = 0;
      c.vx = 0;
      c.vy = 0;
      c.throttle = 0;
    }
    // 沿途每?1000：上下交替部署突击飞?
    const x0 = -WORLD_LIMIT + LEVEL4_SHIP_GAP;
    const x1 = WORLD_LIMIT - LEVEL4_GOAL_SIZE - 200;
    let slot = 0;
    for (let x = x0; x <= x1 + 0.5; x += LEVEL4_SHIP_GAP) {
      const side = (slot % 2 === 0) ? 1 : -1;
      const y = side * (WORLD_Y_LIMIT * (0.45 + rnd() * 0.28));
      const id = typeof nextIdFn === "function" ? nextIdFn() : (100 + slot);
      const ship = spawnLocalCraft(
        id,
        "突击" + (slot + 1),
        1,
        { cx: x, cy: y, x0: x - 40, x1: x + 40, y0: y - 40, y1: y + 40 },
        true
      );
      ship.levelAssault = true;
      ship.homeX = x;
      ship.homeY = y;
      ship.x = x + (rnd() - 0.5) * 24;
      ship.y = y + (rnd() - 0.5) * 16;
      ship.heading = Math.atan2((me && me.y) - ship.y, (me && me.x) - ship.x);
      ship.vx = 0;
      ship.vy = 0;
      ship.throttle = 0;
      ship.iq = 3;
      ship.spdTier = 1;
      ship.testBot = false;
      ship.brain = emptyBotCtx(3);
      ship.lo = { main: "gun", sub: "missile", engine: "single" };
      ship.missileCd = 0.4 + rnd() * 0.8;
      ship.mirvCd = 1.0 + rnd() * 1.2;
      ship.missileAmmo = 99;
      ship.gunAmmo = GUN_AMMO_MAX;
      const ro = roster.get(ship.id);
      if (ro) ro.spd = 1;
      localCrafts.push(ship);
      slot += 1;
    }
  }

  function tickLevelAssaultShip(craft, me, dt) {
    if (!craft || craft.respawn > 0) return;
    // 钉在驻点附近轻微漂浮，始终朝向玩?
    const hx = craft.homeX != null ? craft.homeX : craft.x;
    const hy = craft.homeY != null ? craft.homeY : craft.y;
    const bob = Math.sin((performance.now() + (craft.id || 0) * 170) / 420) * 8;
    craft.x += (hx - craft.x) * Math.min(1, 3.2 * dt);
    craft.y += (hy + bob - craft.y) * Math.min(1, 2.6 * dt);
    craft.vx = 0;
    craft.vy = 0;
    craft.throttle = 0;
    const yLo = -WORLD_Y_LIMIT + 24;
    const yHi = WORLD_Y_LIMIT - 24;
    const xLo = -WORLD_LIMIT + 24;
    const xHi = WORLD_LIMIT - 24;
    craft.x = clamp(craft.x, xLo, xHi);
    craft.y = clamp(craft.y, yLo, yHi);
    if (!me || !(me.hp > 0) || me.respawn > 0 || levelRunEnding) return;
    craft.heading = Math.atan2(me.y - craft.y, me.x - craft.x);
    craft.missileCd = Math.max(0, (craft.missileCd || 0) - dt);
    craft.mirvCd = Math.max(0, (craft.mirvCd || 0) - dt);
    // 仅当与玩?X 相差 ?00 时才发射
    if (Math.abs(me.x - craft.x) > LEVEL4_FIRE_X) return;
    if (craft.missileCd <= 0) {
      craft.missileCd = LEVEL4_MIS_CD;
      craft.missileAmmo = 99;
      spawnLocalMissile(craft, me.id, { mirv: false });
    }
    if (craft.mirvCd <= 0) {
      craft.mirvCd = LEVEL4_MIRV_CD;
      craft.missileAmmo = 99;
      spawnLocalMissile(craft, me.id, { mirv: true });
    }
  }

  function tickLevelCrossfireWin(me) {
    if (!(localLevelMode && levelRunCol === 4) || levelRunEnding || !me || !level4Goal) return;
    if (!(me.hp > 0) || me.respawn > 0) return;
    const g = level4Goal;
    if (me.x >= g.x0 && me.x <= g.x1 && me.y >= g.y0 && me.y <= g.y1) {
      levelRunEnding = true;
      levelRunResult = "win";
      beginLevelWinCine(me.x, me.y, { boostBlast: false });
    }
  }

  function drawLevel4Goal(camera) {
    if (!(localLevelMode && levelRunCol === 4) || !level4Goal) return;
    const g = level4Goal;
    const a = screen(g.x0, g.y0, camera);
    const b = screen(g.x1, g.y1, camera);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.save();
    const pulse = 0.12 + 0.08 * Math.sin(performance.now() / 280);
    ctx.fillStyle = `rgba(80,255,140,${pulse})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120,255,170,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(180,255,210,0.9)";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("终点", x + w * 0.5, y + h * 0.5);
    ctx.restore();
  }

  function drawLocalAirMines(camera, tSec) {
    if (!PapaAirMine) return;
    for (const m of localAirMines) {
      if (!m || m.dead) continue;
      const p = screen(m.x, m.y, camera);
      if (p.x < -48 || p.y < -48 || p.x > W + 48 || p.y > H + 48) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      // 池偏低时后台再补一轮
      if (m.armed) {
        ctx.beginPath();
        ctx.arc(0, 0, LEVEL_DEFUSE_RANGE, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,180,90,0.22)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      PapaAirMine.drawMine(ctx, m, tSec, { lampOn: m.armed || ((tSec * 3.2) % 1) < 0.5 });
      ctx.restore();
    }
  }

  let worldIconAtlas = null;
  const WORLD_ICON_CELL = 64;
  const WORLD_ICON_COLS = 5;
  function ensureWorldIconAtlas() {
    if (worldIconAtlas) return worldIconAtlas;
    const canvas = makeOffscreen(WORLD_ICON_CELL * WORLD_ICON_COLS, WORLD_ICON_CELL);
    const g = canvas && canvas.getContext("2d");
    if (!g) return null;
    const cellX = (index) => index * WORLD_ICON_CELL + WORLD_ICON_CELL / 2;
    g.clearRect(0, 0, canvas.width, canvas.height);

    // 0: 医疗?
    g.save();
    g.translate(cellX(0), 32);
    g.fillStyle = "#f3f6fa";
    g.strokeStyle = "#9aa7b4";
    g.lineWidth = 2;
    g.fillRect(-12, -12, 24, 24);
    g.strokeRect(-12, -12, 24, 24);
    g.fillStyle = "#e23b3b";
    g.fillRect(-3, -8, 6, 16);
    g.fillRect(-8, -3, 16, 6);
    g.restore();

    // 1: 弹容量箱
    g.save();
    g.translate(cellX(1), 32);
    g.fillStyle = "#2a2418";
    g.strokeStyle = "#ffcc66";
    g.lineWidth = 2;
    g.fillRect(-13, -13, 26, 26);
    g.strokeRect(-13, -13, 26, 26);
    g.fillStyle = "#ffe08a";
    g.font = "bold 11px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("+20", 0, 0);
    g.restore();

    // 2: 护盾
    g.save();
    g.translate(cellX(2), 32);
    g.beginPath();
    g.moveTo(0, -17);
    g.bezierCurveTo(13, -15, 14, -6, 14, -1);
    g.bezierCurveTo(14, 8, 8, 14, 0, 18);
    g.bezierCurveTo(-8, 14, -14, 8, -14, -1);
    g.bezierCurveTo(-14, -6, -13, -15, 0, -17);
    g.closePath();
    g.fillStyle = "#1a4f9a";
    g.strokeStyle = "#b8e6ff";
    g.lineWidth = 2;
    g.fill();
    g.stroke();
    g.restore();

    // 3/4: 地雷灭灯 / 亮灯
    if (PapaAirMine) {
      for (let i = 0; i < 2; i++) {
        g.save();
        g.translate(cellX(3 + i), 32);
        PapaAirMine.drawMine(g, { armed: false, spin: -Math.PI / 2 }, 0, { lampOn: i === 1 });
        g.restore();
      }
    }
    worldIconAtlas = canvas;
    return canvas;
  }

  function glColorDisk(out, x, y, radius, color, segments) {
    const n = Math.max(8, segments | 0);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2;
      const a1 = (i + 1) / n * Math.PI * 2;
      glColorTriangle(out,
        { x, y },
        { x: x + Math.cos(a0) * radius, y: y + Math.sin(a0) * radius },
        { x: x + Math.cos(a1) * radius, y: y + Math.sin(a1) * radius },
        color
      );
    }
  }

  function appendDashedRing(out, x, y, radius, width, color, segments) {
    const n = Math.max(12, segments | 0);
    for (let i = 0; i < n; i += 2) {
      const a0 = i / n * Math.PI * 2;
      const a1 = (i + 1) / n * Math.PI * 2;
      glColorSegment(
        out,
        x + Math.cos(a0) * radius, y + Math.sin(a0) * radius,
        x + Math.cos(a1) * radius, y + Math.sin(a1) * radius,
        width,
        color
      );
    }
  }

  function drawWorldIconWebGlPass(camera, now) {
    const sprites = [];
    const geometry = [];
    const addPickup = (x, y, frame, size, rotation, glowColor, glowRadius) => {
      const p = screen(x, y, camera);
      const vis = viewPad(size);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return;
      if (glowColor) glColorDisk(geometry, p.x, p.y, glowRadius, glowColor, 16);
      sprites.push({
        x: p.x * dpr, y: p.y * dpr,
        w: size * dpr, h: size * dpr,
        rotation: rotation || 0,
        frame, tint: [1, 1, 1], strength: 0,
      });
    };

    if (medkit) {
      const bob = Math.sin(now / 280) * 4;
      addPickup(medkit.x, medkit.y + bob, medkit.kind === 1 ? 1 : 0, medkit.kind === 1 ? 48 : 30,
        Math.sin(now / 520) * 0.1,
        medkit.kind === 1 ? [1, 0.72, 0.22, 0.16] : [0.25, 1, 0.55, 0.14],
        medkit.kind === 1 ? 34 : 18);
    }
    if (localMatch) {
      for (let i = 0; i < localMagPickups.length; i++) {
        const pk = localMagPickups[i];
        const bob = Math.sin(now / 280) * 4;
        addPickup(pk.x, pk.y + bob, 1, 48, Math.sin(now / 520) * 0.1, [1, 0.72, 0.22, 0.16], 34);
      }
      for (let i = 0; i < localShieldPickups.length; i++) {
        const pk = localShieldPickups[i];
        const bob = Math.sin(now / 260 + pk.x * 0.01) * 4;
        const pulse = 15 + Math.sin(now / 160) * 2;
        addPickup(pk.x, pk.y + bob, 2, 36, 0, [0.25, 0.68, 1, 0.14], pulse);
      }
    }
    const mineMode = localAirMines.length && (localMatch || (assistCoopMode && localLevelMode));
    if (mineMode) {
      const tSec = now / 1000;
      for (let i = 0; i < localAirMines.length; i++) {
        const m = localAirMines[i];
        if (!m || m.dead) continue;
        const p = screen(m.x, m.y, camera);
        if (p.x < -48 || p.y < -48 || p.x > W + 48 || p.y > H + 48) continue;
        const lampOn = m.armed || ((tSec * 3.2) % 1) < 0.5;
        if (m.armed) appendDashedRing(geometry, p.x, p.y, LEVEL_DEFUSE_RANGE, 1.5, [1, 0.6, 0.25, 0.22], 32);
        sprites.push({
          x: p.x * dpr, y: p.y * dpr,
          w: 42 * dpr, h: 42 * dpr,
          rotation: (m.armed ? (m.heading || 0) : (m.spin || 0)) + Math.PI / 2,
          frame: lampOn ? 4 : 3,
          tint: [1, 1, 1], strength: 0,
        });
      }
    }
    if (!sprites.length && !geometry.length) return;

    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    const atlas = ensureWorldIconAtlas();
    let composed = false;
    if (world && atlas && world.beginFrame(W * dpr, H * dpr)) {
      try {
        let drew = true;
        if (geometry.length && !world.drawColorTriangles(geometry, false)) drew = false;
        if (sprites.length && !world.drawSprites("world:icons", atlas, sprites, { cols: WORLD_ICON_COLS, rows: 1 })) drew = false;
        const layer = world.endFrame();
        if (drew && layer) composed = compositeWebGlLayer(world, layer);
      } catch (e) {
        try { console.error("[webgl pass] world icons", e && e.message); } catch (err) {}
      }
    }
  }

  function drawMineDefuseArm(me, camera) {
    if (!mineArm || !me || !PapaAirMine) return;
    const heading = Number.isFinite(me.heading) ? me.heading : 0;
    const nose = screen(
      me.x + Math.cos(heading) * 22,
      me.y + Math.sin(heading) * 22,
      camera
    );
    const mp = screen(mineArm.mx, mineArm.my, camera);
    const reachDur = mineArm.reachDur || 0.28;
    const holdDur = mineArm.holdDur || 1;
    const age = mineArm.age || 0;
    const reach = age < reachDur ? easeOutCubic(age / reachDur) : 1;
    const grip = age < reachDur
      ? clamp((age / reachDur - 0.55) / 0.45, 0, 1)
      : 1;
    const hold = age <= reachDur ? 0 : clamp((age - reachDur) / holdDur, 0, 1);
    PapaAirMine.drawDefuseArmToMine(ctx, nose.x, nose.y, mp.x, mp.y, reach, grip, hold);
  }

  function spawnLevelMothership(x, y, me) {
    const aim = me ? Math.atan2(me.y - y, me.x - x) : Math.PI;
    let m;
    if (PapaMS01) {
      m = PapaMS01.create(x, y, aim, LEVEL_MOTHER_OID);
    } else {
      m = {
        id: LEVEL_MOTHER_OID, x, y, heading: aim, baseHeading: aim,
        hp: LEVEL_MOTHER_HP, maxHp: LEVEL_MOTHER_HP, dead: false, alive: true, kind: "fallback",
      };
    }
    // 导弹齐射：冷却满后连?5 ?
    m.misCd = 3; // 开局稍等再射第一?
    m.misLeft = 0;
    m.misGap = 0;
    return m;
  }

  function spawnLevelAirMines(me, rngFn) {
    localAirMines = [];
    mineCleared = 0;
    mineArm = null;
    const rnd = typeof rngFn === "function" ? rngFn : Math.random;
    const ox = me ? me.x : -420;
    const oy = me ? me.y : 0;
    const margin = 220;
    const lim = WORLD_LIMIT - margin;
    // 先按象限/扇区分散，再在格内抖动，避免扎堆在出生点附近
    const sectors = [
      { x0: -lim, x1: -lim * 0.15, y0: -lim, y1: -lim * 0.15 },
      { x0: lim * 0.15, x1: lim, y0: -lim, y1: -lim * 0.15 },
      { x0: -lim, x1: -lim * 0.15, y0: lim * 0.15, y1: lim },
      { x0: lim * 0.15, x1: lim, y0: lim * 0.15, y1: lim },
      { x0: -lim * 0.55, x1: lim * 0.55, y0: -lim * 0.55, y1: lim * 0.55 },
    ];
    // 打乱扇区顺序，保证助战同 seed 可复?
    for (let i = sectors.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const tmp = sectors[i];
      sectors[i] = sectors[j];
      sectors[j] = tmp;
    }
    const minPlayer = 380;
    const minMine = Math.max(520, WORLD_LIMIT * 0.22);
    let seq = 1;
    for (let n = 0; n < LEVEL_MINE_COUNT; n++) {
      const sec = sectors[n % sectors.length];
      let placed = false;
      for (let tries = 0; tries < 60 && !placed; tries++) {
        const x = sec.x0 + rnd() * (sec.x1 - sec.x0);
        const y = sec.y0 + rnd() * (sec.y1 - sec.y0);
        if (Math.abs(x) > lim || Math.abs(y) > lim) continue;
        if (Math.hypot(x - ox, y - oy) < minPlayer) continue;
        let ok = true;
        for (const o of localAirMines) {
          if (Math.hypot(o.x - x, o.y - y) < minMine) { ok = false; break; }
        }
        if (!ok) continue;
        const m = PapaAirMine
          ? PapaAirMine.create(x, y)
          : { x, y, spin: rnd() * Math.PI * 2, armed: false, dead: false, kind: "airMine" };
        if (m) m.spin = rnd() * Math.PI * 2;
        m.id = seq++;
        m.dead = false;
        localAirMines.push(m);
        placed = true;
      }
      // 扇区放不下时退回全图随?
      if (!placed) {
        for (let tries = 0; tries < 80 && !placed; tries++) {
          const x = (rnd() * 2 - 1) * lim;
          const y = (rnd() * 2 - 1) * lim;
          if (Math.hypot(x - ox, y - oy) < minPlayer) continue;
          let ok = true;
          for (const o of localAirMines) {
            if (Math.hypot(o.x - x, o.y - y) < minMine * 0.75) { ok = false; break; }
          }
          if (!ok) continue;
          const m = PapaAirMine
          ? PapaAirMine.create(x, y)
            : { x, y, spin: rnd() * Math.PI * 2, armed: false, dead: false, kind: "airMine" };
          if (m) m.spin = rnd() * Math.PI * 2;
          m.id = seq++;
          m.dead = false;
          localAirMines.push(m);
          placed = true;
        }
      }
    }
    try {
      GameGlobal.mineCleared = 0;
      GameGlobal.mineTotal = localAirMines.length || LEVEL_MINE_COUNT;
      GameGlobal.levelMineMode = true;
    } catch (e) {}
  }

  function nearestDefusableMine(me) {
    if (!me || !(me.hp > 0) || me.respawn > 0) return null;
    let best = null;
    let bestD = LEVEL_DEFUSE_RANGE;
    for (const m of localAirMines) {
      if (!m || m.dead) continue;
      const d = Math.hypot(m.x - me.x, m.y - me.y);
      if (d <= bestD) { bestD = d; best = m; }
    }
    return best;
  }

  function levelMePose() {
    if (localMatch) {
      return localCrafts.find((c) => c.id === myId) || null;
    }
    return {
      id: myId,
      x: lastGoodMe.x || 0,
      y: lastGoodMe.y || 0,
      hp: lastGoodMe.hp || PLAYER_MAX_HP,
      respawn: lastGoodMe.respawn || 0,
    };
  }
  function tryStartMineDefuse() {
    if (!(localLevelMode && levelRunCol === 3) || levelRunEnding || mineArm) return false;
    const me = levelMePose();
    const target = nearestDefusableMine(me);
    if (!target) return false;
    mineArm = {
      mineId: target.id,
      mx: target.x,
      my: target.y,
      age: 0,
      reachDur: 0.28,
      holdDur: 1,
      dur: 1.28,
    };
    try { sfx?.playSelect?.(); } catch (e) {}
    return true;
  }

  function finishMineDefuse(mine) {
    if (!mine || mine.dead) return;
    const mineId = mine.id;
    mine.dead = true;
    mineCleared += 1;
    try {
      GameGlobal.mineCleared = mineCleared;
      sfx?.playMetalPing?.();
      sfx?.playRockChip?.();
    } catch (e) {}
    spawnCraftSparks(mine.x, mine.y, 1, 0, 10);
    // 清掉已拆
    localAirMines = localAirMines.filter((m) => m && !m.dead);
    try { GameGlobal.mineTotal = Math.max(mineCleared + localAirMines.length, mineCleared); } catch (e) {}
    if (assistCoopMode) {
      try { sendAssistPeer("assistMine", { op: "clear", id: mineId }); } catch (e) {}
    }
    if (localAirMines.length === 0 && mineCleared > 0 && !levelRunEnding) {
      levelRunEnding = true;
      levelRunResult = "win";
      beginLevelWinCine(mine.x, mine.y, { boostBlast: true });
    }
  }

  function popAirMineBlast(mine) {
    if (!mine || mine.dead) return;
    mine.dead = true;
    localAirMines = localAirMines.filter((m) => m && !m.dead);
    popMissileBlast(mine.x, mine.y, 1.45);
    if (localMatch) {
      const me = localCrafts.find((c) => c.id === myId);
      if (me && me.hp > 0 && !(me.respawn > 0)) {
        damageLocalCraft(me, PLAYER_MAX_HP + 10, null);
      }
    } else if (assistCoopMode && localLevelMode && !levelRunEnding) {
      // 服务器对局里碰雷：本地播失败演?
      levelRunEnding = true;
      levelRunResult = "fail";
      levelFailCine = { age: 0, dur: 2.05 };
      try { GameGlobal.levelFailCine = true; } catch (e) {}
      try { burstCraftDeath(lastGoodMe.x || mine.x, lastGoodMe.y || mine.y, 0, 0, lastGoodMe.heading || 0, "fighter", { slowMo: true }); } catch (e) {}
    }
  }

  function tickLocalAirMines(dt) {
    if (!(localLevelMode && levelRunCol === 3)) {
      try {
        GameGlobal.levelMineMode = false;
        GameGlobal.mineDefuseReady = false;
      } catch (e) {}
      return;
    }
    const freeze = !!(
      levelFailHold || levelWinHold
      || (levelFailCine && levelRunResult === "fail")
      || (levelWinCine && levelRunResult === "win")
    );
    const me = levelMePose();
    const ready = !freeze && !mineArm && !!nearestDefusableMine(me);
    try {
      GameGlobal.levelMineMode = true;
      GameGlobal.mineDefuseReady = ready;
      GameGlobal.mineCleared = mineCleared;
      GameGlobal.mineTotal = LEVEL_MINE_COUNT;
    } catch (e) {}

    for (const m of localAirMines) {
      if (!m || m.dead) continue;
      m.spin = (m.spin || 0) + 0.55 * dt;
      const near = me && me.hp > 0 && !(me.respawn > 0)
        && Math.hypot(m.x - me.x, m.y - me.y) <= LEVEL_DEFUSE_RANGE;
      m.armed = !!near;
    // 助战统一拦截
      if (!freeze && me && me.hp > 0 && !(me.respawn > 0)
        && Math.hypot(m.x - me.x, m.y - me.y) < LEVEL_MINE_TOUCH_R + 22) {
        popAirMineBlast(m);
        return;
      }
    }

    if (mineArm) {
      mineArm.age += dt;
      const target = localAirMines.find((m) => m.id === mineArm.mineId);
      if (!target || target.dead) {
        mineArm = null;
      } else {
        mineArm.mx = target.x;
        mineArm.my = target.y;
        // 超出拆除距离且尚未拆??机械臂脱落，进度清零，需重新拆除
        const alive = me && me.hp > 0 && !(me.respawn > 0);
        const dist = alive ? Math.hypot(target.x - me.x, target.y - me.y) : Infinity;
        if (!freeze && dist > LEVEL_DEFUSE_RANGE) {
          mineArm = null;
          try { sfx?.playDry?.(); } catch (e) {}
        } else if (mineArm.age >= mineArm.dur) {
          finishMineDefuse(target);
          mineArm = null;
        }
      }
    }
  }

  function satCutRange() {
    return (PapaSatellite && PapaSatellite.CUT_RANGE) || 140;
  }

  function satGrabRange() {
    return LEVEL_SAT_GRAB_RANGE;
  }

  function satPanelsAllCut(sat) {
    if (!sat || sat.grabbed) return false;
    if (PapaSatellite) return PapaSatellite.allPanelsCut(sat);
    return (sat.panels || []).every((p) => p && p.cut);
  }

  function setupLevel5Exit(anchor) {
    const size = LEVEL5_EXIT_SIZE;
    const half = size / 2;
    // 撤离点放在地图左侧中央，与卫星区拉开距离
    let cx = -Math.min(WORLD_LIMIT * 0.55, 900);
    let cy = 0;
    if (anchor && Number.isFinite(anchor.x)) {
      // 若玩家已偏左，则放到其前方一段距离
      const ang = Number.isFinite(anchor.heading) ? anchor.heading : Math.PI;
      cx = clamp(anchor.x + Math.cos(ang) * 480, -WORLD_LIMIT + half + 40, WORLD_LIMIT - half - 40);
      cy = clamp(anchor.y + Math.sin(ang) * 480, -WORLD_LIMIT + half + 40, WORLD_LIMIT - half - 40);
    }
    level5Exit = {
      x0: cx - half,
      x1: cx + half,
      y0: cy - half,
      y1: cy + half,
    };
  }

  function spawnLevelSatellites(me, rngFn) {
    localSatellites = [];
    satCutCount = 0;
    satGrabCount = 0;
    satArm = null;
    level5Exit = null;
    const rnd = typeof rngFn === "function" ? rngFn : Math.random;
    const spots = [
      { x: 520 + (rnd() - 0.5) * 80, y: -220 + (rnd() - 0.5) * 60 },
      { x: 780 + (rnd() - 0.5) * 80, y: 260 + (rnd() - 0.5) * 60 },
    ];
    for (let i = 0; i < LEVEL_SAT_COUNT; i++) {
      const sp = spots[i] || { x: 600 + i * 200, y: (i % 2 ? 1 : -1) * 180 };
      const heading = i === 0 ? 0.15 : -0.2;
      let sat;
      if (PapaSatellite) {
        sat = PapaSatellite.create(sp.x, sp.y, { id: 5100 + i, heading });
      } else {
        sat = {
          id: 5100 + i,
          x: sp.x,
          y: sp.y,
          heading,
          armed: false,
          panels: [
            { side: -1, cut: false, detach: null },
            { side: 1, cut: false, detach: null },
          ],
          kind: "satellite",
        };
      }
      sat.grabbed = false;
      localSatellites.push(sat);
    }
    try {
      GameGlobal.levelSatMode = true;
      GameGlobal.satCutReady = false;
      GameGlobal.satGrabReady = false;
      GameGlobal.satArmActive = false;
      GameGlobal.satActLabel = "剪断";
      GameGlobal.satCutCount = 0;
      GameGlobal.satCutTotal = LEVEL_SAT_PANEL_TOTAL;
      GameGlobal.satGrabCount = 0;
      GameGlobal.satGrabTotal = LEVEL_SAT_GRAB_TOTAL;
    } catch (e) {}
  }

  function spawnLevelSatPatrols(me, rngFn, nextIdFn) {
    const rnd = typeof rngFn === "function" ? rngFn : Math.random;
    for (let i = 0; i < localSatellites.length; i++) {
      const sat = localSatellites[i];
      if (!sat) continue;
      const id = typeof nextIdFn === "function" ? nextIdFn() : (5200 + i);
      const ang0 = rnd() * Math.PI * 2;
      const R = 155 + rnd() * 35;
      const px = sat.x + Math.cos(ang0) * R;
      const py = sat.y + Math.sin(ang0) * R;
      const ship = spawnLocalCraft(
        id,
        "巡逻机" + (i + 1),
        1,
        { cx: px, cy: py, x0: px - 40, x1: px + 40, y0: py - 40, y1: py + 40 },
        true
      );
      ship.satPatrol = true;
      ship.satId = sat.id;
      ship.homeX = sat.x;
      ship.homeY = sat.y;
      ship.patrolR = R;
      ship.patrolAng = ang0;
      ship.patrolDir = rnd() < 0.5 ? -1 : 1;
      ship.patrolSpd = 0.7 + rnd() * 0.35;
      ship.x = px;
      ship.y = py;
      ship.heading = ang0 + ship.patrolDir * (Math.PI / 2);
      ship.vx = 0;
      ship.vy = 0;
      ship.throttle = 0.55;
      ship.iq = 2;
      ship.spdTier = 1;
      ship.testBot = false;
      ship.brain = emptyBotCtx(2);
      ship.brain.style = 0.55;
      ship.brain.targetId = me && me.id;
      ship.brain.targetUntil = performance.now() + 60000;
      ship.lo = { main: "gun", sub: "missile", engine: "single" };
      ship.gunAmmo = GUN_AMMO_MAX;
      ship.missileAmmo = MISSILE_AMMO_MAX;
      ship.missileCd = 1.2 + rnd();
      const ro = roster.get(ship.id);
      if (ro) ro.spd = 1;
      localCrafts.push(ship);
    }
  }

  /** 绕卫星巡逻；玩家靠近则转向交火，但仍拴在卫星附近 */
  function tickSatPatrolShip(craft, me, foes, rocks, dt) {
    if (!craft || craft.respawn > 0) return;
    const hx = craft.homeX != null ? craft.homeX : craft.x;
    const hy = craft.homeY != null ? craft.homeY : craft.y;
    const R = craft.patrolR || 170;
    craft.patrolAng = (craft.patrolAng || 0) + (craft.patrolDir || 1) * (craft.patrolSpd || 0.85) * dt;
    const tx = hx + Math.cos(craft.patrolAng) * R;
    const ty = hy + Math.sin(craft.patrolAng) * R;

    const aliveMe = me && me.hp > 0 && !(me.respawn > 0) && !levelRunEnding;
    const distMe = aliveMe ? Math.hypot(me.x - craft.x, me.y - craft.y) : Infinity;
    const engage = aliveMe && distMe < 520;

      // 双发尾喷口 + 矢量襟片
    const toTx = Math.atan2(ty - craft.y, tx - craft.x);
    const toMe = aliveMe ? Math.atan2(me.y - craft.y, me.x - craft.x) : toTx;
    let desire = engage ? toMe : toTx;
    // 略带切线方向，看起来像绕?
    if (!engage) desire = toTx + (craft.patrolDir || 1) * 0.35;

    let dh = desire - craft.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    craft.heading += clamp(dh, -2.4 * dt, 2.4 * dt);

    const pull = Math.min(1, 2.8 * dt);
    craft.x += (tx - craft.x) * pull;
    craft.y += (ty - craft.y) * pull;
    const spd = engage ? MAX_SPEED * 0.42 : MAX_SPEED * 0.32;
    craft.vx = Math.cos(craft.heading) * spd;
    craft.vy = Math.sin(craft.heading) * spd;
    craft.x += craft.vx * dt * 0.35;
    craft.y += craft.vy * dt * 0.35;
    craft.throttle = engage ? 0.7 : 0.5;

    // 助战房主失败：回航图
    const away = Math.hypot(craft.x - hx, craft.y - hy);
    if (away > R + 90) {
      const a = Math.atan2(craft.y - hy, craft.x - hx);
      craft.x = hx + Math.cos(a) * (R + 80);
      craft.y = hy + Math.sin(a) * (R + 80);
    }

    if (!engage) return;
    // 近距用常?bot 开火逻辑补一枪（机关?偶尔导弹?
    craft.missileCd = Math.max(0, (craft.missileCd || 0) - dt);
    craft.gunCd = Math.max(0, (craft.gunCd || 0) - dt);
    if (craft.gunCd <= 0) {
      craft.gunCd = 0.14 + Math.random() * 0.08;
      const aim = Math.atan2(me.y - craft.y, me.x - craft.x);
      const spread = (Math.random() - 0.5) * 0.08;
      const a = aim + spread;
      const bx = Math.cos(a);
      const by = Math.sin(a);
      putBulletShot(++bulletSeq, {
        oid: craft.id, kind: 0,
        x: craft.x + bx * 28,
        y: craft.y + by * 28,
        vx: craft.vx * 0.2 + bx * BULLET_SPEED,
        vy: craft.vy * 0.2 + by * BULLET_SPEED,
        ax: bx, ay: by,
        t0: performance.now(), t0Local: performance.now(), own: false, life: BULLET_LIFE_MS,
      });
    }
    if (craft.missileCd <= 0 && distMe < 420 && Math.random() < 0.35) {
      craft.missileCd = 2.4 + Math.random() * 1.2;
      craft.missileAmmo = Math.max(1, craft.missileAmmo || 1);
      try { spawnLocalMissile(craft, me.id, { mirv: false }); } catch (e) {}
    }
  }

  function nearestCuttablePanel(me) {
    if (!me || !(me.hp > 0) || me.respawn > 0) return null;
    const range = satCutRange();
    let best = null;
    let bestD = range;
    for (const sat of localSatellites) {
      if (!sat || sat.grabbed) continue;
      const panels = PapaSatellite
        ? PapaSatellite.remainingPanels(sat)
        : (sat.panels || []).filter((p) => p && !p.cut);
      for (const panel of panels) {
        // 对准铰接根部，不是电板中心
        const pos = PapaSatellite
          ? PapaSatellite.panelRootWorld(sat, panel)
          : { x: sat.x + panel.side * 28, y: sat.y };
        const d = Math.hypot(pos.x - me.x, pos.y - me.y);
        if (d <= bestD) {
          bestD = d;
          best = { sat, panel, x: pos.x, y: pos.y, dist: d };
        }
      }
    }
    return best;
  }

  function nearestGrabbableSat(me) {
    if (!me || !(me.hp > 0) || me.respawn > 0) return null;
    const range = satGrabRange();
    let best = null;
    let bestD = range;
    for (const sat of localSatellites) {
      if (!sat || sat.grabbed || !satPanelsAllCut(sat)) continue;
      const d = Math.hypot(sat.x - me.x, sat.y - me.y);
      if (d <= bestD) {
        bestD = d;
        best = { sat, x: sat.x, y: sat.y, dist: d };
      }
    }
    return best;
  }

  function tryStartSatCut() {
    if (!(localLevelMode && levelRunCol === 5) || levelRunEnding || satArm) return false;
    const me = levelMePose();
    const target = nearestCuttablePanel(me);
    if (!target) return false;
    // 伸出 → 剪刀合拢 → 断开
    satArm = {
      mode: "cut",
      satId: target.sat.id,
      panelSide: target.panel.side,
      mx: target.x,
      my: target.y,
      age: 0,
      reachDur: 0.34,
      snipDur: 0.28,
      done: false,
    };
    try { sfx?.playSelect?.(); } catch (e) {}
    return true;
  }

  function tryStartSatGrab() {
    if (!(localLevelMode && levelRunCol === 5) || levelRunEnding || satArm) return false;
    const me = levelMePose();
    const target = nearestGrabbableSat(me);
    if (!target) return false;
    // 抓手：伸出 → 合爪 → 拖进飞船
    satArm = {
      mode: "grab",
      satId: target.sat.id,
      panelSide: null,
      mx: target.x,
      my: target.y,
      ox: target.sat.x,
      oy: target.sat.y,
      age: 0,
      reachDur: 0.4,
      clampDur: 0.3,
      pullDur: 0.58,
      clamped: false,
      done: false,
    };
    target.sat.grabbing = true;
    try { sfx?.playSelect?.(); } catch (e) {}
    return true;
  }

  /** 剪断 / 抓取统一入口：优先剪板，其次抓星 */
  function tryStartSatAction() {
    if (tryStartSatCut()) return true;
    return tryStartSatGrab();
  }

  function finishSatCut(sat, panel) {
    if (!sat || !panel || panel.cut) return;
    if (PapaSatellite) {
      PapaSatellite.cutPanel(sat, panel, Math.atan2(
        panel.side * Math.sin(sat.heading || 0),
        panel.side * Math.cos(sat.heading || 0)
      ));
    } else {
      panel.cut = true;
    }
    satCutCount += 1;
    try {
      GameGlobal.satCutCount = satCutCount;
      sfx?.playMetalPing?.();
      sfx?.playRockChip?.();
    } catch (e) {}
    const pos = PapaSatellite
      ? PapaSatellite.panelRootWorld(sat, panel)
      : { x: sat.x + (panel.side || 0) * 28, y: sat.y };
    spawnCraftSparks(pos.x, pos.y, 1, 0, 14);
    // 板剪完不立刻过关：需抓进飞船再飞撤离点
    if (satPanelsAllCut(sat) && statusEl) {
      try {
        statusEl.textContent = "电板已断 · 靠近卫星抓取进舱";
      } catch (e) {}
    }
  }

  function finishSatGrab(sat) {
    if (!sat || sat.grabbed) return;
    sat.grabbed = true;
    sat.grabbing = false;
    satGrabCount += 1;
    try {
      GameGlobal.satGrabCount = satGrabCount;
      sfx?.playMetalPing?.();
      sfx?.playSelect?.();
    } catch (e) {}
    spawnCraftSparks(sat.x, sat.y, 0, 1, 18);
    if (satGrabCount >= LEVEL_SAT_GRAB_TOTAL && !level5Exit) {
      const me = levelMePose();
      setupLevel5Exit(me);
      if (statusEl) {
        try {
          statusEl.textContent = "卫星已回收 · 飞向撤离点过关";
        } catch (e) {}
      }
    } else if (statusEl) {
      try {
        statusEl.textContent = `已抓取 ${satGrabCount}/${LEVEL_SAT_GRAB_TOTAL} · 继续回收卫星`;
      } catch (e) {}
    }
  }

  function tickLevel5ExitWin(me) {
    if (!(localLevelMode && levelRunCol === 5) || levelRunEnding || !me || !level5Exit) return;
    if (!(me.hp > 0) || me.respawn > 0) return;
    if (satGrabCount < LEVEL_SAT_GRAB_TOTAL) return;
    const g = level5Exit;
    if (me.x >= g.x0 && me.x <= g.x1 && me.y >= g.y0 && me.y <= g.y1) {
      levelRunEnding = true;
      levelRunResult = "win";
      beginLevelWinCine(me.x, me.y, { boostBlast: false });
    }
  }

  function drawLevel5Exit(camera) {
    if (!(localLevelMode && levelRunCol === 5) || !level5Exit) return;
    if (satGrabCount < LEVEL_SAT_GRAB_TOTAL) return;
    const g = level5Exit;
    const a = screen(g.x0, g.y0, camera);
    const b = screen(g.x1, g.y1, camera);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.save();
    const pulse = 0.12 + 0.08 * Math.sin(performance.now() / 280);
    ctx.fillStyle = `rgba(90,200,255,${pulse})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(140,220,255,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(200,240,255,0.95)";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("撤离点", x + w * 0.5, y + h * 0.5);
    ctx.restore();
  }

  function drawLocalSatellites(camera, tSec) {
    for (const sat of localSatellites) {
      if (!sat || sat.grabbed) continue;
      const p = screen(sat.x, sat.y, camera);
      if (p.x < -180 || p.y < -180 || p.x > W + 180 || p.y > H + 180) continue;
      const snipSide = satArm && satArm.mode !== "grab" && satArm.satId === sat.id && !satArm.done
        ? satArm.panelSide
        : null;
      // 拖进飞船时逐渐缩小
      let scale = 1;
      if (satArm && satArm.mode === "grab" && satArm.satId === sat.id && satArm.clamped) {
        const reachDur = satArm.reachDur || 0.4;
        const clampDur = satArm.clampDur || 0.3;
        const pullDur = satArm.pullDur || 0.58;
        const pullT = clamp(((satArm.age || 0) - reachDur - clampDur) / pullDur, 0, 1);
        scale = Math.max(0.18, 1 - pullT * 0.82);
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      if (scale !== 1) ctx.scale(scale, scale);
      if (PapaSatellite) {
        PapaSatellite.drawSatellite(ctx, sat, tSec, { armed: sat.armed, snipSide });
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fillStyle = "#8aa";
        ctx.fill();
      }
      ctx.restore();
      for (const panel of sat.panels || []) {
        const d = panel && panel.detach;
        if (!d || !PapaSatellite) continue;
        const dp = screen(d.x, d.y, camera);
        PapaSatellite.drawDetachedPanel(ctx, d, dp.x, dp.y, 1);
      }
    }
  }

  function drawSatScissorArm(me, camera) {
    if (!satArm || !me || !PapaSatellite) return;
    const heading = Number.isFinite(me.heading) ? me.heading : 0;
    const nose = screen(
      me.x + Math.cos(heading) * 22,
      me.y + Math.sin(heading) * 22,
      camera
    );
    const mp = screen(satArm.mx, satArm.my, camera);
    const age = satArm.age || 0;

    if (satArm.mode === "grab") {
      const reachDur = satArm.reachDur || 0.4;
      const clampDur = satArm.clampDur || 0.3;
      const pullDur = satArm.pullDur || 0.58;
      // 拖回时 tip 已靠近机头，臂长随距离自然缩短，reach 保持 1
      const reach = age < reachDur ? easeOutCubic(age / reachDur) : 1;
      const clampAmt = age <= reachDur
        ? 0
        : age <= reachDur + clampDur
        ? clamp((age - reachDur) / clampDur, 0, 1)
        : 1;
      const pullT = age <= reachDur + clampDur
        ? 0
        : clamp((age - reachDur - clampDur) / pullDur, 0, 1);
      const hold = clampAmt * 0.45 + pullT * 0.55;
      if (typeof PapaSatellite.drawGrabClaw === "function") {
        PapaSatellite.drawGrabClaw(ctx, nose.x, nose.y, mp.x, mp.y, reach, clampAmt, hold, {
          labelIdle: clampAmt < 0.2 ? "对准星体" : "合爪夹紧",
          labelDone: pullT > 0.05 ? "拖进飞船！" : "夹住！",
        });
      }
      return;
    }

    const reachDur = satArm.reachDur || 0.34;
    const snipDur = satArm.snipDur || 0.28;
    const reach = age < reachDur ? easeOutCubic(age / reachDur) : 1;
    const snipT = age <= reachDur ? 0 : clamp((age - reachDur) / snipDur, 0, 1);
    PapaSatellite.drawScissorArm(ctx, nose.x, nose.y, mp.x, mp.y, reach, snipT, snipT, {
      labelIdle: "对准根部",
      labelDone: "剪断！",
    });
  }

  function tickLocalSatellites(dt) {
    if (!(localLevelMode && levelRunCol === 5)) {
      try {
        GameGlobal.levelSatMode = false;
        GameGlobal.satCutReady = false;
        GameGlobal.satGrabReady = false;
        GameGlobal.satArmActive = false;
      } catch (e) {}
      return;
    }
    const freeze = !!(
      levelFailHold || levelWinHold
      || (levelFailCine && levelRunResult === "fail")
      || (levelWinCine && levelRunResult === "win")
    );
    const me = levelMePose();
    const cutTarget = !freeze ? nearestCuttablePanel(me) : null;
    const grabTarget = !freeze && !cutTarget ? nearestGrabbableSat(me) : null;
    const cutReady = !!cutTarget && !satArm;
    const grabReady = !!grabTarget && !satArm;
    const armMode = satArm && satArm.mode === "grab" ? "grab" : (satArm ? "cut" : null);
    try {
      GameGlobal.levelSatMode = true;
      // 剪板优先；板剪完后同范围切「抓取」；否则保持开火
      GameGlobal.satCutReady = !!(cutReady || (satArm && armMode === "cut"));
      GameGlobal.satGrabReady = !!(grabReady || (satArm && armMode === "grab"));
      GameGlobal.satArmActive = !!satArm;
      GameGlobal.satActLabel = (grabReady || armMode === "grab") ? "抓取" : "剪断";
      GameGlobal.satCutCount = satCutCount;
      GameGlobal.satCutTotal = LEVEL_SAT_PANEL_TOTAL;
      GameGlobal.satGrabCount = satGrabCount;
      GameGlobal.satGrabTotal = LEVEL_SAT_GRAB_TOTAL;
    } catch (e) {}

    const cutR = satCutRange();
    const grabR = satGrabRange();
    for (const sat of localSatellites) {
      if (!sat || sat.grabbed) continue;
      if (PapaSatellite) PapaSatellite.update(sat, dt);
      const near = me && me.hp > 0 && !(me.respawn > 0)
        && Math.hypot(sat.x - me.x, sat.y - me.y) <= Math.max(cutR, grabR) + 20;
      sat.armed = !!near;
    }

    if (satArm) {
      satArm.age += dt;
      const sat = localSatellites.find((s) => s && s.id === satArm.satId);
      if (satArm.mode === "grab") {
        const reachDur = satArm.reachDur || 0.4;
        const clampDur = satArm.clampDur || 0.3;
        const pullDur = satArm.pullDur || 0.58;
        const totalDur = reachDur + clampDur + pullDur;
        if (!sat || sat.grabbed) {
          if (satArm.done && satArm.age >= totalDur + 0.1) {
            satArm = null;
          } else if (!sat) {
            satArm = null;
          }
        } else {
          const alive = me && me.hp > 0 && !(me.respawn > 0);
          const heading = alive && Number.isFinite(me.heading) ? me.heading : 0;
          const noseX = alive ? me.x + Math.cos(heading) * 18 : sat.x;
          const noseY = alive ? me.y + Math.sin(heading) * 18 : sat.y;
          // 合爪前超距会断；夹住后只要求玩家存活，继续拖回
          if (!satArm.clamped) {
            const dist = alive ? Math.hypot(sat.x - me.x, sat.y - me.y) : Infinity;
            if (!freeze && dist > grabR) {
              sat.grabbing = false;
              satArm = null;
              try { sfx?.playDry?.(); } catch (e) {}
            } else {
              satArm.mx = sat.x;
              satArm.my = sat.y;
              if (!freeze && satArm.age >= reachDur + clampDur) {
                satArm.clamped = true;
                try { sfx?.playMetalPing?.(); } catch (e) {}
              }
            }
          } else if (!satArm.done) {
            const pullT = clamp((satArm.age - reachDur - clampDur) / pullDur, 0, 1);
            const u = easeOutCubic(pullT);
            const ox = satArm.ox != null ? satArm.ox : sat.x;
            const oy = satArm.oy != null ? satArm.oy : sat.y;
            sat.x = ox + (noseX - ox) * u;
            sat.y = oy + (noseY - oy) * u;
            satArm.mx = sat.x;
            satArm.my = sat.y;
            if (!alive) {
              // 玩家挂了则松开，卫星落回抓取起点
              sat.x = ox;
              sat.y = oy;
              sat.grabbing = false;
              satArm = null;
            } else if (pullT >= 1) {
              finishSatGrab(sat);
              satArm.done = true;
            }
          }
        }
      } else {
        const panel = sat && (sat.panels || []).find((p) => p && p.side === satArm.panelSide);
        if (!sat || !panel || (panel.cut && satArm.done)) {
          if (satArm.done && satArm.age >= (satArm.reachDur || 0.34) + (satArm.snipDur || 0.28) + 0.18) {
            satArm = null;
          } else if (!sat || !panel) {
            satArm = null;
          }
        } else {
          const pos = PapaSatellite
            ? PapaSatellite.panelRootWorld(sat, panel)
            : { x: sat.x + panel.side * 28, y: sat.y };
          satArm.mx = pos.x;
          satArm.my = pos.y;
          const alive = me && me.hp > 0 && !(me.respawn > 0);
          const dist = alive ? Math.hypot(pos.x - me.x, pos.y - me.y) : Infinity;
          if (!freeze && dist > cutR) {
            satArm = null;
            try { sfx?.playDry?.(); } catch (e) {}
          } else {
            const reachDur = satArm.reachDur || 0.34;
            const snipDur = satArm.snipDur || 0.28;
            if (!satArm.done && satArm.age >= reachDur + snipDur) {
              finishSatCut(sat, panel);
              satArm.done = true;
            }
          }
        }
      }
    }
  }

  function satInteractActive() {
    try {
      return !!(GameGlobal.satCutReady || GameGlobal.satGrabReady || satArm);
    } catch (e) {
      return !!(satArm);
    }
  }

  function spawnMothershipMissile(m, target) {
    if (!m || !target) return null;
    const aim = Math.atan2(target.y - m.y, target.x - m.x);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const x = m.x + cos * 36;
    const y = m.y + sin * 36;
    const launchSpeed = MISSILE_MIN_LAUNCH;
    const mis = {
      id: ++localMissileSeq,
      ownerId: LEVEL_MOTHER_OID,
      targetId: target.id,
      x, y, prevX: x, prevY: y,
      heading: aim,
      launchSpeed,
      speed: launchSpeed,
      age: 0,
      life: 5,
      trail: [],
    };
    localMissiles.push(mis);
    if (localMissiles.length > 80) localMissiles.splice(0, localMissiles.length - 80);
    if (worldOnView(m.x, m.y, 140)) sfx?.playMissile?.(LEVEL_MOTHER_OID);
    return mis;
  }

  function tickMothershipMissiles(m, dt, me, freeze) {
    if (!m || m.dead || m.alive === false) return;
    if (freeze) return;
    m.misCd = Math.max(0, (m.misCd || 0) - dt);
    m.misGap = Math.max(0, (m.misGap || 0) - dt);
    if ((m.misLeft || 0) <= 0 && m.misCd <= 0 && me) {
      m.misLeft = LEVEL_MOTHER_MIS_COUNT;
      m.misGap = 0;
    }
    if ((m.misLeft || 0) > 0 && m.misGap <= 0 && me) {
      spawnMothershipMissile(m, me);
      m.misLeft -= 1;
      if (m.misLeft <= 0) m.misCd = LEVEL_MOTHER_MIS_CD;
      else m.misGap = LEVEL_MOTHER_MIS_GAP;
    }
  }

  function tickLocalMotherships(dt) {
    if (!localMotherships.length) return;
    const me = localCrafts.find((c) => c.id === myId && !(c.respawn > 0));
    const freeze = !!(
      levelFailHold || levelWinHold
      || (levelFailCine && levelRunResult === "fail")
      || (levelWinCine && levelRunResult === "win")
    );
    const now = performance.now();
    const elapsed = now / 1000;
    for (const m of localMotherships) {
      if (m.dead || m.alive === false) continue;
      if (PapaMS01 && m.kind === "ms01") {
        PapaMS01.update(m, dt, me || null, {
          freeze,
          elapsed,
          onFire: (shot) => {
            const sp = Math.hypot(shot.vx, shot.vy) || 1;
            putBulletShot(++bulletSeq, {
              oid: LEVEL_MOTHER_OID, kind: 0, own: false,
              x: shot.x, y: shot.y,
              vx: shot.vx, vy: shot.vy,
              ax: shot.vx / sp, ay: shot.vy / sp,
              t0: now, t0Local: now,
              life: Math.round((shot.life || 1.5) * 1000),
              dmg: shot.dmg || 10, team: 1,
              style: "ms01", ci: shot.ci || 0,
            });
            if (worldOnView(m.x, m.y, 120)) sfx?.playShot?.();
          },
        });
      }
      tickMothershipMissiles(m, dt, me, freeze);
    }
  }

  function damageLocalMothership(m, amount, atX, atY) {
    if (!m || m.dead || m.alive === false || !(amount > 0)) return false;
    const hx = atX != null ? atX : m.x;
    const hy = atY != null ? atY : m.y;
    spawnCraftSparks(hx, hy, 1, 0, 6);
    let killed = false;
    if (PapaMS01 && m.kind === "ms01") {
      killed = !!PapaMS01.damage(m, hx, hy, amount);
    } else {
      m.hp = Math.max(0, m.hp - amount);
      killed = m.hp <= 0;
      if (killed) { m.dead = true; m.alive = false; }
    }
    if (!killed) return true;
    m.dead = true;
    m.alive = false;
    burstCraftDeath(m.x, m.y, 0, 0, m.heading, "fighter", { slowMo: true });
    popMissileBlast(m.x, m.y, 1.6);
    if (!levelRunEnding) {
      levelRunEnding = true;
      levelRunResult = "win";
      beginLevelWinCine(m.x, m.y);
    }
    return true;
  }

  function hitLocalMothershipShot(shot) {
    if (!localMatch || !localMotherships.length) return false;
    if (shot.ownerId === LEVEL_MOTHER_OID || shot.oid === LEVEL_MOTHER_OID) return false;
    for (const m of localMotherships) {
      if (m.dead || m.alive === false) continue;
      if (!segmentHitsCircle(shot.prevX, shot.prevY, shot.x, shot.y, m.x, m.y, LEVEL_MOTHER_HIT_R)) continue;
      damageLocalMothership(m, shot.dmg || 9, shot.x, shot.y);
      if (shot.blast) {
        splashLocalBlast(shot.x, shot.y, shot.blast, CANNON_SPLASH_DMG, shot.ownerId || shot.oid, null);
      }
      dropBulletShot(shot.id);
      return true;
    }
    return false;
  }

  // 训练场靶机：随机落点，单发；悬停型原地不动，自由型在航点间巡航，均不开?
  function placeTrainTarget(c) {
    const pos = randomLocalPickupPos();
    c.x = pos.x;
    c.y = pos.y;
    c.heading = Math.random() * Math.PI * 2;
    c.vx = 0;
    c.vy = 0;
    c.hp = PLAYER_MAX_HP;
    c.respawn = 0;
    c.shieldT = 0;
    c.stunT = 0;
    c.spdTier = 1;
    c.throttle = c.trainKind === "free" ? 0.55 : 0;
    c.trainWp = c.trainKind === "free" ? randomLocalPickupPos() : null;
    const ro = roster.get(c.id);
    if (ro) ro.spd = 1;
    const st = playerStatus.get(c.id) || { ...DEFAULT_STATUS };
    st.hp = c.hp;
    st.respawn = 0;
    playerStatus.set(c.id, st);
  }

  function trainTargetInput(c) {
    if (c.trainKind === "ally") {
      // 队友悬停在出生点附近，慢速回位，便于绿名辨认
      const pad = factionPads[0];
      if (!pad) return { throttle: 0, brake: true };
      const tx = pad.cx + ((c.id & 1) ? 90 : -90);
      const ty = pad.cy + ((c.id & 1) ? -70 : 70);
      const dx = tx - c.x;
      const dy = ty - c.y;
      if (Math.hypot(dx, dy) < 40) return { throttle: 0, brake: true, aim: c.heading };
      return { throttle: 0.35, aim: Math.atan2(dy, dx) };
    }
    if (c.trainKind !== "free") return { throttle: 0, brake: true };
    let wp = c.trainWp;
    if (!wp || Math.hypot(wp.x - c.x, wp.y - c.y) < 160) wp = c.trainWp = randomLocalPickupPos();
    return { throttle: 0.55, aim: Math.atan2(wp.y - c.y, wp.x - c.x) };
  }

  function localInOwnPad(craft) {
    const pad = factionPads[craft.team];
    if (!pad) return false;
    return craft.x >= pad.x0 && craft.x <= pad.x1 && craft.y >= pad.y0 && craft.y <= pad.y1;
  }

  function respawnLocalCraft(craft) {
    craft.guardUntil = performance.now() + SPAWN_GUARD_MS;
    if (craft.trainKind === "ally") {
      const pad = factionPads[0];
      craft.x = (pad ? pad.cx : 0) + ((craft.id & 1) ? 90 : -90);
      craft.y = (pad ? pad.cy : 0) + ((craft.id & 1) ? -70 : 70);
      craft.heading = Math.atan2(-craft.y, -craft.x || 1);
      craft.vx = 0;
      craft.vy = 0;
      craft.throttle = 0;
      craft.hp = PLAYER_MAX_HP;
      craft.respawn = 0;
      craft.shieldT = 0;
      craft.stunT = 0;
      const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
      st.hp = craft.hp;
      st.respawn = 0;
      playerStatus.set(craft.id, st);
      return;
    }
    if (craft.trainKind) {
      placeTrainTarget(craft);
      return;
    }
    const pad = factionPads[craft.team] || factionPads[0];
    craft.x = pad.cx + (Math.random() - 0.5) * 60;
    craft.y = pad.cy + (Math.random() - 0.5) * 60;
    craft.heading = Math.atan2(-pad.cy, -pad.cx);
    craft.vx = 0;
    craft.vy = 0;
    craft.throttle = craft.bot ? 0.85 : 0;
    craft.hp = PLAYER_MAX_HP;
    craft.respawn = 0;
    craft.shieldT = 0;
    craft.stunT = 0;
    craft.gunAmmo = craft.id === myId ? gunAmmoMax : GUN_AMMO_MAX;
    craft.missileAmmo = MISSILE_AMMO_MAX;
    if (craft.id === myId) {
      gunAmmo = craft.gunAmmo;
      missileAmmo = craft.missileAmmo;
      renderAmmo();
      pushSpeedLeverIdle();
    }
  }

  function damageLocalCraft(craft, amount, attackerId) {
    if (!craft || craft.respawn > 0) return;
    if (craft.shieldT > 0) return;
    if (performance.now() < (craft.guardUntil || 0)) return;
    craft.hp -= amount;
    spawnCraftSparks(craft.x, craft.y, craft.vx || 1, craft.vy || 0, 5 + (Math.random() * 4 | 0));
    playHitOnView(craft.x, craft.y);
    if (craft.id === myId) bumpGunHitFeel(clamp(amount / PLAYER_MAX_HP, 0.2, 1));
    const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
    st.hp = Math.max(0, craft.hp);
    playerStatus.set(craft.id, st);
    if (craft.hp > 0) return;
    // 关卡模式：不复活；敌机死=过关，玩家死=失败（失败先播慢镜头?
    if (localLevelMode) {
      craft.hp = 0;
      craft.respawn = 99999;
      craft.throttle = 0;
      craft.vx = 0;
      craft.vy = 0;
      craft.deaths += 1;
      st.hp = 0;
      st.respawn = 99999;
      playerStatus.set(craft.id, st);
      if (craft.id === myId) {
        burstCraftDeath(craft.x, craft.y, craft.vx, craft.vy, craft.heading, "fighter", { slowMo: true });
        bumpDeathFeel();
        myDeaths += 1;
        renderKd();
        if (!levelRunEnding) {
          levelRunEnding = true;
          levelRunResult = "fail";
          levelFailCine = { age: 0, dur: 2.05 };
          try { GameGlobal.levelFailCine = true; } catch (e) {}
        }
      } else {
        if (attackerId === myId) {
          myKills += 1;
          renderKd();
        }
        // 仅第1关：击毁敌机即过关。第4关须飞入终点区；?关打母舰；第3关拆地雷
        if (!levelRunEnding && levelRunCol === 1) {
          levelRunEnding = true;
          levelRunResult = "win";
          burstCraftDeath(craft.x, craft.y, craft.vx, craft.vy, craft.heading, "fighter", { slowMo: true });
          beginLevelWinCine(craft.x, craft.y);
        } else {
          burstCraftDeath(craft.x, craft.y, craft.vx, craft.vy, craft.heading, "fighter");
        }
      }
      return;
    }
    // 靶机被打灭后很快在别处随机刷?
    const respawnSec = craft.trainKind ? 0.8 : 3;
    craft.hp = 0;
    craft.respawn = respawnSec;
    craft.throttle = 0;
    craft.vx = 0;
    craft.vy = 0;
    craft.deaths += 1;
    st.hp = 0;
    st.respawn = respawnSec;
    playerStatus.set(craft.id, st);
    burstCraftDeath(craft.x, craft.y, craft.vx, craft.vy, craft.heading, "fighter");
    if (craft.id === myId) bumpDeathFeel();
    if (attackerId && attackerId !== craft.id) {
      const atk = localCrafts.find((c) => c.id === attackerId);
      if (atk) {
        atk.kills += 1;
        atk.gunAmmo = gunAmmoMax;
        atk.missileAmmo = MISSILE_AMMO_MAX;
        atk.missileCd = 0;
      }
      if (attackerId === myId) {
        myKills += 1;
        renderKd();
        applyKillAmmoRefill(gunAmmoMax, MISSILE_AMMO_MAX, gunAmmoMax);
      } else if (atk && atk.bot) {
        // 机器人击杀也回满弹?
        atk.gunAmmo = GUN_AMMO_MAX;
        atk.missileAmmo = MISSILE_AMMO_MAX;
      }
    }
    if (craft.id === myId) {
      myDeaths += 1;
      renderKd();
    }
  }

  function applyLocalInput(craft, input, dt) {
    if (craft.respawn > 0) {
      // 关卡：仅点「复活」后的倒计时（<90000）才走复活；永久阵亡标记不自动回?
      if (localLevelMode && craft.respawn >= 90000) return;
      craft.respawn -= dt;
      const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
      st.respawn = Math.max(0, craft.respawn);
      playerStatus.set(craft.id, st);
      if (craft.respawn <= 0) {
        if (localLevelMode) respawnLevelCraft(craft);
        else respawnLocalCraft(craft);
      }
      return;
    }
    if (!input) input = {};
      // 静止：裂片留在母体位置，不做弹开
    const frozen = craft.stunT > 0;
    if (frozen) {
      craft.stunT = Math.max(0, craft.stunT - dt);
      input = { throttle: 0, turn: 0 };
    }
    if (Number.isFinite(input.throttle)) craft.throttle = clamp(input.throttle, 0, 1);
    else if (input.down) craft.throttle = clamp(craft.throttle - dt / 0.5, 0, 1);
    else if (input.up) craft.throttle = clamp(craft.throttle + dt / 0.3, 0, 1);
    else craft.throttle = Math.max(0, craft.throttle - dt / 1.05);

    let turn = clamp(input.turn || 0, -1, 1);
    if (turn === 0 && Number.isFinite(input.aim)) {
      const delta = angleDelta(input.aim, craft.heading);
      turn = Math.abs(delta) < 0.025 ? 0 : clamp(delta * 2, -1, 1);
    }
    craft.heading += turn * craftTurnRate(Math.hypot(craft.vx, craft.vy)) * dt;
    const cos = Math.cos(craft.heading);
    const sin = Math.sin(craft.heading);
    const currentForward = craft.vx * cos + craft.vy * sin;
    const craftMax = MAX_SPEED * clampSpeedTier(craft.spdTier || speedTierOfName(craft.name));
    const targetForward = craft.throttle * craftMax;
    const nextForward = approachForwardSpeed(currentForward, targetForward, !!input.brake, dt);
    craft.vx = frozen ? 0 : cos * nextForward;
    craft.vy = frozen ? 0 : sin * nextForward;
    craft.x += craft.vx * dt;
    craft.y += craft.vy * dt;
    craft.brake = !!input.brake;
    const xLo = -WORLD_LIMIT + 20;
    const xHi = WORLD_LIMIT - 20;
    const yLo = -WORLD_Y_LIMIT + 20;
    const yHi = WORLD_Y_LIMIT - 20;
    if (craft.x < xLo) { craft.x = xLo; if (craft.vx < 0) craft.vx = 0; }
    else if (craft.x > xHi) { craft.x = xHi; if (craft.vx > 0) craft.vx = 0; }
    if (craft.y < yLo) { craft.y = yLo; if (craft.vy < 0) craft.vy = 0; }
    else if (craft.y > yHi) { craft.y = yHi; if (craft.vy > 0) craft.vy = 0; }

    for (const a of asteroids.values()) {
      const dx = a.x - craft.x;
      const dy = a.y - craft.y;
      if (dx * dx + dy * dy > (a.r + 26) * (a.r + 26)) continue;
      const loc = worldToRock(a, craft.x, craft.y);
      if (!rockSolid(a, loc.x, loc.y)) continue;
      const nd = Math.max(0.001, Math.hypot(dx, dy));
      const nx = dx / nd;
      const ny = dy / nd;
      const vn = craft.vx * nx + craft.vy * ny;
      if (vn > 2) {
        craft.vx -= 1.55 * vn * nx;
        craft.vy -= 1.55 * vn * ny;
        craft.throttle = Math.min(craft.throttle, 0.35);
      }
      craft.x -= nx * 3;
      craft.y -= ny * 3;
    }

    if (localInOwnPad(craft)) craft.hp = Math.min(PLAYER_MAX_HP, craft.hp + PAD_HEAL_RATE * dt);

    // 玩家子弹?maybeFireLocalBullet；机器人按各自改装方案开?
    if (craft.bot) {
      const iq = craft.testBot ? GameGlobal.PapaTestBot.iqCfg(craft.iq || 1) : botIqCfg(craft.iq || 1);
      const lo = craft.lo || { main: "gun", sub: "missile" };
      const gunPeriod = GUN_PERIOD * iq.gunPeriod;
      craft.gunAmmo = Math.min(GUN_AMMO_MAX, craft.gunAmmo + GUN_AMMO_REGEN * dt);
      const held = !!input.fireGun;
      const aim = Number.isFinite(input.gunAim) ? input.gunAim : craft.heading;
      const nowT = performance.now();
      const fireBotShell = (opts) => {
        const bx = Math.cos(aim);
        const by = Math.sin(aim);
        const side = opts.side || 0;
        putBulletShot(++bulletSeq, {
          oid: craft.id, kind: 0, own: false,
          x: craft.x + bx * 18 - by * side,
          y: craft.y + by * 18 + bx * side,
          vx: craft.vx + bx * opts.speed,
          vy: craft.vy + by * opts.speed,
          ax: bx, ay: by,
          t0: nowT, t0Local: nowT,
          life: opts.life, team: craft.team,
          dmg: opts.dmg, blast: opts.blast || 0, style: opts.style,
        });
      };
      if (lo.main === "cannon") {
        craft.cannonCd = Math.max(0, (craft.cannonCd || 0) - dt);
        if (held && craft.cannonCd <= 0 && craft.gunAmmo >= 1) {
          craft.gunAmmo -= 1;
          craft.cannonCd = CANNON_CD;
          fireBotShell({
            style: "cannon", dmg: CANNON_DMG, blast: CANNON_BLAST,
            speed: BULLET_SPEED * 1.3, life: BULLET_LIFE_MS * 1.3,
          });
        }
      } else if (lo.main === "gatling") {
        craft.gatSpin = clamp((craft.gatSpin || 0) + (held ? dt / GAT_SPIN_UP : -dt / 0.6), 0, 1);
        const period = 0.14 + (0.045 - 0.14) * craft.gatSpin;
        if (!held) craft.gatAcc = 0;
        else {
          craft.gatAcc = (craft.gatAcc || 0) + dt;
          while (craft.gatAcc >= period) {
            craft.gatAcc -= period;
            if (craft.gunAmmo < 0.5) { craft.gatAcc = 0; break; }
            craft.gunAmmo -= 0.5;
            craft.gatSide = -(craft.gatSide || 1);
            fireBotShell({
              style: "gatling", dmg: GAT_DMG,
              speed: BULLET_SPEED, life: BULLET_LIFE_MS * 0.85,
              side: craft.gatSide * 1.35,
            });
          }
        }
      } else {
        if (held && !craft.gunHeldPrev) {
          craft.gunBurst = Math.max(2, BURST_ROUNDS - (craft.iq >= 3 ? 2 : craft.iq >= 2 ? 1 : 0));
          craft.gunAcc = gunPeriod * (0.5 + (craft.iq >= 3 ? 0.35 : craft.iq >= 2 ? 0.18 : 0));
        }
        if (held || craft.gunBurst > 0) {
          craft.gunAcc += dt;
          while (craft.gunAcc >= gunPeriod && (held || craft.gunBurst > 0)) {
            craft.gunAcc -= gunPeriod;
            if (craft.gunAmmo < 1) {
              craft.gunBurst = 0;
              craft.gunAcc = 0;
              break;
            }
            craft.gunAmmo -= 1;
            if (craft.gunBurst > 0) craft.gunBurst--;
            fireBotShell({ speed: BULLET_SPEED, life: BULLET_LIFE_MS, dmg: 5 });
          }
        } else craft.gunAcc = 0;
      }
      craft.gunHeldPrev = held;

      craft.missileAmmo = Math.min(MISSILE_AMMO_MAX, (craft.missileAmmo ?? MISSILE_AMMO_MAX) + MISSILE_AMMO_REGEN * dt);
      craft.missileCd = Math.max(0, (craft.missileCd || 0) - dt);
      craft.laserCd = Math.max(0, (craft.laserCd || 0) - dt);
      craft.empFireCd = Math.max(0, (craft.empFireCd || 0) - dt);
      if (lo.sub === "emp") {
        craft.empAmmo = Math.min(EMP_AMMO_MAX, (craft.empAmmo ?? EMP_AMMO_MAX) + EMP_AMMO_REGEN * dt);
      }
      if (input.fireMissile) {
        if (isMissileSub(lo.sub) && craft.missileCd <= 0 && craft.missileAmmo >= 1) {
          craft.missileAmmo -= 1;
          craft.missileCd = (lo.sub === "mirv" ? 0.75 : 0.55) * iq.misCd;
          spawnLocalMissile(craft, input.missileTarget, { mirv: lo.sub === "mirv" });
        } else if (lo.sub === "laser" && craft.laserCd <= 0) {
          craft.laserCd = LASER_CD;
          const subAim = botSubWeaponAim(craft, input.missileTarget, nowT);
          try { fireTrainLaser(craft, nowT, subAim); } catch (e) {}
        } else if (lo.sub === "emp" && (craft.empAmmo ?? 0) >= 1 && (craft.empFireCd || 0) <= 0) {
          craft.empAmmo -= 1;
          craft.empFireCd = EMP_FIRE_INTERVAL;
          const subAim = botSubWeaponAim(craft, input.missileTarget, nowT);
          try { fireTrainEmp(craft, nowT, subAim); } catch (e) {}
        }
      }
    }

    const st = playerStatus.get(craft.id) || { ...DEFAULT_STATUS };
    st.hp = craft.hp;
    st.respawn = 0;
    st.brake = craft.brake;
    playerStatus.set(craft.id, st);
  }

  function thinkLocalBot(craft, foes, rocks, dt) {
    const bakCmd = lastAutoCmd;
    const bakAmmo = gunAmmo;
    const bakMe = autoPilotCtx.me;
    const bakFoes = autoPilotCtx.foes;
    const bakRocks = autoPilotCtx.rocks;
    const bakDt = autoPilotCtx.dt;
    const bakBrain = emptyBotCtx();
    pullBotFields(bakBrain);

    pushBotFields(craft.brain);
    autoPilotCtx.iq = craft.iq || (craft.brain && craft.brain.iq) || 1;
    autoPilotCtx.lo = craft.lo || { main: "gun", sub: "missile" };
    autoPilotCtx.me = {
      id: craft.id, x: craft.x, y: craft.y, heading: craft.heading,
      vx: craft.vx, vy: craft.vy, spd: Math.hypot(craft.vx, craft.vy),
      throttle: craft.throttle, respawn: craft.respawn, color: craft.color,
      team: craft.team,
    };
    autoPilotCtx.foes = foes;
    autoPilotCtx.rocks = rocks;
    autoPilotCtx.dt = dt;
    gunAmmo = craft.gunAmmo;
    // 临时?myId 换成该机，方?isAutoFoe / isTeammate
    const bakMy = myId;
    myId = craft.id;
    const cmd = computeAutoPilot();
    myId = bakMy;
    pullBotFields(craft.brain);
    craft.gunAmmo = gunAmmo;

    lastAutoCmd = bakCmd;
    gunAmmo = bakAmmo;
    autoPilotCtx.me = bakMe;
    autoPilotCtx.foes = bakFoes;
    autoPilotCtx.rocks = bakRocks;
    autoPilotCtx.dt = bakDt;
    pushBotFields(bakBrain);
    return cmd;
  }

  function craftToDrawRow(c) {
    return {
      id: c.id, name: c.name, color: c.color, team: c.team,
      x: c.x, y: c.y, heading: c.heading,
      vx: c.vx, vy: c.vy, spd: Math.hypot(c.vx, c.vy),
      throttle: c.throttle, gear: "F", brake: c.brake,
      hp: c.hp, respawn: c.respawn, maxHp: PLAYER_MAX_HP,
      shieldT: c.shieldT || 0,
      stunT: c.stunT || 0,
      human: !!c.human,
      spdTier: clampSpeedTier(c.spdTier || speedTierOfName(c.name)),
    };
  }

  function stepLocalMatch(dt, now) {
    // 计时按墙钟：断线/进后台回来也能对齐真实剩余时?
    if (matchEndAt > 0 && syncMatchTimerFromClock()) {
      endLocalMatch(true);
      return null;
    }
    if (matchLost) return null;
    // 过关/失败演出期间留在战场，不立刻结算
    const rocks = [...asteroids.values()];
    const drawRows = localCrafts.map(craftToDrawRow);
    // 先记全场轨迹，供机器人激?EMP 回看 300~600ms
    try { recordBotFoeHist(localCrafts, now); } catch (e) {}
    const cineFreeze = !!(
      levelFailHold || levelWinHold
      || (levelFailCine && levelRunResult === "fail")
      || (levelWinCine && levelRunResult === "win")
    );

    const guideFreeze = trainGuideWorldFrozen();
    for (const craft of localCrafts) {
      if (guideFreeze) {
        // 训练引导前几步：场上飞机全部暂停
        craft.throttle = 0;
        craft.vx = 0;
        craft.vy = 0;
        continue;
      }
      if (cineFreeze) {
        // 慢镜头：机体停火漂浮，只留给爆炸碎片?
        craft.throttle = 0;
        craft.vx *= Math.exp(-1.8 * dt);
        craft.vy *= Math.exp(-1.8 * dt);
        craft.x += craft.vx * dt;
        craft.y += craft.vy * dt;
        continue;
      }
      // 助战远端机：只吃 snap，不本地操控
      if (craft.assistPeer && craft.id !== myId) {
        craft.x += (craft.vx || 0) * dt;
        craft.y += (craft.vy || 0) * dt;
        continue;
      }
      // 嘉宾侧：敌机/母舰由房?snap 驱动，本地不?AI（避免双端分叉）
      if (assistCoopMode && myId !== 1 && craft.bot) {
        craft.x += (craft.vx || 0) * dt;
        craft.y += (craft.vy || 0) * dt;
        continue;
      }
      if (!craft.bot) {
        // 玩家：P 代打或键鼠，只产 input，物理本地跑
        autoPilotCtx.me = craftToDrawRow(craft);
        autoPilotCtx.foes = drawRows;
        autoPilotCtx.rocks = rocks;
        autoPilotCtx.dt = dt;
        autoPilotCtx.lo = craft.lo || trainLoadout || { main: "gun", sub: "missile" };
        let input;
        if (autoPilot) {
          gunAmmo = craft.gunAmmo;
          input = computeAutoPilot();
          craft.gunAmmo = gunAmmo;
        } else {
          input = inputPayload();
        }
        applyLocalInput(craft, input, dt);
        gunAmmo = craft.gunAmmo;
      } else if (craft.levelAssault) {
        const meRow = drawRows.find((r) => r && r.id === myId) || drawRows.find((r) => r && !r.bot);
        tickLevelAssaultShip(craft, meRow, dt);
      } else if (craft.satPatrol) {
        const meRow = drawRows.find((r) => r && r.id === myId) || drawRows.find((r) => r && !r.bot);
        tickSatPatrolShip(craft, meRow, drawRows, rocks, dt);
      } else {
        const foes = drawRows;
        const cmd = craft.trainKind
          ? trainTargetInput(craft)
          : craft.testBot
          ? GameGlobal.PapaTestBot.think(craft.brain, craftToDrawRow(craft), foes, rocks, dt, {
            worldLimit: WORLD_LIMIT, gunAmmo: craft.gunAmmo, missileAmmo: craft.missileAmmo, lo: craft.lo,
          })
          : thinkLocalBot(craft, foes, rocks, dt);
        applyLocalInput(craft, cmd, dt);
      }
    }
    tickAssistPeerSync(dt);

    const meCraft = localCrafts.find((c) => c.id === myId);
    try { tickLevelCrossfireWin(meCraft); } catch (e) {}
    try { tickLevel5ExitWin(meCraft); } catch (e) {}
    const players = [];
    let me = null;
    for (const c of localCrafts) {
      const row = craftToDrawRow(c);
      if (c.id === myId) me = row;
      else players.push(row);
    }
    if (!me && meCraft) me = craftToDrawRow(meCraft);
    if (!me) me = { id: myId, x: 0, y: 0, throttle: 0, gear: "F", hp: PLAYER_MAX_HP, respawn: 0, heading: 0, spd: 0, vx: 0, vy: 0 };
    players.push(me);
    // 助战嘉宾：母舰由房主 snap 驱动，本地只做地雷交互与子弹
    if (!(assistCoopMode && myId !== 1)) tickLocalMotherships(dt);
    tickLocalAirMines(dt);
    tickLocalSatellites(dt);
    tickLocalSkills(dt);
    tickLocalDirtRocks(dt);
    tickLocalShieldPickups(dt);
    tickLocalMagPickups(dt);
    if (!guideFreeze) stepLocalMissiles(dt);
    if (!guideFreeze) {
      try { tickTrainDrones(dt, now, now); } catch (e) {}
    } else {
      // 引导冻结：无人机也原地停?
      for (let i = 0; i < localDrones.length; i++) {
        const d = localDrones[i];
        if (!d) continue;
        d.vx = 0;
        d.vy = 0;
        d.throttle = 0;
      }
    }
    latestPlayers = localCrafts.map((c) => ({ id: c.id, x: c.x, y: c.y, heading: c.heading, thr: c.throttle }));
    return { me, players, rt: now };
  }

  const rttSamples = [];
  let lastPongAt = 0;
  let lastPingAt = 0;
  let matchFakeRtt = null;
  const RTT_TIMEOUT_MS = 3000;

  function publishNetHud(info) {
    try {
      const v = info && Number.isFinite(info.value) ? Math.round(info.value) : null;
      let level = 0;
      let color = "#ff6b6b";
      if (v == null) {
        level = 0;
        color = "#ff6b6b";
      } else if (v <= 50) {
        level = 4;
        color = "#5dff9a";
      } else if (v <= 80) {
        level = 3;
        color = "#9dff8a";
      } else if (v <= 120) {
        level = 2;
        color = "#ffe08a";
      } else if (v <= 180) {
        level = 1;
        color = "#ffb86b";
      } else {
        level = 1;
        color = "#ff6b6b";
      }
      if (typeof GameGlobal !== "undefined") {
        GameGlobal.netHud = {
          ms: v,
          level,
          color,
          cls: (info && info.cls) || "rtt-bad",
          lost: !!matchLost,
          label: v == null ? "--" : String(v),
        };
      }
    } catch (e) {}
  }
  function rttInfo() {
    if (!lastPongAt || performance.now() - lastPongAt > RTT_TIMEOUT_MS) {
      const info = { text: "延迟 ", cls: "rtt-bad", value: null };
      publishNetHud(info);
      return info;
    }
    if (localMatch) {
      const v = matchFakeRtt != null ? matchFakeRtt : 30 + ((Math.random() * 41) | 0);
      const info = { text: `延迟 ${v}ms`, cls: "rtt-good", value: v };
      publishNetHud(info);
      return info;
    }
    if (!rttSamples.length) {
      const info = { text: "延迟 ", cls: "rtt-bad", value: null };
      publishNetHud(info);
      return info;
    }
    // 最?5 次取中位数：比单?均值更抗抖?
    const sorted = [...rttSamples].sort((a, b) => a - b);
    const v = Math.round(sorted[Math.floor(sorted.length / 2)]);
    const info = { text: `延迟 ${v}ms`, cls: v <= 80 ? "rtt-good" : v <= 150 ? "rtt-warn" : "rtt-bad", value: v };
    publishNetHud(info);
    return info;
  }

  function onPong(m) {
    const now = performance.now();
    const rtt = now - m.ts;
    lastPongAt = now;
    if (localMatch) matchFakeRtt = 30 + ((Math.random() * 41) | 0);
    if (rtt >= 0 && rtt < 3000) {
      rttSamples.push(rtt);
      if (rttSamples.length > 5) rttSamples.shift();
    }
    // 服务器时间与本地时钟的固定偏移（渲染直接对齐服务器时间戳，这里只做记?诊断?
    if (!net.timeOffset && Number.isFinite(m.st)) net.timeOffset = m.st - Math.round(now + rtt / 2);
    updateStatus();
  }

  // 延迟探针：匹配局也发真实 ping，避免微信半开连接导致战绩/开房全?
  setInterval(() => {
    const now = performance.now();
    if (now - lastPongAt > RTT_TIMEOUT_MS) updateStatus();
    if (localMatch) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) showMatchLost();
      else if (matchLost) {
        hideMatchLost();
        updateStatus();
        if (!connected) connect();
      }
    }
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (document.visibilityState !== "visible") return;
    if (now - lastPingAt < 1000) return;
    lastPingAt = now;
    try {
      ws.send(JSON.stringify({ t: "ping", ts: Math.round(now) }));
    } catch (e) {}
  }, 400);

  function updateStatus() {
    const build = ` · build ${BUILD}`;
    if (localMatch) {
      const rtt = rttInfo();
      if (matchLost) {
        try {
          if (typeof GameGlobal !== "undefined") {
            GameGlobal.netHud = { ms: null, level: 0, color: "#ff6b6b", cls: "rtt-bad", lost: true, label: "断" };
          }
        } catch (e) {}
      }
      statusEl.innerHTML = matchLost
        ? `<span class="rtt-bad">连接中断</span>`
        : `<span class="${rtt.cls}">${rtt.text}</span>`;
      return;
    }
    const rtt = rttInfo();
    if (IS_MOBILE) {
      if (!connected) {
        try {
          if (typeof GameGlobal !== "undefined") {
            GameGlobal.netHud = { ms: null, level: 0, color: "#ff6b6b", cls: "rtt-bad", lost: true, label: "--" };
          }
        } catch (e) {}
        statusEl.innerHTML = fullMessage || "连接中…";
        return;
      }
      statusEl.innerHTML = `ID ${myId ?? "?"} · <span class="${rtt.cls}">${rtt.text}</span>`;
      return;
    }
    if (!connected) {
      statusEl.innerHTML = (fullMessage || "正在连接服务器") + build;
      return;
    }
    const buf = play.playing ? `播放 ${play.frames.length}/${BUF_START}` : `缓冲 ${play.frames.length}/${BUF_START}`;
    statusEl.innerHTML = `<strong>多人房间</strong> · 我的 ID?{myId ?? "分配?} · 在线 ${playerCount} · ${buf} · <span class="${rtt.cls}">${rtt.text}</span>${build}`;
  }

  let lastSentPayload = "";
  let lastSentTime = 0;

  // 输入节流：内容没变就跳过，仅保留 250ms 心跳兜底
  function coastFlyThrottle(now) {
    if (flyStick.active) {
      flyStick.coastAt = now;
      return;
    }
    if (flyStick.mag <= 0) return;
    const prev = flyStick.coastAt || now;
    const dt = Math.min(0.08, Math.max(0, (now - prev) / 1000));
    flyStick.coastAt = now;
    // 松手后油门衰减到 0（配合物理滑行降速直至停止）
    flyStick.mag *= Math.exp(-1.65 * dt);
    if (flyStick.mag < 0.015) flyStick.mag = 0;
  }

  let screenShake = 0;
  let shakeDecay = 9;
  let shakePhase = 0;
  let hurtFlash = 0;
  let lastSelfHp = -1;
  function bumpShake(amt, mode) {
    const next = clamp(amt, 0, 1.8);
    if (mode === "hit") {
      // 机关炮连打：轻量叠加，封顶在死亡震以?
      screenShake = Math.min(0.52, screenShake + Math.max(0.1, next));
      shakeDecay = 16;
    } else if (mode === "death") {
      screenShake = Math.max(screenShake, next);
      shakeDecay = 5.4;
    } else {
      screenShake = Math.max(screenShake, next);
      shakeDecay = 9;
    }
  }
  function bumpHurt(amt) {
    hurtFlash = Math.min(1.35, hurtFlash + Math.max(0.28, amt || 0.7));
  }
  function vibe(kind) {
    try {
      if (typeof wx !== "undefined" && typeof wx.vibrateShort === "function") {
        wx.vibrateShort({ type: kind || "light" });
      }
    } catch (e) {}
  }
  /** 被机关炮打中：轻微震?+ 轻触?*/
  function bumpGunHitFeel(dmgRatio) {
    const k = clamp(Number(dmgRatio) || 0.35, 0.12, 1);
    bumpShake(0.14 + k * 0.2, "hit");
    bumpHurt(0.38 + k * 0.42);
    vibe("light");
  }
  /** 自己被打爆：更大震幅，稍留残?*/
  function bumpDeathFeel() {
    bumpShake(1.28, "death");
    bumpHurt(1.15);
    vibe("medium");
  }
  function tickFeel(dt) {
    if (screenShake > 0) {
      screenShake = Math.max(0, screenShake - dt * shakeDecay);
      shakePhase += dt * (screenShake > 0.65 ? 38 : 62);
    }
    if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt * 1.65);
  }
  function shakeOffset() {
    if (screenShake < 0.03) return { x: 0, y: 0 };
    // 轻击偏短频微抖；死亡偏大幅低频，更贴手感
    const heavy = screenShake > 0.65;
    const amp = screenShake * (heavy ? 20 : 9.5);
    const nx = Math.sin(shakePhase * 1.7) * 0.65 + (Math.random() - 0.5) * 0.7;
    const ny = Math.cos(shakePhase * 1.9) * 0.65 + (Math.random() - 0.5) * 0.7;
    return { x: nx * amp, y: ny * amp };
  }
  function worldOnView(x, y, pad) {
    const cx = lastGoodMe.x || 0;
    const cy = lastGoodMe.y || 0;
    const m = Number.isFinite(pad) ? pad : 0;
    const halfW = W / VIEW_SCALE * 0.5 + m;
    const halfH = H / VIEW_SCALE * 0.5 + m;
    return Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= halfH;
  }
  /** 主镜头内爆炸类音效应能听?*/
  function sfxAudibleAt(x, y, pad) {
    return worldOnView(x, y, pad);
  }
  function playHitOnView(x, y) {
    if (sfxAudibleAt(x, y)) sfx?.playHit?.();
  }
  function drawHurtVignette() {
    if (hurtFlash <= 0.02) return;
    const a = clamp(hurtFlash, 0, 1) * 0.75;
    const edge = 30;
    const solid = `rgba(200,12,28,${a})`;
    const clear = "rgba(200,12,28,0)";
    ctx.save();
    try {
      let g = ctx.createLinearGradient(0, 0, 0, edge);
      g.addColorStop(0, solid);
      g.addColorStop(1, clear);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, edge);

      g = ctx.createLinearGradient(0, H, 0, H - edge);
      g.addColorStop(0, solid);
      g.addColorStop(1, clear);
      ctx.fillStyle = g;
      ctx.fillRect(0, H - edge, W, edge);

      g = ctx.createLinearGradient(0, 0, edge, 0);
      g.addColorStop(0, solid);
      g.addColorStop(1, clear);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, edge, H);

      g = ctx.createLinearGradient(W, 0, W - edge, 0);
      g.addColorStop(0, solid);
      g.addColorStop(1, clear);
      ctx.fillStyle = g;
      ctx.fillRect(W - edge, 0, edge, H);
    } catch (e) {
      ctx.fillStyle = solid;
      ctx.fillRect(0, 0, W, edge);
      ctx.fillRect(0, H - edge, W, edge);
      ctx.fillRect(0, 0, edge, H);
      ctx.fillRect(W - edge, 0, edge, H);
    }
    ctx.restore();
  }
  function approachForwardSpeed(current, target, brake, dt) {
    if (brake) return current * Math.exp(-3.2 * dt);
    if (target < current - 1) {
      const next = target + (current - target) * Math.exp(-1.55 * dt);
      return Math.abs(next) < 2 && target <= 0 ? 0 : next;
    }
    return target;
  }

  function sendInput(overrides = {}, force = false) {
    if (phase !== "playing") return;
    if (localMatch) return;
    if (!connected || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    coastFlyThrottle(now);
    const inp = inputPayload(overrides);
    // 副武器是激?/ 电磁脉冲：不发导弹，松手时单独发 {t:"sub"}
    if (trainLoadout && !isMissileSub(trainLoadout.sub)) inp.fireMissile = false;
    if (inp.fireMissile) noteMissileFireClaim();
    const payload = JSON.stringify(inp);
    const idle = !keys.up && !keys.down && !keys.left && !keys.right && !keys.brake && !keys.gun && !keys.missile && !pointer.left && !pointer.right && !gunStick.active && !flyStick.active && flyStick.mag <= 0;
    if (!force && idle && payload === lastSentPayload && now - lastSentTime < 250) return;
    lastSentPayload = payload;
    lastSentTime = now;
    ws.send(payload);
  }
  setInterval(() => sendInput(), FRAME_MS);

  function hold(el, key) {
    const on = (e) => {
      e.preventDefault();
      keys[key] = true;
      el.classList.add("on");
      el.setPointerCapture?.(e.pointerId);
    };
    const off = () => {
      keys[key] = false;
      el.classList.remove("on");
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
  }
  hold($("left"), "left");
  hold($("right"), "right");
  hold($("brake"), "brake");
  let weaponInited = false;
  let missileFocus = null;
  let lockAnimT0 = 0;
  let lockNextAt = 0;
  let pendingLock = null;
  let latestLockPlayers = [];
  let latestLockCamera = { x: 0, y: 0 };

  function onScreenLock(player, camera) {
    if (!player || player.respawn > 0) return false;
    const p = screen(player.x, player.y, camera);
    const vis = viewPad(36);
    return p.x >= vis.x0 && p.y >= vis.y0 && p.x <= vis.x1 && p.y <= vis.y1;
  }

  function isTeammate(p) {
    if (!factionPads.length || !p || p.id === myId || p.blade) return false;
    if (localMatch) {
      const myCraft = localCrafts.find((c) => c.id === myId);
      const myT = myCraft && Number.isInteger(myCraft.team) ? myCraft.team : myTeam;
      if (Number.isInteger(p.team)) return p.team === myT;
      const other = localCrafts.find((c) => c.id === p.id);
      return !!(other && other.team === myT);
    }
    const mine = roster.get(myId);
    const other = roster.get(p.id);
    const oc = (other && other.color) || p.color;
    return !!(mine && mine.color && oc && oc === mine.color);
  }

  function listLockables(players, camera) {
    const list = [];
    for (const p of players) {
      if (p.id === myId) continue;
      if (isTeammate(p)) continue;
      if (!onScreenLock(p, camera)) continue;
      list.push(p);
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  function cancelAutoLock() {
    lockNextAt = 0;
    pendingLock = null;
  }

  function setMissileFocus(id, playSfx) {
    missileFocus = id;
    lockAnimT0 = performance.now();
    if (playSfx) sfx?.playSelect();
  }

  function ensureMissileLock(players, camera, playSfx) {
    cancelAutoLock();
    const list = listLockables(players, camera);
    if (!list.length) {
      missileFocus = null;
      return;
    }
    if (!list.some((p) => p.id === missileFocus)) setMissileFocus(list[0].id, playSfx);
    else lockAnimT0 = performance.now();
  }

  function cycleMissileLock(players, camera) {
    cancelAutoLock();
    if (subAimMode()) { missileFocus = null; return; }
    const list = listLockables(players, camera);
    if (!list.length) { missileFocus = null; return; }
    const i = list.findIndex((p) => p.id === missileFocus);
    const next = list[(i + 1) % list.length];
    setMissileFocus(next.id, true);
  }

  function tickMissileLock(players, camera, now) {
    if (currentWeapon !== "missile" || subAimMode()) {
      cancelAutoLock();
      missileFocus = null;
      return;
    }
    const list = listLockables(players, camera);
    const alive = missileFocus != null && list.some((p) => p.id === missileFocus);
    if (alive) {
      pendingLock = null;
      lockNextAt = 0;
      return;
    }
    if (missileFocus != null && !alive) {
      const ids = list.map((p) => p.id);
      pendingLock = ids.find((id) => id > missileFocus) ?? ids[0] ?? null;
      missileFocus = null;
      lockNextAt = now + 280;
    }
    if (lockNextAt && now >= lockNextAt) {
      lockNextAt = 0;
      const still = listLockables(players, camera);
      let next = pendingLock && still.some((p) => p.id === pendingLock) ? pendingLock : null;
      pendingLock = null;
      if (next == null && still.length) next = still[0].id;
      if (next != null) setMissileFocus(next, true);
      else missileFocus = null;
    } else if (!missileFocus && !lockNextAt && list.length) {
      setMissileFocus(list[0].id, true);
    }
  }

  function selectWeapon(w) {
    const prev = currentWeapon;
    const next = w === "missile" ? "missile" : "gun";
    if (weaponInited && next !== currentWeapon) sfx?.playSelect();
    weaponInited = true;
    currentWeapon = next;
    $("weapA").classList.toggle("on", currentWeapon === "gun");
    $("weapB").classList.toggle("on", currentWeapon === "missile");
    $("fireLabel").textContent = currentWeapon === "gun" ? "" : "发射";
    document.documentElement.classList.toggle("gun-mode", IS_MOBILE && currentWeapon === "gun");
    document.documentElement.classList.toggle("missile-mode", IS_MOBILE && currentWeapon === "missile");
    if (currentWeapon !== "missile") {
      missileFocus = null;
      cancelAutoLock();
    }
    if (keys.gun || keys.missile) {
      keys.gun = currentWeapon === "gun";
      keys.missile = currentWeapon === "missile";
      sendInput();
    }
    resetFireKnob();
    if (weaponInited && prev !== next) noteTrainGuideWeapon();
    if (trainLoadout && trainLoadout.sub === "drone") updateDroneFireLabel();
  }
  const FIRE_STICK_SIZE = 99; // 与移动摇杆同?
  function resetFireKnob() {
    const knob = $("fireKnob");
    gunStick.dx = 0;
    gunStick.dy = 0;
    if (!gunStick.active) gunStick.angle = null;
    knob.style.left = "50%";
    knob.style.top = "50%";
    knob.style.transform = "translate(-50%, -50%)";
  }
      // 复活瞬移：旧轨迹作废
  function setFireOrigin(e) {
    const el = $("fireBtn");
    const p = stagePoint(e);
    const r = FIRE_STICK_SIZE / 2;
    const vw = W || 9999;
    const vh = H || 9999;
    const leftBound = vw * 0.5 + r;
    el.floatX = clamp(p.x, leftBound, vw - r - 4);
    el.floatY = clamp(p.y, r + 36, vh - r - 4);
  }
  function applyFireStick(e) {
    const el = $("fireBtn");
    const p = stagePoint(e);
    const cx = Number.isFinite(el.floatX) ? el.floatX : ((el.visLeft || 0) + (el.visSize || FIRE_STICK_SIZE) / 2);
    const cy = Number.isFinite(el.floatY) ? el.floatY : ((el.visTop || 0) + (el.visSize || FIRE_STICK_SIZE) / 2);
    let dx = p.x - cx;
    let dy = p.y - cy;
    const maxR = FIRE_STICK_SIZE * 0.34;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / maxR);
    dx = (dx / len) * k;
    dy = (dy / len) * k;
    gunStick.dx = dx;
    gunStick.dy = dy;
    gunStick.angle = k >= 0.12 ? Math.atan2(dy, dx) : null;
    const knob = $("fireKnob");
    knob.style.left = `${50 + dx * 34}%`;
    knob.style.top = `${50 + dy * 34}%`;
    knob.style.transform = "translate(-50%, -50%)";
  }
  function trainGuideBlocksInput() {
    return !!(trainGuide && trainGuide.step < TRAIN_GUIDE_STEPS);
  }
  $("weapA").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (trainGuideBlocksInput()) return;
    selectWeapon("gun");
  });
  $("weapB").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (trainGuideBlocksInput()) return;
    selectWeapon("missile");
  });
  $("lockBtn").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (trainGuideBlocksInput()) return;
    cycleMissileLock(latestLockPlayers, latestLockCamera);
  });
  (function bindFire() {
    const el = $("fireBtn");
    const on = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (trainGuideBlocksInput()) return;
      // ?关：拆除；第5关：仅靠近卫星时剪断，否则正常开?
      if (localLevelMode && levelRunCol === 3) {
        el.classList.add("on");
        el.setPointerCapture?.(e.pointerId);
        tryStartMineDefuse();
        return;
      }
      if (localLevelMode && levelRunCol === 5 && satInteractActive()) {
        el.classList.add("on");
        el.setPointerCapture?.(e.pointerId);
        tryStartSatAction();
        return;
      }
      gunStick.active = true;
      keys.gun = currentWeapon === "gun";
      keys.missile = currentWeapon === "missile";
      el.classList.add("on");
      el.setPointerCapture?.(e.pointerId);
      if (IS_MOBILE) setFireOrigin(e);
      if (currentWeapon === "gun" || subAimMode()) applyFireStick(e);
      sendInput(currentWeapon === "missile" ? { fireMissile: true } : { fireGun: true });
    };
    const move = (e) => {
      if (localLevelMode && levelRunCol === 3) return;
      if (localLevelMode && levelRunCol === 5 && satInteractActive()) return;
      if (!gunStick.active || (currentWeapon !== "gun" && !subAimMode())) return;
      applyFireStick(e);
      sendInput();
    };
    const off = () => {
      gunStick.active = false;
      gunStick.angle = null;
      keys.gun = false;
      keys.missile = false;
      el.classList.remove("on");
      el.floatX = undefined;
      el.floatY = undefined;
      resetFireKnob();
      sendInput();
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
  })();
  function resetFlyKnob() {
    const knob = $("flyKnob");
    flyStick.dx = 0;
    flyStick.dy = 0;
    knob.style.left = "50%";
    knob.style.top = "50%";
    knob.style.transform = "translate(-50%, -50%)";
  }
  const FLY_STICK_SIZE = 99;
  // 浮动摇杆：按下处为中心（王者式），松手回到默认位置
  function setFlyOrigin(e) {
    const el = $("flyBtn");
    const p = stagePoint(e);
    const r = FLY_STICK_SIZE / 2;
    const vw = W || 9999;
    const vh = H || 9999;
    el.floatX = clamp(p.x, r + 4, vw - r - 4);
    el.floatY = clamp(p.y, r + 4, vh - r - 4);
  }
  function applyFlyStick(e) {
    const el = $("flyBtn");
    const p = stagePoint(e);
    const cx = Number.isFinite(el.floatX) ? el.floatX : el.offsetLeft + el.offsetWidth / 2;
    const cy = Number.isFinite(el.floatY) ? el.floatY : el.offsetTop + el.offsetHeight / 2;
    let dx = p.x - cx;
    let dy = p.y - cy;
    const maxR = FLY_STICK_SIZE * 0.38;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / maxR);
    dx = (dx / len) * k;
    dy = (dy / len) * k;
    const dead = 0.08;
    flyStick.dx = dx;
    flyStick.dy = dy;
    if (k <= dead) {
      flyStick.mag = 0;
      flyStick.angle = null;
    } else {
      flyStick.mag = (k - dead) / (1 - dead);
      flyStick.angle = Math.atan2(dy, dx);
    }
    const knob = $("flyKnob");
    knob.style.left = `${50 + dx * 38}%`;
    knob.style.top = `${50 + dy * 38}%`;
    knob.style.transform = "translate(-50%, -50%)";
  }
  (function bindFly() {
    const el = $("flyBtn");
    if (!el) return;
    const on = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (trainGuideBlocksInput()) return;
      flyStick.active = true;
      flyStick.coastAt = performance.now();
      el.classList.add("on");
      el.setPointerCapture?.(e.pointerId);
      if (IS_MOBILE) setFlyOrigin(e);
      applyFlyStick(e);
      sendInput();
    };
    const move = (e) => {
      if (!flyStick.active) return;
      applyFlyStick(e);
      sendInput();
    };
    const off = () => {
      flyStick.active = false;
      flyStick.angle = null;
      flyStick.coastAt = performance.now();
      el.classList.remove("on");
      el.floatX = undefined;
      el.floatY = undefined;
      resetFlyKnob();
      sendInput();
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    resetFlyKnob();
  })();
  selectWeapon("gun");
  $("gearF").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    selectWeapon("missile");
    sendInput({ fireMissile: true });
  });

  function setManualThrottle(value) {
    manualThrottle = clamp(value, 0, 1);
    manualThrottleUntil = performance.now() + 180;
    sendInput({ throttle: manualThrottle });
  }
  function setSpeedLever(value) {
    speedLever = clamp(value, 0, 1);
    try { GameGlobal.speedLever = speedLever; } catch (e) {}
    setManualThrottle(speedLever);
    noteTrainGuideLever();
  }
  function dragThrottle(el, asSpeedLever) {
    let active = false;
    const set = (e) => {
      const p = stagePoint(e);
      const top = Number(el.offsetTop) || 0;
      const h = Math.max(1, Number(el.offsetHeight) || 1);
      const pad = asSpeedLever ? 14 : 0;
      const t = 1 - (p.y - top - pad) / Math.max(1, h - pad * 2);
      if (asSpeedLever) setSpeedLever(t);
      else setManualThrottle(t);
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation?.();
      if (trainGuideBlocksInput()) return;
      active = true;
      el.setPointerCapture?.(e.pointerId);
      set(e);
    });
    el.addEventListener("pointermove", (e) => { if (active) set(e); });
    el.addEventListener("pointerup", () => { active = false; });
    el.addEventListener("pointercancel", () => { active = false; });
  }
  dragThrottle($("slider"), true);
  dragThrottle(gauge, false);

  addEventListener("keydown", (e) => {
    if (phase !== "playing") return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
    if (key === "a" || key === "arrowleft") keys.left = true;
    if (key === "d" || key === "arrowright") keys.right = true;
    if (key === "w" || key === "arrowup") keys.up = true;
    if (key === "s" || key === "arrowdown") keys.down = true;
    if (key === "q") {
      if (!e.repeat) selectWeapon(currentWeapon === "gun" ? "missile" : "gun");
    } else if (key === "e") {
      if (!e.repeat) {
        if (currentWeapon !== "missile") selectWeapon("missile");
        cycleMissileLock(latestLockPlayers, latestLockCamera);
      }
    } else if (key === " ") {
      keys.gun = currentWeapon === "gun";
      keys.missile = currentWeapon === "missile";
    }
    sendInput();
  });
  addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key === "a" || key === "arrowleft") keys.left = false;
    if (key === "d" || key === "arrowright") keys.right = false;
    if (key === "w" || key === "arrowup") keys.up = false;
    if (key === "s" || key === "arrowdown") keys.down = false;
    if (key === " ") {
      keys.gun = false;
      keys.missile = false;
    }
    sendInput();
  });
  addEventListener("blur", () => {
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    pointer.left = false;
    pointer.right = false;
    sendInput();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = stagePoint(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.left = true;
    sendInput();
  });
  addEventListener("pointermove", (e) => {
    const p = stagePoint(e);
    pointer.x = p.x;
    pointer.y = p.y;
  });
  addEventListener("pointerdown", (e) => {
    if (e.button !== 2) return;
    const p = stagePoint(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.right = true;
    sendInput();
  });
  addEventListener("pointerup", (e) => {
    if (e.button === 0) pointer.left = false;
    if (e.button === 2) pointer.right = false;
    sendInput();
  });
  addEventListener("pointercancel", () => {
    pointer.left = false;
    pointer.right = false;
  });
  addEventListener("contextmenu", (e) => e.preventDefault());

  // 本机预测：用与服务器完全一致的物理公式模拟自己的飞机，再轻柔向服务器校?
  function stepPrediction(dt, now) {
    const meServer = latestPlayers.find((p) => p.id === myId);
    if (!meServer) { pred = null; return; }
    if (!pred) {
      pred = { x: meServer.x, y: meServer.y, vx: 0, vy: 0, heading: meServer.heading, throttle: 0 };
      return;
    }
    const meSt = playerStatus.get(myId) || DEFAULT_STATUS;
    if (meSt.respawn > 0 || Math.hypot(meServer.x - (pred.x + predErr.x), meServer.y - (pred.y + predErr.y)) > 260) {
      const dir0 = 1;
      pred.x = meServer.x;
      pred.y = meServer.y;
      pred.heading = meServer.heading;
      pred.vx = Math.cos(meServer.heading) * pred.throttle * myMaxSpeed() * dir0;
      pred.vy = Math.sin(meServer.heading) * pred.throttle * myMaxSpeed() * dir0;
      predErr.x = predErr.y = predErr.h = predErr.t = 0;
      return;
    }
    const input = inputPayload();
    if (Number.isFinite(input.throttle)) pred.throttle = clamp(input.throttle, 0, 1);
    else if (input.down) pred.throttle = clamp(pred.throttle - dt / 0.5, 0, 1);
    else if (input.up) pred.throttle = clamp(pred.throttle + dt / 0.3, 0, 1);
    else pred.throttle = Math.max(0, pred.throttle - dt / 1.05);

    let turn = clamp(input.turn || 0, -1, 1);
    if (turn === 0 && Number.isFinite(input.aim)) {
      const delta = angleDelta(input.aim, pred.heading);
      turn = Math.abs(delta) < 0.025 ? 0 : clamp(delta * 2, -1, 1);
    }
    pred.heading += turn * craftTurnRate(Math.hypot(pred.vx, pred.vy)) * dt;

    const dir = 1;
    const cos = Math.cos(pred.heading);
    const sin = Math.sin(pred.heading);
    const currentForward = pred.vx * cos + pred.vy * sin;
    const targetForward = pred.throttle * myMaxSpeed() * dir;
    const nextForward = approachForwardSpeed(currentForward, targetForward, !!input.brake, dt);
    pred.vx = cos * nextForward;
    pred.vy = sin * nextForward;
    pred.x += pred.vx * dt;
    pred.y += pred.vy * dt;
    const pxLo = -WORLD_LIMIT + 20;
    const pxHi = WORLD_LIMIT - 20;
    const pyLo = -WORLD_Y_LIMIT + 20;
    const pyHi = WORLD_Y_LIMIT - 20;
    if (pred.x < pxLo) { pred.x = pxLo; if (pred.vx < 0) pred.vx = 0; }
    else if (pred.x > pxHi) { pred.x = pxHi; if (pred.vx > 0) pred.vx = 0; }
    if (pred.y < pyLo) { pred.y = pyLo; if (pred.vy < 0) pred.vy = 0; }
    else if (pred.y > pyHi) { pred.y = pyHi; if (pred.vy > 0) pred.vy = 0; }
    for (const a of asteroids.values()) {
      const dx = a.x - pred.x;
      const dy = a.y - pred.y;
      if (dx * dx + dy * dy > (a.r + 26) * (a.r + 26)) continue;
      const loc = worldToRock(a, pred.x, pred.y);
      if (!rockSolid(a, loc.x, loc.y)) continue;
      const nd = Math.max(0.001, Math.hypot(dx, dy));
      const nx = dx / nd;
      const ny = dy / nd;
      const vn = pred.vx * nx + pred.vy * ny;
      if (vn > 2) {
        pred.vx -= 1.55 * vn * nx;
        pred.vy -= 1.55 * vn * ny;
        pred.throttle = Math.min(pred.throttle, 0.35);
      }
      pred.x -= nx * 3;
      pred.y -= ny * 3;
    }

    // 移动为客户端权威：服务器回显的就是本机上报的位置，误差偏移直接衰减到 0，不再做校正
    const k = 1 - Math.exp(-8 * dt);
    predErr.x += (0 - predErr.x) * k;
    predErr.y += (0 - predErr.y) * k;
    predErr.h += (0 - predErr.h) * k;
    predErr.t += (0 - predErr.t) * k;
  }

  let lastLocalMissileAt = 0;
  let missileHeldPrev = false;
  let muzzleFlash = { until: 0, size: 0, k: 0 };
  let gunAcc = 0;
  let gunBurst = 0;
  let gunHeldPrev = false;
  let lastLocalGunRt = 0;
  function muzzleDirOf(me) {
    const aim = currentGunAim(me);
    let bx = Math.cos(aim);
    let by = Math.sin(aim);
    const len = Math.hypot(bx, by);
    if (len > 1e-6) {
      bx /= len;
      by /= len;
    } else {
      bx = Math.cos(me.heading || 0);
      by = Math.sin(me.heading || 0);
    }
    return { bx, by };
  }

  function spawnGunBullet(me, rt, now) {
    const barrel = fighterBarrelWorld(me);
    const { bx, by } = muzzleDirOf(me);
    let sx = 0;
    let sy = 0;
    if (localMatch) {
      const craft = localCrafts.find((c) => c.id === myId);
      if (craft) { sx = craft.vx || 0; sy = craft.vy || 0; }
    } else if (me) {
      sx = Number.isFinite(me.vx) ? me.vx : Math.cos(me.heading || 0) * (me.spd || 0);
      sy = Number.isFinite(me.vy) ? me.vy : Math.sin(me.heading || 0) * (me.spd || 0);
    }
    // 叠加飞机速度；寿?初速与服务器一致，保证显示射程对齐命中
    putBulletShot(++bulletSeq, {
      oid: myId, kind: 0,
      x: barrel.x + bx * 0.7,
      y: barrel.y + by * 0.7,
      vx: sx + bx * BULLET_SPEED,
      vy: sy + by * BULLET_SPEED,
      ax: bx, ay: by,
      t0: rt, t0Local: now, own: true, life: BULLET_LIFE_MS,
    });
    muzzleFlash.until = now + 45;
    muzzleFlash.size = 5.6 + Math.random() * 2.2;
  }

  function maybeFireLocalBullet(now, me, rt) {
    if (localLevelMode && levelRunCol === 3) {
      gunAcc = 0;
      gunBurst = 0;
      gunHeldPrev = false;
      keys.gun = false;
      return;
    }
    if (localLevelMode && levelRunCol === 5 && satInteractActive()) {
      gunAcc = 0;
      gunBurst = 0;
      gunHeldPrev = false;
      keys.gun = false;
      return;
    }
    if ((!connected && !localMatch) || myId === null || !me || me.respawn > 0 || me.stunT > 0) {
      gunAcc = 0;
      gunBurst = 0;
      gunHeldPrev = false;
      if (lastLocalGunRt) gunAmmo = Math.min(gunAmmoMax, gunAmmo + GUN_AMMO_REGEN * gunScale() * clamp((rt - lastLocalGunRt) / 1000, 0, 0.05));
      lastLocalGunRt = rt;
      renderAmmo();
      return;
    }
    const held = gunHeld();
    if (!lastLocalGunRt) lastLocalGunRt = rt;
    const dt = clamp((rt - lastLocalGunRt) / 1000, 0, 0.05);
    lastLocalGunRt = rt;
    gunAmmo = Math.min(gunAmmoMax, gunAmmo + GUN_AMMO_REGEN * gunScale() * dt);
    if (trainLoadout && trainLoadout.main !== "gun") {
      fireTrainMain(held, dt, me, rt, now);
      gunHeldPrev = held;
      renderAmmo();
      return;
    }
    if (held && !gunHeldPrev) {
      gunBurst = BURST_ROUNDS;
      gunAcc = GUN_PERIOD * 0.5;
      if (gunAmmo < 1) {
        sfx?.playDry();
        pulseAmmoDeny("gun");
      }
    }
    gunHeldPrev = held;
    if (held || gunBurst > 0) {
      gunAcc += dt;
      while (gunAcc >= GUN_PERIOD && (held || gunBurst > 0)) {
        gunAcc -= GUN_PERIOD;
        if (gunAmmo < 1) {
          gunBurst = 0;
          gunAcc = 0;
          sfx?.playDry();
          pulseAmmoDeny("gun");
          break;
        }
        gunAmmo -= 1;
        spawnGunBullet(me, rt, now);
        if (gunBurst > 0) gunBurst--;
      }
    } else {
      gunAcc = 0;
    }
    renderAmmo();
  }

  // ---------- 训练场改装武器（机库方案?----------
  const CANNON_CD = 0.325;
  const CANNON_DMG = 30;
  const CANNON_SPLASH_DMG = 10;
  const CANNON_BLAST = 40;
  const GAT_SPIN_UP = 0.9;
  const GAT_DMG = 4;
  // 激光：单发脉冲光束（瞬发）；打到陨石即止于命中点，效果同加农炮命中陨石
  const LASER_CD = 0.62;
  const LASER_LEN = 900;
  const LASER_FLASH = 0.045;
  const LASER_LIFE = 0.08;
  const LASER_CUT = 11;
  const LASER_HIT_R = CRAFT_HIT_R;
  const LASER_DMG = PLAYER_MAX_HP; // 一炮打?
  const LASER_GHOST_N = 38;
  const EMP_AMMO_MAX = 5;
  const EMP_FIRE_INTERVAL = 0.5; // 发射间隔 500ms
  const EMP_AMMO_REGEN = 1 / 2; // ?2 秒回 1 ?
  const EMP_CD = EMP_FIRE_INTERVAL; // 兼容旧引?
  const EMP_BALL_SPEED = 800;
  const EMP_BALL_RANGE = 400; // 短距闪电团（相对初版：速?、距×2?
  const EMP_BALL_R = 30;
  const EMP_BALL_LIFE = EMP_BALL_RANGE / EMP_BALL_SPEED;
  const EMP_RANGE = EMP_BALL_RANGE; // 兼容旧引?
  // 被电磁脉冲击中（全程定在原地瘫痪）：
  // 瘫痪全程电流缠身 + 机身深蓝 ?EMP_WAKE_SEC 秒亮起恢复（电流消失?
  const EMP_ZAP_SEC = 1; // 兼容旧分段时长；视觉上电流贯穿整?stun
  const EMP_DARK_SEC = 3;
  const EMP_WAKE_SEC = 0.2;
  const EMP_STUN = EMP_ZAP_SEC + EMP_DARK_SEC + EMP_WAKE_SEC;
  // 返回 [深蓝程度 0~1, 亮起程度 0~1]
  function empPaintOf(p) {
    const s = p && p.stunT;
    if (!(s > 0)) return [0, 0];
  // 兼容旧名：开局不再推满，改为熄火待命
    if (s <= EMP_WAKE_SEC) {
      const u = 1 - s / EMP_WAKE_SEC;
      return [1 - u, Math.sin(Math.PI * u)];
    }
    // 瘫痪全程保持深蓝（电流由外层电弧绘制?
    return [1, 0];
  }
  const EMP_DMG = 5;
  const trainW = {
    cannonCd: 0, gatSpin: 0, gatAcc: 0, gatSide: 1, gatHz: 0, gatFiring: false,
    laserCd: 0, subAim: 0, subAiming: false, beams: [], ghosts: [], windA: 0.7,
    empCd: 0, empAmmo: 5, empFireCd: 0, bolts: [], empBalls: [],
  };
  function resetTrainWeapons() {
    trainW.cannonCd = 0;
    trainW.gatSpin = 0;
    trainW.gatAcc = 0;
    trainW.gatFiring = false;
    trainW.laserCd = 0;
    trainW.subAiming = false;
    trainW.beams.length = 0;
    trainW.ghosts.length = 0;
    trainW.empCd = 0;
    trainW.empAmmo = EMP_AMMO_MAX;
    trainW.empFireCd = 0;
    trainW.bolts.length = 0;
    trainW.empBalls.length = 0;
    clearTrainDrones();
  }

  function clearTrainDrones() {
    localDrones.length = 0;
  }

  function damageTrainDrone(drone, amount, attackerId) {
    if (!drone || drone.hp <= 0) return false;
    const dmg = Math.max(0, Number(amount) || 0);
    if (!(dmg > 0)) return false;
      // 池偏低时后台再补一轮
    if (attackerId === myId) return false;
    drone.hp = Math.max(0, drone.hp - dmg);
    spawnCraftSparks(drone.x, drone.y, drone.vx || 1, drone.vy || 0, 4 + (Math.random() * 3 | 0));
    playHitOnView(drone.x, drone.y);
    if (drone.hp > 0) return true;
    try {
      burstCraftDeath(drone.x, drone.y, drone.vx || 0, drone.vy || 0, drone.heading || 0, "fighter");
    } catch (e) {}
    const ix = localDrones.indexOf(drone);
    if (ix >= 0) localDrones.splice(ix, 1);
    syncDroneAmmoUi();
    updateDroneFireLabel();
    return true;
  }

  function hitsTrainDrones(shot, radius) {
    if (!localDrones.length || !shot) return false;
    const oid = shot.ownerId != null ? shot.ownerId : shot.oid;
    if (oid === myId) return false; // 己方弹不打己方无人机
    const r = radius != null ? radius : DRONE_HIT_R;
    for (let i = localDrones.length - 1; i >= 0; i--) {
      const d = localDrones[i];
      if (!d || d.hp <= 0) continue;
      if (!segmentHitsCircle(shot.prevX, shot.prevY, shot.x, shot.y, d.x, d.y, r)) continue;
      spawnCraftSparks(shot.x, shot.y, shot.vx || 1, shot.vy || 0, 4);
      damageTrainDrone(d, shot.dmg || 9, oid);
      if (shot.blast) {
        // 爆炸余伤已由本弹结算主目标；其余无人机在 splash 里处?
      }
      dropBulletShot(shot.id);
      return true;
    }
    return false;
  }

  function syncDroneAmmoUi() {
    // 副武器弹药条 = 当前无人机数量（满编 2?
    missileAmmo = localDrones.length;
    missileAmmoMax = DRONE_COUNT;
  }

  function updateDroneFireLabel() {
    try {
      const lab = $("fireLabel");
      if (!lab) return;
      if (!(trainLoadout && trainLoadout.sub === "drone" && currentWeapon === "missile")) return;
      lab.textContent = localDrones.length < DRONE_COUNT ? "召唤" : "";
    } catch (e) {}
  }

  /** 召唤一架无人机；已满编返回 false */
  function trySummonDrone(me) {
    if (!(trainLoadout && trainLoadout.sub === "drone")) return false;
    if (localDrones.length >= DRONE_COUNT) return false;
    const host = me || localCrafts.find((c) => c && c.id === myId);
    if (!host || host.respawn > 0) return false;
    const ang = Math.random() * Math.PI * 2;
    const rad = 70 + Math.random() * 50;
    const maxHp = droneMaxHp();
    localDrones.push({
      x: host.x + Math.cos(ang) * rad,
      y: host.y + Math.sin(ang) * rad,
      heading: (host.heading || 0) + ang + Math.PI * 0.5,
      vx: host.vx || 0, vy: host.vy || 0, throttle: 0.85,
      bank: 0, tailPose: 0,
      hp: maxHp, maxHp,
      ammo: DRONE_AMMO, gunAcc: 0,
      flashUntil: 0, flashSize: 0,
      wpAng: ang,
      wpRad: rad,
      wpT: 0.6 + Math.random() * 1.4,
      orbitDir: localDrones.length % 2 === 0 ? 1 : -1,
    });
    syncDroneAmmoUi();
    updateDroneFireLabel();
    return true;
  }

  function ensureTrainDrones(me) {
    if (!(trainLoadout && trainLoadout.sub === "drone")) return;
    while (localDrones.length < DRONE_COUNT) {
      if (!trySummonDrone(me)) break;
    }
    syncDroneAmmoUi();
    updateDroneFireLabel();
  }

  function spawnDroneBullet(drone, ang, rt, now) {
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const sx = drone.vx || 0;
    const sy = drone.vy || 0;
    putBulletShot(++bulletSeq, {
      oid: myId, kind: 0,
      x: drone.x + ux * 10,
      y: drone.y + uy * 10,
      vx: sx + ux * BULLET_SPEED,
      vy: sy + uy * BULLET_SPEED,
      ax: ux, ay: uy,
      t0: rt, t0Local: now, own: true, life: BULLET_LIFE_MS,
      dmg: 5, style: "drone",
    });
    drone.flashUntil = now + 45;
    drone.flashSize = 5.2 + Math.random() * 2;
  }

  function tickTrainDrones(dt, now, rt) {
    if (!(trainLoadout && trainLoadout.sub === "drone")) {
      if (localDrones.length) clearTrainDrones();
      return;
    }
    const me = localCrafts.find((c) => c && c.id === myId);
    if (!me || me.respawn > 0) return;
    if (!localDrones.length) {
      syncDroneAmmoUi();
      return;
    }
    // 开火距离：只要威胁在当前屏幕内即可拦截（用上一帧相机，与画面一致）
    const cam = (latestLockCamera && Number.isFinite(latestLockCamera.x) && Number.isFinite(latestLockCamera.y))
      ? latestLockCamera
      : { x: me.x, y: me.y };
    const threatOnScreen = (ent) => {
      if (!ent || !Number.isFinite(ent.x) || !Number.isFinite(ent.y)) return false;
      const p = screen(ent.x, ent.y, cam);
      const vis = viewPad(20);
      return p.x >= vis.x0 && p.y >= vis.y0 && p.x <= vis.x1 && p.y <= vis.y1;
    };
    // 导弹是否朝主机飞来（优先拦截?
    const missileInboundHost = (m) => {
      if (!m) return false;
      if (m.targetId === myId) return true;
      const mx = Number.isFinite(m.vx) ? m.vx : Math.cos(m.heading || 0) * (m.speed || 0);
      const myv = Number.isFinite(m.vy) ? m.vy : Math.sin(m.heading || 0) * (m.speed || 0);
      const toX = me.x - m.x;
      const toY = me.y - m.y;
      const dist = Math.hypot(toX, toY) || 1;
      const closing = (mx * toX + myv * toY) / dist;
      if (closing < 30) return false;
      const bear = Math.atan2(toY, toX);
      const head = Math.atan2(myv, mx);
      return Math.cos(angleDelta(bear, head)) > 0.25;
    };
    // { ent, kind: 'missile'|'craft', inbound }
    const threats = [];
    for (let i = 0; i < localMissiles.length; i++) {
      const m = localMissiles[i];
      if (!m || m.ownerId === myId) continue;
      const owner = localCrafts.find((c) => c && c.id === m.ownerId);
      if (owner && owner.team === me.team) continue;
      if (!threatOnScreen(m)) continue;
      threats.push({ ent: m, kind: "missile", inbound: missileInboundHost(m) });
    }
    for (let i = 0; i < localCrafts.length; i++) {
      const c = localCrafts[i];
      if (!c || c.id === myId || c.respawn > 0 || c.team === me.team) continue;
      if (!threatOnScreen(c)) continue;
      threats.push({ ent: c, kind: "craft", inbound: false });
    }
    // 像机器人一样自由飞：远了加速追玩家，追上后减速在身旁徘徊
    const loiterMin = 70;
    const loiterMax = 170;
    const catchDist = loiterMax * 1.15; // 超出此距离视为掉队，全力?
    const meSpd = Math.hypot(me.vx || 0, me.vy || 0);
    const myCap = MAX_SPEED * clampSpeedTier(me.spdTier || mySpeedTier || 1);
    // 结算面板可盖在大厅上；仅进对局时强制收起
    const chaseMax = Math.max(myCap * 1.35, MAX_SPEED * 1.25);
    const loiterMaxSpd = Math.max(110, myCap * 0.72);
    const turnRate = 3.8;
    for (let i = 0; i < localDrones.length; i++) {
      const d = localDrones[i];
      d.wpT -= dt;
      if (d.wpT <= 0) {
        d.wpT = 1.1 + Math.random() * 2.4;
        d.wpAng += d.orbitDir * (0.5 + Math.random() * 1.4);
        d.wpRad = loiterMin + Math.random() * (loiterMax - loiterMin);
        if (Math.random() < 0.22) d.orbitDir *= -1;
      }
      // 带上关卡标记，开局走服务器助战场
      d.wpAng += d.orbitDir * (0.45 + Math.random() * 0.2) * dt;

      const toMe = Math.hypot(me.x - d.x, me.y - d.y);
      const chasing = toMe > catchDist;
      let desireX;
      let desireY;
      if (chasing) {
        // 掉队：朝玩家前方截击点飞，而不是只追当前位?
        const leadT = 0.35;
        desireX = me.x + (me.vx || 0) * leadT;
        desireY = me.y + (me.vy || 0) * leadT;
      } else {
        desireX = me.x + Math.cos(d.wpAng) * d.wpRad;
        desireY = me.y + Math.sin(d.wpAng) * d.wpRad;
        if (toMe < 42) {
          const away = Math.atan2(d.y - me.y, d.x - me.x);
          desireX = me.x + Math.cos(away) * loiterMin;
          desireY = me.y + Math.sin(away) * loiterMin;
        }
      }

      // 优先：飞向主机的导弹 > 其他导弹 > 敌机；同级取距无人机更近 / 更紧?
      let best = null;
      let bestScore = -1e18;
      let bestInbound = false;
      for (let t = 0; t < threats.length; t++) {
        const th = threats[t];
        const ent = th.ent;
        const dx = ent.x - d.x;
        const dy = ent.y - d.y;
        const distD = Math.hypot(dx, dy);
        let score = -distD;
        if (th.inbound) {
          score += 1e9;
          const mx = Number.isFinite(ent.vx) ? ent.vx : Math.cos(ent.heading || 0) * (ent.speed || 0);
          const myv = Number.isFinite(ent.vy) ? ent.vy : Math.sin(ent.heading || 0) * (ent.speed || 0);
          const toMeX = me.x - ent.x;
          const toMeY = me.y - ent.y;
          const distMe = Math.hypot(toMeX, toMeY) || 1;
          const closing = Math.max(1, (mx * toMeX + myv * toMeY) / distMe);
          score -= (distMe / closing) * 80; // 越快打到主机越优?
        } else if (th.kind === "missile") {
          score += 1e6;
        }
        if (score > bestScore) {
          bestScore = score;
          best = ent;
          bestInbound = !!th.inbound;
        }
      }

      let flyAim = Math.atan2(desireY - d.y, desireX - d.x);
      let shootAim = flyAim;
      // 飞向主机的导弹：即使掉队追人也要扭头拦截；其余威胁仍在身旁时?
      if (best && (bestInbound || !chasing)) {
        const lead = bestInbound ? 0.08 : 0.12;
        const bvx = Number.isFinite(best.vx) ? best.vx : Math.cos(best.heading || 0) * (best.speed || 0);
        const bvy = Number.isFinite(best.vy) ? best.vy : Math.sin(best.heading || 0) * (best.speed || 0);
        shootAim = Math.atan2(
          best.y + bvy * lead - d.y,
          best.x + bvx * lead - d.x
        );
        flyAim = shootAim;
      }
      const delta = angleDelta(flyAim, d.heading || 0);
      const turn = Math.abs(delta) < 0.03 ? 0 : clamp(delta * 2.2, -1, 1);
      d.heading = (d.heading || 0) + turn * turnRate * dt;
      // 转向时轻微倾斜，跟玩家三角机一样有 bank
      d.bank = clamp((d.bank || 0) * Math.exp(-3.2 * dt) + turn * 0.55, -0.7, 0.7);
      d.tailPose = lerp(d.tailPose || 0, (d.throttle || 0.5) * 0.55 - 0.15, Math.min(1, 6 * dt));

      // 变速：?油门拉满追上；近=降到徘徊速，跟着玩家旁边?
      let targetSpd;
      if (chasing) {
        const catchUp = clamp((toMe - catchDist) / 220, 0, 1);
        targetSpd = meSpd * 1.05 + (chaseMax - meSpd * 1.05) * (0.55 + 0.45 * catchUp);
        targetSpd = clamp(targetSpd, meSpd + 40, chaseMax);
      } else {
          // 助战回退租房：只取房号，不进普通等待房界面
        const orbitBoost = clamp((toMe - loiterMin) / Math.max(1, loiterMax - loiterMin), 0, 1);
        targetSpd = lerp(meSpd * 0.85, Math.max(loiterMaxSpd, meSpd * 1.05), 0.35 + 0.45 * orbitBoost);
        targetSpd = clamp(targetSpd, 90, loiterMaxSpd * 1.15);
        if (best) targetSpd = Math.max(targetSpd, meSpd * 0.95);
      }
      const curSpd = Math.hypot(d.vx || 0, d.vy || 0);
      // 加减速有过渡，不像瞬间变?
      const accel = chasing ? 520 : 280;
      const nextSpd = curSpd + clamp(targetSpd - curSpd, -accel * dt, accel * dt);
      d.throttle = clamp(nextSpd / Math.max(1, chaseMax), 0.2, 1);
      d.vx = Math.cos(d.heading) * nextSpd;
      d.vy = Math.sin(d.heading) * nextSpd;
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      if (best && d.ammo >= 1) {
        // 枪口大致对准才打，避免屁股扫?
        const aimErr = Math.abs(angleDelta(shootAim, d.heading));
        if (aimErr < 0.55) {
          d.gunAcc += dt;
          while (d.gunAcc >= GUN_PERIOD && d.ammo >= 1) {
            d.gunAcc -= GUN_PERIOD;
            d.ammo -= 1;
            spawnDroneBullet(d, d.heading, rt, now);
          }
        } else {
          d.gunAcc = 0;
        }
      } else {
        d.gunAcc = 0;
      }
    }
    syncDroneAmmoUi();
  }

  /** 无人机机腹炮管（与玩家机关炮同款结构，半机上按比例画?*/
  function drawDroneBellyGun(drone, mount, now) {
    const aim = { x: 0, y: -1 }; // 机头朝向
    fillPoly(ellipsePts(mount.x, mount.y, 2.9, 2.2, 0, 10), "#c5ccd3");
    strokePoly(ellipsePts(mount.x, mount.y, 2.9, 2.2, 0, 10), "rgba(242,245,248,0.95)", 0.75);
    fillPoly(ellipsePts(mount.x, mount.y + 0.15, 1.8, 1.4, 0, 8), "#e4e8ed");
    const perp = { x: -aim.y * 1.15, y: aim.x * 1.15 };
    const root = { x: mount.x + aim.x * 1.2, y: mount.y + aim.y * 1.2 };
    const tip = { x: mount.x + aim.x * BARREL_LEN, y: mount.y + aim.y * BARREL_LEN };
    fillPoly([
      { x: root.x + perp.x, y: root.y + perp.y },
      { x: root.x - perp.x, y: root.y - perp.y },
      { x: tip.x - perp.x * 0.42, y: tip.y - perp.y * 0.42 },
      { x: tip.x + perp.x * 0.42, y: tip.y + perp.y * 0.42 },
    ], "#e8ecf0");
    strokePoly([
      { x: root.x + perp.x, y: root.y + perp.y },
      { x: tip.x + perp.x * 0.42, y: tip.y + perp.y * 0.42 },
      { x: tip.x - perp.x * 0.42, y: tip.y - perp.y * 0.42 },
      { x: root.x - perp.x, y: root.y - perp.y },
    ], "rgba(248,250,252,0.9)", 0.55);
    ctx.fillStyle = "#9aa3ab";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1e20";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d5dbe2";
    ctx.fillRect(mount.x - 1.15, mount.y - 0.9, 2.3, 2.8);
    if (now < (drone.flashUntil || 0)) {
      const k = clamp((drone.flashUntil - now) / 45, 0, 1);
      const size = (drone.flashSize || 5.5) * (0.55 + 0.45 * k) / 1.6;
      ctx.globalCompositeOperation = "lighter";
      drawGunFlame(tip, aim, size, k);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawTrainDrones(camera) {
    if (!localDrones.length) return;
    const now = performance.now();
    const prevTint = paintTint;
    const prevStrong = paintTintStrong;
    const prevChar = paintChar;
    const prevGlow = paintGlow;
    for (let i = 0; i < localDrones.length; i++) {
      const d = localDrones[i];
      const p = screen(d.x, d.y, camera);
      if (p.x < -60 || p.y < -60 || p.x > W + 60 || p.y > H + 60) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((d.heading || 0) + Math.PI / 2);
      // 玩家三角机一半大小，复用同款机身 + 机腹炮管
      ctx.scale(SHIP_DRAW_SCALE * 0.5, SHIP_DRAW_SCALE * 0.5);
      paintTint = { r: 60, g: 220, b: 180 };
      paintTintStrong = true;
      paintChar = 0;
      paintGlow = 0;
      const fake = {
        id: -9100 - i,
        heading: d.heading || 0,
        throttle: d.throttle || 0.65,
        spdTier: 1,
        blade: false,
      };
      const visual = {
        bank: d.bank || 0,
        span: 1.14,
        tailPose: d.tailPose || 0,
      };
      try {
        drawFighterBody(fake, visual);
        drawDroneBellyGun(d, { x: (visual.bank || 0) * 0.18, y: -1.6 }, now);
      } catch (e) {
        // 保底三角
        ctx.beginPath();
        ctx.moveTo(0, -22.5);
        ctx.lineTo(17.5, 17.5);
        ctx.lineTo(0, 10);
        ctx.lineTo(-17.5, 17.5);
        ctx.closePath();
        ctx.fillStyle = "#5dffc8";
        ctx.fill();
      }
      ctx.restore();
      // 血量：头顶短条；弹药：机身下方进度条（同血条样式）
      try {
        const maxHp = d.maxHp || droneMaxHp();
        const hpK = clamp((d.hp || 0) / Math.max(1, maxHp), 0, 1);
        const ammoK = clamp((d.ammo || 0) / Math.max(1, DRONE_AMMO), 0, 1);
        const barW = 24;
        const barH = 2.5;
        const half = barW * 0.5;
        ctx.save();
        // 血条（头顶?
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(p.x - half, p.y - 34, barW, barH);
        ctx.fillStyle = "#3ddc84";
        ctx.fillRect(p.x - half, p.y - 34, barW * hpK, barH);
    // 舱体小火花（分离销崩开）
        const ammoY = p.y + 20;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(p.x - half, ammoY, barW, barH);
        ctx.fillStyle = ammoK > 0.25 ? "#5dffc8" : "#ff9a5a";
        ctx.fillRect(p.x - half, ammoY, barW * ammoK, barH);
        ctx.restore();
      } catch (e) {}
    }
    paintTint = prevTint;
    paintTintStrong = prevStrong;
    paintChar = prevChar;
    paintGlow = prevGlow;
  }

  function splashLocalBlast(x, y, radius, dmg, ownerId, skip) {
    popMissileBlast(x, y, 0.9);
    const owner = localCrafts.find((c) => c.id === ownerId);
    for (const c of localCrafts) {
      if (c === skip || c.id === ownerId || c.respawn > 0) continue;
      if (owner && c.team === owner.team) continue;
      if ((c.x - x) ** 2 + (c.y - y) ** 2 > radius * radius) continue;
      damageLocalCraft(c, dmg, ownerId);
    }
    // 敌方爆炸伤到玩家无人?
    if (ownerId !== myId && !(owner && owner.team === 0)) {
      const r2 = radius * radius;
      for (let i = localDrones.length - 1; i >= 0; i--) {
        const d = localDrones[i];
        if (!d || d.hp <= 0) continue;
        if ((d.x - x) ** 2 + (d.y - y) ** 2 > r2) continue;
        damageTrainDrone(d, dmg, ownerId);
      }
    }
    if (ownerId === myId || ownerId === LEVEL_MOTHER_OID) {
      for (const m of localMotherships) {
        if (m.dead) continue;
        if ((m.x - x) ** 2 + (m.y - y) ** 2 > radius * radius) continue;
        if (ownerId === LEVEL_MOTHER_OID) continue;
        damageLocalMothership(m, dmg, x, y);
      }
    }
  }

  function spawnTrainShell(me, rt, now, o) {
    const barrel = fighterBarrelWorld(me);
    const { bx, by } = muzzleDirOf(me);
    const craft = localMatch ? localCrafts.find((c) => c.id === myId) : me;
    const sx = craft ? craft.vx || 0 : 0;
    const sy = craft ? craft.vy || 0 : 0;
    const side = o.side || 0;
    putBulletShot(++bulletSeq, {
      oid: myId, kind: 0,
      x: barrel.x + bx * 0.7 - by * side,
      y: barrel.y + by * 0.7 + bx * side,
      vx: sx + bx * o.speed,
      vy: sy + by * o.speed,
      ax: bx, ay: by,
      t0: rt, t0Local: now, own: true, life: o.life,
      dmg: o.dmg, blast: o.blast || 0, style: o.style,
    });
  }

  function fireTrainMain(held, dt, me, rt, now) {
    if (trainLoadout.main === "cannon") {
      trainW.cannonCd = Math.max(0, trainW.cannonCd - dt);
      if (!held || trainW.cannonCd > 0) return;
      if (gunAmmo < 1) {
        if (!gunHeldPrev) { sfx?.playDry(); pulseAmmoDeny("gun"); }
        return;
      }
      gunAmmo -= 1;
      trainW.cannonCd = CANNON_CD;
      spawnTrainShell(me, rt, now, {
        style: "cannon", dmg: CANNON_DMG, blast: CANNON_BLAST,
        speed: BULLET_SPEED * 1.3, life: BULLET_LIFE_MS * 1.3,
      });
      muzzleFlash.until = now + 90;
      muzzleFlash.size = 11;
      if (sfx?.playCannon) sfx.playCannon();
      else sfx?.playShot?.(-3);
      return;
    }
      // 静止：裂片留在母体位置，不做弹开
    trainW.gatSpin = clamp(trainW.gatSpin + (held ? dt / GAT_SPIN_UP : -dt / 0.6), 0, 1);
    const period = lerp(0.14, 0.045, trainW.gatSpin);
    trainW.gatHz = 1 / period;
    trainW.gatFiring = held && gunAmmo >= 0.5;
    if (!held) { trainW.gatAcc = 0; return; }
    trainW.gatAcc += dt;
    while (trainW.gatAcc >= period) {
      trainW.gatAcc -= period;
      if (gunAmmo < 0.5) {
        trainW.gatAcc = 0;
        if (!gunHeldPrev) { sfx?.playDry(); pulseAmmoDeny("gun"); }
        break;
      }
      gunAmmo -= 0.5;
      trainW.gatSide = -trainW.gatSide;
      spawnTrainShell(me, rt, now, {
        style: "gatling", dmg: GAT_DMG,
        speed: BULLET_SPEED, life: BULLET_LIFE_MS * 0.85, side: trainW.gatSide * GAT_BARREL_OFF * SHIP_DRAW_SCALE,
      });
      muzzleFlash.until = now + 45;
      muzzleFlash.size = 4.6 + Math.random() * 1.8;
    }
  }

  function laserD2(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    const hx = x0 + dx * t - px, hy = y0 + dy * t - py;
    return hx * hx + hy * hy;
  }

  // 沿光束在陨石上切出一条槽；铁陨石会挡住光束，返回光束实际长度
  // dry：开房对战由服务器切石（下发 chip 事件），本地只算铁陨石挡光与火花
  // 光束止于沿线第一块陨石的命中点；本地对局按加农炮炮弹命中处理（开房由服务器结算）
  function carveLaserRocks(beam, dry, ownerId) {
    const { x0, y0, ux, uy } = beam;
    let best = null;
    for (const a of asteroids.values()) {
      if (!a || a.fadeOut || !a.grid) continue;
      const reach = a.extent + 4;
      if (laserD2(a.x, a.y, x0, y0, beam.x1, beam.y1) > reach * reach) continue;
      const tc = (a.x - x0) * ux + (a.y - y0) * uy;
      const tEnd = Math.min(beam.len, tc + reach, best ? best.t : Infinity);
      for (let t = Math.max(0, tc - reach); t <= tEnd; t += 4) {
        const wx = x0 + ux * t, wy = y0 + uy * t;
        const loc = worldToRock(a, wx, wy);
        if (!rockSolid(a, loc.x, loc.y)) continue;
        best = { a, t, x: wx, y: wy, wx, wy, lx: loc.x, ly: loc.y };
        break;
      }
    }
    if (!best) return;
    beam.len = best.t;
    beam.x1 = best.x;
    beam.y1 = best.y;
    beam.hitAt = best;
    const now = performance.now();
    const a = best.a;
    const hf = takeHitFlash();
    hf.x = best.x; hf.y = best.y; hf.ux = ux; hf.uy = uy;
    hf.size = 3.2 + clamp(a.r * 0.44, 12, a.r * 0.52) * 0.12; hf.t0 = now; hf.life = 0.12;
    if (dry) return;
    splashLocalBlast(best.x, best.y, CANNON_BLAST, CANNON_SPLASH_DMG, ownerId, null);
    applyLocalRockHit(a, best, ux * 380, uy * 380, "cannon");
  }

  function spawnLaserGhosts(beam) {
    const wind = { x: Math.cos(trainW.windA) * 78 + 36, y: Math.sin(trainW.windA * 0.82) * 42 - 14 };
    const { x0, y0, x1, y1, ux, uy } = beam;
    const px = -uy, py = ux;
    const side = Math.sign(px * wind.x + py * wind.y) || 1;
    for (let i = 0; i < LASER_GHOST_N; i++) {
      const t = i / (LASER_GHOST_N - 1);
      const j = Math.random() - 0.5;
      trainW.ghosts.push({
        x: x0 + (x1 - x0) * t + ux * j * 6,
        y: y0 + (y1 - y0) * t + uy * j * 6,
        vx: wind.x + px * side * (10 + Math.random() * 28) + (Math.random() - 0.5) * 18,
        vy: wind.y + py * side * (10 + Math.random() * 28) + (Math.random() - 0.5) * 18,
        ux, uy, age: 0,
        hold: 0.07 + t * 0.025,
        life: 0.72 + Math.random() * 0.38,
        w: 1.8 + Math.random() * 2.2,
      });
    }
    if (trainW.ghosts.length > 180) trainW.ghosts.splice(0, trainW.ghosts.length - 180);
  }

  function fireTrainLaser(craft, now, aim) {
    const ang = Number.isFinite(aim) ? aim : craft.heading;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const x0 = craft.x + ux * 16;
    const y0 = craft.y + uy * 16;
    const beam = { x0, y0, ux, uy, len: LASER_LEN, x1: x0 + ux * LASER_LEN, y1: y0 + uy * LASER_LEN, age: 0, hitSfx: false };
    carveLaserRocks(beam, !localMatch, craft.id);
    for (const c of localMatch ? localCrafts : []) {
      if (c.id === craft.id || c.respawn > 0 || c.team === craft.team) continue;
      if (laserD2(c.x, c.y, x0, y0, beam.x1, beam.y1) > LASER_HIT_R * LASER_HIT_R) continue;
      damageLocalCraft(c, Math.max(LASER_DMG, c.hp), craft.id);
      spawnCraftSparks(c.x, c.y, ux, uy, 8);
      popMissileBlast(c.x, c.y, 0.9);
      if (!beam.hitSfx) { beam.hitSfx = true; sfx?.playLaserHit?.(); }
    }
    if (localMatch) {
      for (const m of localMotherships) {
        if (m.dead) continue;
        if (laserD2(m.x, m.y, x0, y0, beam.x1, beam.y1) > LEVEL_MOTHER_HIT_R * LEVEL_MOTHER_HIT_R) continue;
        damageLocalMothership(m, Math.max(LASER_DMG * 0.35, 80), m.x, m.y);
        spawnCraftSparks(m.x, m.y, ux, uy, 10);
        popMissileBlast(m.x, m.y, 1.1);
        if (!beam.hitSfx) { beam.hitSfx = true; sfx?.playLaserHit?.(); }
      }
    }
    // 光束扫过的敌方导弹直接引爆（开房对战由服务器移除并下发爆炸?
    if (localMatch) {
      for (let i = localMissiles.length - 1; i >= 0; i--) {
        const m = localMissiles[i];
        if (m.ownerId === craft.id) continue;
        const owner = localCrafts.find((c) => c.id === m.ownerId);
        if (owner && owner.team === craft.team) continue;
        if (laserD2(m.x, m.y, x0, y0, beam.x1, beam.y1) > 16 * 16) continue;
        popMissileBlast(m.x, m.y, 1.05);
        localMissiles.splice(i, 1);
        if (!beam.hitSfx) { beam.hitSfx = true; sfx?.playLaserHit?.(); }
      }
    }
    if (beam.hitAt && !beam.hitSfx) { beam.hitSfx = true; sfx?.playLaserHit?.(); }
    trainW.beams.push(beam);
    if (trainW.beams.length > 8) trainW.beams.shift();
    spawnLaserGhosts(beam);
    muzzleFlash.until = now + 50;
    muzzleFlash.size = 12 + Math.random() * 3;
    sfx?.playLaser?.();
  }

  function updateTrainLasers(dt) {
    trainW.windA += dt * 0.22;
    for (let i = trainW.beams.length - 1; i >= 0; i--) {
      trainW.beams[i].age += dt;
      if (trainW.beams[i].age >= LASER_LIFE) trainW.beams.splice(i, 1);
    }
    const gs = trainW.ghosts;
    for (let i = gs.length - 1; i >= 0; i--) {
      const p = gs[i];
      p.age += dt;
      if (p.age > p.hold) {
        const u = clamp((p.age - p.hold) / Math.max(0.05, p.life - p.hold), 0, 1);
        const k = 0.28 + u * 1.55;
        p.x += p.vx * dt * k;
        p.y += p.vy * dt * k;
        p.vx += (Math.random() - 0.5) * 90 * dt;
        p.vy += (Math.random() - 0.5) * 90 * dt;
      }
      if (p.age >= p.life) gs.splice(i, 1);
    }
  }

  // 开房对战当前帧的其它飞?
  let roomFramePlayers = [];
  function spawnEmpBall(x, y, ang, ownerId, team, authoritative) {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    trainW.empBalls.push({
      x, y,
      prevX: x, prevY: y,
      vx: cos * EMP_BALL_SPEED,
      vy: sin * EMP_BALL_SPEED,
      ang,
      age: 0,
      life: EMP_BALL_LIFE,
      r: EMP_BALL_R,
      ownerId: ownerId || 0,
      team: team != null ? team : null,
      hit: false,
      // localMatch 本机演算；开房只做表现，命中靠服务器
      authoritative: !!authoritative,
    });
    if (trainW.empBalls.length > 12) trainW.empBalls.shift();
  }
  function fireTrainEmp(craft, now, aim) {
    const ang = Number.isFinite(aim) ? aim : craft.heading;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const x0 = craft.x + cos * 16;
    const y0 = craft.y + sin * 16;
    spawnEmpBall(x0, y0, ang, craft.id, craft.team, !!localMatch);
    if (sfx?.playEmp) sfx.playEmp();
    else sfx?.playShot?.(-6);
  }
  function empBallHitTarget(ball, c) {
    if (!c || c.respawn > 0) return false;
    if (c.id === ball.ownerId) return false;
    if (ball.team != null && c.team != null && c.team === ball.team) return false;
    if (isSpawnGuarded(c)) return false;
    return segmentHitsCircle(ball.prevX, ball.prevY, ball.x, ball.y, c.x, c.y, CRAFT_HIT_R + ball.r * 0.35);
  }
  function updateEmpBalls(dt, now) {
    const list = trainW.empBalls;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.age += dt;
      b.prevX = b.x;
      b.prevY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (!b.hit && b.authoritative && localMatch) {
        for (const c of localCrafts) {
          if (!empBallHitTarget(b, c)) continue;
          b.hit = true;
          applyEmpStun(c);
          damageLocalCraft(c, EMP_DMG, b.ownerId);
      sfx?.playEmpZap?.();
          break;
        }
      }
      if (b.hit || b.age >= b.life) list.splice(i, 1);
    }
  }

  function fireTrainSub(now, me, dt) {
    if (trainLoadout && trainLoadout.sub === "drone") {
      // 副武器开火：无人机不?2 架时点一下召唤一架；满编后只伴飞拦截
      const held = missileHeld();
      const alive = !!(me && !(me.respawn > 0) && !(me.stunT > 0) && myId !== null);
      if (held && !missileHeldPrev) {
        if (!alive) {
      // 池偏低时后台再补一轮
        } else if (localDrones.length >= DRONE_COUNT) {
          sfx?.playDry?.();
          pulseAmmoDeny("missile");
        } else if (trySummonDrone(me)) {
          sfx?.playSelect?.();
          try { wx.showToast({ title: "无人机已释放", icon: "none", duration: 900 }); } catch (e) {}
        } else {
          sfx?.playDry?.();
          pulseAmmoDeny("missile");
        }
      }
      missileHeldPrev = held;
      syncDroneAmmoUi();
      updateDroneFireLabel();
      renderAmmo();
      return;
    }
    const held = missileHeld();
    const alive = !!(me && !(me.respawn > 0) && !(me.stunT > 0) && myId !== null);
    const craft = localMatch ? localCrafts.find((c) => c.id === myId) : me;
    const laser = trainLoadout.sub === "laser";
    const emp = trainLoadout.sub === "emp";
    trainW.laserCd = Math.max(0, trainW.laserCd - dt);
    trainW.empFireCd = Math.max(0, trainW.empFireCd - dt);
    if (emp) {
      trainW.empAmmo = Math.min(EMP_AMMO_MAX, trainW.empAmmo + EMP_AMMO_REGEN * dt);
    }
    if (held && alive && craft) {
      if (!missileHeldPrev) trainW.subAim = craft.heading;
      const a = Number.isFinite(gunStick.angle) ? gunStick.angle : cursorAim();
      if (Number.isFinite(a)) trainW.subAim = a;
      trainW.subAiming = true;
    } else if (!held && missileHeldPrev && trainW.subAiming) {
      trainW.subAiming = false;
      if (!alive || !craft) {
        // 阵亡/重生中松手：不发?
      } else if (laser) {
        if (trainW.laserCd > 0) {
          sfx?.playDry();
          pulseAmmoDeny("missile");
        } else {
          trainW.laserCd = LASER_CD;
          fireTrainLaser(craft, now, trainW.subAim);
          if (!localMatch) {
            try {
              if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "sub", a: Math.round(trainW.subAim * 1000) / 1000 }));
            } catch (e) {}
          }
        }
      } else if (emp) {
        if (trainW.empAmmo < 1 || trainW.empFireCd > 0) {
          sfx?.playDry();
          pulseAmmoDeny("missile");
        } else {
          trainW.empAmmo = Math.max(0, trainW.empAmmo - 1);
          trainW.empFireCd = EMP_FIRE_INTERVAL;
          fireTrainEmp(craft, now, trainW.subAim);
          if (!localMatch) {
            try {
              if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "sub", a: Math.round(trainW.subAim * 1000) / 1000 }));
            } catch (e) {}
          }
        }
      }
    } else if (!held) {
      trainW.subAiming = false;
    }
    if (laser) {
      missileAmmo = MISSILE_AMMO_MAX * (1 - trainW.laserCd / LASER_CD);
      missileAmmoMax = MISSILE_AMMO_MAX;
    } else if (emp) {
      missileAmmo = trainW.empAmmo;
      missileAmmoMax = EMP_AMMO_MAX;
    }
    missileHeldPrev = held;
    renderAmmo();
  }

  // 激光束 / 电磁闪电 / 被瘫痪的电弧（世界坐标层?
  function drawTrainWeapons(players, camera, now) {
    ctx.save();
    try { ctx.globalCompositeOperation = "lighter"; } catch (e) {}
    ctx.lineCap = "round";
    if (trainW.ghosts.length) {
      try { ctx.globalCompositeOperation = "source-over"; } catch (e) {}
      for (const p of trainW.ghosts) {
        const live = Math.max(0, 1 - p.age / p.life);
        const blow = p.age <= p.hold ? 0 : clamp((p.age - p.hold) / Math.max(0.05, p.life - p.hold), 0, 1);
        const al = live * live * (0.34 - blow * 0.18);
        if (al < 0.01) continue;
        const s = screen(p.x, p.y, camera);
        const sx = s.x, sy = s.y;
        const len = 20 * (1 - blow * 0.55);
        const wid = p.w * (1 + blow * 2.4);
        ctx.strokeStyle = `rgba(186,92,98,${al})`;
        ctx.lineWidth = wid;
        ctx.beginPath();
        ctx.moveTo(sx - p.ux * len, sy - p.uy * len);
        ctx.lineTo(sx + p.ux * len, sy + p.uy * len);
        ctx.stroke();
        ctx.strokeStyle = `rgba(228,188,184,${al * 0.45})`;
        ctx.lineWidth = Math.max(0.8, wid * 0.35);
        ctx.beginPath();
        ctx.moveTo(sx - p.ux * len * 0.7, sy - p.uy * len * 0.7);
        ctx.lineTo(sx + p.ux * len * 0.7, sy + p.uy * len * 0.7);
        ctx.stroke();
      }
      try { ctx.globalCompositeOperation = "lighter"; } catch (e) {}
    }
    for (const L of trainW.beams) {
      const flash = Math.max(0, 1 - L.age / LASER_FLASH);
      const fk = flash * flash;
      if (fk <= 0.01) continue;
      const a = screen(L.x0, L.y0, camera);
      const ax = a.x, ay = a.y;
      const b = screen(L.x1, L.y1, camera);
      const bx = b.x, by = b.y;
      for (const [w, c] of [[12, `rgba(255,40,55,${0.22 * fk})`], [5, `rgba(255,130,100,${0.4 * fk})`], [1.6, `rgba(255,240,230,${0.7 * fk})`]]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    const zig = (x0, y0, x1, y1, n, amp) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const o = (Math.random() * 2 - 1) * amp;
        ctx.lineTo(x0 + dx * t + nx * o, y0 + dy * t + ny * o);
      }
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
      // 机关炮连打：轻量叠加，封顶在死亡震以下
    for (let i = 0; i < trainW.empBalls.length; i++) {
      const ball = trainW.empBalls[i];
      const live = 1 - ball.age / Math.max(0.05, ball.life);
      if (live <= 0.02) continue;
      const s = screen(ball.x, ball.y, camera);
      const cx = s.x;
      const cy = s.y;
      const pulse = 0.65 + 0.35 * Math.sin(now / 40 + i * 2.1);
      const rad = (10 + pulse * 6) * (0.75 + live * 0.35);
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad * 2.2);
      g.addColorStop(0, `rgba(230,248,255,${0.55 * live})`);
      g.addColorStop(0.35, `rgba(110,200,255,${0.35 * live * pulse})`);
      g.addColorStop(1, "rgba(40,120,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(180,230,255,${0.55 * live})`;
      ctx.lineWidth = 1.4;
      for (let j = 0; j < 6; j++) {
        const a0 = Math.random() * Math.PI * 2;
        const a1 = a0 + (Math.random() * 1.4 - 0.2);
        const r0 = 2 + Math.random() * rad * 0.35;
        const r1 = rad * (0.55 + Math.random() * 0.7);
        zig(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0,
          cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, 4, 3.2);
      }
      ctx.fillStyle = `rgba(245,252,255,${0.75 * live})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2 + pulse, 0, Math.PI * 2);
      ctx.fill();
    }
        // 保底三角
    trainW.bolts.length = 0;
    // 瘫痪全程电流缠身；进入恢复亮起（stunT<=WAKE）后电流立刻消失
    for (const p of players) {
      if (!(p.stunT > EMP_WAKE_SEC) || p.respawn > 0) continue;
      const c = screen(p.x, p.y, camera);
      const cx = c.x, cy = c.y;
      const pulse = 0.55 + 0.45 * Math.sin(now / 70 + (p.id || 0));
      ctx.strokeStyle = `rgba(110,203,255,${0.45 + pulse * 0.4})`;
      ctx.lineWidth = 1.35;
      for (let j = 0; j < 5; j++) {
        const a0 = Math.random() * Math.PI * 2;
        const r0 = 9 + Math.random() * 10;
        const r1 = 9 + Math.random() * 10;
        zig(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0,
          cx + Math.cos(a0 + 0.9 + Math.random() * 0.8) * r1,
          cy + Math.sin(a0 + 0.9 + Math.random() * 0.8) * r1, 5, 5);
      }
      ctx.strokeStyle = `rgba(200,240,255,${0.25 + pulse * 0.25})`;
      ctx.lineWidth = 0.9;
      for (let j = 0; j < 2; j++) {
        const a0 = Math.random() * Math.PI * 2;
        const r0 = 6 + Math.random() * 6;
        const r1 = 12 + Math.random() * 8;
        zig(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0,
          cx + Math.cos(a0 + Math.PI * 0.7) * r1,
          cy + Math.sin(a0 + Math.PI * 0.7) * r1, 4, 3.5);
      }
      ctx.strokeStyle = `rgba(110,203,255,${0.28 + pulse * 0.2})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, 18 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function maybeFireLocalMissile(now, me, dt) {
    if (localLevelMode && levelRunCol === 3) {
      keys.missile = false;
      return;
    }
    if (localLevelMode && levelRunCol === 5 && satInteractActive()) {
      keys.missile = false;
      return;
    }
    if (trainLoadout && !isMissileSub(trainLoadout.sub)) {
      fireTrainSub(now, me, dt || 0);
      return;
    }
    const held = missileHeld();
    missileAmmo = Math.min(missileAmmoMax, missileAmmo + MISSILE_AMMO_REGEN * (dt || 0));
    if (!held || (!connected && !localMatch) || myId === null || !me || me.respawn > 0 || me.stunT > 0) {
      missileHeldPrev = held;
      renderAmmo();
      return;
    }
    if (missileAmmo < 1) {
      if (held && !missileHeldPrev) {
        sfx?.playDry();
        pulseAmmoDeny("missile");
      }
      missileHeldPrev = held;
      renderAmmo();
      return;
    }
    if (now - lastLocalMissileAt < 500) {
      if (held && !missileHeldPrev) {
        sfx?.playDry();
        pulseAmmoDeny("missile");
      }
      missileHeldPrev = held;
      renderAmmo();
      return;
    }
    missileHeldPrev = held;
    missileAmmo -= 1;
    lastLocalMissileAt = now;
    if (localMatch) {
      const craft = localCrafts.find((c) => c.id === myId);
      if (craft) {
        craft.missileAmmo = missileAmmo;
        const mirv = !!(trainLoadout && trainLoadout.sub === "mirv");
        spawnLocalMissile(craft, missileFocus, { mirv });
      }
    } else {
      // 联机：本地预播发射音（服务端广播自己的弹时会跳过?
      sfx?.playMissile?.(myId);
    }
    renderAmmo();
  }

  // 导弹特写临时逻辑分辨率；>0 ?screen/viewPad 走画中画坐标，且禁止污染?HUD?
  let pipScreenSpan = 0;
  function screen(x, y, camera) {
    const o = screenRing[screenRingI];
    screenRingI = (screenRingI + 1) & (SCREEN_RING_N - 1);
    const sw = pipScreenSpan > 0 ? pipScreenSpan : W;
    const sh = pipScreenSpan > 0 ? pipScreenSpan : H;
    o.x = x - camera.x + sw / 2;
    o.y = y - camera.y + sh / 2;
    return o;
  }

  function compositeWebGlLayer(world, layer) {
    if (!world || !layer) return false;
    if (typeof world.isDirect === "function" && world.isDirect()) return true;
    ctx.drawImage(layer, 0, 0, W, H);
    return true;
  }

  function activeWebGlWorld() {
    return (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
  }

  let lastCanvasLayerMode = "";
  function uploadCanvasLayer(world, key, update = true) {
    try {
      // 背景与HUD按顺序上传即可，复用同一张全屏纹理，避免多占数份显存?
      return !!(world && world.drawCanvasLayer("screen:2d-layer", canvas, update));
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error("[mainWebGL] canvas layer", msg);
      try { wx.showToast({ title: msg.slice(0, 24), icon: "none", duration: 5000 }); } catch (e) {}
      return false;
    }
  }

  function resetCanvasLayer() {
    // 原位清屏，避免每帧重设尺寸导?D缓冲区重新分配?
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resetGfx(false);
  }

  function viewPad(extra) {
    // 画中画：逻辑画布就是 span×span，不再套主视?VIEW_SCALE?
    const sw = pipScreenSpan > 0 ? pipScreenSpan : W;
    const sh = pipScreenSpan > 0 ? pipScreenSpan : H;
    const spanX = pipScreenSpan > 0 ? sw : sw / VIEW_SCALE;
    const spanY = pipScreenSpan > 0 ? sh : sh / VIEW_SCALE;
    viewPadScratch.x0 = (sw - spanX) * 0.5 - extra;
    viewPadScratch.y0 = (sh - spanY) * 0.5 - extra;
    viewPadScratch.x1 = (sw + spanX) * 0.5 + extra;
    viewPadScratch.y1 = (sh + spanY) * 0.5 + extra;
    return viewPadScratch;
  }

  function resetGfx(hard) {
    if (hard) {
      try {
        for (let i = 0; i < 24; i++) ctx.restore();
      } catch (e) {}
    }
    try {
      ctx.setTransform(uiDpr, 0, 0, uiDpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
    } catch (e) {}
  }

  function beginWorldView() {
    if (VIEW_SCALE === 1) return;
    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.scale(VIEW_SCALE, VIEW_SCALE);
    ctx.translate(-W * 0.5, -H * 0.5);
  }

  function endWorldView() {
    if (VIEW_SCALE === 1) return;
    ctx.restore();
  }

  function drawLevelWinVeil(alpha) {
    const a = clamp(alpha, 0, 0.35);
    ctx.save();
    ctx.fillStyle = `rgba(20, 36, 28, ${a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function easeInOutCubic(t) {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  function easeOutCubic(t) {
    const u = clamp(t, 0, 1);
    return 1 - Math.pow(1 - u, 3);
  }
  function easeOutQuad(t) {
    const u = clamp(t, 0, 1);
    return 1 - (1 - u) * (1 - u);
  }

  function drawLevelFailGray(alpha) {
    const a = clamp(alpha, 0, 0.78);
    if (a <= 0.01) return;
    ctx.fillStyle = `rgba(6, 8, 12, ${a})`;
    ctx.fillRect(0, 0, W, H);
    // 去色感：再罩一层冷?
    ctx.fillStyle = `rgba(70, 78, 88, ${a * 0.22})`;
    ctx.fillRect(0, 0, W, H);
  }

  function draw() {
    const now = performance.now();
    const mainWorld = USE_MAIN_WEBGL ? activeWebGlWorld() : null;
    const screenCanvas = (typeof GameGlobal !== "undefined" && GameGlobal.screenCanvas) || null;
    const mainScene = !!(USE_MAIN_WEBGL && mainWorld && mainWorld.beginScene(
      screenCanvas ? screenCanvas.width : Math.max(1, W * dpr),
      screenCanvas ? screenCanvas.height : Math.max(1, H * dpr)
    ));
    hudCanvasLive = true;
    try { GameGlobal.hudCanvasLive = true; } catch (e) {}
    try { scheduleFrame(draw); } catch (e) { setTimeout(draw, 16); }
    const rawDt = (now - lastFrameTime) / 1000;
    let dt = Math.min(rawDt, 0.033);
    lastFrameTime = now;
    updateFps(now);
    // 失败/过关慢镜头：时间变慢；结束后停在本页弹窗
    const failCine = !!(levelFailCine && levelRunResult === "fail");
    const failHold = !!levelFailHold;
    const winCine = !!(levelWinCine && levelRunResult === "win");
    const winHold = !!levelWinHold;
    if (failCine) {
      levelFailCine.age += rawDt;
      dt = Math.min(rawDt, 0.033) * 0.22;
      if (levelFailCine.age >= levelFailCine.dur) {
        enterLevelFailHold();
      }
    } else if (winCine) {
      levelWinCine.age += rawDt;
      dt = 0; // 飞机/子弹定格；爆炸碎片另?fxDt
      const hold = levelWinCine.holdDur || 0.1;
      const pan = levelWinCine.panDur || 0.55;
      const focusAt = hold + pan;
      if (!levelWinCine.sfxFocus && levelWinCine.age >= focusAt) {
        levelWinCine.sfxFocus = true;
        screenShake = Math.max(screenShake, 0.95);
        try { sfx?.playBoom?.(); } catch (e) {}
        if (levelWinCine.boostBlast) {
          try {
            spawnFireBlast(levelWinCine.fx, levelWinCine.fy, 1.55);
            popMissileBlast(levelWinCine.fx, levelWinCine.fy, 1.15);
          } catch (e) {}
        }
      }
      if (levelWinCine.age >= levelWinCine.dur) {
        enterLevelWinHold();
      }
    } else if (failHold || winHold) {
      dt = 0; // 停帧，留在当前战场画?
    }
    resetGfx(false);
    // playing + WebGL 会在下方立即清空 HUD 画布；这里再填一次整屏只是无?CPU 绘制?
    if (!mainScene || phase !== "playing") {
      ctx.fillStyle = MAP_BG;
      ctx.fillRect(0, 0, W, H);
    }
    if (phase !== "playing") {
      screenShake = 0;
      hurtFlash = 0;
      lastSelfHp = -1;
      if (typeof GameGlobal !== "undefined" && GameGlobal.wxOverlay) GameGlobal.wxOverlay(ctx, W, H);
      drawFps();
      if (mainScene) {
        uploadCanvasLayer(mainWorld, "screen:menu");
        lastCanvasLayerMode = "menu";
        mainWorld.endScene();
      }
      return;
    }

    try {
    coastFlyThrottle(now);
      // 这里用跨两段的速度，避免外推阶段出现一顿一冲
    tickFeel(winCine ? Math.min(rawDt, 0.033) : dt);
    if (!localMatch && matchEndAt > 0) syncMatchTimerFromClock();
    // 助战?/5关：地雷/卫星叠层在服务器对局里本地演?
    if (!localMatch && assistCoopMode && localLevelMode && levelRunCol === 3) {
      try { tickLocalAirMines(dt); } catch (e) {}
    }
    if (!localMatch && assistCoopMode && localLevelMode && levelRunCol === 5) {
      try { tickLocalSatellites(dt); } catch (e) {}
      try { tickLevel5ExitWin(levelMePose()); } catch (e) {}
    }
    let frame = null;
    let rt = now;
    let players = [];
    let me = null;

    if (localMatch) {
      const loc = stepLocalMatch(dt, now);
      if (!loc || !localMatch) {
        if (typeof GameGlobal !== "undefined" && GameGlobal.wxOverlay) GameGlobal.wxOverlay(ctx, W, H);
        drawFps();
        if (mainScene) {
          uploadCanvasLayer(mainWorld, "screen:transition");
          mainWorld.endScene();
        }
        return;
      }
      me = loc.me;
      players = loc.players;
      rt = loc.rt;
      if (autoPilot && lastAutoCmd && lastAutoCmd.missileTarget != null) missileFocus = lastAutoCmd.missileTarget;
      const meCraft = localCrafts.find((c) => c.id === myId);
      if (meCraft) {
        me.x = meCraft.x; me.y = meCraft.y; me.heading = meCraft.heading;
        me.throttle = meCraft.throttle;
        me.spd = Math.hypot(meCraft.vx, meCraft.vy);
        me.vx = meCraft.vx; me.vy = meCraft.vy;
        me.hp = meCraft.hp; me.respawn = meCraft.respawn;
        gunAmmo = meCraft.gunAmmo;
      }
      if (!failCine && !failHold && !winCine && !winHold) {
        maybeFireLocalBullet(now, me, rt);
        if (meCraft) meCraft.gunAmmo = gunAmmo;
        maybeFireLocalMissile(now, me, dt);
        if (meCraft) meCraft.missileAmmo = missileAmmo;
      }
      frame = { missiles: new Map() };
    } else {
    frame = stepPlayback(dt);
    rt = play.head;
    for (const p of frame.players.values()) {
      const info = roster.get(p.id);
      const st = playerStatus.get(p.id) || DEFAULT_STATUS;
      const heading = p.heading ?? p.h;
      const team = (info && normalizeTeamIndex(info.team) != null)
        ? normalizeTeamIndex(info.team)
        : (p.id === myId && factionPads.length ? normalizeTeamIndex(myTeam) : null);
      const spdTier = clampSpeedTier(info && info.spd);
      const maxSpd = MAX_SPEED * spdTier;
      const row = {
        id: p.id,
        name: info ? info.name : ("Ace" + p.id),
        team,
        color: (team != null ? TEAM_COLORS[team % TEAM_COLORS.length] : null) || (info && info.color) || "#78d9ff",
        x: p.x,
        y: p.y,
        heading,
        spd: (p.thr || 0) * maxSpd,
        vx: Math.cos(heading) * (p.thr || 0) * maxSpd,
        vy: Math.sin(heading) * (p.thr || 0) * maxSpd,
        throttle: p.thr || 0,
        gear: "F",
        brake: p.id === myId ? keys.brake : st.brake,
        hp: st.hp,
        maxHp: PLAYER_MAX_HP,
        respawn: st.respawn,
        spdTier,
      };
      if (p.id === myId) {
        const live = IS_MOBILE ? speedLever : (pred && Number.isFinite(pred.throttle) ? pred.throttle : (p.thr || 0));
        row.throttle = clamp(live, 0, 1);
        row.spdTier = mySpeedTier;
        row.spd = row.throttle * myMaxSpeed();
        row.vx = Math.cos(heading) * row.spd;
        row.vy = Math.sin(heading) * row.spd;
        me = row;
      } else players.push(row);
    }
    const bladeSrc = frame.blades || new Map();
    for (const s of bladeSrc.values()) {
      const heading = s.heading ?? s.h;
      const thr = s.thr || 0.7;
      players.push({
        id: s.id,
        name: s.name || "ACE",
        color: "#7ef0b4",
        x: s.x,
        y: s.y,
        heading,
        spd: thr * MAX_SPEED * 0.75,
        vx: Math.cos(heading) * thr * MAX_SPEED * 0.75,
        vy: Math.sin(heading) * thr * MAX_SPEED * 0.75,
        throttle: thr,
        gear: "F",
        brake: false,
        hp: s.hp != null ? s.hp : 30,
        maxHp: 30,
        respawn: 0,
        blade: true,
      });
    }
    if (!me) {
      me = {
        id: myId,
        x: lastGoodMe.x,
        y: lastGoodMe.y,
        throttle: lastGoodMe.throttle || 0,
        gear: "F",
        hp: lastGoodMe.hp || PLAYER_MAX_HP,
        respawn: 0,
        heading: lastGoodMe.heading || 0,
        spd: 0,
        vx: 0,
        vy: 0,
        color: "#78d9ff",
        name: "",
      };
    }
    if (!Number.isFinite(me.x) || !Number.isFinite(me.y) || !Number.isFinite(me.heading)) {
      me.x = lastGoodMe.x;
      me.y = lastGoodMe.y;
      me.heading = lastGoodMe.heading || 0;
    }
    resolveMeIronRocks(me);
    players.push(me);
    if (roomStunUntil.size) {
      for (const p of players) {
        const until = roomStunUntil.get(p.id);
        if (!until) continue;
        if (until <= now || p.respawn > 0) roomStunUntil.delete(p.id);
        else p.stunT = (until - now) / 1000;
      }
    }
    roomFramePlayers = players;
    maybeFireLocalBullet(now, me, rt);
    maybeFireLocalMissile(now, me, dt);
    } // end !localMatch playback branch
    if (me && Number.isFinite(me.hp) && !(me.respawn > 0)) {
      if (lastSelfHp >= 0 && me.hp < lastSelfHp - 0.4) {
        const dropped = lastSelfHp - me.hp;
        bumpGunHitFeel(clamp(dropped / PLAYER_MAX_HP, 0.2, 1));
        spawnCraftSparks(me.x, me.y, me.vx || 1, me.vy || 0, 4);
      }
      lastSelfHp = me.hp;
    } else if (me && me.respawn > 0) {
      if (lastSelfHp > 0) bumpDeathFeel();
      lastSelfHp = -1;
    }
    const sh = shakeOffset();
    let camera = { x: me.x + sh.x, y: me.y + sh.y };
    // 过关终结镜头：相机从己机过渡到击破目?
    if (winCine && levelWinCine) {
      const focus = levelWinCamPos(levelWinCine);
      if (focus) {
        const punch = levelWinCine.age >= (levelWinCine.holdDur || 0) + (levelWinCine.panDur || 0)
          ? sh
          : { x: 0, y: 0 };
        camera = { x: focus.x + punch.x, y: focus.y + punch.y };
      }
    }
    // 有自己的导弹在飞则拉远主视角；场上没有了?100ms 缩回
    try { updateMissileViewZoom(dt); } catch (e) { VIEW_SCALE = VIEW_SCALE_BASE; }
    // 关卡胜负定格/慢镜：禁止再推机?加特林循环，否则 stopAll 会被下一帧重新点?
    const levelSfxMute = !!(failCine || failHold || winCine || winHold);
    if (levelSfxMute) {
      try { sfx?.setGatling?.(0, false, 0); } catch (e) {}
      try { sfx?.setCannon?.(false); } catch (e) {}
      try { sfx?.tickFlight?.(0, 0, false, false); } catch (e) {}
      try { sfx?.tickOthers?.(0, 0, false); } catch (e) {}
    } else {
      sfx?.tickFlight(dt, me.throttle || 0, !!keys.brake, !(me.respawn > 0));
      sfx?.setCannon(gunHeld() && gunAmmo >= 1 && !(me.respawn > 0) && !(trainLoadout && trainLoadout.main !== "gun"));
      if (trainLoadout && trainLoadout.main === "gatling" && !(me.respawn > 0)) {
        sfx?.setGatling?.(trainW.gatSpin, trainW.gatFiring, trainW.gatHz);
      } else {
        sfx?.setGatling?.(0, false, 0);
      }
      let otherPower = 0;
      let otherCannon = false;
      const seen = new Set();
      for (const p of players) {
        if (p.id === myId || p.respawn > 0) continue;
        if (!onScreenLock(p, camera)) continue;
        seen.add(p.id);
        const thr = Number.isFinite(p.throttle) ? p.throttle : (p.blade ? 0.7 : 0);
        otherPower = Math.max(otherPower, clamp(thr, 0, 1));
      }
      for (const b of bulletShots.values()) {
        if (b.own || b.oid === myId || b.kind) continue;
        const age = rt - b.t0;
        if (age < 0 || age > 90) continue;
        const sx = b.x + b.vx * age / 1000;
        const sy = b.y + b.vy * age / 1000;
        if (seen.has(b.oid) || onScreenLock({ x: sx, y: sy, respawn: 0 }, camera)) {
          otherCannon = true;
          break;
        }
      }
      sfx?.tickOthers(dt, otherPower, otherCannon);
    }
    if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y)) {
      camera.x = lastGoodMe.x;
      camera.y = lastGoodMe.y;
    } else {
      lastGoodMe.x = me.x;
      lastGoodMe.y = me.y;
      lastGoodMe.heading = me.heading || 0;
      lastGoodMe.throttle = me.throttle || 0;
      lastGoodMe.hp = me.hp;
      lastGoodMe.respawn = me.respawn || 0;
    }
    beginWorldView();
  // 客户端对铁陨石做与网页服同款的硬碰分离，避免穿模
    const worldClip = worldViewRect(camera);
    const viewClip = viewPad(0);
    const clipOob = worldClip.x0 > viewClip.x0 || worldClip.y0 > viewClip.y0
      || worldClip.x1 < viewClip.x1 || worldClip.y1 < viewClip.y1;
    if (clipOob) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(worldClip.x0, worldClip.y0, worldClip.x1 - worldClip.x0, worldClip.y1 - worldClip.y0);
      ctx.clip();
    }
    if (!mainScene) drawMapBg(camera);
    if (!mainScene && !MAP_DECOR_OFF) {
      drawZoneBackdrop(camera);
      drawBeacons(camera, now);
      drawMapLabels(camera);
    }
    flushChips();
    flushSplits();

    // ?WebGL 场景已关闭时，背?世界都画?2D 主画布上?
    if (mainScene) {
      if (clipOob) ctx.restore();
      endWorldView();
      resetCanvasLayer();
      mainWorld.setViewScale(VIEW_SCALE);
      mainWorld.setCoordinateScale(1);
      drawSpaceFieldWebGl(camera, mainWorld);
      beginWorldView();
      if (clipOob) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(worldClip.x0, worldClip.y0, worldClip.x1 - worldClip.x0, worldClip.y1 - worldClip.y0);
        ctx.clip();
      }
    }

    const asteroidsArr = [];
    const dropRocks = [];
    for (const a of asteroids.values()) {
      if (a.fadeOut && now - a.fadeOut > 320) { dropRocks.push(a.id); continue; }
      if (!a.fadeOut && !a.iron && !ASTEROIDS_STATIC) {
        a.x += (a.vx || 0) * dt;
        a.y += (a.vy || 0) * dt;
        a.rotation += (a.spin || 0) * dt;
        if (a.sx != null) {
          a.sx += (a.vx || 0) * dt;
          a.sy += (a.vy || 0) * dt;
          const k = 1 - Math.exp(-7 * dt);
          a.x += (a.sx - a.x) * k;
          a.y += (a.sy - a.y) * k;
          if (Number.isFinite(a.srot)) a.rotation += angleDelta(a.srot, a.rotation) * k;
        }
      }
      a.flash = Math.max(0, (a.flash || 0) - dt);
      if (a.welds && a.welds.length) tickMetalWelds(a, dt);
      asteroidsArr.push(a);
    }
    for (const id of dropRocks) asteroids.delete(id);
    // 过关镜头：世界定格，但碎?爆炸用慢动作继续?
    let debrisDt = dt;
    if (winCine && levelWinCine) {
      debrisDt = Math.min(rawDt, 0.033) * 0.48;
    }
    updateDebris(debrisDt);
    const motherships = [];
    if (localMatch) {
      for (const m of localMotherships) {
        if (!m.dead && m.alive !== false) motherships.push(m);
      }
    } else {
      // 开?助战：母舰基准在 welcome.ms，周期快照只更炮?
      for (const [id, base] of mothershipBase) {
        const samples = entMotherships.get(id);
        let turret = base.h || 0;
        let shotsLeft = 0;
        let cd = 0;
        if (samples && samples.length) {
          const last = samples[samples.length - 1];
          if (last) {
            turret = Number.isFinite(last.turret) ? last.turret : turret;
            shotsLeft = last.shotsLeft || 0;
            cd = last.cd || 0;
          }
        }
        motherships.push({
          id, x: base.x, y: base.y, heading: base.h || 0,
          turretAngle: turret, shotsLeft, cooldown: cd,
          alive: true, dead: false,
        });
      }
    }
    const missiles = [];
    for (const s of frame.missiles.values()) {
      const heading = s.heading ?? s.h;
      missiles.push({
        id: s.id, x: s.x, y: s.y, heading, speed: s.spd || 0,
        ownerId: s.ownerId || 0,
        prevX: s.x - Math.cos(heading) * 16, prevY: s.y - Math.sin(heading) * 16, trail: [],
      });
    }
    if (localMatch) {
      missiles.length = 0;
      for (const m of localMissiles) missiles.push(m);
    } else {
      syncMyMissileClaims(missiles, me);
    }
    updateMissileTrails(missiles, dt);
    const bullets = [];
    const enemyBullets = [];
    for (const b of bulletShots.values()) {
      const age = rt - b.t0;
      if (age > b.life) { dropBulletShot(b.id); continue; }
      if (age < 0) continue;
      const shot = {
        id: b.id,
        ownerId: b.oid,
        x: b.x + b.vx * age / 1000,
        y: b.y + b.vy * age / 1000,
        // 子弹快：回看 ~2 帧做扫掠判定，掉帧也不穿?
        prevX: b.x + b.vx * Math.max(0, age - 34) / 1000,
        prevY: b.y + b.vy * Math.max(0, age - 34) / 1000,
        vx: b.vx, vy: b.vy,
        ax: b.ax, ay: b.ay,
        age, life: b.life,
        dmg: b.dmg, blast: b.blast, style: b.style, ci: b.ci,
      };
      (b.kind ? enemyBullets : bullets).push(shot);
    }
    // 特效：对象池 active 槽位
    const effects = [];
    for (let i = 0; i < MAX_EFFECTS; i++) {
      const f = effectList[i];
      if (!f.active) continue;
      const life = f.ty === 0 ? 0.22 : 0.55;
      const age = (now - f.t0) / 1000;
      if (age >= life) { f.active = false; continue; }
      if (age < 0) continue;
      f._age = age;
      f._life = life;
      f._color = EFFECT_COLORS[f.c] || "#ffb45f";
      effects.push(f);
    }

    if (DEBUG) {
      dbgFrame = {
        my: myId,
        t: now,
        rt: Math.round(rt),
        st: net.latestSt,
        delay: Math.round(net.delay),
        interval: Math.round(net.interval * 10) / 10,
        players: players.map((p) => ({ id: p.id, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, h: p.heading, r: p.respawn, pw: Math.round((p.throttle || 0) * 100) / 100 })),
        bullets: bullets.length,
        shots: bullets.filter((b) => b.ownerId === myId).map((b) => ({ x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, a: Math.round(b.age) })),
        fx: effects.map((e) => ({ ty: e.ty, x: Math.round(e.x), y: Math.round(e.y), a: Math.round(e.age * 1000) })),
        missiles: missiles.map((m) => ({ id: m.id, x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, h: m.heading, spd: m.speed })),
        ast: asteroidsArr.length,
      };
      if (GameGlobal.__hook) GameGlobal.__hook(dbgFrame);
    }

    if (mainScene) {
      drawAsteroidWebGlPass(asteroidsArr, camera);
      drawWorldIconWebGlPass(camera, now);
      drawMothershipWebGlPass(motherships, camera, now);
    } else {
      for (const asteroid of asteroidsArr) {
        try { drawAsteroid(asteroid, camera); } catch (e) {}
      }
      drawMedkit(camera, now);
      drawLocalShieldPickups(camera, now);
      if (localMatch) for (const pk of localMagPickups) drawPickupBox(pk.x, pk.y, 1, camera, now);
      for (const mothership of motherships) {
        try {
          if (PapaMS01 && mothership.kind === "ms01") PapaMS01.draw(ctx, mothership, camera, screen, now / 1000);
          else drawMothership(mothership, camera);
        } catch (e) {}
      }
      if (localAirMines.length && (localMatch || (assistCoopMode && localLevelMode))) {
        try { drawLocalAirMines(camera, now / 1000); } catch (e) {}
      }
      if (localSatellites.length && (localMatch || (assistCoopMode && localLevelMode))) {
        try { drawLocalSatellites(camera, now / 1000); } catch (e) {}
      }
      try { drawLevel4Goal(camera); } catch (e) {}
      try { drawLevel5Exit(camera); } catch (e) {}
    }
    for (const player of players) updatePlayerVisual(player, dt);
    // 批绘被禁用后改直?Canvas，避免排队进?WebGL?
    if (mainScene || (USE_CRAFT_WEBGL && !craftWebGlBatchDisabled)) {
      worldCraftQueue.length = 0;
      worldCraftTrailVertices.length = 0;
      if (mainScene) {
        for (const player of players) {
          const vis = playerVisuals.get(player.id);
          if (!vis) continue;
          queueWorldCraftTrail(vis.trail, camera);
        }
      } else {
        // 仅飞?WebGL：尾焰仍?2D，避免整场景 WebGL?
        for (const player of players) {
          const vis = playerVisuals.get(player.id);
          if (vis) drawPlayerTrail(vis.trail, camera);
        }
      }
      worldCraftBatchActive = true;
      for (const player of players) {
        try { drawPlayer(player, camera); } catch (e) {}
      }
      worldCraftBatchActive = false;
      flushWorldCraftBatch(camera);
    } else {
      for (const player of players) {
        const vis = playerVisuals.get(player.id);
        if (vis) drawPlayerTrail(vis.trail, camera);
      }
      for (const player of players) {
        try { drawPlayer(player, camera); } catch (e) {}
      }
    }
    if (mineArm && me && (localMatch || (assistCoopMode && localLevelMode))) {
      try { drawMineDefuseArm(me, camera); } catch (e) {}
    }
    if (satArm && me && (localMatch || (assistCoopMode && localLevelMode))) {
      try { drawSatScissorArm(me, camera); } catch (e) {}
    }
    for (const player of players) emitDamageFx(player, dt);
    try { drawGunSight(me, camera, now); } catch (e) {}
    const gunKilledMissiles = new Set();
    const visibleBullets = bullets.filter((b) => {
      if (consumeShotOnRocks(b, asteroidsArr, now)
        || hitsCraft(b, players.concat(me ? [me] : []), CRAFT_HIT_R)
        || hitsTrainDrones(b, DRONE_HIT_R)) return false;
      const mid = shotHitsMissile(b, missiles, 16);
      if (mid) {
        gunKilledMissiles.add(mid);
        const m = missiles.find((x) => x.id === mid);
        if (m) popMissileBlast(m.x, m.y, 1.05);
        if (localMatch) {
          const ix = localMissiles.findIndex((x) => x.id === mid);
          if (ix >= 0) localMissiles.splice(ix, 1);
        }
        return false;
      }
      return true;
    });
    const visibleEnemy = enemyBullets.filter((b) => !consumeShotOnRocks(b, asteroidsArr, now));
    const wakeShots = visibleBullets.concat(visibleEnemy);
    updateGunWakeTrails(wakeShots.filter((b) => b.style !== "ms01"), dt);
    updateTrainLasers(dt);
    try { updateEmpBalls(dt, now); } catch (e) {}
    try { drawTrainWeapons(players, camera, now); } catch (e) {}
    try { drawTrainDrones(camera); } catch (e) {}
    const visibleMissiles = missiles.filter((m) => {
      if (gunKilledMissiles.has(m.id)) return false;
      for (const a of asteroidsArr) {
        const hit = sampleHitAsteroid(a, m.prevX, m.prevY, m.x, m.y);
        if (!hit) continue;
        return false;
      }
      for (const p of players.concat(me ? [me] : [])) {
        if (p.id === m.ownerId || p.respawn > 0) continue;
        if ((m.x - p.x) ** 2 + (m.y - p.y) ** 2 < CRAFT_HIT_R * CRAFT_HIT_R) return false;
      }
      return true;
    });
    if (mainScene) {
      drawAmbientFxWebGlPass(camera, now);
      drawProjectileWebGlPass(visibleBullets, visibleEnemy, visibleMissiles, camera);
      drawImpactFxWebGlPass(camera, now, dt);
    } else {
      drawDmgSmoke(camera);
      drawDebris(camera);
      drawDmgFire(camera);
      drawHealBursts(camera, now);
      drawGunWakeTrails(camera);
      const ms01Shots = visibleBullets.filter((b) => b.style === "ms01").concat(visibleEnemy.filter((b) => b.style === "ms01"));
      drawGunBullets(visibleBullets.filter((b) => b.style !== "ms01"), camera, false);
      drawGunBullets(visibleEnemy.filter((b) => b.style !== "ms01"), camera, true);
      if (PapaMS01 && ms01Shots.length) {
        try { PapaMS01.drawTracers(ctx, ms01Shots, camera, screen); } catch (e) {}
      }
      for (const missile of visibleMissiles) drawMissile(missile, camera);
      for (const effect of effects) {
        drawEffect({
          ty: effect.ty, x: effect.x, y: effect.y, size: effect.size,
          color: effect._color, age: effect._age, life: effect._life,
        }, camera);
      }
      drawFireBlasts(camera, dt);
      drawHitFlashes(camera, now);
    }
    try { drawMirvStages(camera); } catch (e) {}
    drawRepairPad(camera, now);
    if (clipOob) ctx.restore();
    endWorldView();
    tickMissileLock(players, camera, now);
    latestLockPlayers = players;
    latestLockCamera = camera;
    if (!MAP_DECOR_OFF) drawZoneGrade();
    drawWorldBoundMask(camera, now);
    drawMissileLocks(players, camera, now);
    drawMinimap(players, me, asteroidsArr, now, missiles);
    drawRespawnBar(me, now);
    drawShieldBar(me);
    updateFlightUi(me);
    drawAim();
    drawHurtVignette();
    try { drawTrainGuideWorldHints(players, me, camera); } catch (e) {}
    if (failCine && levelFailCine) {
      const u = clamp(levelFailCine.age / 0.55, 0, 1);
      drawLevelFailGray(0.18 + u * 0.58);
    } else if (failHold) {
      drawLevelFailGray(0.72);
    } else if (winCine && levelWinCine) {
      const veilT = easeOutQuad(clamp(levelWinCine.age / Math.max(0.2, levelWinCine.dur || 1), 0, 1));
      drawLevelWinVeil(0.06 + veilT * 0.16);
    }
    if (typeof GameGlobal !== "undefined" && GameGlobal.wxOverlay) GameGlobal.wxOverlay(ctx, W, H);
    if (failCine && levelFailCine && !failHold) {
      const u = clamp(levelFailCine.age / 0.55, 0, 1);
      drawLevelFailGray(0.12 + u * 0.28);
    }
    if (mainScene) {
      mainWorld.setViewScale(1);
      mainWorld.setCoordinateScale(1);
      uploadCanvasLayer(mainWorld, "screen:overlay", true);
      lastCanvasLayerMode = "playing";
      drawFpsWebGl(mainWorld);
      mainWorld.endScene();
    } else {
      try { drawFps(); } catch (e) {}
    }
    } catch (err) {
      resetGfx(true);
      const msg = err && err.message ? err.message : String(err);
      console.error("[papa] draw", msg);
      if (performance.now() - drawFailAt > 4000) {
        drawFailAt = performance.now();
        try { wx.showToast({ title: "画出?" + msg.slice(0, 18), icon: "none", duration: 2000 }); } catch (e) {}
      }
      try {
        drawPlayerSimple({ color: "#78d9ff" }, { x: W * 0.5, y: H * 0.5 }, lastGoodMe.heading || 0);
      } catch (e) {}
      if (typeof GameGlobal !== "undefined" && GameGlobal.wxOverlay) {
        try { GameGlobal.wxOverlay(ctx, W, H); } catch (e) {}
      }
      try { drawFps(); } catch (e) {}
      if (mainScene) {
        try {
          mainWorld.setViewScale(1);
          mainWorld.setCoordinateScale(1);
          uploadCanvasLayer(mainWorld, "screen:error");
          mainWorld.endScene();
        } catch (e) {}
      }
    }
  }
  try { scheduleFrame(draw); } catch (e) { setTimeout(draw, 0); }

  function stampMap(img, camera, z, cssW, cssH, sc) {
    if (!img || !img.width) return;
    const scale = sc == null ? 1 : sc;
    const tw = cssW * scale;
    const th = cssH * scale;
    if (!(tw > 8 && th > 8)) return;
    const vis = viewPad(4);
    const ox = ((camera.x * z) % tw + tw) % tw;
    const oy = ((camera.y * z) % th + th) % th;
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
    for (let x = vis.x0 - ox; x < vis.x1; x += tw) {
      for (let y = vis.y0 - oy; y < vis.y1; y += th) {
        try { ctx.drawImage(img, x, y, tw, th); } catch (e) { return; }
      }
    }
  }

  // 瓦片烘焙失败时的实时六边形底纹（?web 远景层同视差?
  function drawLiveHexGrid(camera) {
    const z = MAP_FAR_Z;
    const sc = MAP_FAR_SC;
    const dx = HEX_DX * sc;
    const dy = HEX_DY * sc;
    const rx = HEX_RX * sc;
    const ry = HEX_RY * sc;
    const vis = viewPad(dx + rx);
    const ox = ((camera.x * z) % dx + dx) % dx;
    const oy = ((camera.y * z) % dy + dy) % dy;
    const col0 = Math.floor((vis.x0 + ox) / dx) - 1;
    const col1 = Math.ceil((vis.x1 + ox) / dx) + 1;
    const row0 = Math.floor((vis.y0 + oy) / dy) - 1;
    const row1 = Math.ceil((vis.y1 + oy) / dy) + 1;
    ctx.strokeStyle = "rgba(78,140,116,0.18)";
    ctx.lineWidth = 1.35;
    ctx.lineJoin = "round";
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const cx = col * dx + (row % 2 ? dx * 0.5 : 0) - ox;
        const cy = row * dy - oy;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i - Math.PI / 6;
          const x = cx + rx * Math.cos(ang);
          const y = cy + ry * Math.sin(ang);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  const OUT_OF_BOUNDS_FILL = "#000";
  const worldViewRectScratch = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function worldViewRect(camera) {
    const a = screen(-WORLD_LIMIT, -WORLD_Y_LIMIT, camera);
    const b = screen(WORLD_LIMIT, WORLD_Y_LIMIT, camera);
    const o = worldViewRectScratch;
    o.x0 = Math.min(a.x, b.x);
    o.y0 = Math.min(a.y, b.y);
    o.x1 = Math.max(a.x, b.x);
    o.y1 = Math.max(a.y, b.y);
    return o;
  }
  function drawMapBg(camera) {
    // 纯黑?+ 程序化星空（带视差）
    ctx.fillStyle = MAP_BG;
    const vis = viewPad(4);
    ctx.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
    try { drawSpaceField(camera); } catch (e) {}
  }

  let zoneFogCache = { key: "", grad: null };
  function drawZoneBackdrop(camera) {
    if (MAP_DECOR_OFF) return;
    const vis = viewPad(4);
    const t = ZONE.tint;
    const fogKey = `${vis.x0 | 0},${vis.y0 | 0},${vis.x1 | 0},${vis.y1 | 0},${t[0]},${t[1]},${t[2]},${ZONE.fog}`;
    let fog = zoneFogCache.grad;
    if (zoneFogCache.key !== fogKey || !fog) {
      fog = ctx.createLinearGradient(vis.x0, vis.y0, vis.x0 + (vis.x1 - vis.x0) * 0.35, vis.y1);
      fog.addColorStop(0, `rgba(${t[0]},${t[1]},${t[2]},${ZONE.fog})`);
      fog.addColorStop(0.45, `rgba(${t[0]},${t[1]},${t[2]},${ZONE.fog * 0.4})`);
      fog.addColorStop(1, `rgba(${t[0]},${t[1]},${t[2]},${ZONE.fog * 0.08})`);
      zoneFogCache.key = fogKey;
      zoneFogCache.grad = fog;
    }
    ctx.fillStyle = fog;
    ctx.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
    // 界外不画陨石剪影（省性能）；贴边时由 clip + 黑底遮罩盖住
    const wr = worldViewRect(camera);
    const sil = ZONE.sil;
    for (const layer of ZONE_SIL) {
      const spanW = W + 180;
      const spanH = H + 180;
      for (const rk of layer.rocks) {
        let x = (rk.nx * spanW - 90 - camera.x * layer.z) % spanW;
        if (x < -90) x += spanW;
        let y = (rk.ny * spanH - 90 - camera.y * layer.z) % spanH;
        if (y < -90) y += spanH;
        if (x + rk.r < wr.x0 || x - rk.r > wr.x1 || y + rk.r < wr.y0 || y - rk.r > wr.y1) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rk.rot);
        ctx.beginPath();
        for (let i = 0; i < rk.verts.length; i++) {
          const a = (i / rk.verts.length) * Math.PI * 2;
          const rr = rk.r * rk.verts[i];
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr * rk.squash;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${sil[0]},${sil[1]},${sil[2]},${layer.a})`;
        ctx.fill();
        // 轻量档跳过描边：观感几乎不变，少一?path 提交
        if (!PERF_LITE) {
          ctx.strokeStyle = `rgba(${sil[0]},${sil[1]},${sil[2]},${layer.a * 1.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  function drawZoneGrade() {
    if (MAP_DECOR_OFF) return;
    const t = ZONE.tint;
    ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${ZONE.grade})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMapLabels(camera) {
    if (MAP_DECOR_OFF) return;
    const vis = viewPad(90);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of MAP_LABELS) {
      const p = screen(m.x, m.y, camera);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
      if (m.coord) {
        ctx.font = "11px Segoe UI, sans-serif";
        ctx.fillStyle = "rgba(170,190,210,0.16)";
        ctx.fillText(m.text, p.x, p.y);
        ctx.strokeStyle = "rgba(170,190,210,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 8, p.y);
        ctx.lineTo(p.x + 8, p.y);
        ctx.moveTo(p.x, p.y - 8);
        ctx.lineTo(p.x, p.y + 8);
        ctx.stroke();
      } else {
        ctx.font = m.big ? "bold 16px Segoe UI, sans-serif" : "13px Segoe UI, sans-serif";
        ctx.fillStyle = m.big ? "rgba(190,210,225,0.28)" : "rgba(180,200,215,0.22)";
        ctx.fillText(m.text, p.x, p.y);
      }
    }
    ctx.restore();
  }

  function drawBeacons(camera, now) {
    if (MAP_DECOR_OFF) return;
    const elapsed = now / 1000;
    const vis = viewPad(80);
    ctx.strokeStyle = "rgba(120,120,130,0.55)";
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    for (const b of mapBeacons) {
      const p = screen(b.x, b.y, camera);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
      const a0 = b.spin + elapsed * 0.2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * Math.PI * 2;
        const x = p.x + Math.cos(a) * b.r;
        const y = p.y + Math.sin(a) * b.r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function rockShadeStyle(a, ext, glow, g = ctx) {
    const base = a.iron
      ? [138 + glow * 70, 151 + glow * 60, 164 + glow * 50]
      : [98 + glow * 80, 91 + glow * 70, 85 + glow * 55];
    const grd = g.createLinearGradient(0, -ext, 0, ext);
    if (a.iron) {
      grd.addColorStop(0, `rgb(${Math.min(255, base[0] + 40) | 0},${Math.min(255, base[1] + 35) | 0},${Math.min(255, base[2] + 30) | 0})`);
      grd.addColorStop(0.45, `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`);
      grd.addColorStop(1, `rgb(${Math.max(40, base[0] - 55) | 0},${Math.max(45, base[1] - 50) | 0},${Math.max(50, base[2] - 45) | 0})`);
    } else {
      grd.addColorStop(0, `rgb(${Math.min(255, base[0] + 18) | 0},${Math.min(255, base[1] + 14) | 0},${Math.min(255, base[2] + 10) | 0})`);
      grd.addColorStop(0.5, `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`);
      grd.addColorStop(1, `rgb(${Math.max(35, base[0] - 28) | 0},${Math.max(32, base[1] - 26) | 0},${Math.max(30, base[2] - 24) | 0})`);
    }
    return grd;
  }

  function rgbCss(c, alpha) {
    return `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${alpha})`;
  }

  // 焊痕：刚打上是红热色，heat 衰减（约 2.6s）后变成暗色疤，再叠 Godot 同款红热小点
  function drawMetalScars(a, pts, g = ctx) {
    g.save();
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    try { g.clip(); } catch (e) {}
    for (const s of a.scars) {
      const t = s.heat0 > 0 ? clamp(s.heat / s.heat0, 0, 1) : 0;
      const hot = weldColor(s.heat);
      const c = [
        s.cold[0] + (hot[0] - s.cold[0]) * t,
        s.cold[1] + (hot[1] - s.cold[1]) * t,
        s.cold[2] + (hot[2] - s.cold[2]) * t,
      ];
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.rot);
      g.scale(1, s.ry / s.rx);
      g.beginPath();
      g.arc(0, 0, s.rx, 0, Math.PI * 2);
      g.fillStyle = rgbCss(c, 0.92);
      g.fill();
      g.restore();
    }
    for (const w of a.welds || []) {
      if (w.heat < 0.04) continue;
      g.beginPath();
      g.arc(w.x, w.y, 0.55 + w.heat * 0.85, 0, Math.PI * 2);
      g.fillStyle = `rgba(242,31,13,${0.55 + 0.4 * w.heat})`;
      g.fill();
      if (w.heat > 0.35) {
        g.beginPath();
        g.arc(w.x, w.y, 0.28 + w.heat * 0.28, 0, Math.PI * 2);
        g.fillStyle = `rgba(255,115,46,${0.65 * w.heat})`;
        g.fill();
      }
    }
    g.restore();
  }

  function drawAsteroidSmooth(a, glow, g = ctx) {
    const pts = a.pts || [];
    if (pts.length < 3) return false;
    const holes = a.holes || [];
    g.beginPath();
    rockOutlinePath(g, pts);
    for (const h of holes) {
      const rr = Math.max(2, h.r);
      g.moveTo(h.x + rr, h.y);
      g.arc(h.x, h.y, rr, 0, Math.PI * 2, true);
      g.closePath();
    }
    g.fillStyle = rockShadeStyle(a, a.extent || a.r, glow, g);
    let filled = false;
    try {
      g.fill("evenodd");
      filled = true;
    } catch (e) {}
    if (!filled) {
      try { g.fill(); } catch (err) {}
      if (holes.length) {
        const prev = g.globalCompositeOperation;
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = "#000";
        for (const h of holes) {
          g.beginPath();
          g.arc(h.x, h.y, Math.max(2, h.r), 0, Math.PI * 2);
          g.fill();
        }
        g.globalCompositeOperation = prev || "source-over";
      }
    }
    if (a.iron && (a.scars && a.scars.length)) drawMetalScars(a, pts, g);
    g.beginPath();
    rockOutlinePath(g, pts);
    g.lineJoin = "round";
    g.lineCap = "round";
            // 仅自己爆炸才大震，敌机爆炸不震
    const edgeW = clamp((a.r || 20) * (a.iron ? 0.055 : 0.045), 1, 2.5);
    g.strokeStyle = a.iron ? "rgba(200,210,220,0.35)" : "rgba(120,108,96,0.4)";
    g.lineWidth = edgeW * 1.85;
    g.stroke();
    g.strokeStyle = a.iron ? "#e8eef4" : "#938578";
    g.lineWidth = edgeW;
    g.stroke();
    if (a.iron) {
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 1;
      g.stroke();
    }
    return true;
  }

  // 被激光切过的铁陨石：与网页版激光切槽同款——沿光束挖出圆头平滑槽（?2×半宽），
  // 槽边再压一圈暗色焦痕；在离屏画布上画本体再挖槽，避免把主画布的背景一起擦?
  const IRON_CUT_SCALE = 2;
  function drawIronCut(a, glow, target = ctx) {
    const ext = a.extent || a.r;
    if (!(ext > 0)) return false;
    const size = Math.ceil(ext * 2 * IRON_CUT_SCALE) + 4;
    if (!a.cutCanvas || a.cutCanvas.width !== size) {
      a.cutCanvas = makeOffscreen(size, size);
      a.cutCtx = a.cutCanvas ? a.cutCanvas.getContext("2d") : null;
    }
    const g = a.cutCtx;
    if (!g) return false;
    const k = (size / 2) / (ext + 2 / IRON_CUT_SCALE);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, size, size);
    g.setTransform(k, 0, 0, k, size / 2, size / 2);
    drawAsteroidSmooth(a, glow, g);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "#000";
    for (const s of a.cuts) {
      g.lineWidth = s.r * 2;
      g.beginPath();
      g.moveTo(s.x0 - s.ux * s.r * 0.6, s.y0 - s.uy * s.r * 0.6);
      g.lineTo(s.x1 + s.ux * s.r * 0.6, s.y1 + s.uy * s.r * 0.6);
      g.stroke();
    }
    g.globalCompositeOperation = "source-atop";
    g.strokeStyle = "rgba(22,18,16,0.28)";
    for (const s of a.cuts) {
      g.lineWidth = s.r * 2.35;
      g.beginPath();
      g.moveTo(s.x0 - s.ux * s.r * 0.6, s.y0 - s.uy * s.r * 0.6);
      g.lineTo(s.x1 + s.ux * s.r * 0.6, s.y1 + s.uy * s.r * 0.6);
      g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    const half = size / 2 / k;
    target.drawImage(a.cutCanvas, -half, -half, half * 2, half * 2);
    return true;
  }

  /** 格子轮廓 ?平滑折线（Chaikin），减轻打碎后的台阶锯齿 */
  function chaikinLoop(pts, iters) {
    let cur = pts;
    for (let n = 0; n < iters; n++) {
      if (cur.length < 3) break;
      const next = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i];
        const b = cur[(i + 1) % cur.length];
        next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      cur = next;
    }
    return cur;
  }
  function rockGridSmoothLoops(grid, extent) {
    const N = TOPO_G;
    const cell = (extent * 2) / N;
    const solid = (x, y) => x >= 0 && y >= 0 && x < N && y < N && grid[y * N + x] === 1;
    const edges = new Map();
    const addEdge = (x0, y0, x1, y1) => {
      const k = `${x0},${y0}>${x1},${y1}`;
      const rk = `${x1},${y1}>${x0},${y0}`;
      if (edges.has(rk)) edges.delete(rk);
      else edges.set(k, [x0, y0, x1, y1]);
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!solid(x, y)) continue;
        if (!solid(x, y - 1)) addEdge(x, y, x + 1, y);
        if (!solid(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
        if (!solid(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
        if (!solid(x - 1, y)) addEdge(x, y + 1, x, y);
      }
    }
    if (!edges.size) return [];
    const adj = new Map();
    for (const [x0, y0, x1, y1] of edges.values()) {
      const key = `${x0},${y0}`;
      let list = adj.get(key);
      if (!list) { list = []; adj.set(key, list); }
      list.push([x1, y1]);
    }
    const used = new Set();
    const loops = [];
    for (const [x0, y0, x1, y1] of edges.values()) {
      const startK = `${x0},${y0}>${x1},${y1}`;
      if (used.has(startK)) continue;
      const raw = [];
      let cx = x0;
      let cy = y0;
      let nx = x1;
      let ny = y1;
      for (let guard = 0; guard < edges.size + 4; guard++) {
        const ek = `${cx},${cy}>${nx},${ny}`;
        if (used.has(ek)) break;
        used.add(ek);
        raw.push([-extent + cx * cell, -extent + cy * cell]);
        const opts = adj.get(`${nx},${ny}`) || [];
        let next = null;
        for (let i = 0; i < opts.length; i++) {
          const t = opts[i];
          const tk = `${nx},${ny}>${t[0]},${t[1]}`;
          if (!used.has(tk)) { next = t; break; }
        }
        cx = nx;
        cy = ny;
        if (!next) break;
        nx = next[0];
        ny = next[1];
        if (raw.length > 2 && cx === x0 && cy === y0) break;
      }
      if (raw.length >= 3) loops.push(chaikinLoop(raw, 3));
    }
    return loops;
  }
  function drawAsteroidBlocks(a, glow, g = ctx) {
    const ext = a.extent;
    if (!a.grid || !(ext > 0)) return false;
    const cell = (ext * 2) / TOPO_G;
    // 普通碎石：平滑轮廓，避免格子台阶锯齿；字形仍走像素块保字形
    if (!a.glyphChar) {
      if (!a._smoothLoops || a._smoothSolid !== a.solid) {
        a._smoothLoops = rockGridSmoothLoops(a.grid, ext);
        a._smoothSolid = a.solid;
      }
      const loops = a._smoothLoops;
      if (!loops || !loops.length) return false;
      g.beginPath();
      for (const loop of loops) {
        g.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) g.lineTo(loop[i][0], loop[i][1]);
        g.closePath();
      }
      g.fillStyle = rockShadeStyle(a, ext, glow, g);
      try { g.fill("evenodd"); } catch (e) { g.fill(); }
      g.beginPath();
      for (const loop of loops) {
        g.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) g.lineTo(loop[i][0], loop[i][1]);
        g.closePath();
      }
      g.lineJoin = "round";
      g.lineCap = "round";
      const edgeW = clamp((a.r || 20) * 0.04, 0.8, 2.2);
      g.strokeStyle = a.iron ? "rgba(200,210,220,0.35)" : "rgba(120,108,96,0.4)";
      g.lineWidth = edgeW * 1.7;
      g.stroke();
      g.strokeStyle = a.iron ? "#e8eef4" : "#938578";
      g.lineWidth = edgeW;
      g.stroke();
      return true;
    }
    const pad = Math.max(0.25, cell * 0.18);
    g.beginPath();
    let any = false;
    for (let cy = 0; cy < TOPO_G; cy++) {
      let run = -1;
      for (let cx = 0; cx <= TOPO_G; cx++) {
        const on = cx < TOPO_G && a.grid[cy * TOPO_G + cx];
        if (on && run < 0) run = cx;
        if ((!on || cx === TOPO_G) && run >= 0) {
          const lx = -ext + run * cell;
          const ly = -ext + cy * cell;
          const w = (cx - run) * cell;
          g.rect(lx - pad, ly - pad, w + pad * 2, cell + pad * 2);
          any = true;
          run = -1;
        }
      }
    }
    if (!any) return false;
    g.fillStyle = rockShadeStyle(a, ext, glow, g);
    g.fill();
    // 字形陨石：描?高光，字母轮廓更清晰（土质用浅描边压对比?
    if (a.iron) {
      g.strokeStyle = "rgba(236,244,252,0.92)";
      g.lineWidth = Math.max(1.6, cell * 0.42);
      g.lineJoin = "round";
      g.stroke();
      g.strokeStyle = "rgba(120,138,154,0.55)";
      g.lineWidth = Math.max(1, cell * 0.22);
      g.stroke();
    } else {
      g.strokeStyle = "rgba(255,244,220,0.96)";
      g.lineWidth = Math.max(2, cell * 0.5);
      g.lineJoin = "round";
      g.stroke();
      g.strokeStyle = "rgba(62,44,30,0.72)";
      g.lineWidth = Math.max(1.1, cell * 0.26);
      g.stroke();
    }
    return true;
  }

  function drawGlyphIronMask(a, glow, g = ctx) {
    if (!a.mask || !a.extent) return false;
    const ext = a.extent;
    const s = ext * 2;
    g.drawImage(a.mask, -ext, -ext, s, s);
    g.save();
    g.globalCompositeOperation = "source-atop";
    const shine = g.createLinearGradient(-ext, -ext, ext, ext);
    shine.addColorStop(0, `rgba(255,255,255,${0.24 + glow * 0.22})`);
    shine.addColorStop(0.5, "rgba(255,255,255,0)");
    shine.addColorStop(1, "rgba(18,26,34,0.4)");
    g.fillStyle = shine;
    g.fillRect(-ext, -ext, s, s);
    g.restore();
    // 字母外轮廓描?
    if (a.grid) {
      const cell = (ext * 2) / TOPO_G;
      g.beginPath();
      let any = false;
      for (let cy = 0; cy < TOPO_G; cy++) {
        let run = -1;
        for (let cx = 0; cx <= TOPO_G; cx++) {
          const on = cx < TOPO_G && a.grid[cy * TOPO_G + cx];
          if (on && run < 0) run = cx;
          if ((!on || cx === TOPO_G) && run >= 0) {
            g.rect(-ext + run * cell, -ext + cy * cell, (cx - run) * cell, cell);
            any = true;
            run = -1;
          }
        }
      }
      if (any) {
        if (a.iron) {
          g.strokeStyle = "rgba(245,250,255,0.95)";
          g.lineWidth = Math.max(1.8, cell * 0.38);
        } else {
          g.strokeStyle = "rgba(255,246,224,0.98)";
          g.lineWidth = Math.max(2.2, cell * 0.48);
        }
        g.lineJoin = "round";
        g.stroke();
        if (!a.iron) {
          g.strokeStyle = "rgba(58,40,28,0.7)";
          g.lineWidth = Math.max(1.1, cell * 0.24);
          g.stroke();
        }
      }
    }
    return true;
  }

  function drawAsteroid(asteroid, camera) {
    const ext = asteroid.extent || asteroid.r * 1.18;
    const now = performance.now();
    let ox = 0, oy = 0, alpha = 1;
    if (asteroid.fadeOut) {
      alpha = Math.max(0, 1 - (now - asteroid.fadeOut) / 320);
      if (alpha <= 0.01) return;
    }
    if (asteroid.splitBorn) {
      const t = clamp((now - asteroid.splitBorn) / 420, 0, 1);
      // 静止模式：裂片原地淡入，不弹开位移
      if (!ASTEROIDS_STATIC) {
        const k = 1 - Math.pow(1 - t, 3);
        ox = (asteroid.splitDx || 0) * 12 * k;
        oy = (asteroid.splitDy || 0) * 12 * k;
      }
      alpha *= Math.min(1, t / 0.22);
    }
    const p = screen(asteroid.x + ox, asteroid.y + oy, camera);
    const vis = viewPad(ext);
    if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return;

    const glow = asteroid.flash || 0;
    // 铁陨石始终平?挖坑；普通石：完整平滑，打缺/切开用格子；字形铁石强制格子/遮罩
    const useBlocks = (!asteroid.iron || asteroid.glyphChar) && !!(asteroid.blocky || asteroid.splitBorn || asteroid.glyphChar);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(asteroid.rotation || 0);
    if (asteroid.iron && asteroid.cuts && asteroid.cuts.length && drawIronCut(asteroid, glow)) {
      // 激光切槽已?
    } else if (asteroid.glyphChar && asteroid.mask && drawGlyphIronMask(asteroid, glow)) {
      // 无法拉起授权按钮
    } else if (useBlocks) drawAsteroidBlocks(asteroid, glow);
    else if (!drawAsteroidSmooth(asteroid, glow)) drawAsteroidBlocks(asteroid, glow);
    ctx.restore();
  }

  const ASTEROID_ATLAS_CELL = PERF_LITE ? 160 : 256;
  const ASTEROID_ATLAS_MAX = 64;
  let asteroidAtlasCache = null;
  function canBatchAsteroid(a) {
    return !!(a && ((a.pts && a.pts.length >= 3) || a.grid || a.mask));
  }

  function ensureAsteroidAtlas(items) {
    if (!items.length) return null;
    const signature = items.map((a) => [
      a.id, Math.round((a.extent || a.r || 0) * 10),
      a.pts ? a.pts.length : 0, a.solid || 0,
      a.blocky ? 1 : 0, a.splitBorn ? 1 : 0, a.glyphChar || "",
      a.scars ? a.scars.length : 0,
      a.cuts ? a.cuts.length : 0,
      a.cuts && a.cuts.length ? (a.cuts[a.cuts.length - 1].serial || 0) : 0,
      a.scars && a.scars.length
        ? `${Math.round(a.scars[a.scars.length - 1].x || 0)},${Math.round(a.scars[a.scars.length - 1].y || 0)}`
        : "",
    ].join(":")).join("|");
    if (asteroidAtlasCache && asteroidAtlasCache.signature === signature) return asteroidAtlasCache;
    const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)));
    const rows = Math.max(1, Math.ceil(items.length / cols));
    const canvas = makeOffscreen(cols * ASTEROID_ATLAS_CELL, rows * ASTEROID_ATLAS_CELL);
    const g = canvas && canvas.getContext("2d");
    if (!g) return null;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const frames = new Map();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const baked = a.scars && a.scars.length
        ? {
          ...a,
          scars: a.scars.map((s) => ({ ...s, heat: 0 })),
          welds: [],
        }
        : a;
      const ext = a.extent || a.r * 1.18;
      const drawExt = ext + 4;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const scale = (ASTEROID_ATLAS_CELL - 8) / (drawExt * 2);
      g.save();
      g.translate(col * ASTEROID_ATLAS_CELL + ASTEROID_ATLAS_CELL / 2,
        row * ASTEROID_ATLAS_CELL + ASTEROID_ATLAS_CELL / 2);
      g.scale(scale, scale);
      const useBlocks = (!a.iron || a.glyphChar) && !!(a.blocky || a.splitBorn || a.glyphChar);
      if (a.iron && a.cuts && a.cuts.length) drawIronCut(baked, 0, g);
      else if (a.glyphChar && a.mask) drawGlyphIronMask(baked, 0, g);
      else if (useBlocks) drawAsteroidBlocks(baked, 0, g);
      else if (!drawAsteroidSmooth(baked, 0, g)) drawAsteroidBlocks(baked, 0, g);
      g.restore();
      frames.set(a.id, { frame: i, drawExt });
    }
    asteroidAtlasCache = { signature, canvas, cols, rows, frames };
    return asteroidAtlasCache;
  }

  function drawAsteroidWebGlPass(items, camera) {
    if (!items || !items.length) return;
    const batched = [];
    const roughVis = viewPad(220);
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!canBatchAsteroid(a)) continue;
      const p = screen(a.x, a.y, camera);
      const ext = a.extent || a.r * 1.18;
      if (p.x + ext < roughVis.x0 || p.y + ext < roughVis.y0
        || p.x - ext > roughVis.x1 || p.y - ext > roughVis.y1) continue;
      if (batched.length < ASTEROID_ATLAS_MAX) batched.push(a);
    }
    if (!batched.length) return;
    const atlas = ensureAsteroidAtlas(batched);
    const sprites = [];
    if (atlas) {
      for (let i = 0; i < batched.length; i++) {
        const a = batched[i];
        const info = atlas.frames.get(a.id);
        if (!info) continue;
        const ext = info.drawExt;
        const now = performance.now();
        let ox = 0, oy = 0, alpha = 1;
        if (a.fadeOut) alpha = Math.max(0, 1 - (now - a.fadeOut) / 320);
        if (alpha <= 0.01) continue;
        if (a.splitBorn) {
          const t = clamp((now - a.splitBorn) / 420, 0, 1);
          const k = 1 - Math.pow(1 - t, 3);
          ox = (a.splitDx || 0) * 12 * k;
          oy = (a.splitDy || 0) * 12 * k;
          alpha *= Math.min(1, t / 0.22);
        }
        const p = screen(a.x + ox, a.y + oy, camera);
        const vis = viewPad(ext);
        if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
        const flash = clamp((a.flash || 0) * 2.2, 0, 0.75);
        sprites.push({
          x: p.x * dpr, y: p.y * dpr,
          w: ext * 2 * dpr, h: ext * 2 * dpr,
          rotation: a.rotation || 0,
          frame: info.frame,
          tint: [1, 0.82, 0.66],
          strength: flash,
          alpha,
        });
      }
    }
    if (!sprites.length) return;
    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    let composed = false;
    if (world && atlas && world.beginFrame(W * dpr, H * dpr)) {
      try {
        let hash = 2166136261;
        for (let i = 0; i < atlas.signature.length; i++) {
          hash ^= atlas.signature.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        const drew = world.drawSprites(`world:asteroids:${hash >>> 0}`, atlas.canvas, sprites, {
          cols: atlas.cols, rows: atlas.rows, pinned: false,
        });
        const layer = world.endFrame();
        if (drew && layer) composed = compositeWebGlLayer(world, layer);
      } catch (e) {
        try { console.error("[webgl pass] asteroids", e && e.message); } catch (err) {}
      }
    }
  }

  function drawDebris(camera) {
    ctx.lineCap = "round";
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const p = debris[i];
      if (!p.active) continue;
      const s = screen(p.x, p.y, camera);
      const vis = viewPad(20);
      if (s.x < vis.x0 || s.y < vis.y0 || s.x > vis.x1 || s.y > vis.y1) continue;
      const u = p.age / p.life;
      const alpha = u < 0.12 ? 1 : Math.pow(1 - (u - 0.12) / 0.88, 1.25);
      if (p.spark) {
        const fade = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
        const vlen = Math.hypot(p.vx, p.vy);
        const trail = clamp(vlen * 0.018, 1, 3);
        const col = sparkColor(u, 0.9 * fade);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(0.6, p.size);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - (vlen > 0.01 ? p.vx / vlen * trail : 0), s.y - (vlen > 0.01 ? p.vy / vlen * trail : 0));
        ctx.stroke();
        continue;
      }
      const tpl = DEBRIS_TEMPLATES[p.template];
      const stx = p.stretchX || 1;
      const sty = p.stretchY || 1;
      const cr = Math.cos(p.rot) * p.size;
      const sr = Math.sin(p.rot) * p.size;
      ctx.beginPath();
      for (let v = 0; v < tpl.length; v += 2) {
        const lx = tpl[v] * stx;
        const ly = tpl[v + 1] * sty;
        const vx = lx * cr - ly * sr;
        const vy = lx * sr + ly * cr;
        if (v === 0) ctx.moveTo(s.x + vx, s.y + vy);
        else ctx.lineTo(s.x + vx, s.y + vy);
      }
      ctx.closePath();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  let ms01BodyAtlas = null;
  function ensureMs01BodyAtlas() {
    if (ms01BodyAtlas) return ms01BodyAtlas;
    if (!PapaMS01 || typeof PapaMS01.drawStaticBody !== "function") return null;
    const canvas = makeOffscreen(192, 192);
    const g = canvas && canvas.getContext("2d");
    if (!g) return null;
    g.clearRect(0, 0, 192, 192);
    PapaMS01.drawStaticBody(g, 96, 96);
    ms01BodyAtlas = canvas;
    return canvas;
  }

  function appendLegacyMothershipGeometry(out, m, camera) {
    const p = screen(m.x, m.y, camera);
    const vis = viewPad(85);
    if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return false;
    const rotation = m.heading + Math.PI / 2;
    const cs = Math.cos(rotation);
    const sn = Math.sin(rotation);
    const xf = (x, y) => ({ x: p.x + x * cs - y * sn, y: p.y + x * sn + y * cs });
    for (const side of [-1, 1]) {
      glColorPolygon(out, [xf(side * 12, 34), xf(side * 17, 50), xf(side * 7, 50)], [0.36, 0.82, 1, 0.34]);
    }
    glColorPolygon(out, [
      xf(0, -58), xf(18, -40), xf(42, -18), xf(54, 8), xf(34, 20), xf(16, 36),
      xf(0, 46), xf(-16, 36), xf(-34, 20), xf(-54, 8), xf(-42, -18), xf(-18, -40),
    ], [0.082, 0.106, 0.133, 1]);
    glColorPolygon(out, [
      xf(0, -44), xf(14, -28), xf(28, -8), xf(16, 16),
      xf(0, 30), xf(-16, 16), xf(-28, -8), xf(-14, -28),
    ], [0.125, 0.165, 0.2, 1]);
    const a0 = xf(0, -44), a1 = xf(0, 30);
    const b0 = xf(-28, -8), b1 = xf(28, -8);
    glColorSegment(out, a0.x, a0.y, a1.x, a1.y, 1, [0.41, 0.84, 1, 0.65]);
    glColorSegment(out, b0.x, b0.y, b1.x, b1.y, 1, [0.41, 0.84, 1, 0.65]);
    for (const side of [-1, 1]) {
      const offset = m.heading + Math.PI / 2;
      const turret = screen(m.x + Math.cos(offset) * side * 22, m.y + Math.sin(offset) * side * 22, camera);
      const ta = Number(m.turretAngle) || 0;
      glColorSegment(out, turret.x, turret.y, turret.x + Math.cos(ta) * 24, turret.y + Math.sin(ta) * 24,
        3, m.shotsLeft > 0 ? [0.62, 0.92, 1, 1] : [0.43, 0.5, 0.55, 1]);
      glColorDisk(out, turret.x, turret.y, 6, [0.06, 0.095, 0.125, 1], 12);
    }
    const progress = m.shotsLeft > 0 ? 1 : clamp(1 - m.cooldown / 5, 0, 1);
    const ringSeg = 24;
    for (let i = 0; i < ringSeg; i++) {
      const a = i / ringSeg * Math.PI * 2 - Math.PI / 2;
      const b = (i + 1) / ringSeg * Math.PI * 2 - Math.PI / 2;
      const active = i / ringSeg <= progress;
      const col = active
        ? (m.shotsLeft > 0 ? [0.88, 0.9, 0.92, 0.85] : [0.28, 0.89, 0.48, 1])
        : [0.67, 0.7, 0.74, 0.2];
      glColorSegment(out, p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12,
        p.x + Math.cos(b) * 12, p.y + Math.sin(b) * 12, 3, col);
    }
    if (m.maxHp > 0) {
      const hp = clamp(m.hp / m.maxHp, 0, 1);
      glColorQuad(out, p.x, p.y - 69.5, 56, 5, 0, [0, 0, 0, 0.45]);
      if (hp > 0) glColorQuad(out, p.x - 28 + 28 * hp, p.y - 69.5, 56 * hp, 5, 0,
        hp > 0.35 ? [0.48, 0.84, 1, 1] : [1, 0.42, 0.36, 1]);
    }
    return true;
  }

  function drawMothershipWebGlPass(items, camera, now) {
    const ms01 = [];
    const legacy = [];
    for (let i = 0; i < items.length; i++) {
      const m = items[i];
      if (!m || m.dead || m.alive === false) continue;
      if (PapaMS01 && m.kind === "ms01") ms01.push(m);
      else legacy.push(m);
    }
    if (!ms01.length && !legacy.length) return;
    const atlas = ensureMs01BodyAtlas();
    const visible = [];
    const sprites = [];
    const geometry = [];
    for (let i = 0; i < legacy.length; i++) appendLegacyMothershipGeometry(geometry, legacy[i], camera);
    const tSec = now / 1000;
    if (atlas && PapaMS01.renderBob) {
      for (let i = 0; i < ms01.length; i++) {
        const m = ms01[i];
        const bob = PapaMS01.renderBob(m, tSec);
        const p = screen(m.x, m.y + bob, camera);
        const vis = viewPad(110);
        if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
        visible.push(m);
        sprites.push({
          x: p.x * dpr, y: p.y * dpr,
          w: 192 * dpr, h: 192 * dpr,
          rotation: m.heading + Math.PI / 2,
          frame: 0, tint: [1, 1, 1], strength: 0, alpha: 1,
        });
      }
    }
    if (!sprites.length && !geometry.length) return;
    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    let layer = null;
    let drew = false;
    if (world && world.beginFrame(W * dpr, H * dpr)) {
      try {
        drew = true;
        if (geometry.length && !world.drawColorTriangles(geometry, false)) drew = false;
        if (sprites.length && !world.drawSprites("world:ms01-body", atlas, sprites, { cols: 1, rows: 1 })) drew = false;
        layer = world.endFrame();
      } catch (e) {
        try { console.error("[webgl pass] motherships", e && e.message); } catch (err) {}
      }
    }
    if (drew && layer) {
      if (hudCanvasLive && !suppressWorldCanvasOverlay) {
        for (let i = 0; i < visible.length; i++) {
          try { PapaMS01.drawUnderlay(ctx, visible[i], camera, screen, tSec); } catch (e) {}
        }
      }
      compositeWebGlLayer(world, layer);
      if (hudCanvasLive && !suppressWorldCanvasOverlay) {
        for (let i = 0; i < visible.length; i++) {
          try { PapaMS01.drawOverlay(ctx, visible[i], camera, screen, tSec); } catch (e) {}
        }
      }
    }
  }

  function drawMothership(m, camera) {
    const p = screen(m.x, m.y, camera);
    const vis = viewPad(80);
    if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(m.heading + Math.PI / 2);
    for (const side of [-1, 1]) {
      ctx.fillStyle = "rgba(92,210,255,0.34)";
      ctx.beginPath();
      ctx.moveTo(side * 12, 34);
      ctx.lineTo(side * 17, 50);
      ctx.lineTo(side * 7, 50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(18, -40);
    ctx.lineTo(42, -18);
    ctx.lineTo(54, 8);
    ctx.lineTo(34, 20);
    ctx.lineTo(16, 36);
    ctx.lineTo(0, 46);
    ctx.lineTo(-16, 36);
    ctx.lineTo(-34, 20);
    ctx.lineTo(-54, 8);
    ctx.lineTo(-42, -18);
    ctx.lineTo(-18, -40);
    ctx.closePath();
    ctx.fillStyle = "#151b22";
    ctx.strokeStyle = "#5d7180";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#202a33";
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(14, -28);
    ctx.lineTo(28, -8);
    ctx.lineTo(16, 16);
    ctx.lineTo(0, 30);
    ctx.lineTo(-16, 16);
    ctx.lineTo(-28, -8);
    ctx.lineTo(-14, -28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(105,215,255,0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(0, 30);
    ctx.moveTo(-28, -8);
    ctx.lineTo(28, -8);
    ctx.stroke();
    ctx.restore();

    for (const side of [-1, 1]) {
      const offset = m.heading + Math.PI / 2;
      const turret = screen(m.x + Math.cos(offset) * side * 22, m.y + Math.sin(offset) * side * 22, camera);
      ctx.save();
      ctx.translate(turret.x, turret.y);
      ctx.rotate(m.turretAngle);
      ctx.strokeStyle = m.shotsLeft > 0 ? "#9feaff" : "#6d7f8b";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
      ctx.fillStyle = "#101820";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const progress = m.shotsLeft > 0 ? 0 : clamp(1 - m.cooldown / 5, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(170,180,190,0.28)";
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = m.shotsLeft > 0 ? "rgba(225,230,235,0.85)" : "#48e27b";
    ctx.beginPath();
    ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + (m.shotsLeft > 0 ? 1 : progress) * Math.PI * 2);
    ctx.stroke();
    // 关卡母舰血?
    if (m.maxHp > 0) {
      const u = clamp(m.hp / m.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(-28, -72, 56, 5);
      ctx.fillStyle = u > 0.35 ? "#7ad7ff" : "#ff6b5b";
      ctx.fillRect(-28, -72, 56 * u, 5);
    }
    ctx.restore();
  }

  const CONTENT_SCALE = 0.5;
  const SHIP_DRAW_SCALE = 0.9; // ?0.6 基础上再放大 1/2
  // —?玩家飞机帧图集（改装选择）；新增机型只扩?CRAFT_ATLAS_INFO —?
  const CRAFT_SKIN_DRAW = 58.5;
  const CRAFT_BANK_FRAME_COUNT = 15;
  const CRAFT_ATLAS_INFO = {
    fbx: {
      src: "res/craft-fbx-bank-game/atlas.png",
      frameSize: 128,
      cols: 5,
      rows: 3,
      drawMul: 1,
    },
    jgi: {
      src: "res/craft-jgi-bank-game/atlas.png",
      frameSize: 128,
      cols: 5,
      rows: 3,
      drawMul: 4 / 3, // 再放?1/3
    },
    jci: {
      src: "res/craft-jci-bank-game/atlas.png",
      frameSize: 128,
      cols: 5,
      rows: 3,
      drawMul: 1,
    },
  };
  function craftSkinDrawMul(skin) {
    const info = CRAFT_ATLAS_INFO[String(skin || "")];
    const mul = info && Number(info.drawMul);
    return Number.isFinite(mul) && mul > 0 ? mul : 1;
  }
  function craftSkinDrawSize(skin) {
    return CRAFT_SKIN_DRAW * craftSkinDrawMul(skin);
  }
  const craftAtlasImgs = Object.create(null);
  const craftAtlasFailed = Object.create(null);
  const craftAtlasWaiters = Object.create(null); // key -> [cb]
  // 每机型一张原色图集；敌我只用名字/血条颜色区分，不再烤阵营染色条带?
  const CRAFT_FRAME_CELL = 128;

  function retainCraftFactionPacks(keepKeys) {
    const keep = new Set((keepKeys || []).filter(Boolean));
    for (const key of Object.keys(craftAtlasImgs)) {
      if (keep.has(key)) continue;
      try { delete craftAtlasImgs[key]; } catch (e) {}
      try { delete craftAtlasFailed[key]; } catch (e) {}
      try { delete craftAtlasWaiters[key]; } catch (e) {}
    }
  }

  function notifyCraftAtlasWaiters(key, ok) {
    const list = craftAtlasWaiters[key];
    if (!list || !list.length) return;
    delete craftAtlasWaiters[key];
    for (let i = 0; i < list.length; i++) {
      try { list[i](ok); } catch (e) {}
    }
  }

  function beginCraftAtlasFetch(key, info) {
    if (craftAtlasImgs[key] || craftAtlasFailed[key]) return;
    const img = (typeof wx !== "undefined" && typeof wx.createImage === "function")
      ? wx.createImage()
      : (typeof Image !== "undefined" ? new Image() : null);
    if (!img) {
      craftAtlasFailed[key] = true;
      notifyCraftAtlasWaiters(key, false);
      return;
    }
    craftAtlasImgs[key] = img;
    img.onload = () => { notifyCraftAtlasWaiters(key, true); };
    img.onerror = () => {
      craftAtlasFailed[key] = true;
      try { delete craftAtlasImgs[key]; } catch (e) {}
      notifyCraftAtlasWaiters(key, false);
      try { console.warn("[craftAtlas] load fail", info.src); } catch (e) {}
    };
    try { img.src = info.src; } catch (e) {
      craftAtlasFailed[key] = true;
      try { delete craftAtlasImgs[key]; } catch (e2) {}
      notifyCraftAtlasWaiters(key, false);
    }
  }

  function ensureCraftAtlasImg(skin) {
    const key = String(skin || "");
    if (!key || craftAtlasFailed[key]) return null;
    const cached = craftAtlasImgs[key];
    if (cached && (cached.width || 0) > 0) return cached;
    if (cached) return null; // 加载?
    const info = CRAFT_ATLAS_INFO[key];
    if (!info || !info.src) {
      craftAtlasFailed[key] = true;
      notifyCraftAtlasWaiters(key, false);
      return null;
    }
    // 机体图集?craft 分包：先确保分包就绪再设 img.src，避免主包下载被卡住
    const craftReady = !!(typeof GameGlobal !== "undefined" && GameGlobal.__craftPkgReady);
    if (!craftReady && typeof GameGlobal !== "undefined" && typeof GameGlobal.ensureCraftPkg === "function") {
      GameGlobal.ensureCraftPkg().then(() => {
        try { beginCraftAtlasFetch(key, info); } catch (e) {}
      }).catch(() => {
        try { beginCraftAtlasFetch(key, info); } catch (e) {}
      });
      return null;
    }
    beginCraftAtlasFetch(key, info);
    const img = craftAtlasImgs[key];
    if (img && ((img.width || 0) > 0 || (img.complete && (img.naturalWidth || img.width || 0) > 0))) {
      notifyCraftAtlasWaiters(key, true);
      return img;
    }
    return null;
  }

  function craftAtlasIsReady(skin) {
    const key = String(skin || "");
    if (!key) return true;
    if (craftAtlasFailed[key]) return true; // 失败也放行，避免卡死
    const img = craftAtlasImgs[key];
    return !!(img && (img.width || 0) > 0);
  }

  function craftAtlasKeysForOpts(opts) {
    const o = opts || {};
    const mine = normalizePlayerCraft(
      (o.loadout && o.loadout.craft)
      || (trainLoadout && trainLoadout.craft)
      || getMyLoadout().craft
      || DEFAULT_PLAYER_CRAFT
    );
    // 训练/关卡只需自己机型；匹?开房机器人可能随机，三机都预热
    if (o.train || o.level) return [mine];
    return PLAYER_CRAFT_KEYS.slice();
  }

  function whenCraftAtlasesReady(keys, onReady) {
    const need = [];
    const seen = Object.create(null);
    const src = Array.isArray(keys) && keys.length ? keys : PLAYER_CRAFT_KEYS;
    for (let i = 0; i < src.length; i++) {
      const key = normalizePlayerCraft(src[i]);
      if (!key || seen[key]) continue;
      seen[key] = 1;
      need.push(key);
    }
    if (!need.length) {
      try { onReady && onReady(); } catch (e) {}
      return;
    }
    let left = need.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { onReady && onReady(); } catch (e) {}
    };
    const one = () => {
      if (finished) return;
      left -= 1;
      if (left <= 0) finish();
    };
    for (let i = 0; i < need.length; i++) {
      const key = need[i];
      ensureCraftAtlasImg(key);
      if (craftAtlasIsReady(key)) {
        one();
        continue;
      }
      let settled = false;
      const tick = () => {
        if (settled) return;
        settled = true;
        one();
      };
      (craftAtlasWaiters[key] || (craftAtlasWaiters[key] = [])).push(tick);
      // onload 可能在注?waiter 前就触发（缓存同步完成），再读一?
      if (craftAtlasIsReady(key)) tick();
    }
    // 超时兜底：宁可进局也不永久卡在 loading
    setTimeout(finish, 5000);
  }

  function craftBankFrame(skin, bank) {
    const key = String(skin || "");
    const info = CRAFT_ATLAS_INFO[key];
    if (!info) return null;
    // 导出帧顺序是 +60° ?-60°，与转向 bank 符号相反，因此反向取帧?
    const t = clamp((1 - (Number(bank) || 0)) * 0.5, 0, 1);
    const index = Math.round(t * (CRAFT_BANK_FRAME_COUNT - 1));
    ensureCraftAtlasImg(key);
    const img = craftAtlasImgs[key] || null;
    if (!(img && img.width > 0)) return null;
    return {
      pack: null,
      img,
      index,
      info,
      cell: CRAFT_FRAME_CELL,
    };
  }

  let craftGlRenderer = null;
  let craftGlFailed = false;
  function craftGlShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "craft shader compile failed");
    }
    return shader;
  }
  function createCraftWebGlCanvas(width, height) {
    const w = Math.max(1, width | 0);
    const h = Math.max(1, height | 0);
    const attrs = { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: true };
    const tryGl = (canvas) => {
      if (!canvas) return null;
      try { canvas.width = w; canvas.height = h; } catch (e) {}
      const gl = canvas.getContext("webgl", attrs)
        || canvas.getContext("experimental-webgl", attrs);
      return gl ? { canvas, gl } : null;
    };
    if (typeof wx !== "undefined" && typeof wx.createOffscreenCanvas === "function") {
      try {
        const got = tryGl(wx.createOffscreenCanvas({ type: "webgl", width: w, height: h }));
        if (got) return got;
      } catch (e) {}
      try {
        const got = tryGl(wx.createOffscreenCanvas());
        if (got) return got;
      } catch (e) {}
    }
    // 真机常见：无 createOffscreenCanvas，但第二?createCanvas 可作离屏 WebGL?
    if (typeof wx !== "undefined" && typeof wx.createCanvas === "function") {
      try {
        const got = tryGl(wx.createCanvas());
        if (got) return got;
      } catch (e) {}
    }
    return null;
  }

  function ensureCraftGlRenderer() {
    // 仅在飞机 WebGL 开启时允许离屏调色回退?
    if (!USE_CRAFT_WEBGL && !USE_MAIN_WEBGL) {
      craftGlFailed = true;
      return null;
    }
    if (craftGlRenderer || craftGlFailed) return craftGlRenderer;
    try {
      const got = createCraftWebGlCanvas(128, 128);
      if (!got) throw new Error("webgl canvas unavailable");
      const { canvas, gl } = got;
      const vs = craftGlShader(gl, gl.VERTEX_SHADER, [
        "attribute vec2 aPos;",
        "attribute vec2 aUv;",
        "varying vec2 vUv;",
        "void main(){ gl_Position=vec4(aPos,0.0,1.0); vUv=aUv; }",
      ].join("\n"));
      const fs = craftGlShader(gl, gl.FRAGMENT_SHADER, [
        "precision mediump float;",
        "uniform sampler2D uTex;",
        "uniform vec4 uUvRect;",
        "uniform vec3 uTint;",
        "uniform float uStrength;",
        "varying vec2 vUv;",
        "void main(){",
        "  vec4 p=texture2D(uTex,uUvRect.xy+vUv*uUvRect.zw);",
        "  float lum=dot(p.rgb,vec3(0.2126,0.7152,0.0722));",
        "  vec3 colored=uTint*clamp(lum*1.18,0.0,1.0);",
        "  gl_FragColor=vec4(mix(p.rgb,colored,uStrength),p.a);",
        "}",
      ].join("\n"));
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "craft shader link failed");
      }
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0,
         1, -1, 1, 0,
        -1,  1, 0, 1,
         1,  1, 1, 1,
      ]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program, "aPos");
      const uv = gl.getAttribLocation(program, "aUv");
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, "uTex"), 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.viewport(0, 0, 128, 128);
      craftGlRenderer = {
        canvas, gl, texture,
        uvRect: gl.getUniformLocation(program, "uUvRect"),
        tint: gl.getUniformLocation(program, "uTint"),
        strength: gl.getUniformLocation(program, "uStrength"),
        atlas: null,
      };
      return craftGlRenderer;
    } catch (e) {
      craftGlFailed = true;
      try { console.warn("[craftWebGL] disabled", e && e.message); } catch (err) {}
      return null;
    }
  }
  function renderCraftGlFrame(frame) {
    const renderer = ensureCraftGlRenderer();
    if (!renderer || !frame || !frame.img) return null;
    try {
      const { gl } = renderer;
      if (renderer.atlas !== frame.img) {
        gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.img);
        renderer.atlas = frame.img;
      }
      const col = frame.index % frame.info.cols;
      const row = Math.floor(frame.index / frame.info.cols);
      gl.uniform4f(
        renderer.uvRect,
        col / frame.info.cols,
        1 - (row + 1) / frame.info.rows,
        1 / frame.info.cols,
        1 / frame.info.rows
      );
      gl.uniform3f(renderer.tint, 1, 1, 1);
      gl.uniform1f(renderer.strength, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.flush();
      return renderer.canvas;
    } catch (e) {
      craftGlFailed = true;
      craftGlRenderer = null;
      try { console.error("[craftWebGL] render failed", e && e.message); } catch (err) {}
      return null;
    }
  }

  // 启动预热全部机型图集，避免进局后首帧无图只剩矢?空白?
  try {
    for (let i = 0; i < PLAYER_CRAFT_KEYS.length; i++) ensureCraftAtlasImg(PLAYER_CRAFT_KEYS[i]);
  } catch (e) {}

  let worldCraftBatchActive = false;
  // 飞机 WebGL 批绘已关闭；保留开关便于以后再开，默认永久禁用?
  let craftWebGlBatchDisabled = true;
  let craftWebGlBatchProbed = true;
  // 导弹画中画与主战场共?WebGL，但不能把姓?护盾?Canvas 覆盖物画到主 HUD?
  let suppressWorldCanvasOverlay = false;
  const worldCraftQueue = [];
  const worldCraftTrailVertices = [];

  function canUseCraftWebGlBatch(world) {
    if (craftWebGlBatchDisabled || !USE_CRAFT_WEBGL || !world) return false;
    try {
      const st = typeof world.status === "function" ? world.status() : null;
      if (st && st.state === "failed") {
        craftWebGlBatchDisabled = true;
        return false;
      }
      const backend = typeof world.getGlBackend === "function"
        ? world.getGlBackend()
        : (st && st.backend) || "";
      // 二次 createCanvas ?WebGL 在不少机型上能画?FBO，但 drawImage ?2D 是空白?
      if (backend === "canvas2") {
        craftWebGlBatchDisabled = true;
        return false;
      }
    } catch (e) {}
    return true;
  }

  function probeCraftWebGlPixels(world, queue) {
    if (craftWebGlBatchProbed || !world || !world.gl || !queue || !queue.length) return true;
    craftWebGlBatchProbed = true;
    try {
      const gl = world.gl;
      if (typeof gl.readPixels !== "function") return true;
      try { gl.flush(); } catch (e) {}
      const item = queue[0];
      const sx = Math.max(0, Math.min(world.width - 1, (item.p.x * dpr) | 0));
      const syTop = Math.max(0, Math.min(world.height - 1, (item.p.y * dpr) | 0));
      const sy = world.height - 1 - syTop;
      const pixels = new Uint8Array(4);
      gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if ((pixels[3] | 0) < 8) {
        craftWebGlBatchDisabled = true;
        try { console.warn("[craftWebGL] batch blank, fallback canvas"); } catch (e) {}
        return false;
      }
      return true;
    } catch (e) {
      craftWebGlBatchDisabled = true;
      return false;
    }
  }

  function drawQueuedCraftCanvas(item) {
    let ok = false;
    try {
      ctx.save();
      ctx.translate(item.p.x, item.p.y);
      ctx.rotate(item.heading + Math.PI / 2);
      ctx.scale(SHIP_DRAW_SCALE, SHIP_DRAW_SCALE);
      paintTint = null;
      paintTintStrong = false;
      [paintChar, paintGlow] = empPaintOf(item.player);
      ok = drawCraftSkinBody(item.player, item.visual, item.skin);
  // 客户端对铁陨石做与网页服同款的硬碰分离，避免穿模
      if (!ok) {
        const skin = item.skin;
        const pending = USE_CRAFT_ATLAS && skin && !craftAtlasFailed[String(skin)] && !craftAtlasIsReady(skin);
        if (!pending) drawFighterBody(item.player, item.visual);
      }
      ok = true;
      paintChar = paintGlow = 0;
      ctx.restore();
    } catch (e) {
      paintChar = paintGlow = 0;
      try { ctx.restore(); } catch (err) {}
      try {
        drawPlayerSimple(item.player, item.p, item.heading);
        ok = true;
      } catch (err) {
        ok = false;
      }
    }
    return ok;
  }
  function queueWorldCraftTrail(trail, camera) {
    if (!trail || trail.length < 2) return;
    if (!trail.some((point) => point.blue)) {
      const last = [-1, -1];
      for (let i = 0; i < trail.length; i++) {
        const point = trail[i];
        const jet = point.jet ? 1 : 0;
        const prevI = last[jet];
        last[jet] = i;
        if (prevI < 0) continue;
        const prev = trail[prevI];
        const u = 1 - point.age / Math.max(point.life, 0.001);
        if (u <= 0.02) continue;
        const a = screen(prev.x, prev.y, camera);
        const b = screen(point.x, point.y, camera);
        const alpha = u * (0.42 + point.power * 0.75);
        const width = (0.7 + u * (0.65 + point.power * 3)) * (point.scale || 1) * 0.5;
        glColorSegment(worldCraftTrailVertices, a.x, a.y, b.x, b.y, width,
          [1, (60 + u * 120) / 255, (40 + u * 60) / 255, alpha]);
      }
      return;
    }
    for (let jet = 0; jet < 2; jet++) {
      const points = [];
      for (let i = 0; i < trail.length; i++) {
        const point = trail[i];
        if (!point.blue || (point.jet ? 1 : 0) !== jet) continue;
        const u = clamp(1 - point.age / Math.max(point.life, 0.001), 0, 1);
        if (u <= 0.015) continue;
        const p = screen(point.x, point.y, camera);
        points.push({ x: p.x, y: p.y, u, power: point.power || 0 });
      }
      if (points.length < 2) continue;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const widthA = (1.1 + a.power * 2.5) * Math.pow(a.u, 0.72) * 0.5;
        const widthB = (1.1 + b.power * 2.5) * Math.pow(b.u, 0.72) * 0.5;
        glColorSegmentGradient(
          worldCraftTrailVertices, a.x, a.y, b.x, b.y,
          widthA * 2.45, widthB * 2.45,
          [0.05, 0.25, 1, 0.08 + a.u * 0.3],
          [0.05, 0.25, 1, 0.08 + b.u * 0.3]
        );
        glColorSegmentGradient(
          worldCraftTrailVertices, a.x, a.y, b.x, b.y,
          Math.max(0.6, widthA * 0.62), Math.max(0.6, widthB * 0.62),
          [0.62, 0.94, 1, 0.22 + a.u * 0.66],
          [0.62, 0.94, 1, 0.22 + b.u * 0.66]
        );
      }
      const newest = points[points.length - 1];
      const oldest = points[0];
      const dx = oldest.x - newest.x;
      const dy = oldest.y - newest.y;
      const length = Math.hypot(dx, dy) || 1;
      const power = newest.power;
      const baseWidth = (1.35 + power * 2.25) * (2 / 3);
      const rings = [0.22, 0.4, 0.58, 0.76];
      const flameAngle = Math.atan2(dy, dx);
      for (let i = 0; i < rings.length; i++) {
        const f = rings[i];
        const cx = newest.x + dx * f;
        const cy = newest.y + dy * f;
        const cross = baseWidth * Math.pow(1 - f, 0.65) * 0.82;
        const along = Math.min(2.2 + power * 1.15, length * 0.08);
        const alpha = (0.62 - i * 0.1) * (0.55 + power * 0.45);
        glColorEllipse(worldCraftTrailVertices, cx, cy, along * 1.35, cross * 1.35,
          flameAngle, [0.08, 0.36, 1, alpha * 0.35], 14);
        glColorEllipse(worldCraftTrailVertices, cx, cy, along, cross * 0.62,
          flameAngle, [0.58, 0.92, 1, alpha * 0.8], 14);
      }
    }
  }

  function queueWorldCraft(player, visual, skin, frame, p, heading) {
    const drawSize = craftSkinDrawSize(skin) * SHIP_DRAW_SCALE * dpr;
    worldCraftQueue.push({
      player,
      visual,
      skin,
      frame,
      p: { x: p.x, y: p.y },
      heading,
      sprite: {
        x: p.x * dpr,
        y: p.y * dpr,
        w: drawSize,
        h: drawSize,
        rotation: heading + Math.PI / 2,
        frame: frame.index,
        tint: [1, 1, 1],
        strength: 0,
      },
    });
  }

  function drawQueuedCraftExtras(item, camera) {
    if (!hudCanvasLive || suppressWorldCanvasOverlay) return;
    if (USE_MAIN_WEBGL && pipScreenSpan > 0) return;
    const player = item.player;
    if (player.id === myId && !player.blade) {
      ctx.save();
      try {
        ctx.translate(item.p.x, item.p.y);
        ctx.rotate(item.heading + Math.PI / 2);
        ctx.scale(SHIP_DRAW_SCALE * 0.8, SHIP_DRAW_SCALE * 0.8);
        drawBellyGun(player, { x: (item.visual.bank || 0) * 0.18, y: -1.6 });
      } catch (e) {
      } finally {
        ctx.restore();
      }
    }
    try { drawPlayerShield(player, camera, performance.now()); } catch (e) {}
    try { drawLabel(player, item.p); } catch (e) {}
  }

  // 共享世界批次异常时，飞机仍由独立 WebGL 着色器绘制；不回退?Canvas 图集着色?
  function drawQueuedCraftStandaloneWebGl(item) {
    const glFrame = renderCraftGlFrame(item.frame);
    if (!glFrame) return false;
    const size = craftSkinDrawSize(item.skin);
    ctx.save();
    try {
      ctx.translate(item.p.x, item.p.y);
      ctx.rotate(item.heading + Math.PI / 2);
      ctx.scale(SHIP_DRAW_SCALE, SHIP_DRAW_SCALE);
      ctx.drawImage(
        glFrame,
        -size / 2, -size / 2,
        size, size
      );
      return true;
    } catch (e) {
      try { console.error("[craftWebGL] compose failed", e && e.message); } catch (err) {}
      return false;
    } finally {
      ctx.restore();
    }
  }

  function flushWorldCraftBatch(camera) {
    if (!worldCraftQueue.length && !worldCraftTrailVertices.length) return;
    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    const pipOnly = suppressWorldCanvasOverlay || pipScreenSpan > 0;
    let composed = false;
    // 画中画必须用主屏分辨率的 FBO（场景已 begin）；beginFrame(W*dpr) ?sceneActive 时是 no-op?
    // backend 要等 beginFrame/init 后才准，因此先开帧再决定是否信任?
    if (!craftWebGlBatchDisabled && USE_CRAFT_WEBGL && world && world.beginFrame(W * dpr, H * dpr)) {
      if (!canUseCraftWebGlBatch(world)) {
        try { world.endFrame(); } catch (e) {}
      } else {
        try {
          // 仅飞机叠加层：透明清屏，再合成?2D 世界上，避免整屏黑底盖住地图?
          if (!world.sceneActive && world.gl) {
            world.gl.clearColor(0, 0, 0, 0);
            world.gl.clear(world.gl.COLOR_BUFFER_BIT);
          }
          // 合成发生?beginWorldView 内，ctx 已带 VIEW_SCALE?
          // WebGL 再乘一次会双重缩放，飞机相对姓?尾焰往外飘?
          world.setViewScale(1);
          world.setCoordinateScale(1);
          let drewAll = true;
          if (worldCraftTrailVertices.length && !world.drawColorTriangles(worldCraftTrailVertices, true)) drewAll = false;
          const groups = new Map();
          for (let i = 0; i < worldCraftQueue.length; i++) {
            const item = worldCraftQueue[i];
            const image = item.frame && (item.frame.img || (item.frame.pack && item.frame.pack.img));
            if (!image || !(image.width > 0)) {
              drewAll = false;
              continue;
            }
            let group = groups.get(item.skin);
            if (!group) {
              group = { image, info: item.frame.info, sprites: [] };
              groups.set(item.skin, group);
            }
            group.sprites.push(item.sprite);
          }
          groups.forEach((group, skin) => {
            if (!group.sprites.length) return;
            if (!world.drawSprites("craft:" + skin, group.image, group.sprites, group.info)) drewAll = false;
          });
          // 首帧读像素：FBO 仍全透明则永久禁用批绘，避免“合成成功但飞机消失”?
          if (drewAll && worldCraftQueue.length && !probeCraftWebGlPixels(world, worldCraftQueue)) {
            drewAll = false;
          }
          const layer = world.endFrame();
          if (drewAll && layer) composed = compositeWebGlLayer(world, layer);
        } catch (e) {
          craftWebGlBatchDisabled = true;
          try { console.error("[webgl pass] crafts", e && e.message); } catch (err) {}
        }
      }
    } else if (world) {
      // beginFrame 失败（含永久 FAILED）时改走 Canvas，避免每帧空排队?
      try {
        const st = typeof world.status === "function" ? world.status() : null;
        if (st && st.state === "failed") craftWebGlBatchDisabled = true;
      } catch (e) {}
    }
    // 特写镜头禁止 Canvas 回退，否则会?600 坐标污染?HUD?
    // 批绘失败一律走 2D 图集/矢量，不再经单机 WebGL 调色（部分机型同样会合成空白）?
    if (!composed && worldCraftQueue.length && !pipOnly) {
      for (let i = 0; i < worldCraftQueue.length; i++) {
        drawQueuedCraftCanvas(worldCraftQueue[i]);
      }
    }
    // 无论批绘或回退，姓?护盾/腹炮都补画在 2D 上?
    if (!pipOnly) {
      for (let i = 0; i < worldCraftQueue.length; i++) drawQueuedCraftExtras(worldCraftQueue[i], camera);
    }
    worldCraftQueue.length = 0;
    worldCraftTrailVertices.length = 0;
  }

  function isHostileCraft(player) {
    if (!player || player.blade) return false;
    if (player.id === myId) return false;
    let myT = normalizeTeamIndex(myTeam);
    if (localMatch) {
      const meCraft = localCrafts.find((c) => c && c.id === myId);
      if (meCraft) myT = normalizeTeamIndex(meCraft.team);
    } else {
      const meInfo = roster.get(myId);
      if (meInfo) myT = normalizeTeamIndex(meInfo.team);
    }
    const theirT = normalizeTeamIndex(player.team);
    if (myT != null && theirT != null) return myT !== theirT;
    return true;
  }
  function drawCraftSkinBody(player, visual, skin) {
    if (!USE_CRAFT_ATLAS) return false;
    const bank = (visual && visual.bank) || 0;
    const frame = craftBankFrame(skin, bank);
    if (!frame || !frame.info) return false;
    // 只信?wx.createImage 图集。离屏条带在部分真机 drawImage 到主画布会变空白?
    const img = (frame.img && frame.img.width > 0)
      ? frame.img
      : (craftAtlasImgs[String(skin || "")] || null);
    if (!img || !(img.width > 0)) return false;
    const size = craftSkinDrawSize(skin);
    const src = frame.info.frameSize || 128;
    const col = frame.index % frame.info.cols;
    const row = Math.floor(frame.index / frame.info.cols);
    const g = ctx;
    try {
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.drawImage(
        img,
        col * src, row * src, src, src,
        -size / 2, -size / 2, size, size
      );
    } catch (e) {
      return false;
    }
    if (player.id === myId && !player.blade) {
      g.save();
      g.scale(0.8, 0.8);
      drawBellyGun(player, { x: bank * 0.18, y: -1.6 });
      g.restore();
    }
    return true;
  }

  function craftSkinForPlayer(player) {
    if (!player) return DEFAULT_PLAYER_CRAFT;
    if (player.craftSkin) return normalizePlayerCraft(player.craftSkin);
    if (player.lo && player.lo.craft) return normalizePlayerCraft(player.lo.craft);
    if (player.id === myId) {
      if (trainLoadout && trainLoadout.craft) return normalizePlayerCraft(trainLoadout.craft);
      return getMyLoadout().craft;
    }
    if (localMatch) {
      const local = localCrafts.find((craft) => craft && craft.id === player.id);
      if (local && local.lo && local.lo.craft) return normalizePlayerCraft(local.lo.craft);
    }
    const info = roster.get(player.id);
    return info && info.craft ? normalizePlayerCraft(info.craft) : DEFAULT_PLAYER_CRAFT;
  }

  // —?机体精灵（运行时从矢量烤出）；保障：?false 或烘焙失??立刻回原矢量 —?
  // 真机离屏常烤成黑块，默认关闭；要试再 GameGlobal.setCraftSprites(true)
  let USE_CRAFT_SPRITES = false;
  const CRAFT_SPRITE_BANKS = [-0.65, 0, 0.65];
  const CRAFT_BAKE_SIZE = 160;
  const CRAFT_BAKE_SCALE = 2;
  const craftSpriteSheets = {
    single: [null, null, null],
    twin: [null, null, null],
    ready: false,
    failed: false,
    tintBuf: null,
  };
  try {
    GameGlobal.setCraftSprites = (on) => {
      USE_CRAFT_SPRITES = !!on;
      if (USE_CRAFT_SPRITES && !craftSpriteSheets.ready && !craftSpriteSheets.failed) ensureCraftSprites();
    };
    GameGlobal.craftSpritesEnabled = () => !!(USE_CRAFT_SPRITES && craftSpriteSheets.ready);
  } catch (e) {}

  function visualFor(player) {
    if (!playerVisuals.has(player.id)) {
      playerVisuals.set(player.id, { heading: player.heading, bank: 0, span: 1.14, trail: [], tailPose: 0, prevThr: 0, smokeAcc: 0, fireAcc: 0 });
    }
    return playerVisuals.get(player.id);
  }

  let paintTint = null; // {r,g,b} 阵营/机体染色
  let paintTintStrong = false; // 开房阵营战时加强主题色
  function craftTeamColor(player) {
    if (!player) return "#3ddc84";
    if (player.blade) return "#3ddc84";
    // 名字/血条：敌机红、队友（含自己）绿；机身图集保持原色?
    return isHostileCraft(player) ? "#ff4d4d" : "#3ddc84";
  }
  function metal(k, shade, a) {
    let r = Math.min(255, (16 + k * 78) * shade);
    let g = Math.min(255, (24 + k * 92) * shade);
    let b = Math.min(255, (38 + k * 118) * shade);
    if (paintTint) {
      // 开房阵营：主题色更明显；大房间保留轻染以免糊成一?
      const base = paintTintStrong ? 0.58 : 0.22;
      const amt = base + (1 - shade) * (paintTintStrong ? 0.16 : 0.1);
      r = r * (1 - amt) + paintTint.r * amt;
      g = g * (1 - amt) + paintTint.g * amt;
      b = b * (1 - amt) + paintTint.b * amt;
    }
    return a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }

  function bezierPt(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return {
      x: p0.x * u * u * u + p1.x * 3 * u * u * t + p2.x * 3 * u * t * t + p3.x * t * t * t,
      y: p0.y * u * u * u + p1.y * 3 * u * u * t + p2.y * 3 * u * t * t + p3.y * t * t * t,
    };
  }

  // 电磁瘫痪机身染色：paintChar 压向深蓝，paintGlow 提亮（只影响 rgb()/rgba() 颜色串）
  let paintChar = 0;
  let paintGlow = 0;
  function charCol(color) {
    if (!(paintChar > 0 || paintGlow > 0) || typeof color !== "string") return color;
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
    if (!m) return color;
    const c = paintChar * 0.88;
    let r = +m[1] * (1 - c) + 14 * c;
    let g = +m[2] * (1 - c) + 32 * c;
    let b = +m[3] * (1 - c) + 92 * c;
    const w = paintGlow * 0.75;
    r = r * (1 - w) + 190 * w;
    g = g * (1 - w) + 236 * w;
    b = b * (1 - w) + 255 * w;
    return m[4] != null ? `rgba(${r | 0},${g | 0},${b | 0},${m[4]})` : `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function fillPoly(pts, color) {
    if (!pts || !pts.length || !pts[0]) return;
    const g = paintCtx || ctx;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillStyle = charCol(color);
    g.fill();
  }

  function strokePoly(pts, color, width) {
    if (!pts || !pts.length || !pts[0]) return;
    const g = paintCtx || ctx;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokeStyle = charCol(color);
    g.lineWidth = width;
    g.stroke();
  }

  function rotOff(ox, oy, px, py, ang) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return { x: ox + px * c - py * s, y: oy + px * s + py * c };
  }

  // 复用点列，避免烟?火焰每帧大量临时对象触发 GC（调用方需同步消费，勿跨帧存引用）
  const ELLIPSE_PTS_POOL = [];
  function ellipsePts(cx, cy, rx, ry, rot, n) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    let pts = ELLIPSE_PTS_POOL[n];
    if (!pts || pts.length !== n) {
      pts = new Array(n);
      for (let i = 0; i < n; i++) pts[i] = { x: 0, y: 0 };
      ELLIPSE_PTS_POOL[n] = pts;
    }
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const lx = Math.cos(t) * rx;
      const ly = Math.sin(t) * ry;
      const p = pts[i];
      p.x = cx + lx * c - ly * s;
      p.y = cy + lx * s + ly * c;
    }
    return pts;
  }

  /**
   * 尾焰喷口几何：贴机尾中线；半距供双引擎左右喷口?
   * 是否双焰不由机型决定，由当前引擎档（spdTier>=2）决定?
   */
  function craftTrailNozzles(skin, bank) {
    const b = clamp(Number(bank) || 0, -1, 1);
    const s = SHIP_DRAW_SCALE;
    const key = String(skin || "");
    // 压坡时略收一点，避免外甩
    const bankSqueeze = Math.max(0.72, Math.cos(b * Math.PI / 3));
    // 一根细尾焰宽度（局部单位）；左右各外移半根 ?间距多出一根焰?
    const plumeHalf = 1.2;
    let driftLocal = 0;
    let halfLocal = (1.55 + plumeHalf) * bankSqueeze;
    let tailLocal = 18;
    if (key === "jgi") {
      // ?atlas 已轴对齐，不再大幅横移；机身放大后喷口同?
      const mul = craftSkinDrawMul("jgi");
      driftLocal = -0.25 * b * mul;
      halfLocal = (1.65 + plumeHalf) * bankSqueeze * mul;
      tailLocal = 21 * mul;
    } else if (key === "jci") {
      driftLocal = -0.15 * b;
      halfLocal = (1.55 + plumeHalf) * bankSqueeze;
      tailLocal = 18;
    } else if (key === "fbx") {
      driftLocal = -0.2 * b;
      halfLocal = (1.75 + plumeHalf) * bankSqueeze;
      tailLocal = 22;
    } else {
      halfLocal = (1.5 + plumeHalf) * bankSqueeze;
      tailLocal = 18;
    }
    return {
      drift: driftLocal * s,
      half: halfLocal * s,
      tail: tailLocal * s,
    };
  }

  function updatePlayerVisual(player, dt) {
    const visual = visualFor(player);
    if (player.respawn > 0) {
      visual.trail.length = 0;
      return;
    }
    const dh = angleDelta(player.heading, visual.heading);
    visual.heading = player.heading;
    const maxTurnRate = craftTurnRate(player.spd || 0);
    const turn = dt > 0 ? clamp((dh / dt) / maxTurnRate, -1, 1) : 0;
    // 帧图集飞机：转入灵敏，回正约 0.4 秒（在原 0.6 基础上再?50%）?
    const bankNeutral = Math.abs(turn) < 0.08;
    const bankRate = bankNeutral ? 5.7 : 5;
    visual.bank = approach(visual.bank, bankNeutral ? 0 : turn, bankRate, dt);
    const power = player.throttle || 0;
    visual.span = approach(visual.span, player.brake ? 1.18 : 1.1, 4, dt);
    const dthr = power - visual.prevThr;
    let tailT = 0;
    if (player.brake) tailT = -1;
    else if (keys.up && player.id === myId) tailT = 1;
    else if (dthr < -0.0015) tailT = -0.55;
    else if (dthr > 0.0015) tailT = 0.55;
    visual.tailPose += (tailT - visual.tailPose) * (1 - Math.exp(-9 * dt));
    visual.prevThr = power;

    const cs = Math.cos(player.heading);
    const sn = Math.sin(player.heading);
    // 用机体真实速度（本地预?/ 状?vx,vy / heading×spd），避免插值位移抖出假速度?
    let vx;
    let vy;
    if (player.id === myId && pred) {
      vx = pred.vx;
      vy = pred.vy;
    } else if (Number.isFinite(player.vx) && Number.isFinite(player.vy)) {
      vx = player.vx;
      vy = player.vy;
    } else {
      const spd = player.spd || 0;
      vx = cs * spd;
      vy = sn * spd;
    }
    const trail = visual.trail;
    let tw = 0;
    for (let ti = 0; ti < trail.length; ti++) {
      const point = trail[ti];
      point.age += dt;
      point.x += point.vx * dt;
      point.y += point.vy * dt;
      if (point.age < point.life) trail[tw++] = point;
      else trailPointPool.release(point);
    }
    trail.length = tw;
    // 低端关掉昂贵蓝焰链，改回普通尾焰（?60 帧路径同款成本）?
    const skin = craftSkinForPlayer(player);
    const blueTestCraft = !PERF_LITE && skin === "fbx";
    // 喷流相对机尾向后；粒子继承完整机体速度，尾焰才贴机?
    // 长度相对旧版减半：只砍一次存活时间（勿再叠乘 0.5，否则短到看不见）?
    // 粗细保持减半；长度在减半基础上再加倍（≈原先一半粗、原长短?
    const fex = blueTestCraft ? 19 + power * 199 : 47 + power * 140;
    const fvx = vx - cs * fex;
    const fvy = vy - sn * fex;
    const life = blueTestCraft
      ? 0.08
      : Math.max(0.1, (0.093 + power * 0.22) * 0.5);
    const sc = (1 + power * 1.25) * 0.85 * CONTENT_SCALE * (SHIP_DRAW_SCALE / 0.8) * (blueTestCraft ? 0.85 : 1) * 0.5;
    // 图集压坡帧的喷口位置（含 JGI 模型轴不正导致的横移），换算到世界坐标?
    const nozzles = craftTrailNozzles(skin, visual.bank || 0);
    const rightX = -sn;
    const rightY = cs;
    // 单引擎必须单焰；仅双引擎（spdTier>=2）才左右双喷
    const twin = craftSpeedTier(player) >= 2;
    if (twin) {
      const pL = trailPointPool.take();
      pL.x = player.x + rightX * (nozzles.drift - nozzles.half) - cs * nozzles.tail;
      pL.y = player.y + rightY * (nozzles.drift - nozzles.half) - sn * nozzles.tail;
      pL.vx = fvx; pL.vy = fvy; pL.age = 0; pL.life = life; pL.power = power; pL.jet = 0; pL.scale = sc; pL.blue = blueTestCraft;
      trail.push(pL);
      const pR = trailPointPool.take();
      pR.x = player.x + rightX * (nozzles.drift + nozzles.half) - cs * nozzles.tail;
      pR.y = player.y + rightY * (nozzles.drift + nozzles.half) - sn * nozzles.tail;
      pR.vx = fvx; pR.vy = fvy; pR.age = 0; pR.life = life; pR.power = power; pR.jet = 1; pR.scale = sc; pR.blue = blueTestCraft;
      trail.push(pR);
      if (trail.length > 24) {
        const cut = trail.length - 24;
        for (let ti = 0; ti < cut; ti++) trailPointPool.release(trail[ti]);
        trail.splice(0, cut);
      }
    } else {
      // 单引擎：尾焰只从机尾中心喷（仍跟喷口横移?
      const p0 = trailPointPool.take();
      p0.x = player.x + rightX * nozzles.drift - cs * nozzles.tail;
      p0.y = player.y + rightY * nozzles.drift - sn * nozzles.tail;
      p0.vx = fvx; p0.vy = fvy; p0.age = 0; p0.life = life; p0.power = power; p0.jet = 0; p0.scale = sc; p0.blue = false;
      trail.push(p0);
      if (trail.length > 16) {
        const cut = trail.length - 16;
        for (let ti = 0; ti < cut; ti++) trailPointPool.release(trail[ti]);
        trail.splice(0, cut);
      }
    }
  }

  function drawPlayerSimple(player, p, heading) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(heading + Math.PI / 2);
    ctx.scale(SHIP_DRAW_SCALE, SHIP_DRAW_SCALE);
    ctx.beginPath();
    ctx.moveTo(0, -22.5);
    ctx.lineTo(17.5, 17.5);
    ctx.lineTo(0, 10);
    ctx.lineTo(-17.5, 17.5);
    ctx.closePath();
    ctx.fillStyle = craftTeamColor(player);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 复活无敌：看到某架飞机从"等复?变回存活就开?3 秒倒计时（开房与本地共用，只用于显示?
  function spawnGuardLeft(player, now) {
    let g = spawnGuardSeen.get(player.id);
    // 服务器重生进度按 0.2s 取整，最?0.1s 会先?0；血量仍?0 就还没真正复?
    const dead = player.respawn > 0 || (player.hp != null && player.hp <= 0 && !player.blade);
    if (!g) {
      g = { dead, until: 0 };
      spawnGuardSeen.set(player.id, g);
    }
    if (g.dead && !dead) g.until = now + SPAWN_GUARD_MS;
    g.dead = dead;
    return Math.max(0, g.until - now);
  }
  function isSpawnGuarded(c) {
    const now = performance.now();
    if (now < (c.guardUntil || 0)) return true;
    const g = spawnGuardSeen.get(c.id);
    return !!(g && g.until > now);
  }

  function drawSpawnGuard(p, leftMs, now) {
    const u = clamp(leftMs / SPAWN_GUARD_MS, 0, 1);
    const fade = clamp(leftMs / 250, 0, 1);
    const R = 38;
    const pulse = 0.75 + 0.25 * Math.sin(now / 110);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = fade;
    ctx.fillStyle = `rgba(255,40,40,${0.1 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,60,60,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,50,50,${0.75 + 0.25 * pulse})`;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u);
    ctx.stroke();
    ctx.restore();
  }

  function bakeOneCraftSprite(twin, bank) {
    const size = CRAFT_BAKE_SIZE;
    const cnv = makeOffscreen(size, size);
    if (!cnv) return null;
    const g = cnv.getContext("2d");
    if (!g) return null;
    try { g.clearRect(0, 0, size, size); } catch (e) {}
    const prevPaint = paintCtx;
    const prevTint = paintTint;
    const prevStrong = paintTintStrong;
    const prevChar = paintChar;
    const prevGlow = paintGlow;
    paintCtx = g;
    paintTint = null;
    paintTintStrong = false;
    paintChar = 0;
    paintGlow = 0;
    try {
      g.save();
      g.translate(size / 2, size / 2);
      g.scale(CRAFT_BAKE_SCALE, CRAFT_BAKE_SCALE);
      // id≠myId ?blade：跳过机腹炮，只烤机?
      drawFighterBody(
        { id: -99991, throttle: 0.55, blade: true, spdTier: twin ? 2 : 1 },
        { bank, span: 1.14, tailPose: 0 }
      );
      g.restore();
    } catch (err) {
      paintCtx = prevPaint;
      paintTint = prevTint;
      paintTintStrong = prevStrong;
      paintChar = prevChar;
      paintGlow = prevGlow;
      return null;
    }
    paintCtx = prevPaint;
    paintTint = prevTint;
    paintTintStrong = prevStrong;
    paintChar = prevChar;
    paintGlow = prevGlow;
    return { img: cnv, size, scale: CRAFT_BAKE_SCALE };
  }

  function ensureCraftSprites() {
    if (!USE_CRAFT_SPRITES) return false;
    if (craftSpriteSheets.ready) return true;
    if (craftSpriteSheets.failed) return false;
    try {
      for (const twin of [false, true]) {
        const key = twin ? "twin" : "single";
        for (let bi = 0; bi < CRAFT_SPRITE_BANKS.length; bi++) {
          const spr = bakeOneCraftSprite(twin, CRAFT_SPRITE_BANKS[bi]);
          if (!spr || !spr.img) throw new Error("bake empty");
          craftSpriteSheets[key][bi] = spr;
        }
      }
      craftSpriteSheets.ready = true;
      try { console.log("[craft-sprite] baked ok"); } catch (e) {}
      return true;
    } catch (err) {
      craftSpriteSheets.failed = true;
      USE_CRAFT_SPRITES = false;
      try { console.warn("[craft-sprite] bake failed, fallback vector", err); } catch (e) {}
      return false;
    }
  }

  function pickCraftBankIndex(bank) {
    const b = Number(bank) || 0;
    if (b < -0.28) return 0;
    if (b > 0.28) return 2;
    return 1;
  }

  function ensureCraftTintBuf(size) {
    let buf = craftSpriteSheets.tintBuf;
    if (buf && buf._craftSize === size) return buf;
    buf = makeOffscreen(size, size);
    if (!buf) return null;
    buf._craftSize = size;
    craftSpriteSheets.tintBuf = buf;
    return buf;
  }

  /** 在已 translate/rotate/scale 的坐标系里贴机身精灵；失败返?false */
  function drawCraftSpriteBody(player, visual) {
    const twin = craftSpeedTier(player) >= 2;
    const bi = pickCraftBankIndex(visual && visual.bank);
    const spr = craftSpriteSheets[twin ? "twin" : "single"][bi];
    if (!spr || !spr.img) return false;
    const inv = 1 / spr.scale;
    const w = spr.size * inv;
    const h = spr.size * inv;
    // 真机上离?source-atop 易整架漆黑：只直贴，阵营色仍靠矢量回退/后续方案
    try {
      paintCtx.drawImage(spr.img, -w / 2, -h / 2, w, h);
    } catch (e) {
      return false;
    }
    if (player.id === myId && !player.blade) {
      drawBellyGun(player, { x: (visual.bank || 0) * 0.18, y: -1.6 });
    }
    return true;
  }

  function drawPlayer(player, camera) {
    if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) return;
    const heading = Number.isFinite(player.heading) ? player.heading : 0;
    const guardLeft = player.id != null ? spawnGuardLeft(player, performance.now()) : 0;
    const p = screen(player.x, player.y, camera);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const vis = viewPad(120);
    if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return;
    if (player.respawn > 0 || (player.hp != null && player.hp <= 0 && !player.blade)) return;
    // 仅主?WebGL 画中画需?Canvas?D 特写本身就在 clip 变换里画，姓名也要跟过去?
    const pipOnly = USE_MAIN_WEBGL && (suppressWorldCanvasOverlay || pipScreenSpan > 0);
    if (guardLeft > 0 && !pipOnly && hudCanvasLive) {
      try { drawSpawnGuard(p, guardLeft, performance.now()); } catch (e) {}
    }

    let deferredToWorld = false;
    try {
      const visual = visualFor(player);
      if (pipOnly) {
        const selectedCraftSkin = craftSkinForPlayer(player);
        if (selectedCraftSkin && worldCraftBatchActive) {
          const frame = craftBankFrame(selectedCraftSkin, visual.bank || 0);
          if (frame) queueWorldCraft(player, visual, selectedCraftSkin, frame, p, heading);
        }
        return;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(heading + Math.PI / 2);
      ctx.scale(SHIP_DRAW_SCALE, SHIP_DRAW_SCALE);
      paintTint = null;
      paintTintStrong = false;
      [paintChar, paintGlow] = empPaintOf(player);
      // Canvas 2D：每机一张原色图集；敌我只靠名字/血条颜色?
      let drew = false;
      const selectedCraftSkin = craftSkinForPlayer(player);
      if (selectedCraftSkin) {
        try { drew = drawCraftSkinBody(player, visual, selectedCraftSkin); } catch (e) { drew = false; }
      }
      if (!drew) {
        const pending = USE_CRAFT_ATLAS && selectedCraftSkin
          && !craftAtlasFailed[String(selectedCraftSkin)]
          && !craftAtlasIsReady(selectedCraftSkin);
        if (!pending) {
          try { drawFighterBody(player, visual); drew = true; } catch (e) { drew = false; }
        } else {
          drew = true; // 加载中先留空，等 loading / 下一帧图?
        }
      }
      if (!drew) {
        // 已在 translate/rotate/scale 内，本地坐标画保底三角?
        ctx.beginPath();
        ctx.moveTo(0, -22.5);
        ctx.lineTo(17.5, 17.5);
        ctx.lineTo(0, 10);
        ctx.lineTo(-17.5, 17.5);
        ctx.closePath();
        ctx.fillStyle = "#9aa3ad";
        ctx.fill();
      }
      paintChar = paintGlow = 0;
      ctx.restore();
    } catch (e) {
      paintChar = paintGlow = 0;
      try { ctx.restore(); } catch (err) {}
      if (!deferredToWorld && !pipOnly) drawPlayerSimple(player, p, heading);
    }
    if (deferredToWorld || pipOnly || !hudCanvasLive) return;
    try { drawPlayerShield(player, camera, performance.now()); } catch (e) {}
    try { drawLabel(player, p); } catch (e) {}
  }

  function drawFighterBody(player, visual) {
    const bank = visual.bank;
    const span = visual.span;
    const power = player.throttle || 0;
    const leftScale = span * (1 - Math.max(0, -bank) * 0.4);
    const rightScale = span * (1 - Math.max(0, bank) * 0.4);
    const kL = (255 - clamp(-bank, 0, 1) * 70) / 255;
    const kR = (205 - clamp(bank, 0, 1) * 60 + clamp(-bank, 0, 1) * 40) / 255;
    const flare = clamp(-visual.tailPose, 0, 1);
    const tuck = clamp(visual.tailPose, 0, 1);
    const flutter = Math.sin(performance.now() / 1000 * 18) * 0.09 * (0.18 + Math.abs(visual.tailPose));
    const notchY = 9;
    const tuckW = clamp((1.14 - span) / 0.21, 0, 1);
    const wingY = lerp(20, 23.25, tuckW);
    const nose = { x: 0, y: -30 * lerp(0.95, 1.1, power) };
    const lt = { x: -24 * leftScale, y: wingY };
    const rt = { x: 24 * rightScale, y: wingY };

    const twin = craftSpeedTier(player) >= 2;
    if (twin) {
    // 助战统一拦截
      for (const s of [-1, 1]) {
        const tL = s > 0 ? kR : kL;
        fillPoly([
          { x: s * 0.15, y: notchY - 0.4 },
          { x: s * 3.1, y: 11.6 },
          { x: s * 2.4, y: 15.2 },
          { x: s * 0.1, y: notchY + 2.6 },
        ], metal(tL, 0.72));
        paintCtx.beginPath();
        paintCtx.moveTo(s * 0.2, notchY + 0.6);
        paintCtx.lineTo(s * 2.8, 13.1);
        paintCtx.strokeStyle = charCol(`rgba(${(0.16 + tL * 0.55) * 255 | 0},${(0.27 + tL * 0.59) * 255 | 0},${(0.43 + tL * 0.57) * 255 | 0},0.85)`);
        paintCtx.lineWidth = 1.15;
        paintCtx.stroke();
      }
      // 双发尾喷?+ 矢量襟片
      for (const s of [-1, 1]) {
        const tw = 7.2 * (s > 0 ? rightScale : leftScale) * (1 + flare * 0.38 - tuck * 0.16);
        const tL = s > 0 ? kR : kL;
        const ox = s * 2.7;
        const oy = 13.1;
        const ang = s * (flare * 0.62 - tuck * 0.28 + flutter);
        const tip = [
          rotOff(ox, oy, -s * 1.6, -2.3, ang),
          rotOff(ox, oy, s * (tw - 1.4), -1.4, ang),
          rotOff(ox, oy, s * (tw * 0.86 - 1.4), 3.9, ang),
          rotOff(ox, oy, -s * 1.1, 3.4, ang),
        ];
        fillPoly(tip, metal(tL, 0.86, 0.78 + flare * 0.18));
        strokePoly(tip, `rgba(${(0.35 + tL * 0.47) * 255 | 0},${(0.55 + tL * 0.35) * 255 | 0},${(0.71 + tL * 0.27) * 255 | 0},0.55)`, 0.7);
      }
    } else {
      // 单引擎机舱（居中?
      {
        const tL = (kL + kR) * 0.5;
        fillPoly([
          { x: -2.8, y: notchY - 0.2 },
          { x: 2.8, y: notchY - 0.2 },
          { x: 3.4, y: 12.2 },
          { x: 2.6, y: 15.6 },
          { x: -2.6, y: 15.6 },
          { x: -3.4, y: 12.2 },
        ], metal(tL, 0.74));
        paintCtx.beginPath();
        paintCtx.moveTo(-2.2, notchY + 0.8);
        paintCtx.lineTo(-2.8, 13.4);
        paintCtx.moveTo(2.2, notchY + 0.8);
        paintCtx.lineTo(2.8, 13.4);
        paintCtx.strokeStyle = charCol(`rgba(${(0.16 + tL * 0.55) * 255 | 0},${(0.27 + tL * 0.59) * 255 | 0},${(0.43 + tL * 0.57) * 255 | 0},0.85)`);
        paintCtx.lineWidth = 1.15;
        paintCtx.stroke();
      }
      // 单引擎尾喷口 + 矢量襟片
      {
        const tw = 8.6 * ((leftScale + rightScale) * 0.5) * (1 + flare * 0.38 - tuck * 0.16);
        const tL = (kL + kR) * 0.5;
        const ox = 0;
        const oy = 13.4;
        const ang = flare * 0.35 - tuck * 0.18 + flutter * 0.5;
        const tip = [
          rotOff(ox, oy, -tw * 0.42, -2.1, ang),
          rotOff(ox, oy, tw * 0.42, -2.1, ang),
          rotOff(ox, oy, tw * 0.36, 4.1, ang),
          rotOff(ox, oy, -tw * 0.36, 4.1, ang),
        ];
        fillPoly(tip, metal(tL, 0.86, 0.78 + flare * 0.18));
        strokePoly(tip, `rgba(${(0.35 + tL * 0.47) * 255 | 0},${(0.55 + tL * 0.35) * 255 | 0},${(0.71 + tL * 0.27) * 255 | 0},0.55)`, 0.7);
        fillPoly(ellipsePts(ox, oy + 0.6, 2.1, 1.35, 0, 10), "rgba(8,14,22,0.85)");
        strokePoly(ellipsePts(ox, oy + 0.6, 2.1, 1.35, 0, 10), "rgba(120,200,255,0.35)", 0.55);
      }
    }

    const finTilt = bank * 3 + flutter * 1.2;
    const finLift = flare * 2.2 - tuck * 1.3;
    fillPoly([
      { x: -0.2, y: notchY - 2.6 },
      { x: finTilt, y: notchY - 2.6 + 1.6 - finLift },
      { x: finTilt, y: notchY + 1.4 + 0.4 - finLift * 0.45 },
      { x: -0.2, y: notchY + 1.4 },
    ], metal(0.72 + Math.abs(bank) * 0.2, 0.58));
    paintCtx.beginPath();
    paintCtx.moveTo(finTilt, notchY - 2.6 + 1.6 - finLift);
    paintCtx.lineTo(finTilt, notchY + 1.8 - finLift * 0.45);
    paintCtx.strokeStyle = charCol("rgba(120,209,255,0.55)");
    paintCtx.lineWidth = 0.5;
    paintCtx.stroke();

    fillPoly([nose, rt, { x: 0, y: notchY }], metal(kR, 0.52));
    fillPoly([nose, { x: 0, y: notchY }, lt], metal(kL, 0.6));

    const spine = [];
    for (let i = 0; i <= 10; i++) spine.push(bezierPt({ x: 0, y: -27 }, { x: 3.4, y: -8 }, { x: 3.6, y: 4 }, { x: 0, y: 11.2 }, i / 10));
    for (let i = 0; i <= 10; i++) spine.push(bezierPt({ x: 0, y: 11.2 }, { x: -3.6, y: 4 }, { x: -3.4, y: -8 }, { x: 0, y: -27 }, i / 10));
    fillPoly(spine, metal((kL + kR) * 0.5, 0.78));

    paintCtx.lineWidth = 0.65;
    paintCtx.beginPath(); paintCtx.moveTo(nose.x, nose.y); paintCtx.lineTo(lt.x * 0.9, lt.y * 0.9); paintCtx.strokeStyle = charCol("rgba(209,230,255,0.28)"); paintCtx.stroke();
    paintCtx.beginPath(); paintCtx.moveTo(nose.x, nose.y); paintCtx.lineTo(rt.x * 0.9, rt.y * 0.9); paintCtx.strokeStyle = charCol("rgba(150,191,230,0.18)"); paintCtx.stroke();
    paintCtx.strokeStyle = "rgba(5,10,15,0.5)";
    paintCtx.lineWidth = 0.5;
    paintCtx.beginPath(); paintCtx.moveTo(-3.2, -10); paintCtx.lineTo(lt.x * 0.52, lt.y * 0.5); paintCtx.stroke();
    paintCtx.beginPath(); paintCtx.moveTo(3.2, -10); paintCtx.lineTo(rt.x * 0.52, rt.y * 0.5); paintCtx.stroke();
    paintCtx.beginPath(); paintCtx.moveTo(-5.2, 2); paintCtx.lineTo(lt.x * 0.74, lt.y * 0.7); paintCtx.stroke();
    paintCtx.beginPath(); paintCtx.moveTo(5.2, 2); paintCtx.lineTo(rt.x * 0.74, rt.y * 0.7); paintCtx.stroke();
    paintCtx.beginPath(); paintCtx.moveTo(0, -22); paintCtx.lineTo(0, 8); paintCtx.stroke();
    strokePoly([nose, rt, { x: 0, y: notchY }, lt], "rgba(79,199,255,0.22)", 1.05);

    const gx = bank * 0.55;
    const gy = -9.4;
    fillPoly(ellipsePts(gx, gy, 2.55, 5.9, 0, 18), "rgba(31,71,102,0.78)");
    strokePoly(ellipsePts(gx, gy, 2.55, 5.9, 0, 18), "rgba(171,214,245,0.55)", 0.55);
    fillPoly(ellipsePts(gx - 0.75, gy - 1.7, 0.85, 2.35, -0.28, 8), "rgba(255,255,255,0.42)");
    fillPoly(ellipsePts(gx + 0.55, gy + 1.6, 1.05, 1.7, 0.2, 8), "rgba(20,41,61,0.28)");

    if (player.id === myId && !player.blade) drawBellyGun(player, { x: bank * 0.18, y: -1.6 });
  }

  function currentGunAim(player) {
    if (player.id === myId && Number.isFinite(gunStick.angle) && !subAimMode()) return gunStick.angle;
    if (player.id === myId) {
      const aim = cursorAim();
      if (Number.isFinite(aim)) return aim;
    }
    return player.heading;
  }

  function bellyAimLocal(player) {
    let aim = { x: 0, y: -1 };
    const gunAim = currentGunAim(player);
    const world = { x: Math.cos(gunAim) * 400, y: Math.sin(gunAim) * 400 };
    const rot = player.heading + Math.PI / 2;
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    const lx = world.x * c - world.y * s;
    const ly = world.x * s + world.y * c;
    const len = Math.hypot(lx, ly);
    if (len > 4) aim = { x: lx / len, y: ly / len };
    return { aim, rot };
  }

  function fighterBarrelWorld(player) {
    const visual = visualFor(player);
    const mount = { x: visual.bank * 0.18, y: -1.6 };
    const { aim, rot } = bellyAimLocal(player);
    const sc = SHIP_DRAW_SCALE;
    const localX = (mount.x + aim.x * BARREL_LEN) * sc;
    const localY = (mount.y + aim.y * BARREL_LEN) * sc;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    return {
      x: player.x + localX * ca - localY * sa,
      y: player.y + localX * sa + localY * ca,
      dirX: aim.x * ca - aim.y * sa,
      dirY: aim.x * sa + aim.y * ca,
    };
  }

  const SHIP_LEN_WORLD = 53 * SHIP_DRAW_SCALE;
  // 只在开火时显示开火方向环（停火后 200ms 内淡出）
  function drawGunSight(me, camera, now) {
    if (localLevelMode && levelRunCol === 3) return;
    if (localLevelMode && levelRunCol === 5 && satInteractActive()) return;
    if (!me || me.respawn > 0 || !Number.isFinite(me.x)) return;
    if (trainW.subAiming && subAimMode()) {
      const emp = trainLoadout.sub === "emp";
      const ready = emp
        ? (trainW.empAmmo >= 1 && trainW.empFireCd <= 0)
        : trainW.laserCd <= 0;
      const color = emp ? (ready ? "#6ecbff" : "#4d6a80") : (ready ? "#ff4d6d" : "#8a5560");
      drawFireDirRing(me, { dirX: Math.cos(trainW.subAim), dirY: Math.sin(trainW.subAim) }, camera, color);
      return;
    }
    // 按住开火期间常亮（加农炮两发之间也不消失）；松手后按最后一发淡?
    const k = gunHeld() ? 1 : barrelExtOf(me);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    drawFireDirRing(me, fighterBarrelWorld(me), camera);
    ctx.restore();
  }

  // 飞机外圈虚线?+ 环上小箭头指向开火方?
  function drawFireDirRing(me, b, camera, arrowColor) {
    const c = screen(me.x, me.y, camera);
    const R = SHIP_LEN_WORLD * 0.85;
    const e = screen(me.x + R, me.y, camera);
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    if (!Number.isFinite(r) || r < 4) return;
    const ang = Math.atan2(b.dirY, b.dirX);
    ctx.save();
    ctx.translate(c.x, c.y);
    // 手绘虚线，避免依?setLineDash
    const seg = 28;
    const dashFrac = 0.55;
    const ring = (color, w) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2 / seg) * dashFrac;
        ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
        ctx.arc(0, 0, r, a0, a1);
      }
      ctx.stroke();
    };
    ring("rgba(0,0,0,0.35)", 2.4);
    ring("rgba(255,255,255,0.55)", 1.1);
    ctx.rotate(ang);
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(r + s * 1.1, 0);
    ctx.lineTo(r - s * 0.5, -s * 0.8);
    ctx.lineTo(r - s * 0.15, 0);
    ctx.lineTo(r - s * 0.5, s * 0.8);
    ctx.closePath();
    ctx.fillStyle = arrowColor || "#78ff5a";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawGunFlame(tip, aim, size, k) {
    const ang = Math.atan2(aim.y, aim.x);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const xf = (px, py) => ({ x: tip.x + px * ca - py * sa, y: tip.y + px * sa + py * ca });
    fillPoly([
      xf(size * 1.25, 0), xf(size * 0.35, -size * 0.62), xf(-size * 0.35, -size * 0.3),
      xf(-size * 0.1, 0), xf(-size * 0.35, size * 0.3), xf(size * 0.35, size * 0.62),
    ], `rgba(255,120,36,${0.55 + 0.35 * k})`);
    fillPoly([
      xf(size * 0.8, 0), xf(size * 0.15, -size * 0.34), xf(-size * 0.18, -size * 0.14),
      xf(-size * 0.02, 0), xf(-size * 0.18, size * 0.14), xf(size * 0.15, size * 0.34),
    ], `rgba(255,240,160,${0.65 + 0.35 * k})`);
    const core = xf(size * 0.1, 0);
    ctx.fillStyle = "rgba(255,252,242,0.92)";
    ctx.beginPath();
    ctx.arc(core.x, core.y, Math.max(0.35, size * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }

    // 左右燃料舱：侧向剥离 + 相对航迹减速后漂
  const GAT_BARREL_OFF = 1.5;
  function drawGatlingBarrels(player, mount, aim, root, tip) {
    const ux = -aim.y;
    const uy = aim.x;
    for (const s of [-1, 1]) {
      const ox = ux * GAT_BARREL_OFF * s;
      const oy = uy * GAT_BARREL_OFF * s;
      const r0 = { x: root.x + ox, y: root.y + oy };
      const t0 = { x: tip.x + ox, y: tip.y + oy };
      const barrel = [
        { x: r0.x + ux * 0.62, y: r0.y + uy * 0.62 },
        { x: r0.x - ux * 0.62, y: r0.y - uy * 0.62 },
        { x: t0.x - ux * 0.46, y: t0.y - uy * 0.46 },
        { x: t0.x + ux * 0.46, y: t0.y + uy * 0.46 },
      ];
      fillPoly(barrel, "#e8ecf0");
      strokePoly(barrel, "rgba(248,250,252,0.9)", 0.45);
      ctx.fillStyle = "#9aa3ab";
      ctx.beginPath();
      ctx.arc(t0.x, t0.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c1e20";
      ctx.beginPath();
      ctx.arc(t0.x, t0.y, 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    // 两道箍环把双管夹在一起；转动时箍环上的亮条来回闪
    const spin = trainW.gatSpin;
    const turn = (performance.now() / 1000) * (2 + spin * 40);
    for (const at of [0.38, 0.72]) {
      const cx = root.x + (tip.x - root.x) * at;
      const cy = root.y + (tip.y - root.y) * at;
      const w = GAT_BARREL_OFF + 1.0;
      const band = [
        { x: cx + ux * w - aim.x * 0.55, y: cy + uy * w - aim.y * 0.55 },
        { x: cx - ux * w - aim.x * 0.55, y: cy - uy * w - aim.y * 0.55 },
        { x: cx - ux * w + aim.x * 0.55, y: cy - uy * w + aim.y * 0.55 },
        { x: cx + ux * w + aim.x * 0.55, y: cy + uy * w + aim.y * 0.55 },
      ];
      fillPoly(band, "#8e979f");
      const shine = Math.sin(turn + at * 7) * w * 0.8;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(cx + ux * shine, cy + uy * shine, 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#d5dbe2";
    ctx.fillRect(mount.x - 1.6, mount.y - 0.9, 3.2, 2.8);
    const now = performance.now();
    if (now < muzzleFlash.until) {
      const k = clamp((muzzleFlash.until - now) / 45, 0, 1);
      const size = muzzleFlash.size * (0.55 + 0.45 * k) / 1.6;
      const s = trainW.gatSide;
      const ft = { x: tip.x + ux * GAT_BARREL_OFF * s, y: tip.y + uy * GAT_BARREL_OFF * s };
      ctx.globalCompositeOperation = "lighter";
      drawGunFlame(ft, aim, size * 0.8, k);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawBellyGun(player, mount) {
    const { aim } = bellyAimLocal(player);
    fillPoly(ellipsePts(mount.x, mount.y, 2.9, 2.2, 0, 10), "#c5ccd3");
    strokePoly(ellipsePts(mount.x, mount.y, 2.9, 2.2, 0, 10), "rgba(242,245,248,0.95)", 0.75);
    fillPoly(ellipsePts(mount.x, mount.y + 0.15, 1.8, 1.4, 0, 8), "#e4e8ed");
    const perp = { x: -aim.y * 1.15, y: aim.x * 1.15 };
    const root = { x: mount.x + aim.x * 1.2, y: mount.y + aim.y * 1.2 };
    const tip = { x: mount.x + aim.x * BARREL_LEN, y: mount.y + aim.y * BARREL_LEN };
    if (player.id === myId && trainLoadout && trainLoadout.main === "gatling") {
      drawGatlingBarrels(player, mount, aim, root, tip);
      return;
    }
    fillPoly([
      { x: root.x + perp.x, y: root.y + perp.y },
      { x: root.x - perp.x, y: root.y - perp.y },
      { x: tip.x - perp.x * 0.42, y: tip.y - perp.y * 0.42 },
      { x: tip.x + perp.x * 0.42, y: tip.y + perp.y * 0.42 },
    ], "#e8ecf0");
    strokePoly([
      { x: root.x + perp.x, y: root.y + perp.y },
      { x: tip.x + perp.x * 0.42, y: tip.y + perp.y * 0.42 },
      { x: tip.x - perp.x * 0.42, y: tip.y - perp.y * 0.42 },
      { x: root.x - perp.x, y: root.y - perp.y },
    ], "rgba(248,250,252,0.9)", 0.55);
    ctx.fillStyle = "#9aa3ab";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1e20";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d5dbe2";
    ctx.fillRect(mount.x - 1.15, mount.y - 0.9, 2.3, 2.8);
    const now = performance.now();
    if (player.id === myId && now < muzzleFlash.until) {
      const k = clamp((muzzleFlash.until - now) / 45, 0, 1);
      const size = muzzleFlash.size * (0.55 + 0.45 * k) / 1.6;
      ctx.globalCompositeOperation = "lighter";
      drawGunFlame(tip, aim, size, k);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawBlueMachTrail(trail, camera) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let jet = 0; jet < 2; jet++) {
      const points = [];
      for (const point of trail) {
        if (!point.blue || (point.jet ? 1 : 0) !== jet) continue;
        const u = clamp(1 - point.age / Math.max(point.life, 0.001), 0, 1);
        if (u <= 0.015) continue;
        const sp = screen(point.x, point.y, camera);
        points.push({ x: sp.x, y: sp.y, u, power: point.power || 0 });
      }
      if (points.length < 2) continue;
      const newest = points[points.length - 1];
      const oldest = points[0];
      const power = newest.power;
      const baseWidth = (1.35 + power * 2.25) * (2 / 3) * 0.5;

      function plumePath(widthScale) {
        const left = [];
        const right = [];
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const prev = points[Math.max(0, i - 1)];
          const next = points[Math.min(points.length - 1, i + 1)];
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const width = baseWidth * widthScale * Math.pow(p.u, 0.72);
          left.push({ x: p.x + nx * width, y: p.y + ny * width });
          right.push({ x: p.x - nx * width, y: p.y - ny * width });
        }
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
        for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
        ctx.closePath();
      }

      // 单个连续锥形焰体，避免多层直线看起来像几根棍子?
      let gradient = ctx.createLinearGradient(oldest.x, oldest.y, newest.x, newest.y);
      gradient.addColorStop(0, "rgba(20,70,255,0)");
      gradient.addColorStop(0.3, "rgba(25,95,255,0.22)");
      gradient.addColorStop(0.72, "rgba(35,165,255,0.55)");
      gradient.addColorStop(1, "rgba(105,225,255,0.8)");
      ctx.shadowColor = "rgba(25,110,255,0.72)";
      ctx.shadowBlur = 7 + power * 4;
      ctx.fillStyle = gradient;
      plumePath(1.35);
      ctx.fill();

      gradient = ctx.createLinearGradient(oldest.x, oldest.y, newest.x, newest.y);
      gradient.addColorStop(0, "rgba(80,190,255,0)");
      gradient.addColorStop(0.46, "rgba(80,205,255,0.32)");
      gradient.addColorStop(0.82, "rgba(175,245,255,0.75)");
      gradient.addColorStop(1, "rgba(245,255,255,0.96)");
      ctx.shadowBlur = 0;
      ctx.fillStyle = gradient;
      plumePath(0.42);
      ctx.fill();

      const dx = oldest.x - newest.x;
      const dy = oldest.y - newest.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const px = -uy;
      const py = ux;

      // 超音速冲击菱形：间距固定、亮度逐级衰减，形成可辨识的马赫环?
      const rings = [0.22, 0.4, 0.58, 0.76];
      for (let i = 0; i < rings.length; i++) {
        const f = rings[i];
        const cx = newest.x + dx * f;
        const cy = newest.y + dy * f;
        const cross = baseWidth * Math.pow(1 - f, 0.65) * 0.82;
        const along = Math.min(2.2 + power * 1.15, length * 0.08);
        const alpha = (0.68 - i * 0.105) * (0.55 + power * 0.45);
        ctx.fillStyle = `rgba(135,225,255,${alpha * 0.42})`;
        ctx.beginPath();
        ctx.moveTo(cx - ux * along, cy - uy * along);
        ctx.lineTo(cx + px * cross, cy + py * cross);
        ctx.lineTo(cx + ux * along, cy + uy * along);
        ctx.lineTo(cx - px * cross, cy - py * cross);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(218,252,255,${alpha})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(0.55, cross), 0.38, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 喷口处蓝白高温光核?
      const glowRadius = 1.8 + power * 1.9;
      const glow = ctx.createRadialGradient(newest.x, newest.y, 0, newest.x, newest.y, glowRadius);
      glow.addColorStop(0, "rgba(250,255,255,0.98)");
      glow.addColorStop(0.28, "rgba(110,225,255,0.82)");
      glow.addColorStop(1, "rgba(30,90,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(newest.x, newest.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayerTrail(trail, camera) {
    if (trail.length < 2) return;
    if (trail.some((point) => point.blue)) {
      drawBlueMachTrail(trail, camera);
      return;
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const last = [-1, -1];
    for (let i = 0; i < trail.length; i++) {
      const point = trail[i];
      const jet = point.jet ? 1 : 0;
      const prevI = last[jet];
      last[jet] = i;
      if (prevI < 0) continue;
      const prev = trail[prevI];
      const u = 1 - point.age / Math.max(point.life, 0.001);
      if (u <= 0.02) continue;
      const a = screen(prev.x, prev.y, camera);
      const b = screen(point.x, point.y, camera);
      const alpha = Math.min(1, u * (0.55 + point.power * 0.85));
      const w = Math.max(0.6, (1.1 + u * (1.1 + point.power * 3.4)) * (point.scale || 1) * 0.5);
      ctx.strokeStyle = `rgba(255,${70 + u * 130 | 0},${40 + u * 70 | 0},${alpha})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabel(player, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    // 机身已缩小：标签不再?1/VIEW_SCALE 放大，避免昵称相对飞机过?
    ctx.textAlign = "center";
    ctx.font = "8px Segoe UI, Microsoft YaHei, sans-serif";
    const teamCol = craftTeamColor(player);
    const labelY = -36;
    const hpY = labelY + 5;
    ctx.fillStyle = teamCol;
    ctx.fillText(formatNameShort(player.name || ""), 0, labelY);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-14, hpY, 28, 2.5);
    const maxHp = player.maxHp || (player.blade ? 30 : PLAYER_MAX_HP);
    const hpK = clamp(player.hp / maxHp, 0, 1);
    // 血条跟名字同色：敌红友绿；过低略压暗，不改阵营色相?
    ctx.fillStyle = hpK > 0.35 ? teamCol : mixHex(teamCol, "#000000", 0.35);
    ctx.fillRect(-14, hpY, 28 * hpK, 2.5);
    ctx.restore();
  }

  /** 训练场第3步：在场上标出最近的队友/敌机 */
  function drawTrainGuideWorldHints(players, meRow, camera) {
        // 仅起点也上传一次，建立服务端记录
    if (!localTrainMode || !trainGuide) return;
    return;
    const list = Array.isArray(players) ? players : [];
    let ally = null;
    let foe = null;
    let allyD = 1e12;
    let foeD = 1e12;
    const mx = mePos && Number.isFinite(mePos.x) ? mePos.x : 0;
    const myY = mePos && Number.isFinite(mePos.y) ? mePos.y : 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || p.id === myId || p.respawn > 0) continue;
      const d = (p.x - mx) * (p.x - mx) + (p.y - myY) * (p.y - myY);
      if (isHostileCraft(p)) {
        if (d < foeD) { foeD = d; foe = p; }
      } else {
        if (d < allyD) { allyD = d; ally = p; }
      }
    }
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);
    const mark = (p, text, col) => {
      if (!p) return;
      const s = screen(p.x, p.y, camera);
      if (s.x < -40 || s.y < -40 || s.x > W + 40 || s.y > H + 40) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 28 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35 + pulse * 0.35;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = "bold 12px Segoe UI, Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(s.x - 36, s.y - 58, 72, 18);
      ctx.fillStyle = col;
      ctx.fillText(text, s.x, s.y - 44);
      ctx.restore();
    };
    mark(ally, "队友 · 绿色", "#3ddc84");
    mark(foe, "敌机 · 红色", "#ff4d4d");
  }
  function mixHex(a, b, t) {
    const A = hexRgb(a);
    const B = hexRgb(b);
    const k = clamp(t, 0, 1);
    return `rgb(${(A.r + (B.r - A.r) * k) | 0},${(A.g + (B.g - A.g) * k) | 0},${(A.b + (B.b - A.b) * k) | 0})`;
  }

  function consumeShotOnRocks(shot, asteroidsArr, now) {
    for (const a of asteroidsArr) {
      const hit = sampleHitAsteroid(a, shot.prevX, shot.prevY, shot.x, shot.y);
      if (!hit) continue;
      dropBulletShot(shot.id);
      if (shot.blast && localMatch) splashLocalBlast(hit.x, hit.y, shot.blast, CANNON_SPLASH_DMG, shot.ownerId, null);
      const dx = shot.x - shot.prevX;
      const dy = shot.y - shot.prevY;
      const len = Math.hypot(dx, dy) || 1;
      const cannon = shot.style === "cannon";
      const erase = cannon ? clamp(a.r * 0.44, 12, a.r * 0.52) : clamp(a.r * 0.2, 4, a.r * 0.25);
      {
        const hf = takeHitFlash();
        hf.x = hit.x; hf.y = hit.y; hf.ux = dx / len; hf.uy = dy / len;
        hf.size = 3.2 + erase * 0.12; hf.t0 = now; hf.life = cannon ? 0.12 : 0.05;
      }
      const push = cannon ? 380 : 220;
      if (localMatch) applyLocalRockHit(a, hit, dx / len * push, dy / len * push, cannon ? "cannon" : false);
      return true;
    }
    return false;
  }

  function hitsCraft(shot, players, radius) {
    if (hitLocalMothershipShot(shot)) return true;
    for (const p of players) {
      if (p.id === shot.ownerId || p.id === shot.oid || p.respawn > 0) continue;
      if (!segmentHitsCircle(shot.prevX, shot.prevY, shot.x, shot.y, p.x, p.y, radius)) continue;
      spawnCraftSparks(shot.x, shot.y, shot.vx || 1, shot.vy || 0, 5 + (Math.random() * 3 | 0));
      if (localMatch) {
        const oid = shot.ownerId != null ? shot.ownerId : shot.oid;
        const atk = localCrafts.find((c) => c.id === oid);
        const vic = localCrafts.find((c) => c.id === p.id);
        if (atk && vic && atk.team === vic.team) {
          dropBulletShot(shot.id);
          return true;
        }
        if (vic) damageLocalCraft(vic, shot.dmg || 9, oid);
        if (shot.blast) splashLocalBlast(shot.x, shot.y, shot.blast, CANNON_SPLASH_DMG, oid, vic);
      } else if (p.id === myId) {
        bumpGunHitFeel(0.4);
      }
      dropBulletShot(shot.id);
      return true;
    }
    return false;
  }

  function shotHitsMissile(shot, missiles, radius) {
    const r2 = radius * radius;
    const dx = shot.x - shot.prevX;
    const dy = shot.y - shot.prevY;
    const len2 = dx * dx + dy * dy || 1;
    for (const m of missiles) {
      if (m.ownerId === shot.ownerId || m.ownerId === shot.oid) continue;
      const t = clamp(((m.x - shot.prevX) * dx + (m.y - shot.prevY) * dy) / len2, 0, 1);
      const px = shot.prevX + dx * t - m.x;
      const py = shot.prevY + dy * t - m.y;
      if (px * px + py * py >= r2) continue;
      dropBulletShot(shot.id);
      return m.id;
    }
    return 0;
  }

  // 机关炮空气拖尾（同两?drawPlayerTrail：分链连?+ 后漂消散?
  // 性能：仅合并绘制（分?stroke）；子弹对象每帧重建，不能挂采样计时?
  const GUN_WAKE_LIFE = 0.34; // 黑底上略留长一点更好认
  const GUN_WAKE_MAX_PER = 18;
  const GUN_WAKE_BACK = 90;
  const GUN_WAKE_TOTAL_MAX = 640;
  const GUN_WAKE_BUCKETS = 5;
  const gunWakeBuckets = Array.from({ length: GUN_WAKE_BUCKETS }, () => []);

  function updateGunWakeTrails(shots, dt) {
    for (const p of gunWakeTrails) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.8 * dt);
      p.vy *= Math.exp(-1.8 * dt);
    }
    // 紧凑删除过期点，回收到对象池
    let w = 0;
    for (let i = 0; i < gunWakeTrails.length; i++) {
      const gp = gunWakeTrails[i];
      if (gp.age < gp.life) gunWakeTrails[w++] = gp;
      else wakePointPool.release(gp);
    }
    gunWakeTrails.length = w;

    const cs = CONTENT_SCALE;
    const blen = 4.2 * cs;
    for (const shot of shots) {
      const spd = Math.hypot(shot.vx, shot.vy);
      if (spd < 1) continue;
      // 拖尾/朝向按开火方向，不用合成速度方向
      const ang = (Number.isFinite(shot.ax) && Number.isFinite(shot.ay))
        ? Math.atan2(shot.ay, shot.ax)
        : Math.atan2(shot.vy, shot.vx);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const tail = blen * 0.55;
      // 拖尾只用枪口相对初速，避免机速叠进去后前后开火拖尾强弱不一
      const mx = Number.isFinite(shot.ax) ? shot.ax * BULLET_SPEED : shot.vx;
      const my = Number.isFinite(shot.ay) ? shot.ay * BULLET_SPEED : shot.vy;
      const wp = wakePointPool.take();
      wp.id = shot.id;
      wp.x = shot.x - c * tail;
      wp.y = shot.y - s * tail;
      wp.vx = mx * 0.25 - c * GUN_WAKE_BACK;
      wp.vy = my * 0.25 - s * GUN_WAKE_BACK;
      wp.age = 0;
      wp.life = GUN_WAKE_LIFE;
      gunWakeTrails.push(wp);
      // 保序裁掉该弹链最旧点，回收到?
      let n = 0;
      for (let k = 0; k < gunWakeTrails.length; k++) {
        if (gunWakeTrails[k].id === shot.id) n++;
      }
      if (n > GUN_WAKE_MAX_PER) {
        let drop = n - GUN_WAKE_MAX_PER;
        let ww = 0;
        for (let k = 0; k < gunWakeTrails.length; k++) {
          const p = gunWakeTrails[k];
          if (p.id === shot.id && drop > 0) { drop--; wakePointPool.release(p); continue; }
          gunWakeTrails[ww++] = p;
        }
        gunWakeTrails.length = ww;
      }
    }
    if (gunWakeTrails.length > GUN_WAKE_TOTAL_MAX) {
      const cut = gunWakeTrails.length - GUN_WAKE_TOTAL_MAX;
      for (let i = 0; i < cut; i++) wakePointPool.release(gunWakeTrails[i]);
      gunWakeTrails.splice(0, cut);
    }
  }

  function drawGunWakeTrails(camera) {
    if (gunWakeTrails.length < 2) return;
    for (let b = 0; b < GUN_WAKE_BUCKETS; b++) gunWakeBuckets[b].length = 0;
    const last = new Map();
    for (let i = 0; i < gunWakeTrails.length; i++) {
      const point = gunWakeTrails[i];
      const prevI = last.has(point.id) ? last.get(point.id) : -1;
      last.set(point.id, i);
      if (prevI < 0) continue;
      const prev = gunWakeTrails[prevI];
      const u = 1 - point.age / Math.max(point.life, 0.001);
      if (u <= 0.02) continue;
      const a = screen(prev.x, prev.y, camera);
      const bpt = screen(point.x, point.y, camera);
      if (!Number.isFinite(a.x) || !Number.isFinite(bpt.x)) continue;
      const bi = Math.min(GUN_WAKE_BUCKETS - 1, (u * GUN_WAKE_BUCKETS) | 0);
      const bucket = gunWakeBuckets[bi];
      bucket.push(a.x, a.y, bpt.x, bpt.y);
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // 淡空气痕：source-over 低透明，真机可见且不炸?
    ctx.globalCompositeOperation = "source-over";
    for (let bi = 0; bi < GUN_WAKE_BUCKETS; bi++) {
      const segs = gunWakeBuckets[bi];
      if (!segs.length) continue;
      const u = (bi + 0.55) / GUN_WAKE_BUCKETS;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        ctx.moveTo(segs[i], segs[i + 1]);
        ctx.lineTo(segs[i + 2], segs[i + 3]);
      }
      ctx.strokeStyle = `rgba(180, 220, 255, ${0.08 + u * 0.16})`;
      ctx.lineWidth = 0.7 + u * 1.1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function appendGunWakeGeometry(out, camera) {
    if (gunWakeTrails.length < 2) return;
    const last = new Map();
    for (let i = 0; i < gunWakeTrails.length; i++) {
      const point = gunWakeTrails[i];
      const prevI = last.has(point.id) ? last.get(point.id) : -1;
      last.set(point.id, i);
      if (prevI < 0) continue;
      const prev = gunWakeTrails[prevI];
      const u = 1 - point.age / Math.max(point.life, 0.001);
      if (u <= 0.02) continue;
      const a = screen(prev.x, prev.y, camera);
      const b = screen(point.x, point.y, camera);
      if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
      glColorSegment(out, a.x, a.y, b.x, b.y, 0.7 + u * 1.1, [0.71, 0.86, 1, 0.08 + u * 0.16]);
    }
  }

  // 细小子弹 + 浅辉光（对齐 gun-trail-demo?
  const GUN_BULLET_PAL = ["#39ff14", "rgba(57,255,20,0)", "rgba(57,255,20,0.85)", "#9dff7a", "#f4fff0"];
  const GATLING_BULLET_PAL = ["#ffe66b", "rgba(255,230,107,0)", "rgba(255,210,80,0.85)", "#fff0a0", "#fffbe8"];
  function drawGunBullets(shots, camera, thin) {
    const cs = CONTENT_SCALE;
    const blen = (thin ? 12.8 : 16.8) * cs;
    const bwid = (thin ? 1.12 : 1.4) * cs;
    ctx.save();
    ctx.globalAlpha = 1;
    // 真机 lighter 经常无效；统一 source-over，靠实色对比度在黑底显影
    ctx.globalCompositeOperation = "source-over";
    for (const shot of shots) {
      const spd = Math.hypot(shot.vx, shot.vy);
      if (spd < 1) continue;
      const u = clamp(1 - shot.age / Math.max(shot.life, 1), 0, 1);
      const a = u > 0.18 ? 1 : Math.pow(u / 0.18, 0.85);
      if (a < 0.04) continue;
      const p = screen(shot.x, shot.y, camera);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (shot.style === "cannon") {
        ctx.globalAlpha = a * 0.22;
        ctx.fillStyle = "#ff9a3c";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ffb45f";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff4dc";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const gat = shot.style === "gatling";
      const pal = gat ? GATLING_BULLET_PAL : GUN_BULLET_PAL;
      ctx.save();
      ctx.translate(p.x, p.y);
      const bang = (Number.isFinite(shot.ax) && Number.isFinite(shot.ay))
        ? Math.atan2(shot.ay, shot.ax)
        : Math.atan2(shot.vy, shot.vx);
      ctx.rotate(bang);
      const L = blen * (gat ? 0.42 : 0.5);
      const W = bwid * (gat ? 0.7 : 1.6);
      // 很淡的弹后细丝（黑底上刚能察觉）
      const streak = gat ? 10 : 16;
      ctx.lineCap = "round";
      ctx.globalAlpha = a * 0.18;
      ctx.strokeStyle = gat ? "rgba(255, 220, 140, 0.7)" : "rgba(160, 230, 200, 0.7)";
      ctx.lineWidth = Math.max(0.9, W * 0.85);
      ctx.beginPath();
      ctx.moveTo(-L - streak, 0);
      ctx.lineTo(-L * 0.2, 0);
      ctx.stroke();
      // 外层淡辉?
      ctx.globalAlpha = a * 0.16;
      ctx.fillStyle = pal[0];
      ctx.save();
      ctx.translate(L * 0.1, 0);
      ctx.scale(L * 1.15, W * 2.1);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.quadraticCurveTo(-L * 0.6, -W * 0.55, -L * 0.1, -W);
        ctx.lineTo(L * 0.45, -W);
        ctx.quadraticCurveTo(L * 0.92, -W * 0.85, L * 1.12, 0);
        ctx.quadraticCurveTo(L * 0.92, W * 0.85, L * 0.45, W);
        ctx.lineTo(-L * 0.1, W);
        ctx.quadraticCurveTo(-L * 0.6, W * 0.55, -L, 0);
        ctx.closePath();
      };
      let grad = null;
      try {
        grad = ctx.createLinearGradient(-L, 0, L * 1.12, 0);
        grad.addColorStop(0, pal[1]);
        grad.addColorStop(0.35, pal[2]);
        grad.addColorStop(0.75, pal[3]);
        grad.addColorStop(1, pal[4]);
      } catch (e) { grad = null; }
      ctx.globalAlpha = a;
      ctx.fillStyle = grad || pal[0];
      try { body(); ctx.fill(); } catch (e) {
        ctx.fillRect(-L, -W, L * 2.1, W * 2);
      }
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-L * 0.15, -W * 0.28, L * 0.95, W * 0.56);
      ctx.beginPath();
      ctx.arc(L * 0.88, 0, Math.max(0.6, W * 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  function drawHitFlashes(camera, now) {
    for (let i = 0; i < MAX_HIT_FLASHES; i++) {
      const f = hitFlashes[i];
      if (!f.active) continue;
      const k = 1 - (now - f.t0) / 1000 / f.life;
      if (k <= 0) { f.active = false; continue; }
      const p = screen(f.x, f.y, camera);
      const size = f.size * (0.55 + 0.45 * k);
      const ang = Math.atan2(f.uy, f.ux);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const xf = (px, py) => ({ x: p.x + px * ca - py * sa, y: p.y + px * sa + py * ca });
      fillPoly([
        xf(size * 1.25, 0), xf(size * 0.35, -size * 0.62),
        xf(-size * 0.35, -size * 0.3), xf(size * 0.35, size * 0.62),
      ], `rgba(255,120,36,${0.55 + 0.35 * k})`);
      ctx.fillStyle = "rgba(255,252,242,0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, size * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShots(shots, camera, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    for (const shot of shots) {
      const head = screen(shot.x, shot.y, camera);
      const dx = shot.x - shot.prevX;
      const dy = shot.y - shot.prevY;
      const length = Math.hypot(dx, dy);
      const trailLength = length ? clamp(length * 1.25, 6, 18) : 0;
      const tail = length
        ? screen(shot.x - dx / length * trailLength, shot.y - dy / length * trailLength, camera)
        : screen(shot.prevX, shot.prevY, camera);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
  }

  function updateMissileTrails(missiles, dt) {
    const live = new Set();
    for (const m of missiles) {
      live.add(m.id);
      let trail = missileTrails.get(m.id);
      if (!trail) {
        trail = [];
        missileTrails.set(m.id, trail);
      }
      const mp = missileTrailPool.take();
      mp.x = m.x; mp.y = m.y; mp.age = 0;
      trail.push(mp);
      for (const p of trail) p.age += dt;
      while (trail.length && trail[0].age > 0.35) missileTrailPool.release(trail.shift());
      m.trail = trail;
    }
    for (const id of [...missileTrails.keys()]) {
      if (live.has(id)) continue;
      const trail = missileTrails.get(id);
      if (trail) for (const p of trail) missileTrailPool.release(p);
      missileTrails.delete(id);
    }
  }

  function drawMissile(missile, camera) {
    const trail = missile.trail || [];
    const drawScale = Number.isFinite(missile.drawScale) ? missile.drawScale : 1;
    ctx.lineCap = "round";
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = screen(trail[i - 1].x, trail[i - 1].y, camera);
        const b = screen(trail[i].x, trail[i].y, camera);
        const alpha = 1 - trail[i].age / 0.35;
        if (alpha <= 0.02) continue;
        ctx.strokeStyle = `rgba(255,190,90,${alpha * 0.75})`;
        ctx.lineWidth = (1 + alpha * 1.5) * drawScale;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    } else {
      drawShots([missile], camera, "rgba(255,180,80,0.65)", 2 * drawScale);
    }
    const p = screen(missile.x, missile.y, camera);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(missile.heading + Math.PI / 2);
    ctx.scale(drawScale, drawScale);
    ctx.fillStyle = "#ff9d45";
    ctx.beginPath();
    ctx.moveTo(-2, 5);
    ctx.lineTo(0, 13);
    ctx.lineTo(2, 5);
    ctx.fill();
    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(3, 6);
    ctx.lineTo(-3, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f05454";
    ctx.fillRect(-3, 2, 6, 3);
    ctx.restore();
  }

  function glColorVertex(out, x, y, color) {
    out.push(x * dpr, y * dpr, color[0], color[1], color[2], color[3]);
  }

  function glColorTriangle(out, a, b, c, color) {
    glColorVertex(out, a.x, a.y, color);
    glColorVertex(out, b.x, b.y, color);
    glColorVertex(out, c.x, c.y, color);
  }

  function glColorQuad(out, x, y, w, h, rotation, color) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const cs = Math.cos(rotation || 0);
    const sn = Math.sin(rotation || 0);
    const point = (lx, ly) => ({
      x: x + lx * cs - ly * sn,
      y: y + lx * sn + ly * cs,
    });
    const p0 = point(-hw, -hh);
    const p1 = point(hw, -hh);
    const p2 = point(-hw, hh);
    const p3 = point(hw, hh);
    glColorTriangle(out, p0, p1, p2, color);
    glColorTriangle(out, p2, p1, p3, color);
  }

  function glColorSegment(out, x0, y0, x1, y1, width, color) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    glColorQuad(out, (x0 + x1) * 0.5, (y0 + y1) * 0.5, len, width, Math.atan2(dy, dx), color);
  }

  function glColorSegmentGradient(out, x0, y0, x1, y1, width0, width1, color0, color1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const nx = -dy / len;
    const ny = dx / len;
    const a0 = { x: x0 + nx * width0 * 0.5, y: y0 + ny * width0 * 0.5 };
    const a1 = { x: x0 - nx * width0 * 0.5, y: y0 - ny * width0 * 0.5 };
    const b0 = { x: x1 + nx * width1 * 0.5, y: y1 + ny * width1 * 0.5 };
    const b1 = { x: x1 - nx * width1 * 0.5, y: y1 - ny * width1 * 0.5 };
    glColorVertex(out, a0.x, a0.y, color0);
    glColorVertex(out, a1.x, a1.y, color0);
    glColorVertex(out, b0.x, b0.y, color1);
    glColorVertex(out, b0.x, b0.y, color1);
    glColorVertex(out, a1.x, a1.y, color0);
    glColorVertex(out, b1.x, b1.y, color1);
  }

  function glColorPolygon(out, pts, color) {
    if (!pts || pts.length < 3) return;
    for (let i = 1; i < pts.length - 1; i++) glColorTriangle(out, pts[0], pts[i], pts[i + 1], color);
  }

  function glColorEllipse(out, x, y, rx, ry, rotation, color, segments = 8) {
    const pts = [];
    const cs = Math.cos(rotation || 0);
    const sn = Math.sin(rotation || 0);
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      pts.push({ x: x + px * cs - py * sn, y: y + px * sn + py * cs });
    }
    glColorPolygon(out, pts, color);
  }

  const glCssColorCache = new Map();
  function glCssColor(css, alpha) {
    const key = `${css}|${alpha}`;
    const cached = glCssColorCache.get(key);
    if (cached) return cached;
    const s = String(css || "");
    let r = 1, g = 1, b = 1;
    if (s[0] === "#" && s.length === 4) {
      r = parseInt(s[1] + s[1], 16) / 255;
      g = parseInt(s[2] + s[2], 16) / 255;
      b = parseInt(s[3] + s[3], 16) / 255;
    } else if (s[0] === "#" && s.length >= 7) {
      r = parseInt(s.slice(1, 3), 16) / 255;
      g = parseInt(s.slice(3, 5), 16) / 255;
      b = parseInt(s.slice(5, 7), 16) / 255;
    }
    const color = [r, g, b, alpha];
    if (glCssColorCache.size < 96) glCssColorCache.set(key, color);
    return color;
  }

  function drawAmbientFxWebGlPass(camera, now, debrisOnly = false) {
    const normal = [];
    const additive = [];
    const vis = viewPad(90);
    if (!debrisOnly) for (let i = 0; i < MAX_DMG_FX; i++) {
      const p = dmgFx[i];
      if (!p.active) continue;
      const s = screen(p.x, p.y, camera);
      if (s.x < vis.x0 || s.y < vis.y0 || s.x > vis.x1 || s.y > vis.y1) continue;
      const u = p.age / Math.max(p.life, 0.001);
      const fade = Math.pow(Math.max(0, 1 - u), 1.15);
      const r = p.size * (0.55 + u * 1.7);
      if (p.kind === "smoke") {
        const a = fade * (0.22 + p.hurt * 0.38);
        glColorEllipse(normal, s.x, s.y, r, r * 0.72, p.rot,
          p.hurt > 0.65 ? [0.23, 0.2, 0.17, a] : [0.29, 0.28, 0.27, a], 8);
        if (!PERF_LITE) {
          const ox = Math.cos(p.rot) * (-r * 0.12) - Math.sin(p.rot) * (-r * 0.08);
          const oy = Math.sin(p.rot) * (-r * 0.12) + Math.cos(p.rot) * (-r * 0.08);
          glColorEllipse(normal, s.x + ox, s.y + oy, r * 0.55, r * 0.4, p.rot,
            [0.11, 0.105, 0.1, fade * 0.12], 8);
        }
      } else if (p.kind === "fire") {
        glColorEllipse(additive, s.x, s.y, r, r * 1.15, p.rot, [1, 0.35, 0.09, fade * 0.85], 8);
        const ox = Math.sin(p.rot) * r * 0.15;
        const oy = -Math.cos(p.rot) * r * 0.15;
        glColorEllipse(additive, s.x + ox, s.y + oy, r * 0.45, r * 0.7, p.rot,
          [1, 0.82, 0.5, fade * 0.7], 8);
      }
    }
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const p = debris[i];
      if (!p.active) continue;
      const s = screen(p.x, p.y, camera);
      if (s.x < vis.x0 || s.y < vis.y0 || s.x > vis.x1 || s.y > vis.y1) continue;
      const u = p.age / Math.max(p.life, 0.001);
      const alpha = u < 0.12 ? 1 : Math.pow(Math.max(0, 1 - (u - 0.12) / 0.88), 1.25);
      if (p.spark) {
        const fade = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
        const vlen = Math.hypot(p.vx, p.vy);
        const trail = clamp(vlen * 0.018, 1, 3);
        glColorSegment(normal, s.x, s.y,
          s.x - (vlen > 0.01 ? p.vx / vlen * trail : 0),
          s.y - (vlen > 0.01 ? p.vy / vlen * trail : 0),
          Math.max(0.6, p.size), [1, 0.62, 0.2, 0.9 * fade]);
        continue;
      }
      const tpl = DEBRIS_TEMPLATES[p.template];
      if (!tpl) continue;
      const pts = [];
      const cr = Math.cos(p.rot) * p.size;
      const sr = Math.sin(p.rot) * p.size;
      for (let v = 0; v < tpl.length; v += 2) {
        const lx = tpl[v] * (p.stretchX || 1);
        const ly = tpl[v + 1] * (p.stretchY || 1);
        pts.push({ x: s.x + lx * cr - ly * sr, y: s.y + lx * sr + ly * cr });
      }
      glColorPolygon(normal, pts, glCssColor(p.color, alpha));
    }
    if (!debrisOnly) for (let i = 0; i < MAX_HEAL_BURSTS; i++) {
      const h = healBursts[i];
      if (!h.active) continue;
      const u = (now - h.t0) / 420;
      if (u >= 1) { h.active = false; continue; }
      const p = screen(h.x, h.y, camera);
      const r = 8 + u * 30;
      const col = h.kind === "mag" ? [1, 0.88, 0.54, 1 - u]
        : h.kind === "shield" ? [0.49, 0.78, 1, 1 - u] : [0.49, 1, 0.69, 1 - u];
      const seg = 20;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2;
        const a1 = (k + 1) / seg * Math.PI * 2;
        glColorSegment(normal,
          p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r,
          p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r, 2.2, col);
      }
      if (h.kind !== "shield") {
        glColorSegment(normal, p.x, p.y - r * 0.7, p.x, p.y + r * 0.7, 2.2, col);
        glColorSegment(normal, p.x - r * 0.7, p.y, p.x + r * 0.7, p.y, 2.2, col);
      }
    }
    if (!normal.length && !additive.length) return;
    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    let composed = false;
    if (world && world.beginFrame(W * dpr, H * dpr)) {
      try {
        let drew = true;
        if (normal.length && !world.drawColorTriangles(normal, false)) drew = false;
        if (additive.length && !world.drawColorTriangles(additive, true)) drew = false;
        const layer = world.endFrame();
        if (drew && layer) composed = compositeWebGlLayer(world, layer);
      } catch (e) {
        try { console.error("[webgl pass] ambient fx", e && e.message); } catch (err) {}
      }
    }
  }

  function drawImpactFxWebGlPass(camera, now, dt) {
    const normal = [];
    const additive = [];
    const vis = viewPad(90);
    for (let i = 0; i < MAX_FIRE_BLASTS; i++) {
      const e = fireBlasts[i];
      if (!e.active) continue;
      e.age += dt;
      if (e.age >= e.life) { e.active = false; continue; }
      const p = screen(e.x, e.y, camera);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
      const u = e.age / e.life;
      const grow = 1 - Math.pow(1 - u, 1.2);
      const fade = Math.pow(1 - u, 0.65);
      const R = (14 + grow * 34) * e.size;
      const seed = e.seed || 0;
      const rh = (n) => {
        const x = Math.sin((seed + n) * 127.1) * 43758.5453;
        return x - Math.floor(x);
      };
      for (let k = 0; k < 11; k++) {
        const a = seed + k * 0.57 + u * 0.35;
        const flick = 0.72 + 0.28 * Math.sin(now / 1000 * 26 + k * 1.7 + seed);
        const len = R * (0.55 + rh(k) * 0.85) * flick;
        const w = R * (0.1 + rh(k + 4) * 0.14);
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        const xf = (x, y) => ({ x: p.x + x * cs - y * sn, y: p.y + x * sn + y * cs });
        glColorPolygon(normal, [
          xf(-w, R * 0.04), xf(-w * 0.25, -len * 0.42),
          xf(0, -len), xf(w * 0.25, -len * 0.42), xf(w, R * 0.04),
        ], [1, (42 + (k % 5) * 14) / 255, 0.03, 0.5 * fade * flick]);
      }
      for (let k = 0; k < 6; k++) {
        const a = seed * 1.3 + k * 1.05;
        const size = R * (0.22 + rh(k + 8) * 0.28) * (1 - u * 0.35);
        const cx = p.x + Math.cos(a) * R * 0.18;
        const cy = p.y + Math.sin(a) * R * 0.18;
        glColorPolygon(normal, [
          { x: cx, y: cy - size }, { x: cx + size * 0.62, y: cy },
          { x: cx, y: cy + size }, { x: cx - size * 0.62, y: cy },
        ], [1, (130 + k * 12) / 255, 0.09, 0.42 * fade]);
      }
      glColorEllipse(normal, p.x, p.y, R * 0.23, R * 0.28, seed * 0.2, [1, 0.82, 0.27, 0.62 * fade], 4);
      glColorEllipse(normal, p.x, p.y, R * 0.1, R * 0.12, seed * 0.35, [1, 0.96, 0.82, 0.8 * fade], 4);
    }
    for (let i = 0; i < MAX_HIT_FLASHES; i++) {
      const f = hitFlashes[i];
      if (!f.active) continue;
      const k = 1 - (now - f.t0) / 1000 / f.life;
      if (k <= 0) { f.active = false; continue; }
      const p = screen(f.x, f.y, camera);
      const size = f.size * (0.55 + 0.45 * k);
      const ang = Math.atan2(f.uy, f.ux);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const xf = (x, y) => ({ x: p.x + x * ca - y * sa, y: p.y + x * sa + y * ca });
      glColorPolygon(normal, [
        xf(size * 1.25, 0), xf(size * 0.35, -size * 0.62),
        xf(-size * 0.35, -size * 0.3), xf(size * 0.35, size * 0.62),
      ], [1, 0.47, 0.14, 0.55 + 0.35 * k]);
      glColorDisk(normal, p.x, p.y, Math.max(1, size * 0.22), [1, 0.99, 0.95, 0.9], 10);
    }
    for (let i = 0; i < MAX_EFFECTS; i++) {
      const effect = effectList[i];
      if (!effect.active || effect.ty === 0 || !(effect._life > 0)) continue;
      const p = screen(effect.x, effect.y, camera);
      const u = clamp(effect._age / effect._life, 0, 1);
      const fade = 1 - u;
      const color = glCssColor(effect._color, fade);
      glColorDisk(additive, p.x, p.y, (5 + u * 18) * effect.size * fade, color, 14);
      const r = (8 + u * 42) * effect.size;
      const ringColor = glCssColor(effect._color, fade * 0.9);
      const seg = 20;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2;
        const a1 = (k + 1) / seg * Math.PI * 2;
        glColorSegment(additive,
          p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r,
          p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r,
          Math.max(0.6, 3 * fade), ringColor);
      }
    }
    if (!normal.length && !additive.length) return;
    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    let composed = false;
    if (world && world.beginFrame(W * dpr, H * dpr)) {
      try {
        let drew = true;
        if (normal.length && !world.drawColorTriangles(normal, false)) drew = false;
        if (additive.length && !world.drawColorTriangles(additive, true)) drew = false;
        const layer = world.endFrame();
        if (drew && layer) composed = compositeWebGlLayer(world, layer);
      } catch (e) {
        try { console.error("[webgl pass] impact fx", e && e.message); } catch (err) {}
      }
    }
  }

  function glLocalPoint(center, rotation, scale, x, y) {
    const cs = Math.cos(rotation);
    const sn = Math.sin(rotation);
    return {
      x: center.x + (x * cs - y * sn) * scale,
      y: center.y + (x * sn + y * cs) * scale,
    };
  }

  function appendGpuBullet(out, shot, camera, thin) {
    const spd = Math.hypot(shot.vx, shot.vy);
    if (spd < 1) return;
    if (shot.style === "ms01") {
      const palette = [
        [[1, 0.35, 0.29], [1, 0.78, 0.75]],
        [[0.36, 0.94, 0.48], [0.78, 1, 0.84]],
        [[0.36, 0.72, 1], [0.81, 0.92, 1]],
      ];
      const col = palette[shot.ci != null ? shot.ci : 0] || palette[0];
      const tx = shot.vx / spd;
      const ty = shot.vy / spd;
      const p = screen(shot.x, shot.y, camera);
      const fade = clamp((1 - (shot.age || 0) / Math.max(shot.life || 1500, 1)) / 0.13, 0, 1);
      glColorSegment(out, p.x - tx * 48, p.y - ty * 48, p.x - tx * 12, p.y - ty * 12,
        2.4, [col[0][0], col[0][1], col[0][2], 0.18 * fade]);
      glColorSegment(out, p.x - tx * 24, p.y - ty * 24, p.x, p.y,
        2.6, [col[0][0], col[0][1], col[0][2], 0.72 * fade]);
      glColorSegment(out, p.x - tx * 8, p.y - ty * 8, p.x, p.y,
        1.8, [col[1][0], col[1][1], col[1][2], 0.95 * fade]);
      return;
    }
    const u = clamp(1 - shot.age / Math.max(shot.life, 1), 0, 1);
    const alpha = u > 0.18 ? 1 : Math.pow(u / 0.18, 0.85);
    if (alpha < 0.04) return;
    const p = screen(shot.x, shot.y, camera);
    if (shot.style === "cannon") {
      glColorQuad(out, p.x, p.y, 9, 9, 0, [1, 0.48, 0.14, alpha * 0.24]);
      glColorQuad(out, p.x, p.y, 4.5, 4.5, 0, [1, 0.71, 0.37, alpha]);
      glColorQuad(out, p.x, p.y, 2, 2, 0, [1, 0.97, 0.88, alpha]);
      return;
    }
    const gatling = shot.style === "gatling";
    const angle = (Number.isFinite(shot.ax) && Number.isFinite(shot.ay))
      ? Math.atan2(shot.ay, shot.ax)
      : Math.atan2(shot.vy, shot.vx);
    const length = (thin ? 12.8 : 16.8) * CONTENT_SCALE * (gatling ? 0.46 : 0.56);
    const width = (thin ? 1.12 : 1.4) * CONTENT_SCALE * (gatling ? 1.05 : 1.7);
    const body = gatling ? [1, 0.86, 0.28, alpha] : [0.3, 1, 0.18, alpha];
    const core = gatling ? [1, 0.98, 0.82, alpha] : [0.92, 1, 0.9, alpha];
    glColorQuad(out, p.x, p.y, length * 2.1, width * 2.2, angle, [body[0], body[1], body[2], alpha * 0.2]);
    glColorQuad(out, p.x, p.y, length * 1.75, width, angle, body);
    glColorQuad(out, p.x + Math.cos(angle) * length * 0.35, p.y + Math.sin(angle) * length * 0.35, length * 0.75, Math.max(0.65, width * 0.3), angle, core);
  }

  function appendGpuMissile(out, missile, camera) {
    const trail = missile.trail || [];
    const scale = Number.isFinite(missile.drawScale) ? missile.drawScale : 1;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = screen(trail[i - 1].x, trail[i - 1].y, camera);
        const b = screen(trail[i].x, trail[i].y, camera);
        const alpha = 1 - trail[i].age / 0.35;
        if (alpha > 0.02) glColorSegment(out, a.x, a.y, b.x, b.y, (1 + alpha * 1.5) * scale, [1, 0.69, 0.25, alpha * 0.75]);
      }
    } else {
      const tail = screen(missile.prevX, missile.prevY, camera);
      const head = screen(missile.x, missile.y, camera);
      glColorSegment(out, tail.x, tail.y, head.x, head.y, 2 * scale, [1, 0.65, 0.22, 0.65]);
    }
    const p = screen(missile.x, missile.y, camera);
    const rotation = missile.heading + Math.PI / 2;
    const orange = [1, 0.48, 0.16, 1];
    const white = [0.96, 0.96, 0.96, 1];
    const red = [0.94, 0.21, 0.21, 1];
    glColorTriangle(
      out,
      glLocalPoint(p, rotation, scale, -2, 5),
      glLocalPoint(p, rotation, scale, 0, 13),
      glLocalPoint(p, rotation, scale, 2, 5),
      orange
    );
    glColorTriangle(
      out,
      glLocalPoint(p, rotation, scale, 0, -10),
      glLocalPoint(p, rotation, scale, 3, 6),
      glLocalPoint(p, rotation, scale, -3, 6),
      white
    );
    const stripe = glLocalPoint(p, rotation, scale, 0, 3.5);
    glColorQuad(out, stripe.x, stripe.y, 6 * scale, 3 * scale, rotation, red);
  }

  function drawProjectileWebGlPass(friendly, enemy, missiles, camera, includeWake = true) {
    const normal = [];
    const additive = [];
    if (includeWake) appendGunWakeGeometry(normal, camera);
    for (let i = 0; i < friendly.length; i++) {
      appendGpuBullet(friendly[i].style === "ms01" ? additive : normal, friendly[i], camera, false);
    }
    for (let i = 0; i < enemy.length; i++) {
      appendGpuBullet(enemy[i].style === "ms01" ? additive : normal, enemy[i], camera, true);
    }
    for (let i = 0; i < missiles.length; i++) appendGpuMissile(normal, missiles[i], camera);
    if (!normal.length && !additive.length) return;
    const world = (typeof GameGlobal !== "undefined" && GameGlobal.PapaWebGLWorld) || null;
    let composed = false;
    if (world && world.beginFrame(W * dpr, H * dpr)) {
      try {
        let drew = true;
        if (normal.length && !world.drawColorTriangles(normal, false)) drew = false;
        if (additive.length && !world.drawColorTriangles(additive, true)) drew = false;
        const layer = world.endFrame();
        if (drew && layer) composed = compositeWebGlLayer(world, layer);
      } catch (e) {
        try { console.error("[webgl pass] projectiles", e && e.message); } catch (err) {}
      }
    }
  }

  function sparkColor(u, alpha) {
    const stops = [[0, 255, 251, 232], [0.45, 255, 179, 71], [0.9, 168, 53, 15]];
    let a = stops[0];
    let b = stops[1];
    if (u > 0.45) { a = stops[1]; b = stops[2]; }
    const t = clamp((u - a[0]) / Math.max(b[0] - a[0], 0.001), 0, 1);
    return `rgba(${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0},${a[3] + (b[3] - a[3]) * t | 0},${alpha})`;
  }

  function puffDmgSmoke(x, y, heading, vx, vy, hurt, spread, scale) {
    const p = takeDmgFx();
    const cs = Math.cos(heading);
    const sn = Math.sin(heading);
    const lat = (Math.random() - 0.5) * spread;
    p.kind = "smoke";
    p.x = x + -sn * lat;
    p.y = y + cs * lat;
    p.vx = vx * 0.18 - cs * (12 + Math.random() * 22) + (Math.random() - 0.5) * 16;
    p.vy = vy * 0.18 - sn * (12 + Math.random() * 22) + (Math.random() - 0.5) * 16;
    p.life = 0.55 + Math.random() * 0.7 + hurt * 0.3;
    p.size = (4.2 + Math.random() * 5.5 + hurt * 4) * scale;
    p.rot = Math.random() * Math.PI * 2;
    p.spin = (Math.random() - 0.5) * 2.2;
    p.hurt = Math.max(0.35, hurt);
  }

  function puffDmgFire(x, y, heading, vx, vy, spread, scale) {
    const p = takeDmgFx();
    const cs = Math.cos(heading);
    const sn = Math.sin(heading);
    const lat = (Math.random() - 0.5) * spread;
    p.kind = "fire";
    p.x = x - sn * lat;
    p.y = y + cs * lat;
    p.vx = vx * 0.15 - cs * (8 + Math.random() * 40) + (Math.random() - 0.5) * 18;
    p.vy = vy * 0.15 - sn * (8 + Math.random() * 40) + (Math.random() - 0.5) * 18;
    p.life = 0.22 + Math.random() * 0.32;
    p.size = (5 + Math.random() * 7) * scale;
    p.rot = Math.random() * Math.PI * 2;
    p.spin = (Math.random() - 0.5) * 4;
    p.hurt = 1;
  }

  function emitDamageFx(player, dt) {
    if (player.respawn > 0) return;
    const maxHp = player.maxHp || (player.blade ? 30 : PLAYER_MAX_HP);
    const hpK = clamp((player.hp || 0) / maxHp, 0, 1);
    if (hpK > 0.8 || hpK <= 0) return;
    const vis = visualFor(player);
    // ?80% 起：每再?10% 升一档烟雾（更密、更大）
    const smokeTier = clamp(Math.floor((0.8 - hpK) / 0.1 + 1e-6), 0, 8);
    const hurt = clamp(0.32 + smokeTier * 0.1, 0.32, 1.2);
    const sizeBoost = 1 + smokeTier * 0.2;
    const k = 0.5;
    const heading = player.heading;
    const cs = Math.cos(heading);
    const sn = Math.sin(heading);
    const cvx = player.vx || 0;
    const cvy = player.vy || 0;
    // 机身中间冒烟（中心略后一点，仍在机身内）
    const midAlong = 1.5 + Math.random() * 3.5;
    const tx = player.x - cs * midAlong;
    const ty = player.y - sn * midAlong;
    vis.smokeAcc = (vis.smokeAcc || 0) + dt;
    const smokeGap = Math.max(0.016, 0.072 - smokeTier * 0.0075) * PERF_FX_GAP;
    while (vis.smokeAcc >= smokeGap) {
      vis.smokeAcc -= smokeGap;
      puffDmgSmoke(tx, ty, heading, cvx, cvy, hurt, (3.2 + smokeTier * 0.7) * k, k * sizeBoost);
    }
    // 低于 20% 才冒火，同样从机身中部冒
    if (hpK > 0.2) return;
    vis.fireAcc = (vis.fireAcc || 0) + dt;
    const fireHurt = clamp((0.2 - hpK) / 0.2, 0.45, 1);
    const fireGap = (0.055 - fireHurt * 0.028) * PERF_FX_GAP;
    while (vis.fireAcc >= fireGap) {
      vis.fireAcc -= fireGap;
      const along = 0.5 + Math.random() * 5;
      const lat = (Math.random() - 0.5) * 8 * k;
      puffDmgFire(
        player.x - cs * along - sn * lat,
        player.y - sn * along + cs * lat,
        heading, cvx, cvy, 4 * k, k,
      );
    }
  }

  function drawDmgSmoke(camera) {
    const vis = viewPad(48);
    for (let i = 0; i < MAX_DMG_FX; i++) {
      const p = dmgFx[i];
      if (!p.active || p.kind !== "smoke") continue;
      const s = screen(p.x, p.y, camera);
      if (s.x < vis.x0 || s.y < vis.y0 || s.x > vis.x1 || s.y > vis.y1) continue;
      const u = p.age / Math.max(p.life, 0.001);
      const fade = Math.pow(1 - u, 1.15);
      const r = p.size * (0.55 + u * 1.7);
      const a = fade * (0.22 + p.hurt * 0.38);
      fillPoly(ellipsePts(s.x, s.y, r, r * 0.72, p.rot, 8), p.hurt > 0.65 ? `rgba(58,50,44,${a})` : `rgba(74,72,70,${a})`);
      // 轻量档去掉内层暗斑，烟雾仍在，少一次多边形
      if (!PERF_LITE) {
        const ox = Math.cos(p.rot) * (-r * 0.12) - Math.sin(p.rot) * (-r * 0.08);
        const oy = Math.sin(p.rot) * (-r * 0.12) + Math.cos(p.rot) * (-r * 0.08);
        fillPoly(ellipsePts(s.x + ox, s.y + oy, r * 0.55, r * 0.4, p.rot, 8), `rgba(28,27,26,${fade * 0.12})`);
      }
    }
  }

  function drawDmgFire(camera) {
    const vis = viewPad(48);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < MAX_DMG_FX; i++) {
      const p = dmgFx[i];
      if (!p.active || p.kind !== "fire") continue;
      const s = screen(p.x, p.y, camera);
      if (s.x < vis.x0 || s.y < vis.y0 || s.x > vis.x1 || s.y > vis.y1) continue;
      const u = p.age / Math.max(p.life, 0.001);
      const fade = Math.pow(1 - u, 1.15);
      const r = p.size * (0.55 + u * 1.7);
      fillPoly(ellipsePts(s.x, s.y, r, r * 1.15, p.rot, 8), `rgba(255,90,24,${fade * 0.85})`);
      const ox = Math.cos(p.rot) * 0 - Math.sin(p.rot) * (-r * 0.15);
      const oy = Math.sin(p.rot) * 0 + Math.cos(p.rot) * (-r * 0.15);
      fillPoly(ellipsePts(s.x + ox, s.y + oy, r * 0.45, r * 0.7, p.rot, 8), `rgba(255,208,128,${fade * 0.7})`);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawFireBlasts(camera, dt) {
    const vis = viewPad(80);
    for (let i = 0; i < MAX_FIRE_BLASTS; i++) {
      const e = fireBlasts[i];
      if (!e.active) continue;
      e.age += dt;
      if (e.age >= e.life) {
        e.active = false;
        continue;
      }
      const p = screen(e.x, e.y, camera);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
      const u = e.age / e.life;
      const grow = 1 - Math.pow(1 - u, 1.2);
      const fade = Math.pow(1 - u, 0.65);
      const R = (14 + grow * 34) * e.size;
      const seed = e.seed || 0;
      const rh = (n) => {
        const x = Math.sin((seed + n) * 127.1) * 43758.5453;
        return x - Math.floor(x);
      };
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalCompositeOperation = "source-over";
      for (let k = 0; k < 11; k++) {
        const a = seed + k * 0.57 + u * 0.35;
        const flick = 0.72 + 0.28 * Math.sin(performance.now() / 1000 * 26 + k * 1.7 + seed);
        const len = R * (0.55 + rh(k) * 0.85) * flick;
        const w = R * (0.1 + rh(k + 4) * 0.14);
        ctx.fillStyle = `rgba(255,${42 + (k % 5) * 14},8,${0.5 * fade * flick})`;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-w, R * 0.04);
        ctx.lineTo(-w * 0.25, -len * 0.42);
        ctx.lineTo(0, -len);
        ctx.lineTo(w * 0.25, -len * 0.42);
        ctx.lineTo(w, R * 0.04);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      const diamond = (ox, oy, s, rot, color) => {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(rot);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.62, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.62, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      for (let k = 0; k < 6; k++) {
        const a = seed * 1.3 + k * 1.05;
        const s = R * (0.22 + rh(k + 8) * 0.28) * (1 - u * 0.35);
        diamond(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18, s, a + 0.4, `rgba(255,${130 + k * 12},24,${0.42 * fade})`);
      }
      diamond(0, -R * 0.04, R * 0.28 * (1 - u * 0.4), seed * 0.2, `rgba(255,210,70,${0.62 * fade})`);
      diamond(0, -R * 0.06, R * 0.12 * (1 - u * 0.5), seed * 0.35, `rgba(255,244,210,${0.8 * fade})`);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawEffect(effect, camera) {
    if (effect.ty === 0) return;
    const p = screen(effect.x, effect.y, camera);
    const u = clamp(effect.age / effect.life, 0, 1);
    const fade = 1 - u;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (5 + u * 18) * effect.size * fade, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3 * fade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (8 + u * 42) * effect.size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function hudFromWorld(x, y, camera) {
    const p = screen(x, y, camera);
    // 必须返回新对象：调用方常会连续取两点（如世界边界），不能共用 scratch
    if (VIEW_SCALE === 1) return { x: p.x, y: p.y };
    return {
      x: (p.x - W * 0.5) * VIEW_SCALE + W * 0.5,
      y: (p.y - H * 0.5) * VIEW_SCALE + H * 0.5,
    };
  }

  function drawMedkit(camera, now) {
    if (!medkit) return;
    drawPickupBox(medkit.x, medkit.y, medkit.kind, camera, now);
  }
  function drawPickupBox(x, y, kind, camera, now) {
    const bob = Math.sin(now / 280) * 4;
    const p = screen(x, y + bob, camera);
    const mag = kind === 1;
    // 子弹容量图标放大一?
    const k = mag ? 2 : 1;
    const vis = viewPad(24 * k);
    if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return;
    const s = 11;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(k, k);
    ctx.rotate(Math.sin(now / 520) * 0.1);
    ctx.fillStyle = mag ? "rgba(255,200,80,0.2)" : "rgba(70,255,150,0.18)";
    ctx.beginPath();
    ctx.arc(0, 0, 18 + Math.sin(now / 180) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mag ? "#2a2418" : "#f3f6fa";
    ctx.strokeStyle = mag ? "#ffcc66" : "#9aa7b4";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.rect(-s, -s, s * 2, s * 2);
    ctx.fill();
    ctx.stroke();
    if (mag) {
      ctx.fillStyle = "#ffe08a";
      ctx.font = "bold 10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+20", 0, 0);
    } else {
      ctx.fillStyle = "#e23b3b";
      ctx.fillRect(-2.5, -7.2, 5, 14.4);
      ctx.fillRect(-7.2, -2.5, 14.4, 5);
    }
    ctx.restore();
  }

  function drawHealBursts(camera, now) {
    for (let i = 0; i < MAX_HEAL_BURSTS; i++) {
      const h = healBursts[i];
      if (!h.active) continue;
      const u = (now - h.t0) / 420;
      if (u >= 1) {
        h.active = false;
        continue;
      }
      const p = screen(h.x, h.y, camera);
      const r = 8 + u * 30;
      ctx.save();
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = h.kind === "mag" ? "#ffe08a" : h.kind === "shield" ? "#7ec8ff" : "#7dffb0";
      ctx.lineWidth = 2.2;
      if (h.kind === "shield") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 0.7);
        ctx.lineTo(p.x, p.y + r * 0.7);
        ctx.moveTo(p.x - r * 0.7, p.y);
        ctx.lineTo(p.x + r * 0.7, p.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function pathShieldIcon(s) {
    const w = s;
    const h = s * 1.28;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(w * 0.92, -h * 0.92, w, -h * 0.35, w, -h * 0.08);
    ctx.bezierCurveTo(w, h * 0.42, w * 0.55, h * 0.78, 0, h);
    ctx.bezierCurveTo(-w * 0.55, h * 0.78, -w, h * 0.42, -w, -h * 0.08);
    ctx.bezierCurveTo(-w, -h * 0.35, -w * 0.92, -h * 0.92, 0, -h);
    ctx.closePath();
  }
  function paintShieldIcon(s, fill, stroke, lineW) {
    pathShieldIcon(s);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW || 1.6;
      ctx.stroke();
    }
  }

  function drawLocalShieldPickups(camera, now) {
    if (!localMatch || !localShieldPickups.length) return;
    for (const pk of localShieldPickups) {
      const bob = Math.sin(now / 260 + pk.x * 0.01) * 4;
      const p = screen(pk.x, pk.y + bob, camera);
      const vis = viewPad(28);
      if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) continue;
      const pulse = 15 + Math.sin(now / 160) * 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = "rgba(80,180,255,0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, pulse, 0, Math.PI * 2);
      ctx.fill();
      paintShieldIcon(11, "#1a4f9a", "#b8e6ff", 1.8);
      paintShieldIcon(6.5, "rgba(120,200,255,0.55)", "#e8f6ff", 1.1);
      ctx.restore();
    }
  }

  function drawPlayerShield(player, camera, now) {
    if (!(player.shieldT > 0) || player.respawn > 0) return;
    const p = screen(player.x, player.y, camera);
    const vis = viewPad(70);
    if (p.x < vis.x0 || p.y < vis.y0 || p.x > vis.x1 || p.y > vis.y1) return;
    // 围着飞机的蓝色护盾圈 + 剩余时间进度弧（比复活红圈大一圈，两者可同时显示?
    const u = clamp(player.shieldT / LOCAL_SHIELD_DURATION, 0, 1);
    const fade = clamp(player.shieldT / 0.25, 0, 1);
    const pulse = 0.75 + 0.25 * Math.sin(now / 140);
    const R = 44;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = fade;
    ctx.fillStyle = `rgba(47,125,255,${0.12 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,190,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = `rgba(90,175,255,${0.75 + 0.25 * pulse})`;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u);
    ctx.stroke();
    ctx.restore();
  }

  function hexRgb(hex) {
    const raw = String(hex || "#78d9ff").replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return { r: 120, g: 217, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function drawOnePad(pad, camera, now, label) {
    const a = screen(pad.x0, pad.y0, camera);
    const b = screen(pad.x1, pad.y1, camera);
    const x = a.x;
    const y = a.y;
    const w = b.x - a.x;
    const h = b.y - a.y;
    const vis = viewPad(8);
    if (x + w < vis.x0 || y + h < vis.y0 || x > vis.x1 || y > vis.y1) return;
    const me = camera;
    const inside = me.x >= pad.x0 - 24 && me.x <= pad.x1 + 24 && me.y >= pad.y0 - 24 && me.y <= pad.y1 + 24;
    const pulse = 0.12 + 0.06 * Math.sin(now / 1000 * 3.2);
    const rgb = hexRgb(pad.color);
    ctx.save();
    ctx.fillStyle = inside
      ? `rgba(${rgb.r},${rgb.g},${rgb.b},${0.22 + pulse})`
      : `rgba(${rgb.r},${rgb.g},${rgb.b},${0.12 + pulse * 0.4})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = inside ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)` : `rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.22)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
    ctx.font = "bold 13px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = inside ? "rgba(255,255,255,0.92)" : `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`;
    ctx.fillText(inside ? "+10 HP/s" : label, x + w / 2, y + h / 2);
    ctx.restore();
  }

  function drawRepairPad(camera, now) {
    if (factionPads.length) {
      for (const pad of factionPads) {
        drawOnePad(pad, camera, now, `TEAM ${(pad.team || 0) + 1}`);
      }
      return;
    }
    drawOnePad({
      x0: WORLD_LIMIT - PAD_SIZE,
      y0: -WORLD_LIMIT,
      x1: WORLD_LIMIT,
      y1: -WORLD_LIMIT + PAD_SIZE,
      color: "#50c896",
    }, camera, now, "REPAIR");
  }

  function drawWorldBoundMask(camera, now) {
    // X/Y 半幅可不同（??10000×800 ?±5000 / ±400?
    const a = hudFromWorld(-WORLD_LIMIT, -WORLD_Y_LIMIT, camera);
    const x0 = a.x, y0 = a.y;
    const b = hudFromWorld(WORLD_LIMIT, WORLD_Y_LIMIT, camera);
    const x1 = b.x, y1 = b.y;
    if (x0 <= 0 && y0 <= 0 && x1 >= W && y1 >= H) return;
    // 界外不透明黑；不铺场景（上方已 clip?
    ctx.fillStyle = OUT_OF_BOUNDS_FILL;
    if (y0 > 0) ctx.fillRect(0, 0, W, y0);
    if (y1 < H) ctx.fillRect(0, y1, W, H - y1);
    const midTop = Math.max(0, y0);
    const midBot = Math.min(H, y1);
    const midH = midBot - midTop;
    if (midH > 0) {
      if (x0 > 0) ctx.fillRect(0, midTop, x0, midH);
      if (x1 < W) ctx.fillRect(x1, midTop, W - x1, midH);
    }
    // 贴边界线：亮蓝（与星空点缀同色?
    ctx.strokeStyle = MAP_ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  function drawLockCorners(x, y, hw, hh, len, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - hw, y - hh + len); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw + len, y - hh);
    ctx.moveTo(x + hw - len, y - hh); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh + len);
    ctx.moveTo(x + hw, y + hh - len); ctx.lineTo(x + hw, y + hh); ctx.lineTo(x + hw - len, y + hh);
    ctx.moveTo(x - hw + len, y + hh); ctx.lineTo(x - hw, y + hh); ctx.lineTo(x - hw, y + hh - len);
    ctx.stroke();
  }

  function drawMissileLocks(players, camera, now) {
    if (currentWeapon !== "missile" || subAimMode()) return;
    const pulse = 0.78 + 0.16 * Math.sin(now / 1000 * 9);
    for (const p of listLockables(players, camera)) {
      const h = hudFromWorld(p.x, p.y, camera);
      const focus = p.id === missileFocus;
      const hw = focus ? 26 : 22;
      const hh = focus ? 28 : 24;
      const len = focus ? 12 : 9;
      if (!focus) {
        drawLockCorners(h.x, h.y, hw, hh, len, `rgba(255,255,255,${pulse})`, 1.6);
        continue;
      }
      const at = (now - lockAnimT0) / 1000;
      const k = at < 0 ? 1 : Math.min(1, at / 0.34);
      const ease = 1 - Math.pow(1 - k, 3);
      const slam = at >= 0 && at < 0.34;
      const sc = slam ? lerp(2.85, 1, ease) : 1;
      const blink = slam || ((now / 1000 * 5) % 1 < 0.55);
      if (slam) {
        ctx.fillStyle = `rgba(40,220,70,${0.28 * (1 - ease)})`;
        ctx.fillRect(h.x - hw * sc, h.y - hh * sc, hw * sc * 2, hh * sc * 2);
      } else if (blink) {
        ctx.fillStyle = "rgba(40,220,70,0.16)";
        ctx.fillRect(h.x - hw, h.y - hh, hw * 2, hh * 2);
      }
      drawLockCorners(h.x, h.y, hw * sc, hh * sc, len * (slam ? lerp(1.8, 1, ease) : 1), `rgba(46,232,90,${blink ? 1 : 0.12})`, slam ? 3.2 : 2.2);
      drawLockCorners(h.x, h.y, hw * 0.92, hh * 0.92, len * 0.72, `rgba(234,255,234,${blink ? 0.95 : 0.08})`, 1.1);
    }
  }

  function drawMinimap(players, me, asteroidsArr, now, missilesList) {
    // 左上信息区：左右让刘海，上下贴边；右上留给微信胶?
    const safe = (typeof GameGlobal !== "undefined" && GameGlobal.safeUI) || { left: 8, top: 4, right: 8, bottom: 6, contentRight: W };
    const size = Math.min(120, Math.min(W, H) * 0.24);
    const x0 = Math.max(6, Number(safe.edgeLeft != null ? safe.edgeLeft : safe.left) || 6);
    const y0 = Math.max(4, Number(safe.top) || 4);
    const hudCapRight = safe.capsule ? (safe.capsule.left - 8) : (Number(safe.contentRight) || (W - 10));
    if (mapModeBtn) mapModeBtn.style.display = "none";
    const below = y0 + size + 6;
    if (IS_MOBILE && statusWrap) {
      statusWrap.style.left = `${x0}px`;
      statusWrap.style.top = `${below}px`;
    }
    if (gearBtn && phase === "playing") {
      gearBtn.style.display = "grid";
      const gx = x0 + size + 8;
      const gy = y0;
      // 齿轮本身也不得进入胶?
      if (gx + 34 <= hudCapRight) {
        gearBtn.style.left = `${gx}px`;
        gearBtn.style.top = `${gy}px`;
      } else {
        gearBtn.style.left = `${x0}px`;
        gearBtn.style.top = `${below}px`;
      }
    }
    if (matchTimerEl && phase === "playing" && matchLeft >= 0) {
      const tx = x0 + size + 8 + 34 + 8;
      const ty = y0;
      if (tx + 78 <= hudCapRight) {
        matchTimerEl.style.left = `${tx}px`;
        matchTimerEl.style.top = `${ty}px`;
      } else {
        // 训练引导前几步：场上飞机全部暂停
        matchTimerEl.style.left = `${x0}px`;
        matchTimerEl.style.top = `${below + 34}px`;
      }
    }
    const spanX = WORLD_LIMIT * 2;
    const spanY = WORLD_Y_LIMIT * 2;
    const toMap = (wx, wy) => ({
      x: x0 + ((wx + WORLD_LIMIT) / spanX) * size,
      y: y0 + ((wy + WORLD_Y_LIMIT) / spanY) * size,
    });
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 16, 0.78)";
    ctx.strokeStyle = "rgba(180, 196, 210, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(x0 + size / 2, y0);
    ctx.lineTo(x0 + size / 2, y0 + size);
    ctx.moveTo(x0, y0 + size / 2);
    ctx.lineTo(x0 + size, y0 + size / 2);
    ctx.stroke();

    const pads = factionPads.length ? factionPads : [{
      x0: WORLD_LIMIT - PAD_SIZE,
      y0: -WORLD_LIMIT,
      x1: WORLD_LIMIT,
      y1: -WORLD_LIMIT + PAD_SIZE,
      color: "#50c896",
    }];
    for (const pad of pads) {
      const a = toMap(pad.x0, pad.y0);
      const b = toMap(pad.x1, pad.y1);
      const rgb = hexRgb(pad.color);
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.28)`;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    if (level4Goal) {
      const a = toMap(level4Goal.x0, level4Goal.y0);
      const b = toMap(level4Goal.x1, level4Goal.y1);
      ctx.fillStyle = "rgba(80,255,140,0.28)";
      ctx.fillRect(a.x, a.y, Math.max(2, b.x - a.x), Math.max(2, b.y - a.y));
      ctx.strokeStyle = "rgba(120,255,170,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(a.x, a.y, Math.max(2, b.x - a.x), Math.max(2, b.y - a.y));
    }
    if (level5Exit && satGrabCount >= LEVEL_SAT_GRAB_TOTAL) {
      const a = toMap(level5Exit.x0, level5Exit.y0);
      const b = toMap(level5Exit.x1, level5Exit.y1);
      ctx.fillStyle = "rgba(90,200,255,0.28)";
      ctx.fillRect(a.x, a.y, Math.max(2, b.x - a.x), Math.max(2, b.y - a.y));
      ctx.strokeStyle = "rgba(140,220,255,0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(a.x, a.y, Math.max(2, b.x - a.x), Math.max(2, b.y - a.y));
    }

    const dots = new Map();
    for (const p of players) {
      if (p && p.id != null && Number.isFinite(p.x) && Number.isFinite(p.y)) dots.set(p.id, p);
    }
    if (me && myId != null) dots.set(myId, me);
    // 本地局补齐全部飞机（含 AI?
    if (localMatch) {
      for (const c of localCrafts) {
        if (c && c.id != null && Number.isFinite(c.x) && Number.isFinite(c.y)) dots.set(c.id, c);
      }
    }
    for (const [id, e] of entPlayers) {
      if (dots.has(id) || !e.s.length) continue;
      const last = e.s[e.s.length - 1];
      dots.set(id, { id, x: last.x, y: last.y });
    }

    const selfTeam = me && me.team != null ? me.team : 0;
    for (const p of dots.values()) {
      const q = toMap(p.x, p.y);
      const self = p.id === myId;
      const dead = p.respawn > 0 || (p.hp != null && p.hp <= 0 && !p.blade);
      const foe = !self && (p.blade || (p.team != null && p.team !== selfTeam));
      const r = self ? 3.4 : (foe ? 3.0 : 2.6);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      const info = roster.get(p.id);
      const aliveColor = foe
        ? "#ff5a4f"
        : (self ? "#3b9bff" : (factionPads.length && info && info.color ? info.color : "#3b9bff"));
      ctx.fillStyle = dead ? "rgba(160,170,180,0.45)" : aliveColor;
      ctx.fill();
      if (self && !dead) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + Math.cos(me.heading || 0) * 7, q.y + Math.sin(me.heading || 0) * 7);
        ctx.strokeStyle = "rgba(180,220,255,0.9)";
        ctx.stroke();
      }
    }
    // NPC 母舰：红色大点（对齐 Steam 雷达?
    for (const m of localMotherships) {
      if (m.dead || m.alive === false) continue;
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
      const q = toMap(m.x, m.y);
      ctx.fillStyle = "#ff5046";
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,220,200,0.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 空中地雷：琥珀小方?
    for (const m of localAirMines) {
      if (!m || m.dead) continue;
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
      const q = toMap(m.x, m.y);
      ctx.fillStyle = m.armed ? "#ff5a48" : "#ffb24a";
      ctx.fillRect(q.x - 2.2, q.y - 2.2, 4.4, 4.4);
    }
    // 待拾取：联机药箱 / 本地子弹容量 / 保护?
    if (medkit) {
      const qk = toMap(medkit.x, medkit.y);
      ctx.fillStyle = medkit.kind === 1 ? "#ffcc66" : "#5dff9a";
      ctx.fillRect(qk.x - 2.2, qk.y - 2.2, 4.4, 4.4);
    }
    for (const pk of localMagPickups) {
      if (!pk || !Number.isFinite(pk.x) || !Number.isFinite(pk.y)) continue;
      const q = toMap(pk.x, pk.y);
      ctx.fillStyle = "#ffcc66";
      ctx.fillRect(q.x - 2.2, q.y - 2.2, 4.4, 4.4);
    }
    for (const pk of localShieldPickups) {
      if (!pk || !Number.isFinite(pk.x) || !Number.isFinite(pk.y)) continue;
      const q = toMap(pk.x, pk.y);
      ctx.fillStyle = "#4aa8ff";
      ctx.beginPath();
      ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(180, 196, 210, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, size, size);
  }

  function drawShieldBar(me) {
    if (!me || !(me.shieldT > 0) || me.respawn > 0) return;
    const u = clamp(me.shieldT / LOCAL_SHIELD_DURATION, 0, 1);
    const icon = 11;
    const gap = 8;
    const pad = 18;
    const bh = 3;
    const bw = Math.max(60, W - pad * 2 - icon * 2 - gap);
    const total = icon * 2 + gap + bw;
    const x0 = (W - total) * 0.5;
    const y = H - 12;
    ctx.save();
    ctx.translate(x0 + icon, y - 1);
    paintShieldIcon(icon, "#2f7dff", "#ffffff", 1.4);
    paintShieldIcon(icon * 0.55, "rgba(180,220,255,0.7)", null, 0);
    ctx.restore();
    const bx = x0 + icon * 2 + gap;
    const by = y - bh * 0.5;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#2f7dff";
    ctx.fillRect(bx, by, bw * u, bh);
    ctx.restore();
  }

  function drawRespawnBar(me, now) {
    if (!IS_MOBILE) return;
    if (!me || !(me.respawn > 0)) {
      respawnAnimT0 = 0;
      return;
    }
    if (!respawnAnimT0) respawnAnimT0 = now - (RESPAWN_TIME - me.respawn) * 1000;
    const left = clamp(RESPAWN_TIME - (now - respawnAnimT0) / 1000, 0, RESPAWN_TIME);
    const u = 1 - left / RESPAWN_TIME;
    const bw = 168;
    const bh = 10;
    const x = (W - bw) / 2;
    const y = H / 2;
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 14, 0.78)";
    ctx.strokeStyle = "rgba(180, 196, 210, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x - 8, y - 22, bw + 16, 44, 8);
    else ctx.rect(x - 8, y - 22, bw + 16, 44);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c8d8e2";
    ctx.font = "12px Segoe UI, Microsoft YaHei, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("RESPAWN  " + left.toFixed(1) + "s", x, y - 6);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = u > 0.72 ? "#55e487" : "#ffe28a";
    ctx.fillRect(x, y, bw * u, bh);
    ctx.strokeStyle = "rgba(180, 196, 210, 0.55)";
    ctx.strokeRect(x, y, bw, bh);
    ctx.restore();
  }

  function updateFlightUi(me) {
    const throttle = clamp(IS_MOBILE ? speedLever : ((me && me.throttle) || 0), 0, 1);
    const level = Math.round(throttle * BARS);
    if (bars && bars.length) bars.forEach((bar, i) => bar.classList.toggle("on", i < level));
    const thumb = $("thumb");
    if (thumb && thumb.style) thumb.style.top = `${(1 - throttle) * (120 - 24) + 4}px`;
    $("left")?.classList.toggle("on", keys.left);
    $("right")?.classList.toggle("on", keys.right);
    $("flyBtn")?.classList.toggle("on", flyStick.active);
    $("brake")?.classList.toggle("on", keys.brake || !!(me && me.brake));
    $("gearF")?.classList.toggle("on", true);
  }

  function drawAim() {
    if (!pointer.left) return;
    ctx.strokeStyle = "rgba(120,217,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
    ctx.moveTo(pointer.x - 16, pointer.y);
    ctx.lineTo(pointer.x - 6, pointer.y);
    ctx.moveTo(pointer.x + 6, pointer.y);
    ctx.lineTo(pointer.x + 16, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 16);
    ctx.lineTo(pointer.x, pointer.y - 6);
    ctx.moveTo(pointer.x, pointer.y + 6);
    ctx.lineTo(pointer.x, pointer.y + 16);
    ctx.stroke();
  }
})();
