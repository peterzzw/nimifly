// 测试入口专用机器人大脑：与单人匹配 / 开房召集的机器人完全独立，可单独迭代。
// 目前逻辑与单人匹配机器人一致；只读写 craft.brain / craft 自身，不碰全局 autoPilotCtx。
(function () {
  const performance = (typeof GameGlobal !== "undefined" && GameGlobal.performance && typeof GameGlobal.performance.now === "function")
    ? GameGlobal.performance
    : { now: () => Date.now() };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // 1=顶尖 / 2=瞄准差一点 / 3=准度差 + 开火更慢；aimEvery>0 时隔这么多毫秒才重瞄一次
  const IQ = {
    1: { aimNoise: 0.02, gunRate: 1.00, shootCone: 1.00, burstPause: 1.00, burstGap: 1.00, misThink: 1.00, gunPeriod: 1.00, misCd: 1.00, fireWarm: 0.00, aimEvery: 0 },
    2: { aimNoise: 0.14, gunRate: 0.62, shootCone: 0.82, burstPause: 1.25, burstGap: 1.20, misThink: 1.35, gunPeriod: 1.15, misCd: 1.25, fireWarm: 0.12, aimEvery: 200 },
    3: { aimNoise: 0.26, gunRate: 0.42, shootCone: 0.68, burstPause: 1.85, burstGap: 1.55, misThink: 2.20, gunPeriod: 1.55, misCd: 1.85, fireWarm: 0.28, aimEvery: 200 },
  };
  function iqCfg(iq) {
    return IQ[iq] || IQ[1];
  }

  function newBrain(iq) {
    const s = 0.35 + Math.random() * 0.55;
    const tier = iq === 2 || iq === 3 ? iq : 1;
    const cfg = iqCfg(tier);
    return {
      style: s, iq: tier, fireWarm: 0, targetId: null, targetUntil: 0, reacquireAt: 0,
      noseAim: null, gunAim: null, thr: 0.88 + s * 0.08,
      roamT: 2.5 + Math.random() * 2, roamSide: 0,
      orbitSide: Math.random() < 0.5 ? -1 : 1,
      burstLeft: 0.2, burstPause: 0, misThink: (0.2 + Math.random() * 0.4) * cfg.misThink,
      panicUntil: 0, wobble: 0, wobbleT: 0,
      lastSeenX: 0, lastSeenY: 0, memoryUntil: 0,
      aimHold: null, aimHoldAt: 0, aimHoldId: null, aimEvery: 0,
      aimLag: 200 + Math.random() * 200,
    };
  }

  // 枪口瞄敌机 brain.aimLag 毫秒之前的位置（每个机器人 200~400ms 随机）：所有机器人共用一份敌机轨迹
  const HIST_KEEP_MS = 1000; // 覆盖激光/EMP 最高 600ms 回看
  const posHist = new Map(); // id -> [{ t, x, y }]，按时间升序
  function recordFoes(foes, now) {
    for (const p of foes) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      let arr = posHist.get(p.id);
      if (!arr) { arr = []; posHist.set(p.id, arr); }
      const last = arr[arr.length - 1];
      if (last && now - last.t < 8) continue;
      // 复活瞬移：旧轨迹作废
      if (last && Math.hypot(p.x - last.x, p.y - last.y) > 400) arr.length = 0;
      arr.push({ t: now, x: p.x, y: p.y });
      while (arr.length && now - arr[0].t > HIST_KEEP_MS) arr.shift();
    }
  }
  function pastPos(p, now, lagMs) {
    const lag = Math.max(0, Number(lagMs) || 0);
    const arr = posHist.get(p.id);
    const want = now - lag;
    const vx = Number.isFinite(p.vx) ? p.vx : 0;
    const vy = Number.isFinite(p.vy) ? p.vy : 0;
    const rewindFrom = (x, y, t0, evx, evy) => {
      const sec = Math.max(0, (t0 - want) / 1000);
      return { x: x - evx * sec, y: y - evy * sec };
    };
    if (!arr || !arr.length) return rewindFrom(p.x, p.y, now, vx, vy);
    if (want < arr[0].t) {
      let evx = vx;
      let evy = vy;
      if (arr.length > 1) {
        const dtSec = (arr[1].t - arr[0].t) / 1000;
        if (dtSec > 0.001) {
          evx = (arr[1].x - arr[0].x) / dtSec;
          evy = (arr[1].y - arr[0].y) / dtSec;
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

  function isFoe(me, p) {
    return !!p && p.id !== me.id && !(p.respawn > 0) && p.team !== me.team;
  }

  function aheadRock(me, rocks) {
    const hx = Math.cos(me.heading);
    const hy = Math.sin(me.heading);
    let best = null;
    let bestClear = 9e9;
    for (const a of rocks) {
      if (!a || a.fadeOut) continue;
      const dx = a.x - me.x;
      const dy = a.y - me.y;
      const fwd = dx * hx + dy * hy;
      if (fwd < 16 || fwd > 620) continue;
      const side = -dx * hy + dy * hx;
      const rr = (a.extent || a.r || 40) + 36;
      if (Math.abs(side) > rr) continue;
      if (Math.abs(Math.atan2(side, fwd)) > 0.72) continue;
      const clear = fwd - (a.r || 40);
      if (clear < bestClear) {
        bestClear = clear;
        best = { clear, side };
      }
    }
    return best;
  }

  function pickPrey(b, me, foes, now) {
    const byId = (id) => (id == null ? null : foes.find((p) => p && p.id === id && isFoe(me, p)) || null);
    const stuck = byId(b.targetId);
    if (stuck && now < b.targetUntil) {
      const d = Math.hypot(stuck.x - me.x, stuck.y - me.y);
      let interrupt = null;
      let interruptD = 280;
      for (const p of foes) {
        if (!isFoe(me, p) || p.id === stuck.id) continue;
        const dd = Math.hypot(p.x - me.x, p.y - me.y);
        if (dd < interruptD) { interruptD = dd; interrupt = p; }
      }
      if (!interrupt || d < interruptD + 90) return stuck;
    }
    if (now < b.reacquireAt) return stuck;
    let best = null;
    let bestScore = -1;
    for (const p of foes) {
      if (!isFoe(me, p)) continue;
      // 全图找敌人，不设距离上限；真人优先（等效距离近 1200）
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      const bear = Math.atan2(p.y - me.y, p.x - me.x);
      const facing = 1 - Math.min(1, Math.abs(angleDelta(bear, me.heading)) / Math.PI);
      const s = Math.max(0, 10000 - d) * 0.001 + facing * 0.6 + (p.human ? 1.2 : 0) + (p.id === b.targetId ? 0.4 : 0);
      if (s > bestScore) { bestScore = s; best = p; }
    }
    if (best) {
      b.targetId = best.id;
      b.targetUntil = now + 1200 + Math.random() * 2200 + b.style * 800;
      b.reacquireAt = now + 200 + Math.random() * 350;
    } else {
      b.targetId = null;
    }
    return best;
  }

  function slewAngle(cur, want, maxRate, dt) {
    if (!Number.isFinite(cur)) return want;
    return cur + clamp(angleDelta(want, cur), -maxRate * dt, maxRate * dt);
  }

  function softThr(b, cur, want, dt) {
    const rate = 3.2 + b.style * 1.0;
    if (want > cur) return Math.min(want, cur + rate * dt);
    return Math.max(want, cur - (rate * 1.15) * dt);
  }

  function tickBurst(b, canShoot, dt) {
    const iq = iqCfg(b.iq);
    if (b.burstPause > 0) {
      b.burstPause -= dt;
      return false;
    }
    if (!canShoot) {
      if (b.burstLeft > 0 && Math.random() < 0.08) {
        b.burstLeft = 0;
        b.burstPause = (0.12 + Math.random() * 0.25) * iq.burstPause;
      }
      b.fireWarm = 0;
      return false;
    }
    if (iq.fireWarm > 0) {
      b.fireWarm += dt;
      if (b.fireWarm < iq.fireWarm) return false;
    }
    if (b.burstLeft <= 0) {
      const rounds = Math.max(2, (3 + (Math.random() * 7 | 0)) - (b.iq >= 3 ? 2 : b.iq >= 2 ? 1 : 0));
      b.burstLeft = rounds * 0.03 * iq.burstGap;
      return true;
    }
    b.burstLeft -= dt;
    if (b.burstLeft <= 0) {
      b.burstPause = (0.12 + Math.random() * 0.38 + (1 - b.style) * 0.15) * iq.burstPause;
      b.fireWarm = 0;
      return false;
    }
    return true;
  }

  /** me: 当前机器人行（id/team/x/y/heading/vx/vy/respawn）；opt: { worldLimit, gunAmmo, missileAmmo, lo } */
  function think(b, me, foes, rocks, dt, opt) {
    const now = performance.now();
    dt = clamp(dt || 0.016, 0.008, 0.05);
    if (!me || !Number.isFinite(me.x) || me.respawn > 0) {
      return {
        up: false, down: false, brake: false, turn: 0,
        aim: null, gunAim: null, throttle: 0.15,
        fireGun: false, fireMissile: false, missileTarget: null,
      };
    }
    if (!Number.isFinite(b.noseAim)) b.noseAim = me.heading;
    if (!Number.isFinite(b.gunAim)) b.gunAim = me.heading;
    const worldLimit = opt.worldLimit || 2500;
    const gunAmmo = opt.gunAmmo || 0;
    const missileAmmo = opt.missileAmmo || 0;

    const iq = iqCfg(b.iq);
    b.wobbleT -= dt;
    if (b.wobbleT <= 0) {
      b.wobbleT = 1.2 + Math.random() * 1.8;
      b.wobble = (Math.random() - 0.5) * (0.03 + iq.aimNoise * 0.35);
    }

    const rock = aheadRock(me, rocks || []);
    const margin = 180 + (1 - b.style) * 40;
    const nearEdge = me.x < -worldLimit + margin || me.x > worldLimit - margin
      || me.y < -worldLimit + margin || me.y > worldLimit - margin;

    let desireNose = me.heading;
    let desireGun = me.heading;
    let desireThr = 0.94;
    let brake = false;
    let fireGun = false;
    let fireMissile = false;
    let missileTarget = null;
    let panic = now < b.panicUntil;
    let hardTurn = false;

    recordFoes(foes || [], now);
    const prey = pickPrey(b, me, foes || [], now);
    if (prey) {
      b.lastSeenX = prey.x;
      b.lastSeenY = prey.y;
      b.memoryUntil = now + 1100 + Math.random() * 700;

      const dist = Math.hypot(prey.x - me.x, prey.y - me.y);
      const pvx = Number.isFinite(prey.vx) ? prey.vx : Math.cos(prey.heading || 0) * (prey.spd || 0);
      const pvy = Number.isFinite(prey.vy) ? prey.vy : Math.sin(prey.heading || 0) * (prey.spd || 0);
      const spd = Math.hypot(me.vx || 0, me.vy || 0);
      const eta = dist / Math.max(spd, 80);
      const lead = clamp(eta * (0.45 + b.style * 0.25), 0, 0.4);
      const toLead = Math.atan2(prey.y + pvy * lead - me.y, prey.x + pvx * lead - me.x);
      const past = pastPos(prey, now, b.aimLag > 0 ? b.aimLag : 200);
      const toGun = Math.atan2(past.y - me.y, past.x - me.x);

      // 高速狗斗：全程油门，近距切开通过再回咬，绝不贴脸刹停
      if (!Number.isFinite(b.orbitFlipAt) || now >= b.orbitFlipAt) {
        b.orbitSide = b.orbitSide < 0 ? 1 : -1;
        b.orbitFlipAt = now + 1800 + Math.random() * 2600;
      }
      desireThr = 1;
      if (dist < 260) {
        desireNose = toLead + b.orbitSide * (0.85 + b.style * 0.35) + b.wobble;
        hardTurn = true;
      } else if (dist < 520) {
        desireNose = toLead + b.orbitSide * 0.42 + b.wobble * 0.35;
        hardTurn = Math.abs(angleDelta(desireNose, me.heading)) > 0.45;
      } else if (dist < 980) {
        desireNose = toLead + b.orbitSide * 0.16 + b.wobble * 0.2;
      } else {
        desireNose = toLead + b.wobble * 0.15;
      }

      const aimEvery = b.aimEvery > 0 ? b.aimEvery : iq.aimEvery;
      if (aimEvery > 0) {
        if (!Number.isFinite(b.aimHold) || now >= b.aimHoldAt || b.aimHoldId !== prey.id) {
          b.aimHold = toGun + (Math.random() - 0.5) * iq.aimNoise;
          b.aimHoldAt = now + aimEvery;
          b.aimHoldId = prey.id;
        }
        desireGun = b.aimHold;
      } else {
        desireGun = toGun + b.wobble * 0.25 + (Math.random() - 0.5) * iq.aimNoise;
      }
      const aimErr = Math.abs(angleDelta(desireGun, b.gunAim));
      const noseErr = Math.abs(angleDelta(desireNose, me.heading));
      const canShoot = gunAmmo >= 1 && dist < 1250 && aimErr < (0.55 + b.style * 0.35) * iq.shootCone;
      const spray = Math.random() < (0.04 + b.style * 0.04) * (b.iq >= 3 ? 0.55 : b.iq >= 2 ? 0.75 : 1);
      fireGun = tickBurst(b, canShoot || spray, dt);

      missileTarget = prey.id;
      b.misThink -= dt;
      if (b.misThink <= 0) {
        b.misThink = (0.45 + Math.random() * 0.9) * iq.misThink;
        const sub = (opt && opt.lo && opt.lo.sub) || "missile";
        const misChance = (0.45 + b.style * 0.3) * (b.iq >= 3 ? 0.55 : b.iq >= 2 ? 0.8 : 1);
        if (sub === "laser" || sub === "emp") {
          // 激光/电磁：瞄 300~600ms 前的位置再决定开火
          const lag = 300 + Math.random() * 300;
          const pastSub = pastPos(prey, now, lag);
          const subAim = Math.atan2(pastSub.y - me.y, pastSub.x - me.x);
          const subErr = Math.abs(angleDelta(subAim, Number.isFinite(b.gunAim) ? b.gunAim : me.heading));
          fireMissile = dist > 180 && dist < 1200 && subErr < 0.95 * iq.shootCone && Math.random() < misChance;
        } else {
          const goodMis = missileAmmo >= 1 && dist > 220 && dist < 1200 && aimErr < 0.9 * iq.shootCone && noseErr < 1.1;
          fireMissile = goodMis && Math.random() < misChance;
        }
      }
    } else if (now < b.memoryUntil) {
      desireNose = Math.atan2(b.lastSeenY - me.y, b.lastSeenX - me.x) + b.wobble * 0.3;
      desireGun = desireNose;
      desireThr = 0.94;
      tickBurst(b, false, dt);
    } else if (nearEdge) {
      desireNose = Math.atan2(-me.y, -me.x);
      desireGun = desireNose;
      desireThr = 0.9;
      tickBurst(b, false, dt);
    } else {
      b.roamT -= dt;
      if (b.roamT <= 0) {
        b.roamT = 3.5 + Math.random() * 4.5;
        const r = Math.random();
        b.roamSide = r < 0.18 ? -1 : r > 0.82 ? 1 : 0;
      }
      desireNose = me.heading + b.roamSide * 0.12 + b.wobble;
      desireGun = desireNose;
      desireThr = 0.96;
      tickBurst(b, false, dt);
    }

    if (rock && rock.clear < 280) {
      if (!panic && rock.clear < 160) b.panicUntil = now + 280 + Math.random() * 220;
      panic = now < b.panicUntil;
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

    const noseRate = (hardTurn ? 2.6 : 1.55) + b.style * 0.7;
    const gunRate = (4.8 + b.style * 2.0) * iq.gunRate;
    b.noseAim = slewAngle(b.noseAim, desireNose, noseRate, dt);
    b.gunAim = slewAngle(b.gunAim, desireGun, gunRate, dt);
    const thrFloor = rock && rock.clear < 90 ? 0.55 : 0.94;
    b.thr = softThr(b, b.thr, clamp(Math.max(desireThr, thrFloor), thrFloor, 1), dt);
    if (!(rock && rock.clear < 90) && b.thr < 0.94) b.thr = 0.94;
    if (!(rock && rock.clear < 70)) brake = false;

    const turnErr = angleDelta(b.noseAim, me.heading);
    const turn = hardTurn && Math.abs(turnErr) > 0.16 ? (turnErr > 0 ? 1 : -1) : 0;
    return {
      up: true, down: false, brake, turn,
      aim: b.noseAim, gunAim: b.gunAim, throttle: b.thr,
      fireGun, fireMissile, missileTarget,
    };
  }

  GameGlobal.PapaTestBot = { newBrain, think, iqCfg };
})();
