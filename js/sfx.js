(() => {
  const performance = (typeof GameGlobal !== "undefined" && GameGlobal.performance && typeof GameGlobal.performance.now === "function")
    ? GameGlobal.performance
    : { now() { return Date.now(); } };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dbGain(db) { return Math.pow(10, db / 20); }
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  const SFX_DIR = "audio/sfx/";
  const ONESHOT_FILES = [
    "shot", "missile", "select", "tick", "hit", "boom", "chip", "bump", "dry",
    "ping0", "ping1", "ping2", "ping3",
  ];
  const LOOP_FILES = ["cannon", "engine", "core", "air"];

  let ac = null;
  let master = null;
  let ready = false;
  let loading = false;
  let muted = false;
  let cannonOn = false;
  let chipAt = 0;
  let bumpAt = 0;
  let dryAt = 0;
  let pingAt = 0;
  const loops = {};
  const oneshots = {};
  const liveShots = [];
  let engK = 0, coreK = 0, airK = 0;
  let oEngK = 0, oCoreK = 0, oAirK = 0;
  let otherCannonOn = false;
  let gatOn = false;

  function readPackageFile(filePath) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof wx !== "undefined" && typeof wx.getFileSystemManager === "function") {
          wx.getFileSystemManager().readFile({
            filePath,
            success: (res) => resolve(res.data),
            fail: (err) => reject(err || new Error("readFile fail " + filePath)),
          });
          return;
        }
      } catch (e) {}
      if (typeof fetch === "function") {
        fetch(filePath).then((r) => {
          if (!r.ok) throw new Error("fetch " + filePath + " " + r.status);
          return r.arrayBuffer();
        }).then(resolve, reject);
        return;
      }
      reject(new Error("no file loader for " + filePath));
    });
  }

  function decodeAudio(ab) {
    return new Promise((resolve, reject) => {
      if (!ac) {
        reject(new Error("no audio context"));
        return;
      }
      let settled = false;
      const ok = (buf) => { if (!settled) { settled = true; resolve(buf); } };
      const bad = (err) => { if (!settled) { settled = true; reject(err || new Error("decode fail")); } };
      try {
        const ret = ac.decodeAudioData(ab, ok, bad);
        if (ret && typeof ret.then === "function") ret.then(ok, bad);
      } catch (e) {
        bad(e);
      }
    });
  }

  async function loadBuffer(name) {
    const ab = await readPackageFile(SFX_DIR + name + ".mp3");
    return decodeAudio(ab);
  }

  function startLoop(buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(master);
    src.start();
    return { src, gain: g };
  }

  function setLoop(name, db, rate) {
    const L = loops[name];
    if (!L) return;
    const g = db < -70 ? 0 : dbGain(db);
    L.gain.gain.setTargetAtTime(g, ac.currentTime, 0.03);
    L.src.playbackRate.setTargetAtTime(rate, ac.currentTime, 0.04);
  }

  function cutLoop(name) {
    const L = loops[name];
    if (!L || !ac) return;
    try {
      L.gain.gain.cancelScheduledValues(ac.currentTime);
      L.gain.gain.setValueAtTime(0, ac.currentTime);
    } catch (e) {
      try { L.gain.gain.value = 0; } catch (e2) {}
    }
  }

  function killLiveNode(n) {
    if (!n) return;
    try { n.src.onended = null; } catch (e) {}
    try { n.src.stop(); } catch (e) {}
    try { n.src.disconnect(); } catch (e) {}
    try { n.gain.disconnect(); } catch (e) {}
  }

  function stopLiveShots() {
    for (const n of liveShots.splice(0)) killLiveNode(n);
  }

  /** 掐掉仍在播的导弹发射音；ownerId 有值时只掐该机，否则全掐 */
  function stopMissileShots(ownerId) {
    const filter = ownerId != null && ownerId !== undefined;
    const oid = filter ? Number(ownerId) : 0;
    for (let i = liveShots.length - 1; i >= 0; i--) {
      const n = liveShots[i];
      if (!n || n.tag !== "missile") continue;
      if (filter && Number(n.ownerId) !== oid) continue;
      liveShots.splice(i, 1);
      killLiveNode(n);
    }
  }

  function silenceAllLoops() {
    stopLiveShots();
    if (!ready) return;
    engK = coreK = airK = 0;
    oEngK = oCoreK = oAirK = 0;
    cannonOn = false;
    otherCannonOn = false;
    ["engine", "core", "air", "cannon", "engine2", "core2", "air2", "cannon2", "gatSpin", "gatFire"].forEach(cutLoop);
    gatOn = false;
  }

  function disposeLoopNodes() {
    for (const name of Object.keys(loops)) {
      const L = loops[name];
      if (!L) continue;
      try { L.src.stop(); } catch (e) {}
      try { L.src.disconnect(); } catch (e) {}
      try { L.gain.disconnect(); } catch (e) {}
      delete loops[name];
    }
  }

  function clearBuffers() {
    for (const name of Object.keys(oneshots)) delete oneshots[name];
  }

  function playBuf(name, volDb, rate, meta) {
    if (!ready || muted) return;
    const buf = oneshots[name];
    if (!buf) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate || 1;
    const g = ac.createGain();
    g.gain.value = dbGain(volDb);
    src.connect(g);
    g.connect(master);
    const node = { src, gain: g, tag: meta && meta.tag, ownerId: meta && meta.ownerId };
    liveShots.push(node);
    try {
      src.onended = () => {
        const i = liveShots.indexOf(node);
        if (i >= 0) liveShots.splice(i, 1);
        try { g.disconnect(); } catch (e) {}
      };
    } catch (e) {}
    src.start();
  }

  // 双管加特林：合成两条循环轨（无需音频文件）
  // spin：电机啸叫 + 枪管转动的咔嗒声；fire：连发「brrrt」，每秒 GAT_FIRE_HZ 发
  const GAT_FIRE_HZ = 22;
  function synthGatling() {
    const sr = ac.sampleRate || 44100;
    const n = sr; // 1 秒，整数周期便于无缝循环
    const spin = ac.createBuffer(1, n, sr);
    const sd = spin.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 0;
      // 电机啸叫：180Hz 锯齿近似（前 7 次谐波）+ 一点 2 倍频金属感
      for (let h = 1; h <= 7; h++) v += Math.sin(2 * Math.PI * 180 * h * t) / h;
      v *= 0.16;
      v += Math.sin(2 * Math.PI * 360 * t + Math.sin(2 * Math.PI * 6 * t) * 0.8) * 0.05;
      // 气流嘶声（低通噪声）
      lp += (Math.random() * 2 - 1 - lp) * 0.12;
      v += lp * 0.22;
      // 枪管转过击发位的咔嗒：每秒 30 下
      const ph = (t * 30) % 1;
      if (ph < 0.06) v += (Math.random() * 2 - 1) * 0.35 * Math.exp(-ph * 90);
      sd[i] = v;
    }
    const fire = ac.createBuffer(1, n, sr);
    const fd = fire.getChannelData(0);
    const per = n / GAT_FIRE_HZ;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      const k = (i % per) / sr; // 距本发的时间（秒）
      // 爆鸣：低通噪声快速衰减 + 低频「咚」
      lp2 += (Math.random() * 2 - 1 - lp2) * 0.45;
      let v = lp2 * Math.exp(-k * 140) * 0.95;
      v += Math.sin(2 * Math.PI * 82 * k) * Math.exp(-k * 55) * 0.6;
      v += (Math.random() * 2 - 1) * Math.exp(-k * 600) * 0.4;
      fd[i] = Math.max(-1, Math.min(1, v));
    }
    loops.gatSpin = startLoop(spin);
    loops.gatFire = startLoop(fire);
  }

  // 加农炮单发：炮口爆裂 + 下坠低频「轰」+ 低沉滚动尾音 + 后坐机械撞击
  function synthCannon() {
    const sr = ac.sampleRate || 44100;
    const n = Math.floor(sr * 1.2);
    const buf = ac.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let ph = 0, lpA = 0, lpB = 0, lpC = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = Math.random() * 2 - 1;
      // 炮口爆裂：高通噪声，极快衰减
      const hp = w - prev; prev = w;
      let v = hp * Math.exp(-t * 70) * 0.7;
      // 主体「轰」：140Hz → 38Hz 快速下坠的正弦
      const f = 38 + 102 * Math.exp(-t * 16);
      ph += 2 * Math.PI * f / sr;
      v += Math.sin(ph) * Math.exp(-t * 6.5) * 1.15;
      // 冲击波闷响：中低频噪声
      lpA += (w - lpA) * 0.12;
      v += lpA * Math.exp(-t * 22) * 1.6;
      // 滚动尾音：深度低通噪声，慢衰减
      lpB += (w - lpB) * 0.018;
      lpC += (lpB - lpC) * 0.05;
      v += lpC * Math.exp(-t * 3.6) * 9;
      // 后坐 / 炮闩金属撞击（约 70ms 处）
      const k = t - 0.07;
      if (k > 0) v += Math.sin(2 * Math.PI * 1150 * k) * Math.sin(2 * Math.PI * 1730 * k) * Math.exp(-k * 55) * 0.12;
      // 入场 2ms 淡入，避免爆音
      if (t < 0.002) v *= t / 0.002;
      d[i] = Math.tanh(v * 1.35) * 0.95;
    }
    oneshots.cannonShot = buf;
  }

  // 网页版激光音色「Deep beam」：分层参数原样搬过来，离线渲染成单发缓冲
  const LASER_FIRE_LAYERS = [
    { f0: 68, f1: 62, dur: .52, vol: .11, type: "sine", attack: .02, sustain: 1, release: .16 },
    { f0: 74, f1: 68, dur: .5, vol: .07, type: "sine", attack: .022, sustain: 1, release: .16 },
    { f0: 136, f1: 124, dur: .48, vol: .045, type: "triangle", attack: .024, sustain: 1, release: .14 },
    { f0: 240, f1: 720, dur: .09, vol: .09, type: "sine", attack: .004 },
    { f0: 360, f1: 880, dur: .07, vol: .045, type: "triangle", attack: .003 },
    { noise: 1, filter: "lowpass", f0: 420, f1: 180, dur: .5, vol: .04, attack: .02, sustain: 1, release: .16 },
  ];
  const LASER_HIT_LAYERS = [
    { f0: 2100, f1: 1400, dur: .045, vol: .09, type: "sine", attack: .001 },
    { noise: 1, filter: "highpass", f0: 4200, f1: 2200, dur: .028, vol: .06, attack: .001 },
  ];
  function renderLayers(layers) {
    const sr = ac.sampleRate || 44100;
    let total = 0.05;
    for (const L of layers) total = Math.max(total, (L.delay || 0) + (L.dur || 0.1) + 0.02);
    const n = Math.ceil(sr * total);
    const buf = ac.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (const L of layers) {
      const off = L.delay || 0;
      const dur = L.dur || 0.1;
      const atk = L.attack || 0.006;
      const vol = L.vol || 0.2;
      const rel = L.sustain ? Math.min(L.release != null ? L.release : 0.12, Math.max(0.02, dur - atk)) : dur - atk;
      const decayFrom = off + dur - rel;
      const f0 = Math.max(20, L.f0 || 440);
      const f1 = L.f1 ? Math.max(20, L.f1) : f0;
      let ph = 0, low = 0, band = 0;
      const q = 1 / (L.q || 0.707);
      const i0 = Math.floor(off * sr);
      const i1 = Math.min(n, Math.ceil((off + dur) * sr));
      for (let i = i0; i < i1; i++) {
        const t = i / sr - off;
        let g;
        if (t < atk) g = 0.0001 + (vol - 0.0001) * (t / atk);
        else if (off + t < decayFrom) g = vol;
        else g = vol * Math.pow(0.0003 / vol, (off + t - Math.max(decayFrom, off + atk)) / Math.max(0.001, rel));
        const f = f0 * Math.pow(f1 / f0, t / dur);
        let v;
        if (L.noise) {
          const fc = 2 * Math.sin(Math.PI * Math.min(f, sr / 6) / sr);
          const x = Math.random() * 2 - 1;
          low += fc * band;
          const high = x - low - q * band;
          band += fc * high;
          v = L.filter === "lowpass" ? low : L.filter === "highpass" ? high : band;
        } else {
          ph += f / sr;
          ph -= Math.floor(ph);
          v = L.type === "triangle" ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(2 * Math.PI * ph);
        }
        d[i] += v * g;
      }
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < n; i++) d[i] = d[i] / peak * 0.9;
    return buf;
  }
  // 电磁脉冲：发射 = 高压放电「滋啪」；命中 = 目标身上 1 秒电流「滋滋」
  function synthEmp() {
    const sr = ac.sampleRate || 44100;
    const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
    {
      const n = Math.floor(sr * 0.5);
      const buf = ac.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      let prev = 0, ring = 0, ringV = 0, ph1 = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = Math.random() * 2 - 1;
        // 放电瞬间的爆裂（高通噪声）
        const hp = w - prev; prev = w;
        let v = hp * Math.exp(-t * 70) * 0.8;
        // 电弧噼啪：随机脉冲 + 短促金属振铃
        if (Math.random() < 0.012 * Math.exp(-t * 6)) { ring = 1; ringV = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); }
        ring *= 0.93;
        v += ringV * ring * Math.sin(i * 1.9);
        // 高压嗡鸣：120Hz 锯齿 + 抖动的 2 倍频
        ph1 += 120 / sr;
        ph2 += (240 + Math.sin(t * 90) * 30) / sr;
        const am = 0.6 + 0.4 * (Math.random() < 0.5 ? 1 : 0.3);
        v += (saw(ph1) * 0.35 + saw(ph2) * 0.2) * am * Math.exp(-t * 6.5);
        // 下扫「咻」：2600 → 260Hz
        const f = 260 + 2340 * Math.exp(-t * 14);
        v += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 37 * t) * 2) * Math.exp(-t * 9) * 0.35;
        if (t < 0.002) v *= t / 0.002;
        d[i] = Math.tanh(v * 1.3) * 0.9;
      }
      oneshots.empFire = buf;
    }
    {
      const n = Math.floor(sr * 1.0);
      const buf = ac.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      let ph = 0, gate = 1, gateLeft = 0, ring = 0, ringV = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        // 电流时断时续：每 15~60ms 随机切换强弱
        if (--gateLeft <= 0) { gate = Math.random() < 0.7 ? 1 : 0.25; gateLeft = (0.015 + Math.random() * 0.045) * sr; }
        ph += (95 + Math.random() * 6) / sr;
        let v = (saw(ph) * 0.4 + saw(ph * 3) * 0.15) * gate;
        lp += ((Math.random() * 2 - 1) - lp) * 0.5;
        v += lp * 0.25 * gate;
        if (Math.random() < 0.006) { ring = 1; ringV = (Math.random() < 0.5 ? -1 : 1) * 0.7; }
        ring *= 0.9;
        v += ringV * ring * Math.sin(i * 2.3);
        const env = Math.min(1, t / 0.01) * (t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1);
        d[i] = Math.tanh(v * 1.4 * env) * 0.85;
      }
      oneshots.empZap = buf;
    }
  }

  function synthLaser() {
    oneshots.laserFire = renderLayers(LASER_FIRE_LAYERS);
    oneshots.laserHit = renderLayers(LASER_HIT_LAYERS);
  }

  // 多弹头一级舱脱落：金属解扣 + 短泄压呼气（不是爆炸）
  function synthMirvSep() {
    const sr = ac.sampleRate || 44100;
    const n = Math.floor(sr * 0.42);
    const buf = ac.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let prev = 0;
    let lp = 0;
    let ring = 0;
    let ringPh = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = Math.random() * 2 - 1;
      const hp = w - prev;
      prev = w;
      // 解扣撞击：极短低沉金属闷响
      let v = 0;
      if (t < 0.045) {
        const thump = Math.sin(2 * Math.PI * (95 + t * 40) * t) * Math.exp(-t * 55);
        const clack = hp * Math.exp(-t * 90) * 0.55;
        v += thump * 0.55 + clack;
      }
      // 第二下轻扣（另一侧舱体，略延迟）
      if (t > 0.028 && t < 0.09) {
        const u = t - 0.028;
        v += Math.sin(2 * Math.PI * (160 + u * 80) * u) * Math.exp(-u * 70) * 0.28;
        v += hp * Math.exp(-u * 100) * 0.22;
      }
      // 短金属振铃（销钉崩开）
      if (t < 0.12 && Math.random() < 0.04 * Math.exp(-t * 18)) {
        ring = 0.7 + Math.random() * 0.3;
        ringPh = 0;
      }
      ring *= 0.965;
      ringPh += (780 + Math.sin(t * 40) * 60) / sr;
      v += Math.sin(2 * Math.PI * ringPh) * ring * 0.18;
      // 泄压呼气：带通噪声下扫，像舱内气体泄出
      const fc = 900 + 1400 * Math.exp(-t * 7);
      lp += (w - lp) * clamp(fc / (sr * 0.35), 0.02, 0.35);
      const hissEnv = Math.exp(-t * 4.2) * (t < 0.01 ? t / 0.01 : 1) * (t > 0.28 ? Math.max(0, (0.42 - t) / 0.14) : 1);
      v += (lp - w * 0.15) * 0.32 * hissEnv;
      d[i] = Math.tanh(v * 1.15) * 0.82;
    }
    oneshots.mirvSep = buf;
  }

  async function buildFromFiles() {
    if (loading || ready) return;
    loading = true;
    try {
      const oneEntries = await Promise.all(ONESHOT_FILES.map(async (n) => [n, await loadBuffer(n)]));
      for (const [n, buf] of oneEntries) oneshots[n] = buf;
      const loopMap = {};
      const loopEntries = await Promise.all(LOOP_FILES.map(async (n) => [n, await loadBuffer(n)]));
      for (const [n, buf] of loopEntries) loopMap[n] = buf;
      loops.cannon = startLoop(loopMap.cannon);
      loops.engine = startLoop(loopMap.engine);
      loops.core = startLoop(loopMap.core);
      loops.air = startLoop(loopMap.air);
      loops.cannon2 = startLoop(loopMap.cannon);
      loops.engine2 = startLoop(loopMap.engine);
      loops.core2 = startLoop(loopMap.core);
      loops.air2 = startLoop(loopMap.air);
      try { synthGatling(); } catch (e) { console.error("[papa] gatling synth failed", e); }
      try { synthCannon(); } catch (e) { console.error("[papa] cannon synth failed", e); }
      try { synthLaser(); } catch (e) { console.error("[papa] laser synth failed", e); }
      try { synthEmp(); } catch (e) { console.error("[papa] emp synth failed", e); }
      try { synthMirvSep(); } catch (e) { console.error("[papa] mirvSep synth failed", e); }
      ready = true;
    } catch (e) {
      console.error("[papa] sfx load failed", e);
    } finally {
      loading = false;
    }
  }

  const api = {
    /** 仅创建/恢复 AudioContext（用户手势）；不加载音效文件 */
    unlock() {
      const AC = (typeof wx !== "undefined" && wx.createWebAudioContext)
        ? function () { return wx.createWebAudioContext(); }
        : (GameGlobal.AudioContext || GameGlobal.webkitAudioContext);
      if (!AC) return;
      if (!ac) {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.85;
        master.connect(ac.destination);
      }
      if (ac.state === "suspended") ac.resume();
    },
    /** 进入正式对局后再加载 mp3 并启动循环轨 */
    ensureLoaded() {
      api.unlock();
      if (!ac || ready || loading) return;
      buildFromFiles();
    },
    isReady() { return ready; },
    tickFlight(dt, power, braking, alive) {
      if (!ready) return;
      const moveToward = (v, t, d) => Math.abs(t - v) <= d ? t : v + Math.sign(t - v) * d;
      let want = (!muted && alive) ? clamp(power, 0, 1) : 0;
      engK = moveToward(engK, want, dt / 0.22);
      let coreWant = want > 0.48 ? smoothstep(0.48, 0.92, want) : 0;
      coreK = moveToward(coreK, coreWant, dt / 0.28);
      let airWant = 0;
      if (alive && !muted) airWant = braking ? lerp(0.22, 0.85, engK) : Math.pow(engK, 1.2) * 0.38;
      airK = moveToward(airK, airWant, dt / 0.16);
      const duck = cannonOn ? 3.5 : 0;
      if (engK < 0.025) setLoop("engine", -80, 0.94);
      else {
        const u = clamp((engK - 0.025) / 0.975, 0, 1);
        setLoop("engine", lerp(-18.5, -9.5, Math.pow(u, 0.55)) - duck, lerp(0.94, 1.10, u));
      }
      if (coreK < 0.04) setLoop("core", -80, 0.96);
      else setLoop("core", lerp(-22, -10.5, coreK) - duck, lerp(0.96, 1.06, coreK));
      if (airK < 0.04) setLoop("air", -80, 0.97);
      else setLoop("air", lerp(-26, -16.5, airK) - duck * 0.4, lerp(0.97, 1.08, airK));
    },
    setCannon(on) {
      if (!ready) return;
      if (muted) on = false;
      if (on === cannonOn) return;
      cannonOn = on;
      setLoop("cannon", on ? -1.5 : -80, 1);
      if (on) {
        try { loops.cannon.src.playbackRate.value = 1; } catch (e) {}
      }
    },
    /** 加特林：spin 0~1 枪管转速；firing 是否在出弹；hz 当前射速（发/秒） */
    setGatling(spin, firing, hz) {
      if (!ready || !loops.gatSpin) return;
      const s = muted ? 0 : clamp(spin || 0, 0, 1);
      const on = s > 0.02 || (firing && !muted);
      if (!on && !gatOn) return;
      gatOn = on;
      if (s > 0.02) setLoop("gatSpin", lerp(-28, -9, Math.pow(s, 0.7)), lerp(0.42, 1.3, s));
      else setLoop("gatSpin", -80, 0.42);
      if (firing && !muted) setLoop("gatFire", -3, clamp((hz || GAT_FIRE_HZ) / GAT_FIRE_HZ, 0.3, 1.25));
      else setLoop("gatFire", -80, 1);
    },
    setMuted(v) {
      muted = !!v;
      if (!ready || !ac) return;
      try {
        if (muted) {
          for (const L of Object.values(loops)) {
            if (L && L.gain) L.gain.gain.setTargetAtTime(0, ac.currentTime, 0.02);
          }
        }
      } catch (e) {}
    },
    isMuted() { return muted; },
    mute() { api.setMuted(true); },
    unmute() { api.setMuted(false); },
    toggleMute() {
      api.setMuted(!muted);
      return muted;
    },
    stopAll() {
      silenceAllLoops();
    },
    /** 离局释放：停掉循环节点并丢掉解码后的 PCM，下次进局再 ensureLoaded */
    unload() {
      try { silenceAllLoops(); } catch (e) {}
      try { disposeLoopNodes(); } catch (e) {}
      try { clearBuffers(); } catch (e) {}
      ready = false;
      loading = false;
      engK = coreK = airK = 0;
      oEngK = oCoreK = oAirK = 0;
      cannonOn = false;
      otherCannonOn = false;
      // 保留 AudioContext / master，避免再次手势解锁
    },
    tickOthers(dt, power, firing) {
      if (!ready) return;
      const moveToward = (v, t, d) => Math.abs(t - v) <= d ? t : v + Math.sign(t - v) * d;
      let want = (!muted) ? clamp(power, 0, 1) : 0;
      oEngK = moveToward(oEngK, want, dt / 0.22);
      let coreWant = want > 0.48 ? smoothstep(0.48, 0.92, want) : 0;
      oCoreK = moveToward(oCoreK, coreWant, dt / 0.28);
      let airWant = (!muted && want > 0) ? Math.pow(oEngK, 1.2) * 0.38 : 0;
      oAirK = moveToward(oAirK, airWant, dt / 0.16);
      if (oEngK < 0.025) setLoop("engine2", -80, 0.94);
      else {
        const u = clamp((oEngK - 0.025) / 0.975, 0, 1);
        setLoop("engine2", lerp(-22, -13, Math.pow(u, 0.55)), lerp(0.94, 1.10, u));
      }
      if (oCoreK < 0.04) setLoop("core2", -80, 0.96);
      else setLoop("core2", lerp(-26, -14, oCoreK), lerp(0.96, 1.06, oCoreK));
      if (oAirK < 0.04) setLoop("air2", -80, 0.97);
      else setLoop("air2", lerp(-30, -20, oAirK), lerp(0.97, 1.08, oAirK));
      let on = !!firing && !muted;
      if (on !== otherCannonOn) {
        otherCannonOn = on;
        setLoop("cannon2", on ? -5 : -80, 1);
        if (on) {
          try { loops.cannon2.src.playbackRate.value = 1; } catch (e) {}
        }
      }
    },
    playShot(volDb) { playBuf("shot", volDb == null ? -4 : volDb, 1); },
    playCannon() {
      if (oneshots.cannonShot) playBuf("cannonShot", -1, 0.94 + Math.random() * 0.1);
      else playBuf("shot", -3, 0.7);
    },
    playLaser() { playBuf("laserFire", -3, 1); },
    playLaserHit() { playBuf("laserHit", -8, 1); },
    playEmp() { playBuf("empFire", -4, 0.96 + Math.random() * 0.08); },
    playEmpZap() { playBuf("empZap", -9, 1); },
    playMissile(ownerId) { playBuf("missile", -2, 1, { tag: "missile", ownerId }); },
    stopMissile(ownerId) { stopMissileShots(ownerId); },
    /** 多弹头一级舱脱落：解扣 + 泄压，不是爆炸 */
    playMirvSep() {
      if (oneshots.mirvSep) playBuf("mirvSep", -5.5, 0.96 + Math.random() * 0.08);
      else {
        // 回退：轻闷响 + 短促干声，避免误用 boom
        playBuf("bump", -10, 1.15);
        playBuf("dry", -12, 1.35);
      }
    },
    playSelect() { playBuf("select", -8, 1); },
    playCountdown(sec) {
      const s = Math.max(0, Math.ceil(Number(sec) || 0));
      const u = clamp(1 - s / 10, 0, 1);
      const rate = lerp(0.92, 1.28, u);
      const vol = lerp(-10, -4, u);
      playBuf("tick", vol, rate);
    },
    /** 倒计时归零 / 对局结束 */
    playGameEnd() {
      playBuf("boom", -1.5, 0.68);
      playBuf("tick", -2.5, 0.48);
      playBuf("select", -6, 0.78);
    },
    /** 关卡过关：卡片飞出 + 落地确认 */
    playLevelWin() {
      playBuf("select", -3.5, 0.72);
      playBuf("tick", -7, 1.35);
      playBuf("boom", -10, 1.55);
      playBuf("missile", -14, 1.8);
    },
    playLevelWinLand() {
      playBuf("select", -5, 0.92);
      playBuf("tick", -6, 0.62);
      playBuf("boom", -9, 0.85);
    },
    playHit() { playBuf("hit", -2, 1); },
    playBoom() { playBuf("boom", -1, 1); },
    playDry() {
      const now = performance.now();
      if (now - dryAt < 140) return;
      dryAt = now;
      playBuf("dry", -6, 0.94 + Math.random() * 0.1);
    },
    playMetalPing() {
      const now = performance.now();
      if (now - pingAt < 28) return;
      pingAt = now;
      playBuf("ping" + ((Math.random() * 4) | 0), -2 + Math.random() * 3, 0.94 + Math.random() * 0.16);
    },
    playRockChip() {
      const now = performance.now();
      if (now - chipAt < 32) return;
      chipAt = now;
      playBuf("chip", -5, 0.86 + Math.random() * 0.3);
    },
    playRockBump(strength) {
      const k = Math.max(0, Math.min(1, strength == null ? 0.5 : strength));
      if (k < 0.08) return;
      const now = performance.now();
      if (now - bumpAt < 90) return;
      bumpAt = now;
      const vol = -16 + (-1.2 - -16) * Math.pow(k, 0.65);
      const rate = (1.12 + (0.82 - 1.12) * k) * (0.96 + Math.random() * 0.08);
      playBuf("bump", vol, rate);
    },
  };

  const root = GameGlobal;
  root.SkyAceSfx = api;
  GameGlobal.SkyAceSfx = api;
})();
