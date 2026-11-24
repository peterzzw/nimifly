/**
 * Steam 版 MS-01 母舰（尾焰 + 三门炮塔）
 * 来源：牛逼飞行员steam版/game.html
 * 关卡第2关：范围内发炮，不放无人机。
 */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const unitSpeedMul = (hpK) => (hpK <= 0.5 ? 0.5 : 1);
  const unitRateMul = (hpK, extraSmoke) => {
    let m = 1;
    if (extraSmoke || hpK <= 0.5) m *= 0.5;
    if (hpK <= 0.5) m *= 0.5;
    return m;
  };
  let ctx = null;
  let elapsed = 0;
  function ensureEllipse() {
    if (!ctx || typeof ctx.ellipse === "function") return;
    ctx.ellipse = function (x, y, rx, ry, rot, a0, a1) {
      this.save();
      this.translate(x, y);
      this.rotate(rot || 0);
      this.scale(rx, ry);
      this.arc(0, 0, 1, a0 || 0, a1 == null ? Math.PI * 2 : a1);
      this.restore();
    };
  }

  const CARRIER_SCALE = 136 / 348;
  const CS = CARRIER_SCALE;
  const CTAU = Math.PI * 2;
  const C_HULL = [[0, -172], [-4, -160], [-7, -144], [-10, -122], [-13, -96], [-17, -64], [-22, -28],
    [-27, 12], [-29, 50], [-28, 90], [-24, 124], [-18, 150], [-9, 166], [0, 174],
    [9, 166], [18, 150], [24, 124], [28, 90], [29, 50], [27, 12], [22, -28],
    [17, -64], [13, -96], [10, -122], [7, -144], [4, -160]];
  const C_WING = [[24, 24], [52, 54], [102, 98], [120, 122], [118, 150], [86, 152], [38, 144], [23, 108], [21, 62]];
  const C_WING_GREY = [[27, 42], [40, 66], [44, 118], [33, 126], [24, 100], [23, 70]];
  const C_WING_PANEL = [[56, 62], [96, 100], [100, 128], [70, 136], [46, 104], [44, 74]];
  const C_NOSE_SEG = [
    [[0, -172], [-6, -158], [-8, -144], [0, -136], [8, -144], [6, -158]],
    [[0, -148], [-9, -132], [-11, -116], [0, -108], [11, -116], [9, -132]],
    [[0, -120], [-12, -104], [-14, -88], [0, -80], [14, -88], [12, -104]]
  ];
  const C_SPINE = [[0, -168], [-4, -150], [-6, -108], [-5, -54], [-5, 0], [-6, 54], [-5, 106], [-4, 142],
    [0, 156], [4, 142], [5, 106], [6, 54], [5, 0], [5, -54], [6, -108], [4, -150]];
  const C_RIGHT = C_HULL.slice(13).concat([[0, -172]]);
  // 尾部 6 个方形喷口（demo 原值）：x 偏移 / 宽 / 喷口顶端 y / 相位 seed / 焰长系数
  const C_NOZZLES = [
    { x: -57, w: 21, ty: 148, seed: 1.7, len: .90 },
    { x: -34, w: 21, ty: 150, seed: 4.4, len: 1.08 },
    { x: -11, w: 21, ty: 148, seed: 7.1, len: .96 },
    { x: 11, w: 21, ty: 150, seed: 9.6, len: 1.12 },
    { x: 34, w: 21, ty: 148, seed: 12.3, len: .93 },
    { x: 57, w: 21, ty: 150, seed: 15.2, len: 1.03 }
  ];
  const CARRIER_NOZ_Y = 27;        // 焰根藏进喷口（demo 原值，×0.3908≈10.6px）
  // 三门双管炮塔（demo 原值局部坐标，机头朝 -y）：(0,-58) 脊线正中偏舰首 16.7% 舰长；(±54,82) 翼内段 ±45% 半翼展、偏舰尾 23.6%
  const C_TURRETS = [
    { x: 0, y: -58, s: 1.00 },
    { x: -54, y: 82, s: 1.05 },
    { x: 54, y: 82, s: 1.05 }
  ];
  const C_TUR = { baseR: 9.0, mountR: 11.8, barrel: 13.5, gap: 1.9, period: .30, stagger: .10, flashS: .034 }; // 300ms/门、100ms 错相
  // 三门炮固定配色：①脊线红 / ②左翼绿 / ③右翼蓝（core=弹头亮色，tip=炮口焰内芯浅色）
  const C_TUR_COLORS = [
    { core: '#ff5a4a', tip: '#ffc7c0', rgb: '255,90,74' },
    { core: '#5cf07a', tip: '#c8ffd6', rgb: '92,240,122' },
    { core: '#5bb8ff', tip: '#cfeaff', rgb: '91,184,255' },
  ];
  const C_MAG = { size: 1, recharge: .80 };  // 每门每次只打 1 发，冷却后再射
  // 充能环：门①（脊线）炮位，环径 48 局部 = 舰宽 240 的 20%（游戏 ≈18.8px）；线宽 2px
  const C_RING = { x: 0, y: -58, r: 24, lw: 2 / CS };
  const C_DOT = { r: 3.4, gap: 8, dy: 7 };   // 每门 5 枚弹点：半径/间距/相对安装座下缘偏移（局部单位）
  const CARRIER_RECOIL = 2 / CS;   // 后坐硬指标 2px（demo 1.25 → 取 2），换算回局部单位
  const CARRIER_MAX_SPD = 40;      // 巡航速度上限 u/s
  const CARRIER_ACCEL = 12;        // 缓入加速度 ≤12 u/s²
  const CARRIER_RANGE = 620;       // 炮塔开火距离
  // 进入此范围后母舰排队放无人机
  const C_BULLET_SPD = 520, C_BULLET_LIFE = 1.5, C_BULLET_CAP = 130;
  // 尾焰基准：满推 p=1 时 (12+38)=50px × len(0.90~1.12) = 45.0~56.0px ⊂ 44.6~59.0（= demo 114~151 × 0.3908）
  const C_FLAME_BOOT = 12 / CS, C_FLAME_GAIN = 38 / CS;
  const C_FLAME = { width: 3.4, core: '#fff6e4', mid: '#ffd08a', out: '#ff8a34' };
  const C_HIT_R = 52;              // 子弹对母舰圆判定（demo hitR 150×0.3908≈58.6 取 52）
  const C_SEG_HP = 30;             // 总 90 HP = 3 段 × 30；段界 = 缩放后局部 y ±23（-22.7 取整）

  function cPoly(pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function cLines(pts, color, lw = 1) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function cTrace(pts) {           // 只加子路径（配合 clip），不 beginPath
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.closePath();
  }
  function cMir(pts, s) { return pts.map(p => [p[0] * s, p[1]]); }
  function cLg(x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const st of stops) g.addColorStop(st[0], st[1]);
    return g;
  }
  function cDot(x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, CTAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function cHexA(h, a) {
    const n = parseInt(h.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // 母舰压暗：亮部 ×C_DIM_HI、暗部再加深一档 ×C_DIM_LO（仅装甲/结构色；炮口焰/子弹/尾焰/舷灯不动）
  const C_DIM_HI = 0.78, C_DIM_LO = 0.68;
  function cDim(h, f) {
    const n = parseInt(h.slice(1), 16);
    return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
  }
  function cDimAuto(h) {
    const n = parseInt(h.slice(1), 16);
    const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return cDim(h, lum > 120 ? C_DIM_HI : C_DIM_LO);
  }
  function cDimStops(stops) { return stops.map(([p, c]) => [p, c[0] === '#' ? cDimAuto(c) : c]); }
  function hullHalfAtC(y) {        // 机身半宽（右侧轮廓线性插值），用于板缝收边
    for (let i = 1; i < C_RIGHT.length; i++) {
      const a = C_RIGHT[i - 1], b = C_RIGHT[i];
      const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
      if (y >= lo && y <= hi) return Math.abs(a[0] + (b[0] - a[0]) * ((y - a[1]) / ((b[1] - a[1]) || 1)));
    }
    return 3;
  }


  const carrierHp = (m) => m.segHp[0] + m.segHp[1] + m.segHp[2];
  const carrierPower = (m) => 0.55 + 0.45 * (m.speed / CARRIER_MAX_SPD);
  const carrierBob = (m) => (Math.sin(elapsed * CTAU / 2.6 + m.wob) * 1.5 + Math.sin(elapsed * CTAU / (2.6 * 1.6) + m.wob * 2) * .5) * CS;
  function carrierFlick(seed) {
    const t = elapsed;
    return 1 + Math.sin(t * 31 + seed) * .07 + Math.sin(t * 17 + seed * 2.3) * .05 + Math.sin(t * 7.3 + seed) * .03;
  }
  function carrierFlameLenLocal(m, n) {
    return (C_FLAME_BOOT + C_FLAME_GAIN * clamp(carrierPower(m), 0, 1)) * n.len * carrierFlick(n.seed);
  }
  function carrierResetTurrets(m) {
    m.tur = C_TURRETS.map((t, i) => ({
      x: t.x, y: t.y, s: t.s, ang: m.baseHeading, cd: i * C_TUR.stagger,
      rec: 0, flash: 0, ci: i, ammo: C_MAG.size, rt: 0, lock: false, smokeAcc: 0
    }));
  }
  function carrierMuzzleWorld(m, t) {
    const L = (C_TUR.baseR * .5 + C_TUR.barrel) * t.s;
    const a = t.ang - m.heading;
    const lx = (t.x + L * Math.sin(a)) * CS;
    const ly = (t.y - L * Math.cos(a)) * CS;
    const beta = m.heading + Math.PI / 2;
    const cb = Math.cos(beta), sb = Math.sin(beta);
    return { x: m.x + lx * cb - ly * sb, y: m.y + carrierBob(m) + lx * sb + ly * cb };
  }
  function syncHp(m) {
    m.hp = carrierHp(m);
    m.maxHp = C_SEG_HP * 3;
    m.dead = !m.alive;
  }
  function create(x, y, heading, id) {
    const m = {
      id: id != null ? id : 9001,
      x, y,
      heading: heading || 0,
      baseHeading: heading || 0,
      speed: 0,
      segHp: [C_SEG_HP, C_SEG_HP, C_SEG_HP],
      alive: true,
      dead: false,
      wob: Math.random() * 10,
      phase: Math.random() * CTAU,
      smokedTurs: [],
      fireAcc: 0,
      tur: [],
      kind: "ms01",
      hp: C_SEG_HP * 3,
      maxHp: C_SEG_HP * 3,
    };
    carrierResetTurrets(m);
    return m;
  }
  function damage(m, hx, hy, dmg) {
    if (!m || !m.alive || !(dmg > 0)) return false;
    const beta = m.heading + Math.PI / 2;
    const dx = hx - m.x, dy = hy - m.y;
    const ly = -dx * Math.sin(beta) + dy * Math.cos(beta);
    const seg = ly < -23 ? 0 : ly <= 23 ? 1 : 2;
    if (m.segHp[seg] > 0) m.segHp[seg] = Math.max(0, m.segHp[seg] - dmg);
    syncHp(m);
    if (carrierHp(m) <= 0) {
      m.alive = false;
      m.dead = true;
      m.hp = 0;
      return true;
    }
    return false;
  }
  function update(m, dt, target, opts) {
    if (!m || !m.alive) return;
    opts = opts || {};
    elapsed = opts.elapsed != null ? opts.elapsed : (performance.now() / 1000);
    if (opts.freeze) return;
    const capSpd = CARRIER_MAX_SPD * unitSpeedMul(carrierHp(m) / (C_SEG_HP * 3));
    m.speed = Math.min(capSpd, m.speed + CARRIER_ACCEL * dt);
    m.heading = m.baseHeading + Math.sin(elapsed * CTAU / 20 + m.phase) * 0.15;
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
    if (!target) { syncHp(m); return; }
    const dx = target.x - m.x, dy = target.y - m.y;
    const dist = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    const aimX = target.x, aimY = target.y;
    const hpK = carrierHp(m) / (C_SEG_HP * 3);
    const wantSmoke = Math.min(m.tur.length, Math.floor((1 - hpK) / 0.3 + 1e-6));
    if (!m.smokedTurs) m.smokedTurs = [];
    while (m.smokedTurs.length < wantSmoke) {
      const pool = [];
      for (let k = 0; k < m.tur.length; k++) if (m.smokedTurs.indexOf(k) < 0) pool.push(k);
      if (!pool.length) break;
      m.smokedTurs.push(pool[(Math.random() * pool.length) | 0]);
    }
    while (m.smokedTurs.length > wantSmoke) m.smokedTurs.pop();
    const onFire = typeof opts.onFire === "function" ? opts.onFire : null;
    for (let i = 0; i < m.tur.length; i++) {
      const t = m.tur[i];
      if (t.rec > 0) { t.rec *= Math.exp(-dt / .05); if (t.rec < .02) t.rec = 0; }
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt);
      t.ang += clamp(angleDelta(desired, t.ang), -3 * dt, 3 * dt);
      if (m.smokedTurs.indexOf(i) >= 0) { if (t.cd < 0) t.cd = 0; continue; }
      const aligned = Math.abs(angleDelta(desired, t.ang)) < 0.15;
      // 打完 1 发后回充，回满才能再射
      if (t.ammo < C_MAG.size) {
        t.rt += dt;
        while (t.rt >= C_MAG.recharge) { t.rt -= C_MAG.recharge; t.ammo++; }
        if (t.lock && t.ammo >= C_MAG.size) t.lock = false;
      }
      if (!(dist <= CARRIER_RANGE) || !aligned) { if (t.cd < 0) t.cd = 0; continue; }
      t.cd -= dt;
      const turPeriod = Math.max(0.55, C_TUR.period / unitRateMul(hpK, (m.smokedTurs || []).length > 0));
      // 每次每门只打 1 发（不再弹匣连射）
      if (t.cd <= 0 && !t.lock && t.ammo >= 1) {
        t.cd = turPeriod;
        if (onFire) {
          const mz = carrierMuzzleWorld(m, t);
          const fdx = aimX - mz.x, fdy = aimY - mz.y;
          const d = Math.hypot(fdx, fdy) || 1;
          onFire({
            x: mz.x, y: mz.y,
            vx: fdx / d * C_BULLET_SPD, vy: fdy / d * C_BULLET_SPD,
            ci: i, life: C_BULLET_LIFE, dmg: 10,
          });
        }
        t.rec = 1; t.flash = C_TUR.flashS;
        t.ammo = 0; t.rt = 0; t.lock = true;
      }
      if (t.cd < 0) t.cd = 0;
    }
    syncHp(m);
  }

  function carrierWing(side) {
    cPoly(cMir(C_WING, side), cLg(0, 20, 0, 152, cDimStops([[0, '#e6d4b0'], [.26, '#c4aa81'], [.58, '#a88d67'], [.82, '#8a7252'], [1, '#5f4c37']])), 'rgba(214,198,168,.6)', 1.3);
    cPoly(cMir(C_WING_PANEL, side), cLg(30, 60, 110, 136, [[0, 'rgba(96,79,56,.92)'], [1, 'rgba(46,36,24,.96)']]), 'rgba(30,22,13,.92)', 1.1);
    cPoly(cMir(C_WING_GREY, side), cLg(24, 44, 52, 126, cDimStops([[0, '#b0b6b4'], [.5, '#828a8b'], [1, '#4c5658']])), '#1f2628', 1);
    cPoly(cMir([[36, 60], [64, 88], [78, 126], [50, 120], [30, 94]], side), 'rgba(62,48,31,.55)', null);
    cPoly(cMir([[86, 102], [114, 122], [112, 142], [92, 140]], side), 'rgba(76,61,42,.42)', null);
    for (let i = 0; i < 4; i++) cDot(side * (44 + i * 18), 110 - i * 3, .8, 'rgba(44,32,20,.7)', null);
    cLines(cMir([[34, 44], [96, 96], [108, 116]], side), 'rgba(58,42,26,.85)', 1.2);
    cLines(cMir([[28, 96], [88, 144]], side), 'rgba(36,26,15,.9)', 1.4);
    cLines(cMir([[64, 58], [102, 108]], side), 'rgba(244,233,210,.26)', 1);
    cLines(cMir([[46, 120], [92, 148]], side), 'rgba(30,22,13,.9)', 1.5);
    cPoly(cMir([[48, 116], [72, 124], [70, 131], [47, 124]], side), 'rgba(196,186,164,.5)', null);
    cPoly(cMir([[52, 132], [68, 137], [67, 142], [51, 138]], side), 'rgba(88,70,48,.7)', 'rgba(40,30,18,.8)', .8);
    cDot(side * 116, 140, 1.5, side > 0 ? '#7cf0a4' : '#ff5c4a', null);   // 舷灯：右绿左红（小点，无光晕）
    cDot(side * 108, 104, 1.1, 'rgba(210,202,186,.55)', null);
  }

  function drawCarrierBody() {
    for (const s of [-1, 1]) carrierWing(s);

    // 主机体：沙色装甲压暗（亮部 ×.78 / 暗部 ×.68），浅色细轮廓保舰形
    cPoly(C_HULL, cLg(-29, -120, 29, 150, cDimStops([[0, '#f0dcb8'], [.16, '#d0b58d'], [.4, '#a98d67'], [.62, '#c2a67c'], [.84, '#7d654a'], [1, '#49392a']])), 'rgba(220,204,174,.62)', 1.4);

    for (const s of [-1, 1]) {
      cLines(cMir([[-12, -110], [-19, -40], [-23, 30], [-20, 100], [-12, 152]], s), 'rgba(72,58,40,.55)', 7);
      cLines(cMir([[-13, -110], [-21, -40], [-25, 30], [-22, 100], [-14, 152]], s), 'rgba(246,236,216,.16)', 1.2);
    }

    // 中央纵向脊线：亮脊 + 暗槽
    cPoly(C_SPINE, cLg(-6, -160, 6, 150, cDimStops([[0, '#f6ecd8'], [.35, '#d9c8a8'], [.7, '#b39a76'], [1, '#7b6548']])), '#5a4830', 1);
    cLines([[0, -164], [0, 152]], 'rgba(58,44,28,.6)', 2.4);
    cLines([[0, -164], [0, 152]], 'rgba(252,246,232,.4)', .9);

    // 机头三层收窄舱段
    C_NOSE_SEG.forEach((seg, i) => {
      cPoly(seg, cLg(0, -172 + i * 22, 0, -136 + i * 22, cDimStops([[0, '#f2e2c2'], [.5, '#cbb087'], [1, '#91765a']])), 'rgba(42,31,19,.85)', 1.1);
    });
    cDot(0, -152, 4.2, '#3a2c1d', 'rgba(214,196,160,.5)');
    cDot(0, -152, 2.6, cDimAuto('#8fc4c0'), null);
    cDot(-1, -153, 1.1, 'rgba(240,255,252,.5)', null);

    // 横向板缝（按机身宽度收边）
    for (const y of [-66, -32, 2, 38, 74, 110, 142]) {
      const hw = Math.max(2, hullHalfAtC(y) - 1.5);
      cLines([[-hw, y], [hw, y]], 'rgba(52,39,24,.85)', 1.2);
      cLines([[-hw, y - 1.4], [hw, y - 1.4]], 'rgba(246,236,216,.18)', 1);
    }

    // 翼根灰蓝检修带
    for (const s of [-1, 1]) {
      cPoly(cMir([[21, 38], [30, 50], [31, 112], [24, 122], [18, 94], [18, 56]], s), cLg(20, 40, 32, 120, cDimStops([[0, '#b6bab6'], [.6, '#7f8788'], [1, '#4a5356']])), '#20282a', 1.1);
      for (let i = 0; i < 5; i++) cLines(cMir([[21, 54 + i * 14], [30, 57 + i * 14]], s), 'rgba(34,42,44,.7)', 1);
    }

    // 脊线上的两处碟形舱盖
    for (const [dy, rx] of [[-58, 5.6], [12, 4.4]]) {
      ctx.beginPath();
      ctx.ellipse(0, dy, rx, rx * 1.9, 0, 0, CTAU);
      ctx.fillStyle = cLg(0, dy - 10, 0, dy + 10, cDimStops([[0, '#d3bb8d'], [.55, '#a98d67'], [1, '#5d4a32']]));
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,18,.85)'; ctx.lineWidth = 1; ctx.stroke();
      cLines([[0, dy - rx * 1.9], [0, dy + rx * 1.9]], 'rgba(250,242,226,.4)', .8);
    }

    // 舰体编号 MS-01（demo bold 5px 按比太小 → 屏幕 4.8px 米褐，局部 (-12,68)）
    ctx.fillStyle = 'rgba(74,56,34,.65)';
    ctx.font = 'bold ' + (4.8 / CS).toFixed(1) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MS-01', -12, 68);

    // 尾部 6 个方形喷口：暗底橙内光（lighter）
    for (const n of C_NOZZLES) {
      const x0 = n.x - n.w / 2, x1 = n.x + n.w / 2, y0 = n.ty, y1 = n.ty + 34;
      cPoly([[x0 - 2, y0 - 4], [x1 + 2, y0 - 4], [x1 + 2, y1], [x0 - 2, y1]], cLg(x0, y0, x1, y1, cDimStops([[0, '#71603f'], [1, '#34291b']])), '#1b1409', 1.1);
      cPoly([[x0 + 3, y0 + 6], [x1 - 3, y0 + 6], [x1 - 3, y1 - 6], [x0 + 3, y1 - 6]], '#140f08', null);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      cPoly([[x0 + 4.5, y0 + 9], [x1 - 4.5, y0 + 9], [x1 - 4.5, y1 - 9], [x0 + 4.5, y1 - 9]],
        cLg(0, y0 + 9, 0, y1 - 9, [[0, 'rgba(255,164,80,.55)'], [1, 'rgba(255,112,40,.14)']]), null);
      ctx.restore();
      cLines([[x0 + 1, y0 - 1], [x1 - 1, y0 - 1]], 'rgba(240,228,204,.3)', .9);
    }
  }

  // 尾焰：照搬 demo drawFlame（三层锥形 + 速度流 + 火星，lighter，无圆环/光圈）
  function drawCarrierFlame(m, n) {
    const f = C_FLAME, t = elapsed;
    const p = clamp(carrierPower(m), 0, 1);
    const len = carrierFlameLenLocal(m, n);
    const w = f.width + p * 2.8;
    const drift = Math.sin(t * 21 + n.seed) * w * .55;
    const x = n.x, y = n.ty + CARRIER_NOZ_Y;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const gOut = ctx.createLinearGradient(x, y, x, y + len);
    gOut.addColorStop(0, cHexA(f.out, .34 + p * .4));
    gOut.addColorStop(.45, cHexA(f.out, .20 + p * .26));
    gOut.addColorStop(1, cHexA(f.out, 0));
    cPoly([[x - w * 1.9, y], [x - w * 1.15, y + len * .3], [x + drift, y + len], [x + w * 1.15, y + len * .3], [x + w * 1.9, y]], gOut, null);

    const gMid = ctx.createLinearGradient(x, y, x, y + len * .82);
    gMid.addColorStop(0, cHexA(f.mid, .75 + p * .2));
    gMid.addColorStop(.55, cHexA(f.mid, .42 + p * .3));
    gMid.addColorStop(1, cHexA(f.mid, 0));
    cPoly([[x - w, y], [x - w * .62, y + len * .26], [x + drift * .6, y + len * .82], [x + w * .62, y + len * .26], [x + w, y]], gMid, null);

    const gCore = ctx.createLinearGradient(x, y, x, y + len * (.34 + p * .42));
    gCore.addColorStop(0, cHexA(f.core, .95));
    gCore.addColorStop(.7, cHexA(f.core, .5));
    gCore.addColorStop(1, cHexA(f.core, 0));
    cPoly([[x - w * .46, y], [x - w * .3, y + len * .16], [x + drift * .3, y + len * (.34 + p * .42)], [x + w * .3, y + len * .16], [x + w * .46, y]], gCore, null);

    if (p > .35) {                 // 速度流
      const k = (p - .35) / .65;
      for (let i = 0; i < 3; i++) {
        const sx = x + (i - 1) * w * .8;
        const sl = len * (.7 + i * .35) * (1 + Math.sin(t * 26 + n.seed + i) * .12);
        const gr = ctx.createLinearGradient(sx, y, sx, y + sl);
        gr.addColorStop(0, cHexA(f.mid, .5 * k));
        gr.addColorStop(1, cHexA(f.out, 0));
        cLines([[sx, y + len * .18], [sx + drift * .2, y + sl]], gr, Math.max(.7, w * .16));
      }
    }
    for (let i = 0; i < 3; i++) {  // 火星点
      const ph = (t * (3.2 + i * .8) + n.seed + i * 2.1) % 1;
      const sx = x + Math.sin(t * 12 + n.seed * 3 + i) * w * .9;
      ctx.globalAlpha = (1 - ph) * .5 * p;
      cDot(sx, y + len * .2 + ph * len * .9, Math.max(.7, w * .18 * (1 - ph)), f.core, null);
    }
    ctx.restore();
  }

  function drawCarrierEngineFire(m) {
    const hpK = carrierHp(m) / (C_SEG_HP * 3);
    if (hpK > 0.5) return;
    const k = clamp((0.5 - hpK) / 0.5, 0.4, 1);
    const t = elapsed;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const n of C_NOZZLES) {
      const x = n.x;
      const y = n.ty + 6;
      const flick = 0.72 + Math.sin(t * 31 + n.seed) * 0.22 + Math.sin(t * 53 + n.seed * 1.4) * 0.12;
      const len = (28 + k * 36) * flick;
      const w = (6.5 + k * 5) * flick;
      const drift = Math.sin(t * 19 + n.seed) * w * 0.7;
      const gOut = ctx.createLinearGradient(x, y, x + drift, y + len);
      gOut.addColorStop(0, "rgba(255,90,24,0.85)");
      gOut.addColorStop(0.4, "rgba(255,48,10,0.45)");
      gOut.addColorStop(1, "rgba(255,30,0,0)");
      cPoly([[x - w * 1.6, y], [x - w * 0.7, y + len * 0.35], [x + drift, y + len], [x + w * 0.7, y + len * 0.35], [x + w * 1.6, y]], gOut, null);
      const gCore = ctx.createLinearGradient(x, y, x, y + len * 0.55);
      gCore.addColorStop(0, "rgba(255,240,200,0.95)");
      gCore.addColorStop(0.55, "rgba(255,170,60,0.5)");
      gCore.addColorStop(1, "rgba(255,80,20,0)");
      cPoly([[x - w * 0.45, y], [x + drift * 0.3, y + len * 0.55], [x + w * 0.45, y]], gCore, null);
    }
    ctx.restore();
  }

  // 双管炮塔：照搬 demo drawCarrierTurret（安装座 6 刻痕 / 圆底座 / 受光半圈细亮边 / 双炮管 / 炮塔罩 / 2 帧炮口焰 lighter / 后坐）
  function drawCarrierTurret(m, t) {
    const k = t.s, r = C_TUR.baseR * k, mr = C_TUR.mountR * k;
    const recY = t.rec * CARRIER_RECOIL * k;   // 后坐 2px：炮管沿指向缩回
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.ang - m.heading);             // 局部 -y（舰首向）→ 世界炮口指向

    cDot(0, 0, mr, cLg(-mr * .8, -mr * .8, mr * .7, mr, cDimStops([[0, '#7b684a'], [.5, '#4a3d29'], [1, '#241c12']])), 'rgba(24,17,10,.9)');
    for (let i = 0; i < 6; i++) {
      const a = i * CTAU / 6 + .42;
      cLines([[Math.cos(a) * (r + 2.1) * k, Math.sin(a) * (r + 2.1) * k],
             [Math.cos(a) * (mr - .8), Math.sin(a) * (mr - .8)]], 'rgba(26,19,11,.75)', .9);
    }
    cLines([[-mr * .72, mr * .55], [mr * .5, mr * .78]], 'rgba(20,14,8,.6)', 1);

    cDot(0, 1.3 * k, r, 'rgba(24,18,11,.5)', null);
    cDot(0, 0, r, cLg(-r, -r, r * .3, r, cDimStops([[0, '#ded5bd'], [.36, '#a79b7e'], [.7, '#6a6149'], [1, '#37322a']])), 'rgba(18,13,8,.85)');
    ctx.beginPath();                            // 受光半圈细亮边（不成环、不外扩）
    ctx.arc(0, 0, r - .5, Math.PI * .82, Math.PI * 1.68);
    ctx.strokeStyle = 'rgba(250,242,224,.38)'; ctx.lineWidth = .8; ctx.stroke();

    const tipY = -r * .5 - C_TUR.barrel * k + recY;
    const rootY = -r * .25 + recY;
    for (const s of [-1, 1]) {
      const cx = s * C_TUR.gap * k, hw = 1.12 * k;
      cPoly([[cx - hw, rootY], [cx + hw, rootY], [cx + hw * .9, tipY], [cx - hw * .9, tipY]],
        cLg(cx - hw, rootY, cx + hw, tipY, cDimStops([[0, '#95a0a4'], [.42, '#4e585d'], [1, '#1a2024']])), 'rgba(9,13,15,.9)', .8);
      cPoly([[cx - hw * .78, tipY], [cx + hw * .78, tipY], [cx + hw * .68, tipY + 1.3 * k], [cx - hw * .68, tipY + 1.3 * k]], '#0c1013', null);
      cLines([[cx - hw * .5, rootY - 1.2 * k], [cx - hw * .5, tipY + 2 * k]], 'rgba(216,226,230,.32)', .7);
    }

    ctx.beginPath();                            // 炮塔罩
    ctx.ellipse(0, recY * .18, r * .6, r * .7, 0, 0, CTAU);
    ctx.fillStyle = cLg(-r * .6, -r * .75, r * .55, r * .55, cDimStops([[0, '#d3cab2'], [.42, '#8d8369'], [1, '#3a352a']]));
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,15,9,.75)'; ctx.lineWidth = .8; ctx.stroke();
    cLines([[-r * .34, -r * .26 + recY * .18], [r * .2, -r * .2 + recY * .18]], 'rgba(250,244,228,.26)', .7);

    if (t.flash > 0) {                          // 炮口焰：每管 1~2 帧（约 34ms，lighter），用本门配色
      const a = clamp(t.flash / C_TUR.flashS, 0, 1);
      const col = C_TUR_COLORS[t.ci] || C_TUR_COLORS[0];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) {
        const cx = s * C_TUR.gap * k, fl = (4.6 + a * 2.2) * k;
        cPoly([[cx - 1.5 * k, tipY + 1], [cx - .55 * k, tipY - fl], [cx + .55 * k, tipY - fl], [cx + 1.5 * k, tipY + 1]], cHexA(col.core, .7 * a), null);
        cPoly([[cx - .62 * k, tipY], [cx, tipY - fl * .6], [cx + .62 * k, tipY]], cHexA(col.tip, .85 * a), null);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // 充能环 + 弹点：环在门①（脊线）炮位，直径=舰宽 20%；进度=三门里最缺者；三门各 5 枚弹点（实心=有弹、空心=已打空）
  function drawCarrierCharge(m) {
    let frac = 1;
    for (const t of m.tur) frac = Math.min(frac, (t.ammo + (t.ammo < C_MAG.size ? t.rt / C_MAG.recharge : 0)) / C_MAG.size);
    frac = clamp(frac, 0, 1);
    const cx = C_RING.x, cy = C_RING.y, r = C_RING.r;
    ctx.save();
    ctx.lineWidth = C_RING.lw;
    ctx.strokeStyle = 'rgba(13,18,22,.55)';                   // 暗底整环（再压暗一档、不发光）
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, CTAU); ctx.stroke();
    if (frac > .004) {                                        // 充能弧：12 点起顺时针，明度随 0→100% 渐亮（满充能 #eaf9ff 近纯冷白，无红黄）
      ctx.strokeStyle = `rgb(${Math.round(30 + 204 * frac)},${Math.round(44 + 205 * frac)},${Math.round(52 + 203 * frac)})`;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * CTAU); ctx.stroke();
    }
    for (const t of m.tur) {                                  // 5 枚弹点/门，排在安装座下缘一排
      const dy = t.y + C_TUR.mountR * t.s + C_DOT.dy;
      for (let i = 0; i < C_MAG.size; i++) {
        const dx = t.x + (i - (C_MAG.size - 1) / 2) * C_DOT.gap;
        if (i < t.ammo) { cDot(dx, dy, C_DOT.r, '#f2fbff', null); }
        else {
          cDot(dx, dy, C_DOT.r, 'rgba(5,7,9,.8)', null);
          ctx.beginPath(); ctx.arc(dx, dy, C_DOT.r, 0, CTAU);
          ctx.strokeStyle = 'rgba(80,98,110,.38)'; ctx.lineWidth = 1.2 / CS; ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 段损伤焦黑贴片：段血越低越黑（alpha 0~0.5），裁剪在舰体+翼面内，无烟雾
  const C_SCORCH = [
    [[-8, -120, 9, 16], [6, -88, 8, 13], [-3, -66, 11, 10]],
    [[-12, -18, 9, 18], [10, 12, 8, 15], [-1, 42, 11, 11]],
    [[-13, 88, 9, 15], [11, 112, 9, 13], [0, 142, 11, 13]],
  ];
  function drawCarrierDamage(m) {
    if (m.segHp[0] >= C_SEG_HP && m.segHp[1] >= C_SEG_HP && m.segHp[2] >= C_SEG_HP) return;
    ctx.save();
    ctx.beginPath();
    cTrace(C_HULL);
    cTrace(cMir(C_WING, 1));
    cTrace(cMir(C_WING, -1));
    ctx.clip();
    for (let s = 0; s < 3; s++) {
      const dmgK = 1 - m.segHp[s] / C_SEG_HP;
      if (dmgK <= 0) continue;
      ctx.fillStyle = `rgba(14,10,7,${(0.5 * dmgK).toFixed(3)})`;
      for (const [x, y, rx, ry] of C_SCORCH[s]) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, CTAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }


  function draw(drawCtx, m, camera, screenFn, elapsedSec) {
    if (!m || !m.alive || !drawCtx) return;
    ctx = drawCtx;
    ensureEllipse();
    elapsed = elapsedSec != null ? elapsedSec : (performance.now() / 1000);
    const bob = carrierBob(m);
    const p = screenFn(m.x, m.y + bob, camera);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(m.heading + Math.PI / 2);
    ctx.scale(CS, CS);
    for (const n of C_NOZZLES) drawCarrierFlame(m, n);
    drawCarrierBody();
    drawCarrierEngineFire(m);
    for (const t of m.tur) drawCarrierTurret(m, t);
    drawCarrierDamage(m);
    drawCarrierCharge(m);
    ctx.restore();
    const u = clamp(carrierHp(m) / (C_SEG_HP * 3), 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(p.x - 27, p.y - 86, 54, 5);
    ctx.fillStyle = u > 0.35 ? "#7ad7ff" : "#ff6b5b";
    ctx.fillRect(p.x - 27, p.y - 86, 54 * u, 5);
    ctx.restore();
  }

  // WebGL 世界层使用：静态舰体只烘焙一次，尾焰/炮塔/伤痕继续按帧叠加。
  function drawStaticBody(drawCtx, x, y) {
    if (!drawCtx) return;
    ctx = drawCtx;
    ensureEllipse();
    ctx.save();
    ctx.translate(x || 0, y || 0);
    ctx.scale(CS, CS);
    drawCarrierBody();
    ctx.restore();
  }

  function drawUnderlay(drawCtx, m, camera, screenFn, elapsedSec) {
    if (!m || !m.alive || !drawCtx) return;
    ctx = drawCtx;
    ensureEllipse();
    elapsed = elapsedSec != null ? elapsedSec : (performance.now() / 1000);
    const p = screenFn(m.x, m.y + carrierBob(m), camera);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(m.heading + Math.PI / 2);
    ctx.scale(CS, CS);
    for (const n of C_NOZZLES) drawCarrierFlame(m, n);
    ctx.restore();
  }

  function drawOverlay(drawCtx, m, camera, screenFn, elapsedSec) {
    if (!m || !m.alive || !drawCtx) return;
    ctx = drawCtx;
    ensureEllipse();
    elapsed = elapsedSec != null ? elapsedSec : (performance.now() / 1000);
    const p = screenFn(m.x, m.y + carrierBob(m), camera);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(m.heading + Math.PI / 2);
    ctx.scale(CS, CS);
    drawCarrierEngineFire(m);
    for (const t of m.tur) drawCarrierTurret(m, t);
    drawCarrierDamage(m);
    drawCarrierCharge(m);
    ctx.restore();
    const u = clamp(carrierHp(m) / (C_SEG_HP * 3), 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(p.x - 27, p.y - 86, 54, 5);
    ctx.fillStyle = u > 0.35 ? "#7ad7ff" : "#ff6b5b";
    ctx.fillRect(p.x - 27, p.y - 86, 54 * u, 5);
    ctx.restore();
  }

  function renderBob(m, elapsedSec) {
    elapsed = elapsedSec != null ? elapsedSec : (performance.now() / 1000);
    return m ? carrierBob(m) : 0;
  }
  function drawTracers(drawCtx, shots, camera, screenFn) {
    if (!drawCtx || !shots || !shots.length) return;
    ctx = drawCtx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const b of shots) {
      if (b.style !== "ms01") continue;
      const col = C_TUR_COLORS[b.ci != null ? b.ci : 0] || C_TUR_COLORS[0];
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.vx / sp, ty = b.vy / sp;
      const p = screenFn(b.x, b.y, camera);
      const lifeLeft = Math.max(0, 1 - (b.age || 0) / Math.max(b.life || 1500, 1));
      const fade = clamp(lifeLeft / 0.13, 0, 1);
      const ex = p.x - tx * 48, ey = p.y - ty * 48;
      const g = ctx.createLinearGradient(p.x, p.y, ex, ey);
      g.addColorStop(0, "rgba(" + col.rgb + "," + (0.9 * fade) + ")");
      g.addColorStop(0.25, "rgba(" + col.rgb + "," + (0.5 * fade) + ")");
      g.addColorStop(1, "rgba(" + col.rgb + ",0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = col.tip;
      ctx.globalAlpha = 0.9 * fade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - tx * 8, p.y - ty * 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  root.PapaMS01 = {
    create, update, damage, draw, drawTracers,
    drawStaticBody, drawUnderlay, drawOverlay, renderBob,
    HIT_R: C_HIT_R, RANGE: CARRIER_RANGE, SEG_HP: C_SEG_HP, MAX_HP: C_SEG_HP * 3, hp: carrierHp,
  };
})(typeof GameGlobal !== "undefined" ? GameGlobal : (typeof globalThis !== "undefined" ? globalThis : this));
