/**
 * 离线把程序化音效烤成 audio/sfx/*.mp3（运行时不再实时合成）
 * 用法：node tools/bake-sfx.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SR = 48000;
const PRF = 100 / 6;
const LOOP_ROUNDS = 30;
const TARGET_PEAK = 0.5;
const TAU = Math.PI * 2;
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "audio", "sfx");
const TMP_DIR = path.join(ROOT, "tools", "_sfx_wav_tmp");

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

let rngState = 0xC0FFEE;
function seedRng(s) { rngState = (s >>> 0) || 1; }
function rnd() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
}

function makeNoise(n) {
  const a = new Float32Array(n);
  let s = 305419896;
  for (let i = 0; i < n; i++) {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    a[i] = s / 4294967296 * 2 - 1;
  }
  return a;
}

class Svf {
  constructor() { this.ic1 = 0; this.ic2 = 0; }
  process(x, kind, freq, q, sr) {
    const f = clamp(freq, 20, sr * 0.45);
    const g = Math.tan(Math.PI * f / sr);
    const k = 1 / Math.max(q, 0.08);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (kind === "lowpass") return v2;
    if (kind === "highpass") return x - k * v1 - v2;
    return v1;
  }
}

function osc(kind, phase) {
  const p = phase - Math.floor(phase);
  if (kind === "square") return p < 0.5 ? 1 : -1;
  if (kind === "sawtooth") return p * 2 - 1;
  if (kind === "triangle") return 1 - 4 * Math.abs(p - 0.5);
  return Math.sin(p * TAU);
}

function normalize(pcm, peak) {
  let m = 0;
  for (let i = 0; i < pcm.length; i++) m = Math.max(m, Math.abs(pcm[i]));
  if (m <= 1e-5) return pcm;
  const k = peak / m;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= k;
  return pcm;
}

function loopXfade(pcm, fade) {
  fade = Math.min(Math.max(fade, 8), Math.floor(pcm.length / 3));
  const n = pcm.length;
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    pcm[i] = pcm[n - fade + i] * (1 - t) + pcm[i] * t;
  }
  const keep = n - fade;
  return keep < 16 ? pcm : pcm.subarray(0, keep);
}

function expEnv(i, n, attN, peak) {
  const a = 0.0001;
  if (i < attN) return a * Math.pow(Math.max(peak, 0.0002) / a, i / attN);
  const t2 = (i - attN) / Math.max(n - attN, 1);
  return Math.max(peak, 0.0002) * Math.pow(a / Math.max(peak, 0.0002), t2);
}

function sfxEnv(i, n, attN, relN, peak, sustain) {
  if (i < attN) return peak * (i / attN);
  if (!sustain) {
    const t = (i - attN) / Math.max(n - attN, 1);
    return Math.max(peak, 0.0003) * Math.pow(0.0003 / Math.max(peak, 0.0003), t);
  }
  const holdEnd = Math.max(n - relN, attN);
  if (i < holdEnd) return peak;
  const t2 = (i - holdEnd) / Math.max(n - holdEnd, 1);
  return Math.max(peak, 0.0003) * Math.pow(0.0003 / Math.max(peak, 0.0003), t2);
}

const noise = makeNoise(SR * 2);

function mixOsc(dest, t0, dur, attack, peak, oscType, f0, fEnd, sweep) {
  const i0 = Math.max(Math.floor(t0 * SR), 0);
  const n = Math.floor(dur * SR);
  const attN = Math.max(Math.floor(Math.max(0.0008, attack) * SR), 1);
  let phase = 0;
  for (let i = 0; i < n && i0 + i < dest.length; i++) {
    const u = i / Math.max(n - 1, 1);
    let freq = f0;
    if (fEnd > 1) {
      const su = clamp(u / Math.max(sweep, 0.001), 0, 1);
      freq = f0 * Math.pow(Math.max(fEnd, 20) / Math.max(f0, 20), su);
    }
    phase += freq / SR;
    dest[i0 + i] += osc(oscType, phase) * expEnv(i, n, attN, peak);
  }
}

function mixNoiseCannon(dest, t0, dur, attack, peak, nf, nOff) {
  const i0 = Math.max(Math.floor(t0 * SR), 0);
  const n = Math.floor(dur * SR);
  const attN = Math.max(Math.floor(attack * SR), 1);
  const sv = new Svf();
  const kind = nf.type || "bandpass";
  const fq = nf.freq || 1200;
  const q = nf.q || 0.707;
  for (let i = 0; i < n && i0 + i < dest.length; i++) {
    dest[i0 + i] += sv.process(noise[(nOff + i) % noise.length], kind, fq, q, SR) * expEnv(i, n, attN, peak);
  }
}

function mixToneLayer(dest, t0, dur, attack, peak, sustain, release, oscType, f0, f1) {
  const i0 = Math.max(Math.floor(t0 * SR), 0);
  const n = Math.floor(dur * SR);
  const attN = Math.max(Math.floor(attack * SR), 1);
  const relN = Math.max(Math.floor(release * SR), 1);
  let phase = 0;
  for (let i = 0; i < n && i0 + i < dest.length; i++) {
    const u = i / Math.max(n - 1, 1);
    const freq = f1 > 1 ? f0 * Math.pow(Math.max(f1, 20) / Math.max(f0, 20), u) : f0;
    phase += freq / SR;
    dest[i0 + i] += osc(oscType, phase) * sfxEnv(i, n, attN, relN, peak, sustain);
  }
}

function mixNoiseLayer(dest, t0, dur, attack, peak, sustain, release, kind, f0, f1, q) {
  const i0 = Math.max(Math.floor(t0 * SR), 0);
  const n = Math.floor(dur * SR);
  const attN = Math.max(Math.floor(attack * SR), 1);
  const relN = Math.max(Math.floor(release * SR), 1);
  const sv = new Svf();
  const nOff = Math.floor(rnd() * Math.max(noise.length - 8, 1));
  for (let i = 0; i < n && i0 + i < dest.length; i++) {
    const u = i / Math.max(n - 1, 1);
    const fq = f1 > 1 ? f0 * Math.pow(Math.max(f1, 20) / Math.max(f0, 20), u) : f0;
    dest[i0 + i] += sv.process(noise[(nOff + i) % noise.length], kind, fq, q, SR) * sfxEnv(i, n, attN, relN, peak, sustain);
  }
}

function mixLayers(layers, seconds) {
  const dest = new Float32Array(Math.floor(seconds * SR));
  for (const L of layers) {
    const off = L.delay || 0;
    const dur = L.dur || 0.1;
    const vol = L.vol || 0.2;
    const attack = L.attack || 0.006;
    const sustain = !!L.sustain;
    const release = L.release || 0.12;
    if (L.noise) mixNoiseLayer(dest, off, dur, attack, vol, sustain, release, L.filter || "bandpass", L.f0 || 1200, L.f1 || 0, L.q || 0.707);
    else mixToneLayer(dest, off, dur, attack, vol, sustain, release, L.type || "sine", L.f0 || 440, L.f1 || 0);
  }
  return normalize(dest, 0.55);
}

const cannonSpec = {
  outGain: 0.8,
  layers: [
    { type: "sine", freq: 90, freqEnd: 40, sweep: 0.8, dur: 0.16, tone: 0.9, attack: 0.004 },
    { type: "sawtooth", freq: 480, freqEnd: 180, sweep: 0.85, dur: 0.14, tone: 0.32, attack: 0.003 },
    { noise: 0.28, dur: 0.08, attack: 0.002, nf: { type: "bandpass", freq: 1200, q: 1.2 } },
  ],
};

function stampShot(dest, t0, spec, seed) {
  const outGain = spec.outGain ?? 0.85;
  spec.layers.forEach((L, li) => {
    const t = t0 + (L.offset || 0);
    const dur = L.dur ?? 0.1;
    const f0 = L.freq || 0;
    const fEnd = L.freqEnd || 0;
    const oscType = L.type || "sine";
    const attack = L.attack ?? 0.003;
    const toneAmt = L.tone || 0;
    const noiseAmt = L.noise || 0;
    const sweep = L.sweep ?? 0.8;
    if (f0 > 0 && toneAmt > 0) mixOsc(dest, t, dur, attack, toneAmt * 0.55 * outGain, oscType, f0, fEnd, sweep);
    if (noiseAmt > 0) {
      const nf = L.nf || {};
      const nOff = Math.min(Math.floor((li * 0.23 + seed * 0.173 + 0.05) * SR) % Math.max(noise.length - 8, 1), noise.length - 2);
      mixNoiseCannon(dest, t, dur, Math.max(attack, 0.002), noiseAmt * 0.5 * outGain, nf, nOff);
    }
  });
}

function renderCannonLoop() {
  const period = 1 / PRF;
  const loopN = Math.floor(SR * 1.8);
  const tailN = Math.floor(SR * 0.2);
  const pcm = new Float32Array(loopN + tailN);
  for (let i = 0; i < LOOP_ROUNDS; i++) stampShot(pcm, i * period, cannonSpec, i * 0.618);
  const looped = new Float32Array(loopN);
  for (let i = 0; i < loopN; i++) looped[i] = pcm[i];
  for (let i = 0; i < tailN; i++) looped[i % loopN] += pcm[loopN + i];
  return normalize(looped, TARGET_PEAK);
}

function renderCannonShot() {
  const pcm = new Float32Array(Math.floor(SR * 0.22));
  stampShot(pcm, 0, cannonSpec, 0.37);
  return normalize(pcm, TARGET_PEAK);
}

function renderEngineLoop() {
  const n = Math.floor(SR * 1.8);
  const pcm = new Float32Array(n);
  let pSub = 0, pSub2 = 0, pHarm = 0, pWhine = 0;
  const roar = new Svf(), body = new Svf(), body2 = new Svf(), whine = new Svf();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const slow = 1 + 0.018 * Math.sin(t * TAU * 0.7) + 0.01 * Math.sin(t * TAU * 1.9);
    pSub += (36 * slow) / SR;
    pSub2 += (54.5 * slow) / SR;
    pHarm += (108 * slow) / SR;
    pWhine += (1860 + 40 * Math.sin(t * TAU * 0.35)) / SR;
    const nx = noise[i % noise.length];
    let mid = body.process(nx, "lowpass", 320, 0.45, SR);
    mid = body2.process(mid, "bandpass", 210, 0.55, SR) * 0.32;
    const tur = whine.process(Math.sin(pWhine * TAU) * 0.22 + nx * 0.08, "bandpass", 2100, 2.4, SR) * 0.07;
    pcm[i] = Math.sin(pSub * TAU) * 0.62 + Math.sin(pSub2 * TAU) * 0.34 + Math.sin(pHarm * TAU) * 0.10
      + roar.process(nx, "lowpass", 118, 0.38, SR) * 0.88 + mid + tur;
  }
  return normalize(loopXfade(pcm, Math.floor(SR * 0.08)), 0.52);
}

function renderCoreLoop() {
  const n = Math.floor(SR * 1.6);
  const pcm = new Float32Array(n);
  const roar = new Svf(), roar2 = new Svf(), hiss = new Svf();
  let p0 = 0, p1 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p0 += (32 + 1.2 * Math.sin(t * TAU * 0.55)) / SR;
    p1 += 64 / SR;
    const nx = noise[(i * 3) % noise.length];
    let fire = roar.process(nx, "lowpass", 95, 0.32, SR);
    fire = roar2.process(fire, "lowpass", 160, 0.4, SR) * 0.95;
    pcm[i] = Math.sin(p0 * TAU) * 0.48 + Math.sin(p1 * TAU) * 0.18 + fire + hiss.process(nx, "bandpass", 680, 0.7, SR) * 0.12;
  }
  return normalize(loopXfade(pcm, Math.floor(SR * 0.08)), 0.48);
}

function renderAirLoop() {
  const n = Math.floor(SR * 1.4);
  const pcm = new Float32Array(n);
  const hp = new Svf(), lp = new Svf(), bp = new Svf();
  for (let i = 0; i < n; i++) {
    let a = hp.process(noise[i % noise.length], "highpass", 90, 0.6, SR);
    a = lp.process(a, "lowpass", 520, 0.45, SR);
    pcm[i] = bp.process(a, "bandpass", 240, 0.5, SR);
  }
  return normalize(loopXfade(pcm, Math.floor(SR * 0.07)), 0.36);
}

const LAYERS = {
  missile: [
    { noise: true, filter: "highpass", f0: 5000, f1: 1200, dur: 0.04, vol: 0.12, attack: 0.001 },
    { noise: true, filter: "bandpass", q: 1.1, f0: 2200, f1: 280, dur: 0.7, vol: 0.16, attack: 0.012 },
    { noise: true, filter: "lowpass", f0: 980, f1: 160, dur: 0.85, vol: 0.16, attack: 0.02, sustain: true, release: 0.28 },
    { f0: 72, f1: 30, dur: 0.7, vol: 0.14, type: "sine", attack: 0.01 },
  ],
  select: [
    { noise: true, filter: "highpass", f0: 2800, f1: 1800, dur: 0.04, vol: 0.14, attack: 0.001 },
    { f0: 420, f1: 180, dur: 0.05, vol: 0.10, type: "square", attack: 0.001 },
  ],
  tick: [
    { noise: true, filter: "highpass", f0: 5200, f1: 2600, dur: 0.018, vol: 0.12, attack: 0.0002 },
    { f0: 880, f1: 660, dur: 0.055, vol: 0.22, type: "sine", attack: 0.0004 },
    { f0: 1320, f1: 980, dur: 0.035, vol: 0.10, type: "triangle", attack: 0.0003 },
  ],
  hit: [
    { f0: 88, f1: 30, dur: 0.42, vol: 0.32, type: "sine", attack: 0.01 },
    { noise: true, filter: "lowpass", f0: 700, f1: 90, dur: 0.5, vol: 0.24, attack: 0.012 },
    { noise: true, filter: "bandpass", q: 0.8, f0: 2400, dur: 0.09, vol: 0.16, attack: 0.001 },
  ],
  chip: [
    { noise: true, filter: "highpass", f0: 4200, f1: 1100, dur: 0.05, vol: 0.30, attack: 0.001 },
    { noise: true, filter: "bandpass", q: 0.85, f0: 1400, f1: 320, dur: 0.12, vol: 0.26, attack: 0.002 },
    { f0: 260, f1: 78, dur: 0.09, vol: 0.14, type: "triangle", attack: 0.002 },
  ],
  dry: [
    { noise: true, filter: "highpass", f0: 7200, f1: 2400, dur: 0.016, vol: 0.34, attack: 0.0003 },
    { noise: true, filter: "bandpass", q: 2.2, f0: 2100, f1: 620, dur: 0.038, vol: 0.26, attack: 0.0004 },
    { f0: 210, f1: 88, dur: 0.032, vol: 0.18, type: "square", attack: 0.0004 },
    { f0: 78, f1: 36, dur: 0.048, vol: 0.14, type: "sine", attack: 0.0008 },
  ],
  bump: [
    { f0: 68, f1: 24, dur: 0.32, vol: 0.40, type: "sine", attack: 0.004 },
    { f0: 118, f1: 42, dur: 0.16, vol: 0.18, type: "triangle", attack: 0.003 },
    { noise: true, filter: "lowpass", f0: 520, f1: 70, dur: 0.36, vol: 0.32, attack: 0.006 },
    { noise: true, filter: "highpass", f0: 2400, f1: 500, dur: 0.08, vol: 0.20, attack: 0.001 },
  ],
  boom: [
    { noise: true, filter: "highpass", f0: 4200, f1: 900, dur: 0.08, vol: 0.34, attack: 0.001 },
    { noise: true, filter: "bandpass", q: 1.15, f0: 1700, f1: 280, dur: 0.16, vol: 0.32, attack: 0.001 },
    { f0: 96, f1: 38, dur: 0.26, vol: 0.42, type: "sine", attack: 0.003 },
    { f0: 52, f1: 22, dur: 0.48, vol: 0.36, type: "sine", attack: 0.006 },
    { delay: 0.14, f0: 58, f1: 22, dur: 0.95, vol: 0.48, type: "sine", attack: 0.008 },
    { delay: 0.14, f0: 30, f1: 18, dur: 1.15, vol: 0.30, type: "sine", attack: 0.014 },
    { delay: 0.14, noise: true, filter: "lowpass", f0: 720, f1: 55, dur: 1.05, vol: 0.38, attack: 0.008 },
    { delay: 0.16, noise: true, filter: "highpass", f0: 2600, f1: 480, dur: 0.16, vol: 0.18, attack: 0.001 },
    { delay: 0.36, f0: 34, f1: 18, dur: 0.85, vol: 0.22, type: "sine", attack: 0.05 },
  ],
};

function metalPingLayers(seed) {
  let s = (8000 + seed * 2203) >>> 0;
  const rndLocal = (a, b) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return a + (b - a) * (s / 4294967296);
  };
  const g0 = rndLocal(0.018, 0.028);
  const a = rndLocal(7600, 8600);
  const b = rndLocal(8400, 9400);
  return [
    { noise: true, filter: "highpass", f0: 10000, dur: 0.005, vol: 0.22, attack: 0.00008 },
    { f0: a, f1: a * 0.62, dur: 0.014, vol: 0.2, type: "square", attack: 0.00008 },
    { delay: g0, noise: true, filter: "highpass", f0: 10800, dur: 0.004, vol: 0.2, attack: 0.00008 },
    { delay: g0, f0: b, f1: b * 0.61, dur: 0.013, vol: 0.18, type: "square", attack: 0.00008 },
    { delay: g0 + 0.002, noise: true, filter: "bandpass", q: 5.0, f0: 9200, dur: 0.014, vol: 0.1, attack: 0.0001 },
  ];
}

function writeWav(filePath, pcm) {
  const n = pcm.length;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function findFfmpeg() {
  const which = spawnSync("where.exe", ["ffmpeg"], { encoding: "utf8" });
  if (which.status === 0) {
    const line = String(which.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (line) return line;
  }
  return "ffmpeg";
}

function toMp3(wavPath, mp3Path) {
  const ff = findFfmpeg();
  const r = spawnSync(ff, ["-y", "-i", wavPath, "-ac", "1", "-ar", "44100", "-b:a", "96k", mp3Path], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed for ${mp3Path}: ${r.stderr || r.stdout}`);
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  seedRng(0x51A7E);

  const clips = {
    shot: renderCannonShot(),
    missile: mixLayers(LAYERS.missile, 1.3),
    select: mixLayers(LAYERS.select, 0.12),
    tick: mixLayers(LAYERS.tick, 0.1),
    hit: mixLayers(LAYERS.hit, 0.55),
    boom: mixLayers(LAYERS.boom, 1.4),
    chip: mixLayers(LAYERS.chip, 0.28),
    bump: mixLayers(LAYERS.bump, 0.48),
    dry: mixLayers(LAYERS.dry, 0.09),
    cannon: renderCannonLoop(),
    engine: renderEngineLoop(),
    core: renderCoreLoop(),
    air: renderAirLoop(),
  };
  for (let vi = 0; vi < 4; vi++) {
    seedRng(0x1000 + vi * 97);
    clips["ping" + vi] = mixLayers(metalPingLayers(vi), 0.08);
  }

  let total = 0;
  for (const [name, pcm] of Object.entries(clips)) {
    const wav = path.join(TMP_DIR, name + ".wav");
    const mp3 = path.join(OUT_DIR, name + ".mp3");
    writeWav(wav, pcm);
    toMp3(wav, mp3);
    const sz = fs.statSync(mp3).size;
    total += sz;
    console.log(`${name}.mp3  ${(sz / 1024).toFixed(1)} KB  (${(pcm.length / SR).toFixed(2)}s)`);
  }
  // cleanup wav tmp
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
  fs.rmdirSync(TMP_DIR);
  console.log(`TOTAL  ${(total / 1024).toFixed(1)} KB -> ${OUT_DIR}`);
}

main();
