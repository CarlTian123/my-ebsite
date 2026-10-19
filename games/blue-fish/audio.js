/* =========================================================================
   蓝鱼枪战 · 音频引擎 v2  (audio.js)
   -------------------------------------------------------------------------
   全部声音由 WebAudio 实时合成，无任何音频素材文件。

   信号流（所有节点在 init 时一次建好，之后只增不重建）：

     SFX 声部 ─┐                                    ┌─ 母带低架 +1.2dB @90Hz
               ├─→ sfxBus(gain=设置) ─→ sfxComp ─→ │
     混响送 ──→ reverbIn ─→ Convolver(程序生成IR) ─┤  ┌─ 空气感高架 -1.6dB @7k
               │                  ↓ revHP/revLP     ├─→ │
     MUS 声部 ─┼─→ musBus ─→ musFade ─→ musDuck ──→ │  └─→ 限幅器(压缩) ─→ 保险 tanh ─→ destination
               │              ↑sidechain   ↓        │
               │          sfxAnalyser   musLP ─→ musComp ─→(并行)musSat
     AMB 声部 ─┘

     · 混响：噪声 × 指数衰减 × 一阶低通（越往后越暗）+ 稀疏早反射 → 单声道冲激，
       两声道各生成一次（去相关），能量归一化后送入 ConvolverNode。
     · Sidechain：sfxAnalyser 取 256 帧时域 RMS，驱动 musDuck 让音乐在音效密集时
       让位 0~32%，松手后 0.3s 恢复。
     · 母带末端是 tanh 软限幅（曲线最大值 0.98），数学上不可能削波。

   音色设计：每声部 = 瞬态 click + 主体 tone + 噪声尾 + 低频冲击 + 空气感，
   ADSR 全部用指数包络；7 把枪从“短促/密集/宽阔/裂空/闷响/三连/持续”七个方向区分。
   每次播放叠加 ±16 音分随机，连发不机械。

   音乐：92 BPM，D 小调，16 小节循环
     | Dm | Bb | F  | C  | Dm | Bb | C  | C  |   ← A 段（深潜）
     | Gm | Bb | F  | C  | Dm | Bb | A7 | A7 |   ← B 段（抬升）
   分层：pad / bass / arp / lead(作曲旋律) / kick / snare / hat / riser / impact，
   setIntensity(0..1) 控制鼓组密度、滤波亮度、并行失真量与琶音密度。
   ========================================================================= */
(function () {
'use strict';

/* ═════════════════════════════ 0. 基础工具 ═════════════════════════════ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const cents = (c) => Math.pow(2, c / 1200);
const mtof = (semi, base) => base * Math.pow(2, semi / 12);

/** 值域安全的一阶扫频（必须先 setValueAtTime 再 ramp，否则 ramp 起点不确定） */
function sweep(param, t0, from, to, dur, exp) {
  param.setValueAtTime(from, t0);
  if (Math.abs(to - from) < 0.01 || dur <= 0.0005) return;
  if (exp) param.exponentialRampToValueAtTime(Math.max(0.0001, to), t0 + dur);
  else param.linearRampToValueAtTime(to, t0 + dur);
}

/** 指数 ADSR：0.0001 → peak → (hold) → 0.0001 → 0 */
function env(param, t0, peak, a, d, hold) {
  peak = Math.max(0.0002, peak);
  a = Math.max(0.0006, a || 0.004);
  d = Math.max(0.008, d || 0.1);
  const h = hold > 0 ? hold : 0;
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(peak, t0 + a);
  if (h > 0) param.setValueAtTime(peak, t0 + a + h);
  param.exponentialRampToValueAtTime(0.0001, t0 + a + h + d);
  param.setValueAtTime(0, t0 + a + h + d + 0.004);
}

function stopSrc(src, t) {
  try { src.stop(Math.max(0.0001, t)); } catch (e) {}
}

/* ═════════════════════════════ 1. 全局状态 ═════════════════════════════ */

let ac = null;                 // 当前 AudioContext（离线渲染时会被临时换掉）
let mix = null;                // 混音链句柄
let noiseBuf = null;           // 白噪声
let brownBuf = null;           // 布朗噪声（低频床）
let laser = null;              // 持续激光音
let volSfx = 0.85, volMus = 0.45;
const MUS_TRIM = 0.72;        // 音乐总线内部衰减：0.45 的默认音量下 RMS 约 −29 dBFS，给音效让出动态
const AMB_TRIM = 1.5;          // 环境床听感：默认音量下 RMS ≈ −29 dBFS，鲸歌峰值 ≈ 0.16
let musicOn = false, musicTimer = null, musicStep = 0, musicNextT = 0;
let intensity = 0, lastIntensity = -1;
let ambientTimer = null, nextWhale = 0, nextCreak = 0, nextBubble = 0;
let activeVoices = [];
const stats = { created: 0, freed: 0, whales: 0, creaks: 0, firstWhale: 0 };
let initT = 0;
let scBuf = null, sideRMS = 0;

const nowT = () => (ac ? ac.currentTime : 0);
const ready = () => !!ac && ac.state !== 'closed' && !!mix;

function isOffline() {
  return typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
}

/* ═════════════════════════════ 2. 缓冲区 / 混响 IR ═════════════════════════ */

function makeNoise(ctx, seconds, brown) {
  const sr = ctx.sampleRate;
  const len = Math.max(64, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  if (brown) {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/** 程序生成混响冲激响应：噪声 × 指数衰减 × 一阶低通（随时间变暗）+ 稀疏早反射 */
function makeIR(ctx, seconds, decay) {
  const sr = ctx.sampleRate;
  const pre = Math.floor(sr * 0.012);
  const len = Math.floor(sr * seconds) + pre;
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, energy = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      const amp = Math.pow(1 - x, decay) * Math.exp(-x * 2.4);
      let s = Math.random() * 2 - 1;
      const k = 0.52 - 0.44 * x;            // 越往后越暗
      lp += k * (s - lp);
      s = lp;
      if ((i - pre) < sr * 0.09 && Math.random() < 0.0022) s *= 2.4;  // 早期反射
      d[i] = s * amp;
      energy += d[i] * d[i];
    }
    const scale = energy > 0 ? 0.62 / Math.sqrt(energy) : 1;   // 能量归一化
    for (let i = pre; i < len; i++) d[i] *= scale;
  }
  return buf;
}

function safetyCurve(max) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.18) * max;      // |c| ≤ max
  }
  return c;
}
function driveCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return c;
}

/* ═════════════════════════════ 3. 混音链 ═════════════════════════════ */

function buildMixer(ctx) {
  if (scBuf === null || scBuf.length !== 256) scBuf = new Float32Array(256);
  const m = { panner: typeof ctx.createStereoPanner === 'function', sr: ctx.sampleRate };

  /* ---- 母带：低架 → 高架 → 压缩限幅 → 保险软削 → destination ---- */
  m.master = ctx.createGain(); m.master.gain.value = 0.82;

  m.lowShelf = ctx.createBiquadFilter();
  m.lowShelf.type = 'lowshelf'; m.lowShelf.frequency.value = 92; m.lowShelf.gain.value = 1.4;

  m.airTuck = ctx.createBiquadFilter();
  m.airTuck.type = 'highshelf'; m.airTuck.frequency.value = 7200; m.airTuck.gain.value = -1.6;

  m.limiter = ctx.createDynamicsCompressor();
  m.limiter.threshold.value = -3.5;
  m.limiter.knee.value = 3;
  m.limiter.ratio.value = 16;
  m.limiter.attack.value = 0.0025;
  m.limiter.release.value = 0.12;

  m.safety = ctx.createWaveShaper();
  m.safety.curve = safetyCurve(0.97);
  m.safety.oversample = 'none';            // 不做过采样 = 不出插值振铃过冲

  m.master.connect(m.lowShelf);
  m.lowShelf.connect(m.airTuck);
  m.airTuck.connect(m.limiter);
  m.limiter.connect(m.safety);
  m.safety.connect(ctx.destination);

  /* ---- 程序生成混响（卷积） ---- */
  m.reverbIn = ctx.createGain(); m.reverbIn.gain.value = 1;
  m.convolver = ctx.createConvolver();
  m.convolver.buffer = makeIR(ctx, 2.7, 2.1);
  m.revHP = ctx.createBiquadFilter(); m.revHP.type = 'highpass'; m.revHP.frequency.value = 160; m.revHP.Q.value = 0.5;
  m.revLP = ctx.createBiquadFilter(); m.revLP.type = 'lowpass'; m.revLP.frequency.value = 3600; m.revLP.Q.value = 0.4;
  m.reverbOut = ctx.createGain(); m.reverbOut.gain.value = 0.9;
  m.reverbIn.connect(m.convolver);
  m.convolver.connect(m.revHP);
  m.revHP.connect(m.revLP);
  m.revLP.connect(m.reverbOut);
  m.reverbOut.connect(m.master);

  /* ---- 音效总线 ---- */
  m.sfxBus = ctx.createGain(); m.sfxBus.gain.value = volSfx;
  m.sfxComp = ctx.createDynamicsCompressor();
  m.sfxComp.threshold.value = -13; m.sfxComp.knee.value = 9; m.sfxComp.ratio.value = 3.2;
  m.sfxComp.attack.value = 0.004; m.sfxComp.release.value = 0.18;
  m.sfxHP = ctx.createBiquadFilter(); m.sfxHP.type = 'highpass'; m.sfxHP.frequency.value = 48; m.sfxHP.Q.value = 0.6;
  m.sfxAnalyser = ctx.createAnalyser();
  m.sfxAnalyser.fftSize = 256;                 // 256 采样窗口：够快
  m.sfxAnalyser.smoothingTimeConstant = 0.1;
  m.sfxBus.connect(m.sfxComp);
  m.sfxComp.connect(m.sfxHP);
  m.sfxHP.connect(m.sfxAnalyser);
  m.sfxAnalyser.connect(m.master);

  /* ---- 音乐总线 ---- */
  m.musBus = ctx.createGain(); m.musBus.gain.value = volMus * MUS_TRIM;
  m.musFade = ctx.createGain(); m.musFade.gain.value = 0;
  m.musDuck = ctx.createGain(); m.musDuck.gain.value = 1;
  m.musHP = ctx.createBiquadFilter(); m.musHP.type = 'highpass'; m.musHP.frequency.value = 38; m.musHP.Q.value = 0.5;
  m.musLP = ctx.createBiquadFilter(); m.musLP.type = 'lowpass'; m.musLP.frequency.value = 2200; m.musLP.Q.value = 0.7;
  m.musComp = ctx.createDynamicsCompressor();
  m.musComp.threshold.value = -19; m.musComp.knee.value = 12; m.musComp.ratio.value = 2.4;
  m.musComp.attack.value = 0.012; m.musComp.release.value = 0.26;
  m.musSatIn = ctx.createGain(); m.musSatIn.gain.value = 1;
  m.musShaper = ctx.createWaveShaper(); m.musShaper.curve = driveCurve(2.6); m.musShaper.oversample = '2x';
  m.musSat = ctx.createGain(); m.musSat.gain.value = 0.03;

  m.musBus.connect(m.musFade);
  m.musFade.connect(m.musDuck);
  m.musDuck.connect(m.musHP);
  m.musHP.connect(m.musLP);
  m.musLP.connect(m.musComp);
  m.musComp.connect(m.master);
  m.musComp.connect(m.musSatIn);
  m.musSatIn.connect(m.musShaper);
  m.musShaper.connect(m.musSat);
  m.musSat.connect(m.master);

  /* ---- 环境总线 ---- */
  m.ambBus = ctx.createGain(); m.ambBus.gain.value = volMus * AMB_TRIM;
  m.ambBus.connect(m.master);
  m.ambBus.connect(m.reverbIn);
  m.ambStarted = false;

  return m;
}

/* ═════════════════════════════ 4. 声部容器 ═════════════════════════════
   一个 Voice = 一次发声的全部节点集合：输出增益 → 声像 → 距离低通 → 总线，
   外加一条混响送出。所有节点登记在册，寿命结束后统一 disconnect，
   这样连打 200 枪节点数也不会累积。 */

function Voice(o) {
  o = o || {};
  this.bus = o.bus || 'sfx';
  this.rate = o.rate == null ? 1 : o.rate;
  this.t = Math.max(0, o.t == null ? nowT() : o.t);
  this.nodes = [];
  this.end = this.t + 0.08;
  this.done = false;

  const out = ac.createGain();
  out.gain.value = clamp(o.gain == null ? 1 : o.gain, 0, 4);
  this.out = out;
  this.mk(out);

  let tail = out;
  if (o.pan != null && mix.panner) {
    const p = ac.createStereoPanner();
    p.pan.value = clamp(o.pan, -1, 1);
    tail.connect(p);
    tail = p;
    this.mk(p);
  }
  if (o.lp != null && o.lp < 17000) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = clamp(o.lp, 150, 20000);
    f.Q.value = 0.55;
    tail.connect(f);
    tail = f;
    this.mk(f);
  }
  const dest = this.bus === 'music' ? mix.musBus : this.bus === 'amb' ? mix.ambBus : mix.sfxBus;
  tail.connect(dest);

  const send = ac.createGain();
  send.gain.value = clamp(o.send == null ? 0.14 : o.send, 0, 1.5);
  out.connect(send);
  send.connect(mix.reverbIn);
  this.mk(send);
}

Voice.prototype.mk = function (n) { this.nodes.push(n); stats.created++; return n; };

Voice.prototype.osc = function (type, freq) {
  const o = ac.createOscillator();
  o.type = type || 'sine';
  if (freq != null) o.frequency.value = freq;
  this.mk(o);
  return o;
};

Voice.prototype.g = function (val) {
  const g = ac.createGain();
  if (val != null) g.gain.value = val;
  this.mk(g);
  return g;
};

Voice.prototype.bq = function (type, freq, q) {
  const b = ac.createBiquadFilter();
  b.type = type;
  b.frequency.value = clamp(freq, 20, 20000);
  b.Q.value = q == null ? 1 : clamp(q, 0.0001, 40);
  this.mk(b);
  return b;
};

Voice.prototype.pan = function (p) {
  if (!mix.panner) return null;
  const n = ac.createStereoPanner();
  n.pan.value = clamp(p, -1, 1);
  this.mk(n);
  return n;
};

Voice.prototype.mark = function (t) { if (t > this.end) this.end = t; };

/** 结束录制，登记寿命；到点自动断连（离线渲染下由调用方统一清理） */
Voice.prototype.finish = function () {
  if (this.done) return this;
  this.done = true;
  activeVoices.push(this);
  if (!isOffline()) {
    const self = this;
    const ms = Math.max(40, (this.end - nowT()) * 1000 + 240);
    setTimeout(function () { self.dispose(); }, ms);
  }
  return this;
};

Voice.prototype.dispose = function () {
  if (this.nodes) {
    for (let i = 0; i < this.nodes.length; i++) {
      try { this.nodes[i].disconnect(); } catch (e) {}
      stats.freed++;
    }
    this.nodes = null;
  }
  const i = activeVoices.indexOf(this);
  if (i >= 0) activeVoices.splice(i, 1);
};

/* ═════════════════════════════ 5. 合成基元 ═════════════════════════════ */

/** 振荡器音：ADSR + 可选扫频 / 滤波 / 颤音 / 单层声像 / 指定汇点 */
function tone(v, o) {
  const t0 = v.t + (o.at || 0);
  const d = Math.max(0.012, o.d == null ? 0.2 : o.d);
  const a = Math.max(0.0006, o.a == null ? 0.004 : o.a);
  const hold = o.hold || 0;

  const osc = ac.createOscillator();
  v.mk(osc);
  osc.type = o.type || 'sine';
  const f0 = clamp((o.f == null ? 440 : o.f) * v.rate, 8, 18000);
  osc.frequency.setValueAtTime(f0, t0);
  if (o.f1) {
    const f1 = clamp(o.f1 * v.rate, 8, 18000);
    const st = t0 + (a + d) * (o.sweep == null ? 0.8 : clamp(o.sweep, 0.02, 1));
    if (o.lin) osc.frequency.linearRampToValueAtTime(f1, st);
    else osc.frequency.exponentialRampToValueAtTime(f1, st);
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

  if (o.vib) {
    const lfo = ac.createOscillator(); v.mk(lfo);
    const lg = ac.createGain(); v.mk(lg);
    lfo.type = 'sine';
    lfo.frequency.value = clamp(o.vib, 0.1, 60);
    lg.gain.value = o.vibAmt == null ? 6 : o.vibAmt;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + a + hold + d + 0.05);
  }

  let head = osc;
  if (o.filter) {
    const fc = clamp((o.fc == null ? 1400 : o.fc) * (o.fcRate ? v.rate : 1), 30, 19500);
    const f = v.bq(o.filter, fc, o.q == null ? 1 : o.q);
    if (o.fc1 != null) sweep(f.frequency, t0, fc, clamp(o.fc1 * (o.fcRate ? v.rate : 1), 30, 19500), a + d, true);
    head.connect(f);
    head = f;
  }
  let g = v.g(0);
  head.connect(g);
  if (o.pan != null) {
    const p = v.pan(o.pan);
    if (p) { g.connect(p); p.connect(o.dest || v.out); }
    else g.connect(o.dest || v.out);
  } else {
    g.connect(o.dest || v.out);
  }
  env(g.gain, t0, o.v == null ? 0.2 : o.v, a, d, hold);
  const stopT = t0 + a + hold + d + 0.03;
  osc.start(t0);
  osc.stop(stopT);
  v.mark(stopT);
  return g;
}

/** 噪声音：white / brown，带滤波扫频 */
function noise(v, o) {
  const t0 = v.t + (o.at || 0);
  const d = Math.max(0.015, o.d == null ? 0.15 : o.d);
  const a = Math.max(0.0006, o.a == null ? 0.003 : o.a);
  const hold = o.hold || 0;
  const src = ac.createBufferSource();
  src.buffer = (o.brown ? brownBuf : noiseBuf);
  if (!src.buffer) return null;
  v.mk(src);
  src.loop = true;
  src.playbackRate.value = clamp((o.rate || 1) * v.rate, 0.2, 4);

  const fc = clamp(o.fc == null ? 1500 : o.fc, 22, 19500);
  const f = v.bq(o.filter || 'bandpass', fc, o.q == null ? 0.9 : o.q);
  if (o.fc1 != null) sweep(f.frequency, t0, fc, clamp(o.fc1, 22, 19500), a + d, true);

  let head = src;
  head.connect(f);
  head = f;
  if (o.pan != null) {
    const p = v.pan(o.pan);
    if (p) { head.connect(p); head = p; }
  }
  const g = v.g(0);
  head.connect(g);
  g.connect(o.dest || v.out);
  env(g.gain, t0, o.v == null ? 0.2 : o.v, a, d, hold);

  const stopT = t0 + a + hold + d + 0.04;
  try { src.start(t0, Math.random() * 0.8); } catch (e) { try { src.start(t0); } catch (e2) {} }
  stopSrc(src, stopT);
  v.mark(stopT);
  return g;
}

/** FM 金属/钟声：载波 + 调制器（指数衰减的调制指数） */
function ping(v, o) {
  const t0 = v.t + (o.at || 0);
  const d = Math.max(0.03, o.d == null ? 0.2 : o.d);
  const a = Math.max(0.0008, o.a == null ? 0.002 : o.a);
  const f = clamp((o.f == null ? 880 : o.f) * v.rate, 20, 16000);

  const car = ac.createOscillator(); v.mk(car);
  car.type = o.type || 'sine';
  car.frequency.setValueAtTime(f, t0);
  if (o.f1) sweep(car.frequency, t0, f, clamp(o.f1 * v.rate, 20, 16000), a + d * 0.8, true);

  const mod = ac.createOscillator(); v.mk(mod);
  mod.type = 'sine';
  mod.frequency.setValueAtTime(f * (o.ratio || 2.01), t0);

  const mg = v.g(0);
  const idx = (o.index == null ? 3 : o.index) * f;
  mg.gain.setValueAtTime(idx, t0);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.001, idx * 0.05), t0 + a + d * 0.6);
  mod.connect(mg);
  mg.connect(car.frequency);

  const g = v.g(0);
  car.connect(g);
  g.connect(o.dest || v.out);
  env(g.gain, t0, o.v == null ? 0.14 : o.v, a, d);
  mod.start(t0); car.start(t0);
  const stopT = t0 + a + d + 0.04;
  mod.stop(stopT); car.stop(stopT);
  v.mark(stopT);
  return g;
}

/* ═════════════════════════════ 6. 音效设计 ═════════════════════════════
   27 个 cue，每个都是 3~5 层叠加。命名与 game.js 调用完全一致。 */

const SFX = {

  /* ───────── 玩家武器：7 把枪 7 种性格 ───────── */

  // 手枪：短促、干、有枪机金属味，尾巴 0.15s 内收干净
  pistol(v) {
    noise(v, { filter: 'highpass', fc: 4300, q: 0.7, d: 0.020, a: 0.0008, v: 0.30, pan: rnd(-0.10, 0.10) });
    tone(v, { type: 'square', f: 720, f1: 205, d: 0.072, a: 0.0012, v: 0.26, filter: 'lowpass', fc: 3600, fc1: 1000 });
    tone(v, { type: 'sawtooth', f: 334, f1: 128, d: 0.10, a: 0.0015, v: 0.12, filter: 'lowpass', fc: 1700 });
    tone(v, { type: 'sine', f: 156, f1: 52, d: 0.135, a: 0.002, v: 0.32 });
    noise(v, { filter: 'bandpass', fc: 1900, fc1: 720, q: 1.1, d: 0.105, a: 0.004, v: 0.085 });
  },

  // 冲锋枪：极短、偏高、干瘦；连发时靠 ±16 音分随机避免机关枪机械感
  smg(v) {
    noise(v, { filter: 'highpass', fc: 5200, q: 0.8, d: 0.011, a: 0.0006, v: 0.24 });
    noise(v, { filter: 'bandpass', fc: 2850, fc1: 1400, q: 0.9, d: 0.034, a: 0.001, v: 0.16, pan: rnd(-0.14, 0.14) });
    tone(v, { type: 'square', f: 910, f1: 380, d: 0.042, a: 0.0008, v: 0.14, filter: 'lowpass', fc: 4200 });
    tone(v, { type: 'sine', f: 214, f1: 88, d: 0.052, a: 0.0012, v: 0.15 });
  },

  // 霰弹枪：宽阔（左右分层）、低频大、噪声尾拖长，像在水里开了一枪
  shotgun(v) {
    noise(v, { filter: 'bandpass', fc: 1600, q: 1.6, d: 0.018, a: 0.0008, v: 0.16 });
    noise(v, { filter: 'lowpass', fc: 2400, fc1: 170, q: 0.8, d: 0.34, a: 0.0012, v: 0.36, pan: -0.34 });
    noise(v, { filter: 'lowpass', fc: 1900, fc1: 150, q: 0.7, d: 0.30, a: 0.002, v: 0.28, at: 0.006, pan: 0.34 });
    tone(v, { type: 'sawtooth', f: 192, f1: 46, d: 0.30, a: 0.002, v: 0.32, filter: 'lowpass', fc: 820, fc1: 190 });
    tone(v, { type: 'sine', f: 96, f1: 34, d: 0.36, a: 0.003, v: 0.36 });
    noise(v, { filter: 'highpass', fc: 3600, d: 0.05, a: 0.001, v: 0.11 });
  },

  // 狙击枪：裂空瞬态 + 超音速下落 zing + 两声左右错开的回声尾
  sniper(v) {
    noise(v, { filter: 'highpass', fc: 3000, q: 0.6, d: 0.008, a: 0.0006, v: 0.40 });
    tone(v, { type: 'sawtooth', f: 1750, f1: 140, d: 0.30, a: 0.001, v: 0.28, filter: 'lowpass', fc: 2600, fc1: 600 });
    tone(v, { type: 'sine', f: 128, f1: 40, d: 0.40, a: 0.002, v: 0.33 });
    noise(v, { filter: 'bandpass', fc: 6200, fc1: 900, q: 2.2, d: 0.24, a: 0.002, v: 0.14, at: 0.004 });
    // 回声：水面反射两次
    noise(v, { filter: 'lowpass', fc: 1800, fc1: 500, q: 0.9, d: 0.16, a: 0.01, v: 0.075, at: 0.085, pan: -0.42 });
    noise(v, { filter: 'lowpass', fc: 1200, fc1: 380, q: 0.8, d: 0.22, a: 0.014, v: 0.055, at: 0.19, pan: 0.44 });
    tone(v, { type: 'sine', f: 110, f1: 55, d: 0.18, a: 0.02, v: 0.06, at: 0.19, pan: 0.4 });
  },

  // 榴弹发射器：低频闷响 + 发射筒排气"噗"，后接一枚上行的推进 whoosh
  launcher(v) {
    tone(v, { type: 'sine', f: 232, f1: 44, d: 0.30, a: 0.006, v: 0.40, sweep: 0.45 });
    noise(v, { filter: 'lowpass', fc: 900, fc1: 120, q: 0.9, d: 0.28, a: 0.004, v: 0.26 });
    noise(v, { filter: 'bandpass', fc: 2500, q: 1.8, d: 0.035, a: 0.001, v: 0.13 });
    noise(v, { filter: 'bandpass', fc: 700, fc1: 2400, q: 1.2, d: 0.34, a: 0.03, v: 0.085, at: 0.05 });
    tone(v, { type: 'triangle', f: 300, f1: 140, d: 0.10, a: 0.004, v: 0.08, at: 0.03 });
  },

  // 三叉戟：三连上行（D5–G5–C6），玻璃质感，配水花
  trident(v) {
    [0, 0.046, 0.092].forEach((at, i) => {
      const f = [587, 784, 1046][i];
      tone(v, { type: 'triangle', f: f, f1: f * 1.01, d: 0.22, a: 0.002, v: 0.20, at: at, filter: 'lowpass', fc: 4200 });
      tone(v, { type: 'sine', f: f * 2, d: 0.10, a: 0.002, v: 0.07, at: at });
      ping(v, { f: f * 1.5, ratio: 1.41, index: 1.2, d: 0.13, v: 0.05, at: at });
    });
    noise(v, { filter: 'bandpass', fc: 3000, fc1: 800, q: 1.1, d: 0.18, a: 0.006, v: 0.08 });
  },

  // 激光：起振 + 持续感的共鸣扫频（持续音本体由 setLaser 负责）
  laserFire(v) {
    tone(v, { type: 'sawtooth', f: 980, f1: 300, d: 0.20, a: 0.004, v: 0.13, filter: 'bandpass', fc: 1500, fc1: 700, q: 4 });
    tone(v, { type: 'square', f: 490, f1: 150, d: 0.15, a: 0.005, v: 0.05, filter: 'lowpass', fc: 2200 });
    noise(v, { filter: 'bandpass', fc: 2600, fc1: 900, q: 3, d: 0.12, a: 0.003, v: 0.08 });
    tone(v, { type: 'sine', f: 178, f1: 118, d: 0.16, a: 0.004, v: 0.09, vib: 17, vibAmt: 5 });
  },

  /* ───────── 命中 / 暴击 / 击杀 ───────── */

  hit(v) {
    noise(v, { filter: 'bandpass', fc: 1700, fc1: 520, q: 1.4, d: 0.05, a: 0.001, v: 0.26 });
    tone(v, { type: 'triangle', f: 470, f1: 250, d: 0.05, a: 0.001, v: 0.10 });
    tone(v, { type: 'sine', f: 96, f1: 62, d: 0.07, a: 0.001, v: 0.12 });
  },

  crit(v) {
    ping(v, { f: 1880, ratio: 2.71, index: 4.2, d: 0.20, v: 0.16 });
    ping(v, { f: 2810, ratio: 1.83, index: 2.2, d: 0.13, v: 0.09, at: 0.012 });
    noise(v, { filter: 'highpass', fc: 4600, d: 0.05, a: 0.001, v: 0.15 });
    tone(v, { type: 'triangle', f: 2400, f1: 1150, d: 0.10, a: 0.002, v: 0.07 });
  },

  kill(v) {
    noise(v, { filter: 'lowpass', fc: 1500, fc1: 150, q: 0.9, d: 0.25, a: 0.002, v: 0.28 });
    noise(v, { filter: 'bandpass', fc: 900, fc1: 280, q: 2.2, d: 0.12, a: 0.002, v: 0.12 });
    tone(v, { type: 'triangle', f: 430, f1: 108, d: 0.22, a: 0.002, v: 0.17, filter: 'lowpass', fc: 1100 });
    tone(v, { type: 'sine', f: 124, f1: 44, d: 0.26, a: 0.003, v: 0.25 });
  },

  /* ───────── 玩家受伤 / 死亡 / 护盾 / 冲刺 ───────── */

  hurt(v) {
    tone(v, { type: 'sawtooth', f: 198, f1: 58, d: 0.28, a: 0.003, v: 0.30, filter: 'lowpass', fc: 760, fc1: 300 });
    tone(v, { type: 'sawtooth', f: 203, f1: 60, d: 0.24, a: 0.004, v: 0.14, detune: 11, filter: 'lowpass', fc: 700 });
    noise(v, { filter: 'lowpass', fc: 800, fc1: 190, d: 0.18, a: 0.002, v: 0.24 });
    tone(v, { type: 'triangle', f: 530, f1: 190, d: 0.16, a: 0.006, v: 0.09, at: 0.02, vib: 23, vibAmt: 26 });
  },

  die(v) {
    tone(v, { type: 'sawtooth', f: 320, f1: 28, d: 1.35, a: 0.006, v: 0.30, filter: 'lowpass', fc: 900, fc1: 170, sweep: 0.9 });
    tone(v, { type: 'square', f: 160, f1: 24, d: 1.20, a: 0.01, v: 0.12, filter: 'lowpass', fc: 600, fc1: 120 });
    noise(v, { filter: 'lowpass', fc: 2200, fc1: 70, d: 1.10, a: 0.004, v: 0.22 });
    tone(v, { type: 'sine', f: 92, f1: 26, d: 1.25, a: 0.01, v: 0.28 });
    // 上浮的气泡（灵魂出窍）
    [0.35, 0.55, 0.8].forEach((at, i) => {
      tone(v, { type: 'sine', f: 500 + i * 240, f1: 1400 + i * 300, d: 0.12, a: 0.004, v: 0.05, at: at, pan: rnd(-0.5, 0.5) });
    });
  },

  shield(v) {
    tone(v, { type: 'sine', f: 300, f1: 900, d: 0.28, a: 0.012, v: 0.19 });
    tone(v, { type: 'sine', f: 302, f1: 905, d: 0.28, a: 0.014, v: 0.10, detune: 8 });
    tone(v, { type: 'triangle', f: 600, f1: 1520, d: 0.22, a: 0.016, v: 0.09, at: 0.015 });
    noise(v, { filter: 'bandpass', fc: 1200, fc1: 3200, q: 1.4, d: 0.24, a: 0.02, v: 0.06 });
  },

  shieldBreak(v) {
    noise(v, { filter: 'highpass', fc: 3000, d: 0.20, a: 0.001, v: 0.28 });
    [0, 0.018, 0.037, 0.058, 0.082, 0.11].forEach((at, i) => {
      const f = 2400 - i * 290 + rnd(-90, 90);
      tone(v, { type: 'triangle', f: f, f1: f * 0.44, d: 0.12, a: 0.001, v: 0.10 - i * 0.008, at: at, pan: rnd(-0.7, 0.7) });
    });
    tone(v, { type: 'sine', f: 108, f1: 42, d: 0.28, a: 0.002, v: 0.22 });
  },

  dash(v) {
    noise(v, { filter: 'bandpass', fc: 320, fc1: 2600, q: 1.1, d: 0.20, a: 0.01, v: 0.22 });
    noise(v, { filter: 'bandpass', fc: 2400, fc1: 300, q: 0.9, d: 0.30, a: 0.03, v: 0.14, at: 0.09 });
    tone(v, { type: 'sine', f: 720, f1: 160, d: 0.26, a: 0.008, v: 0.10 });
    tone(v, { type: 'sine', f: 120, f1: 58, d: 0.30, a: 0.006, v: 0.16 });
  },

  /* ───────── 拾取 / 金币 / 升级 / 卡牌 / UI ───────── */

  pickup(v) {
    tone(v, { type: 'triangle', f: 784, d: 0.18, a: 0.002, v: 0.16 });
    tone(v, { type: 'sine', f: 1175, d: 0.20, a: 0.003, v: 0.12, at: 0.055 });
    ping(v, { f: 1568, ratio: 2.0, index: 1.5, d: 0.16, v: 0.06, at: 0.055 });
    noise(v, { filter: 'highpass', fc: 5200, d: 0.05, a: 0.002, v: 0.05 });
  },

  coin(v) {
    ping(v, { f: 1568, ratio: 2.01, index: 1.3, d: 0.10, v: 0.10 });
    ping(v, { f: 2093, ratio: 1.5, index: 1.0, d: 0.09, v: 0.06, at: 0.045 });
  },

  level(v) {
    // D 小调主和弦琶音上行 + 铺底 + 低频落点
    [587, 698, 880, 1175].forEach((f, i) => {
      tone(v, { type: 'triangle', f: f, d: 0.42, a: 0.004, v: 0.15, at: i * 0.075, filter: 'lowpass', fc: 5200 });
      ping(v, { f: f * 2, ratio: 2.0, index: 1.1, d: 0.30, v: 0.045, at: i * 0.075 });
    });
    tone(v, { type: 'sine', f: 73, f1: 73, d: 0.75, a: 0.02, v: 0.20 });
    noise(v, { filter: 'lowpass', fc: 700, fc1: 4200, q: 0.8, d: 0.38, a: 0.06, v: 0.05 });
  },

  card(v) {
    noise(v, { filter: 'bandpass', fc: 1400, fc1: 5200, q: 1.2, d: 0.11, a: 0.006, v: 0.09, pan: -0.3 });
    ping(v, { f: 880, ratio: 2.0, index: 1.4, d: 0.22, v: 0.09, at: 0.05 });
    ping(v, { f: 1320, ratio: 1.5, index: 1.0, d: 0.20, v: 0.05, at: 0.085 });
  },

  ui(v) {
    tone(v, { type: 'sine', f: 640, f1: 730, d: 0.05, a: 0.001, v: 0.11 });
    noise(v, { filter: 'highpass', fc: 6200, d: 0.014, a: 0.0006, v: 0.04 });
  },

  uiBack(v) {
    tone(v, { type: 'sine', f: 620, f1: 372, d: 0.09, a: 0.001, v: 0.11 });
    noise(v, { filter: 'bandpass', fc: 2600, fc1: 1200, q: 1.2, d: 0.06, a: 0.001, v: 0.04 });
  },

  /* ───────── 敌人 / 爆炸 / 传送 / BOSS / 气泡 ───────── */

  enemyShot(v) {
    tone(v, { type: 'square', f: 520, f1: 176, d: 0.075, a: 0.001, v: 0.12, filter: 'lowpass', fc: 1700, fc1: 900 });
    tone(v, { type: 'sawtooth', f: 260, f1: 130, d: 0.09, a: 0.002, v: 0.06 });
    noise(v, { filter: 'bandpass', fc: 1500, fc1: 600, q: 1.3, d: 0.05, a: 0.001, v: 0.09 });
  },

  enemySniper(v) {
    // 先充能呜一声，再裂空
    tone(v, { type: 'sawtooth', f: 1200, f1: 2700, d: 0.20, a: 0.04, v: 0.055, filter: 'bandpass', fc: 2400, q: 5, at: 0.0 });
    noise(v, { filter: 'highpass', fc: 2800, d: 0.05, a: 0.001, v: 0.22, at: 0.19 });
    tone(v, { type: 'sawtooth', f: 1250, f1: 110, d: 0.30, a: 0.002, v: 0.19, filter: 'lowpass', fc: 2200, fc1: 500, at: 0.19 });
    tone(v, { type: 'sine', f: 112, f1: 38, d: 0.34, a: 0.003, v: 0.20, at: 0.19 });
  },

  explode(v) {
    noise(v, { filter: 'lowpass', fc: 2600, fc1: 70, q: 0.9, d: 0.62, a: 0.002, v: 0.38 });
    tone(v, { type: 'sine', f: 142, f1: 30, d: 0.68, a: 0.004, v: 0.35 });
    noise(v, { filter: 'bandpass', fc: 950, fc1: 200, q: 0.8, d: 0.40, a: 0.004, v: 0.15, at: 0.02 });
    // 碎片飞溅
    for (let i = 0; i < 6; i++) {
      noise(v, { filter: 'highpass', fc: rnd(2400, 6000), d: rnd(0.03, 0.075), a: 0.001, v: rnd(0.03, 0.075), at: rnd(0.03, 0.5), pan: rnd(-0.8, 0.8) });
    }
  },

  tele(v) {
    tone(v, { type: 'sine', f: 300, f1: 1450, d: 0.55, a: 0.10, v: 0.11, vib: 8.5, vibAmt: 14 });
    tone(v, { type: 'sine', f: 452, f1: 2180, d: 0.50, a: 0.12, v: 0.06, at: 0.04, detune: 9 });
    noise(v, { filter: 'bandpass', fc: 800, fc1: 4200, q: 4, d: 0.52, a: 0.08, v: 0.06 });
    ping(v, { f: 1320, ratio: 3.01, index: 2.6, d: 0.45, v: 0.035, at: 0.28 });
  },

  boss(v) {
    tone(v, { type: 'sawtooth', f: 55, f1: 38, d: 1.35, a: 0.02, v: 0.26, filter: 'lowpass', fc: 300, q: 2.2, sweep: 0.6 });
    tone(v, { type: 'sawtooth', f: 82, f1: 48, d: 1.25, a: 0.03, v: 0.15, detune: -7, filter: 'lowpass', fc: 340 });
    tone(v, { type: 'sine', f: 41, f1: 34, d: 1.45, a: 0.02, v: 0.32 });
    noise(v, { filter: 'lowpass', fc: 420, fc1: 110, q: 1.2, d: 1.20, a: 0.03, v: 0.17, brown: true });
    tone(v, { type: 'square', f: 640, f1: 250, d: 0.90, a: 0.05, v: 0.05, filter: 'bandpass', fc: 900, q: 9, at: 0.12 });
  },

  bubble(v) {
    const f = 560 + Math.random() * 420;
    tone(v, { type: 'sine', f: f, f1: f * 2.3, d: 0.075, a: 0.002, v: 0.075, pan: rnd(-0.6, 0.6) });
    noise(v, { filter: 'bandpass', fc: 3200, fc1: 5200, q: 2.4, d: 0.03, a: 0.001, v: 0.022 });
  },
};

/** 别名：老代码/未来代码里可能出现的名字，保证永远不会因为查不到 cue 而报错 */
const ALIAS = { laser: 'laserFire', laserBeam: 'laserFire', shot: 'pistol', hurt2: 'hurt' };

/* ═════════════════════════════ 7. 播放入口 ═════════════════════════════ */

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function play(name, opts) {
  if (!ready() || typeof name !== 'string') return;
  const fn = has(SFX, name) ? SFX[name] : (has(ALIAS, name) ? SFX[ALIAS[name]] : null);
  if (typeof fn !== 'function') return;
  opts = opts || {};
  let v = null;
  try {
    v = new Voice({
      gain: opts.vol == null ? 1 : clamp(opts.vol, 0, 4),
      pan: opts.pan,
      send: opts.send,
      lp: opts.lp,
      rate: (opts.rate == null ? 1 : opts.rate) * cents(rnd(-16, 16)),
      t: opts._t,
    });
    fn(v);
  } catch (e) {
    /* 单个 cue 出问题不影响游戏 */
  } finally {
    if (v) v.finish();
  }
}

/** 世界坐标发声：距离衰减（反平方感）+ 距离低通（远处只剩低频）+ 声像 + 更远的混响 */
function playAt(name, x, y, opts) {
  if (!ready()) return;
  const W = (typeof window !== 'undefined' && window.innerWidth) || 1280;
  const H = (typeof window !== 'undefined' && window.innerHeight) || 800;
  const dx = x - W / 2, dy = y - H / 2;
  const d = Math.hypot(dx, dy);
  const maxD = Math.max(W, H) * 0.72;
  const k = clamp(d / maxD, 0, 1);
  const vol = lerp(1, 0.10, Math.pow(k, 1.3));
  const pan = clamp(dx / (W * 0.55), -0.85, 0.85);
  const lp = lerp(17000, 1500, Math.pow(k, 0.8));
  const send = 0.14 + k * 0.42;
  const o = Object.assign({}, opts || {});
  o.vol = (o.vol == null ? 1 : o.vol) * vol;
  if (o.pan == null) o.pan = pan;
  if (o.send == null) o.send = send;
  o.lp = o.lp == null ? lp : Math.min(o.lp, lp);
  play(name, o);
}

/* ═════════════════════════════ 8. 持续激光 ═════════════════════════════ */

function setLaser(on) {
  if (!ready()) { laser = null; return; }
  if (on && !laser) {
    try {
      const t = ac.currentTime;
      const v = new Voice({ gain: 1, send: 0.24, bus: 'sfx' });

      // 总包络（起振 / 收声都走它）
      const master = v.g(0);
      master.connect(v.out);

      // 共鸣带通 → 低通 → 总包络
      const bp = v.bq('bandpass', 1150, 4.5);
      const lp = v.bq('lowpass', 4200, 0.8);
      bp.connect(lp);
      lp.connect(master);

      const o1 = v.osc('sawtooth', 168);
      const o2 = v.osc('square', 336); o2.detune.value = 6;
      const o3 = v.osc('sine', 84);                 // 低频厚度
      const g1 = v.g(0.5), g2 = v.g(0.22), g3 = v.g(0.5);
      o1.connect(g1); g1.connect(bp);
      o2.connect(g2); g2.connect(bp);
      o3.connect(g3); g3.connect(master);

      const nz = ac.createBufferSource();
      nz.buffer = noiseBuf; nz.loop = true; nz.playbackRate.value = 1.4;
      v.mk(nz);
      const nf = v.bq('bandpass', 2600, 3.2);
      const ng = v.g(0.05);
      nz.connect(nf); nf.connect(ng); ng.connect(master);

      // 起振：滤波扫频 + 音量爬升；慢速 LFO 让音色呼吸
      sweep(bp.frequency, t, 520, 1250, 0.12, true);
      const lfo = v.osc('sine', 6.4);
      const lg = v.g(210);
      lfo.connect(lg); lg.connect(bp.frequency);
      lfo.start(t);

      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.115, t + 0.07);

      o1.start(t); o2.start(t); o3.start(t);
      try { nz.start(t); } catch (e) {}
      laser = { v: v, t: t, nodes: [o1, o2, o3, nz, lfo], master: master };
    } catch (e) {
      laser = null;
    }
  } else if (!on && laser) {
    const L = laser;
    laser = null;
    try {
      const t = ac.currentTime;
      L.master.gain.cancelScheduledValues(t);
      L.master.gain.setValueAtTime(Math.max(0.0001, L.master.gain.value), t);
      L.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      L.nodes.forEach(function (s) { stopSrc(s, t + 0.16); });
      L.v.mark(t + 0.22);
      L.v.finish();
    } catch (e) {}
  }
}

/* ═════════════════════════════ 9. 环境音 ═════════════════════════════ */

function startAmbient(fade) {
  if (!ac || !mix || mix.ambStarted || !noiseBuf) return;
  mix.ambStarted = true;
  try {
    const t = ac.currentTime;
    const bed = ac.createBufferSource();
    bed.buffer = brownBuf || noiseBuf;
    bed.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 210; lp.Q.value = 0.5;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 78; bp.Q.value = 6;
    const g1 = ac.createGain(); g1.gain.value = 0.110;
    const g2 = ac.createGain(); g2.gain.value = 0.060;
    bed.connect(lp); lp.connect(g1); g1.connect(mix.ambBus);
    bed.connect(bp); bp.connect(g2); g2.connect(mix.ambBus);
    bed.start(t);

    // 深海压力感的次低频
    const sub = ac.createOscillator(); sub.type = 'sine'; sub.frequency.value = 41.5;
    const sg = ac.createGain(); sg.gain.value = 0.050;
    sub.connect(sg); sg.connect(mix.ambBus);
    sub.start(t);

    // 缓慢的水流起伏
    const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lg = ac.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(bp.frequency);
    lfo.start(t);
    const lfo2 = ac.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.043;
    const lg2 = ac.createGain(); lg2.gain.value = 0.014;
    lfo2.connect(lg2); lg2.connect(g1.gain);
    lfo2.start(t);

    mix.ambNodes = [bed, sub, lfo, lfo2];
    const f = fade == null ? 2.5 : fade;
    mix.ambBus.gain.setValueAtTime(0.0001, t);
    mix.ambBus.gain.exponentialRampToValueAtTime(Math.max(0.0002, volMus * AMB_TRIM), t + Math.max(0.2, f));
  } catch (e) { mix.ambStarted = false; }
}

/** 鲸歌：FM 载波 + 滑音 + 颤音 + 两个共振峰，长混响，随机声像 */
function whaleCall(t) {
  if (!ac || !mix) return;
  stats.whales++;
  if (!stats.firstWhale) stats.firstWhale = +(nowT() - initT).toFixed(2);
  const v = new Voice({ t: t, gain: 1, pan: rnd(-0.75, 0.75), send: 0.85, bus: 'amb' });
  const dur = rnd(3.0, 4.6);
  const base = rnd(96, 168);
  const car = v.osc('sine', base);
  // 先上行五度再缓缓落下，像远处鲸鱼的呼唤
  sweep(car.frequency, t, base, base * 1.5, dur * 0.34, true);
  car.frequency.exponentialRampToValueAtTime(base * 1.18, t + dur * 0.62);
  car.frequency.exponentialRampToValueAtTime(base * 0.78, t + dur);

  const mod = v.osc('sine', base * 2.02);
  const mg = v.g(base * 0.55);
  mg.gain.setValueAtTime(base * 0.6, t);
  mg.gain.exponentialRampToValueAtTime(base * 0.08, t + dur * 0.8);
  mod.connect(mg); mg.connect(car.frequency);

  const vib = v.osc('sine', rnd(4.2, 6.4));
  const vg = v.g(4.5);
  vib.connect(vg); vg.connect(car.frequency);

  // 共振峰 360/720 落在鲸歌基频的谐波区，另加一条直达低频路径保证存在感。
  // （原来 520/1080 会把 96–168Hz 的基频几乎全滤掉，实测只有 −30dB）
  const f1 = v.bq('bandpass', 360, 3.0);
  const f2 = v.bq('bandpass', 720, 3.5);
  const f3 = v.bq('lowpass', 200, 0.8);
  const g1 = v.g(0), g2 = v.g(0), g3 = v.g(0);
  car.connect(f1); f1.connect(g1); g1.connect(v.out);
  car.connect(f2); f2.connect(g2); g2.connect(v.out);
  car.connect(f3); f3.connect(g3); g3.connect(v.out);

  g1.gain.setValueAtTime(0.0001, t);
  g1.gain.exponentialRampToValueAtTime(0.155, t + dur * 0.32);
  g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.065, t + dur * 0.4);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g3.gain.setValueAtTime(0.0001, t);
  g3.gain.exponentialRampToValueAtTime(0.118, t + dur * 0.26);
  g3.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);

  [car, mod, vib].forEach(function (s) { s.start(t); s.stop(t + dur + 0.08); });
  v.mark(t + dur + 0.1);
  v.finish();
}

/** 远处的船体/礁石低鸣 */
function deepCreak(t) {
  stats.creaks++;
  const v = new Voice({ t: t, gain: 1, pan: rnd(-0.8, 0.8), send: 0.7, bus: 'amb' });
  const d = rnd(2.2, 3.6);
  noise(v, { filter: 'bandpass', fc: rnd(70, 110), q: 8, d: d, a: 0.5, v: 0.35, brown: true });
  tone(v, { type: 'sine', f: rnd(38, 52), f1: rnd(30, 40), d: d, a: 0.4, v: 0.10 });
  v.mark(t + d + 0.2);
  v.finish();
}

function ambientTick() {
  if (isOffline()) return;          // 同上
  if (!ready()) return;
  const t = ac.currentTime;
  if (t > nextWhale) { whaleCall(t + 0.2); nextWhale = t + rnd(20, 42); }
  if (t > nextCreak) { deepCreak(t + 0.3); nextCreak = t + rnd(34, 68); }
  if (t > nextBubble) {
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const v = new Voice({ t: t + 0.15 + i * rnd(0.08, 0.22), gain: 0.5, pan: rnd(-0.7, 0.7), send: 0.5, bus: 'amb' });
      const f = rnd(420, 900);
      tone(v, { type: 'sine', f: f, f1: f * rnd(1.8, 2.8), d: rnd(0.05, 0.09), a: 0.002, v: 0.09 });
      v.finish();
    }
    nextBubble = t + rnd(7, 16);
  }
}

/* ═════════════════════════════ 10. 音乐 ═════════════════════════════
   92 BPM，D 小调，16 小节循环，每小节 16 个十六分音符。 */

const BPM = 92;
const STEP = 60 / BPM / 4;          // ≈0.163s
const BAR = STEP * 16;              // ≈2.609s
const D3 = 146.832;                 // D3
const CH = { m: [0, 3, 7, 12], M: [0, 4, 7, 12], d7: [0, 4, 7, 10, 12] };

// 相对 D3 的半音根音
const PROG = [
  { r: 0, t: 'm' },   // Dm
  { r: -4, t: 'M' },  // Bb
  { r: 3, t: 'M' },   // F
  { r: -2, t: 'M' },  // C
  { r: 0, t: 'm' },   // Dm
  { r: -4, t: 'M' },  // Bb
  { r: -2, t: 'M' },  // C
  { r: -2, t: 'M' },  // C
  { r: 5, t: 'm' },   // Gm
  { r: -4, t: 'M' },  // Bb
  { r: 3, t: 'M' },   // F
  { r: -2, t: 'M' },  // C
  { r: 0, t: 'm' },   // Dm
  { r: -4, t: 'M' },  // Bb
  { r: 7, t: 'd7' },  // A7
  { r: 7, t: 'd7' },  // A7
];

/* 作曲旋律：[小节, 十六分位置, 相对 D4 的半音, 时值(十六分), 力度]
   A 段 4~7 小节是一句稀疏的“呼唤”，B 段 8~15 小节是完整两句。 */
const MEL = [
  [4, 0, 7, 6, 0.50], [4, 8, 5, 4, 0.40],
  [5, 0, 3, 4, 0.45], [5, 6, 0, 4, 0.45], [5, 12, 5, 3, 0.36],
  [6, 0, 7, 6, 0.50], [6, 10, 8, 4, 0.40],
  [7, 0, 7, 4, 0.46], [7, 6, 10, 6, 0.46],

  [8, 0, 12, 4, 0.78], [8, 6, 10, 2, 0.55], [8, 8, 8, 4, 0.66], [8, 12, 7, 3, 0.48],
  [9, 0, 15, 4, 0.82], [9, 4, 12, 2, 0.56], [9, 8, 10, 3, 0.56], [9, 12, 12, 4, 0.60],
  [10, 0, 15, 3, 0.78], [10, 4, 17, 3, 0.66], [10, 8, 15, 2, 0.56], [10, 12, 12, 4, 0.60],
  [11, 0, 19, 4, 0.82], [11, 8, 17, 2, 0.56], [11, 10, 15, 2, 0.50], [11, 12, 14, 4, 0.66],

  [12, 0, 12, 4, 0.78], [12, 4, 10, 2, 0.52], [12, 8, 8, 2, 0.52], [12, 12, 7, 4, 0.56],
  [13, 0, 8, 4, 0.66], [13, 4, 10, 2, 0.52], [13, 8, 12, 2, 0.56], [13, 12, 15, 4, 0.66],
  [14, 0, 19, 4, 0.82], [14, 4, 17, 2, 0.56], [14, 6, 15, 2, 0.50], [14, 8, 14, 4, 0.60],
  [15, 0, 13, 3, 0.68], [15, 4, 12, 2, 0.52], [15, 8, 10, 2, 0.50], [15, 12, 7, 4, 0.56],
];
const MEL_MAP = Object.create(null);
MEL.forEach(function (m) { MEL_MAP[m[0] * 16 + m[1]] = { s: m[2], d: m[3], v: m[4] }; });

// 16 步琶音动机（索引进 4 音和弦声位）
const ARP = [0, 2, 1, 3, 2, 1, 3, 4, 0, 2, 1, 3, 4, 3, 2, 1];

function musVoice(t, gain, pan, send) {
  return new Voice({ t: t, gain: gain == null ? 1 : gain, pan: pan, send: send == null ? 0.3 : send, bus: 'music' });
}

function padEnv(param, t0, peak, dur) {
  peak = Math.max(0.0002, peak);
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(peak, t0 + dur * 0.33);
  param.setValueAtTime(peak * 0.86, t0 + dur * 0.72);
  param.exponentialRampToValueAtTime(0.0001, t0 + dur);
  param.setValueAtTime(0, t0 + dur + 0.02);
}

/** pad 铺底：每小节一次，4 音 × 2 层去谐，慢起音 */
function musPad(t, chord, dur) {
  const v = musVoice(t, 1, rnd(-0.12, 0.12), 0.55);
  const lp = v.bq('lowpass', 700 + intensity * 2400, 0.7);
  lp.connect(v.out);
  const iv = CH[chord.t];
  const tones = [iv[0], iv[1], iv[2], iv[2] + 12];
  tones.forEach(function (semi, i) {
    const f = D3 * Math.pow(2, (chord.r + semi) / 12) * 2;
    [[-6, 'sawtooth'], [7, 'triangle']].forEach(function (cfg, j) {
      const o = v.osc(cfg[1], f);
      o.detune.value = cfg[0] + rnd(-2, 2);
      const g = v.g(0);
      o.connect(g); g.connect(lp);
      padEnv(g.gain, t, (i === 0 ? 0.052 : 0.036) / (j ? 1.4 : 1), dur);
      o.start(t); o.stop(t + dur + 0.05);
    });
  });
  v.mark(t + dur + 0.1);
  v.finish();
}

/** 贝斯：sub 正弦 + 轻失真锯齿，双音叠加 */
function musBass(t, f, dur, vel) {
  const v = musVoice(t, 1, 0, 0.04);
  const lp = v.bq('lowpass', 250 + intensity * 320, 1.5);
  lp.connect(v.out);
  const sub = v.osc('sine', f);
  const sg = v.g(0); sub.connect(sg); sg.connect(lp);
  env(sg.gain, t, vel, 0.007, dur);
  const saw = v.osc('sawtooth', f);
  saw.detune.value = 4;
  const sg2 = v.g(0); saw.connect(sg2); sg2.connect(lp);
  env(sg2.gain, t, vel * 0.5, 0.005, dur * 0.85);
  sub.start(t); sub.stop(t + dur + 0.06);
  saw.start(t); saw.stop(t + dur + 0.06);
  v.mark(t + dur + 0.1);
  v.finish();
}

/** 琶音：三角波拨弦 + 八度正弦点亮 */
function musArp(t, f, vel) {
  const v = musVoice(t, 1, rnd(-0.38, 0.38), 0.24);
  tone(v, { type: 'triangle', f: f, d: 0.22, a: 0.004, v: vel, filter: 'lowpass', fc: 1700 + intensity * 3400, q: 1.15 });
  tone(v, { type: 'sine', f: f * 2, d: 0.10, a: 0.003, v: vel * 0.32 });
  if (intensity > 0.62) tone(v, { type: 'square', f: f, d: 0.07, a: 0.002, v: vel * 0.16, filter: 'highpass', fc: 1800 });
  v.finish();
}

/** 主旋律：锯齿 + 三角八度 + 正弦基音，带 5Hz 颤音 */
function musLead(t, f, dur, vel) {
  const v = musVoice(t, 1, rnd(-0.08, 0.08), 0.34);
  tone(v, { type: 'sawtooth', f: f, d: dur, a: 0.055, v: vel * 0.5, hold: dur * 0.35,
    filter: 'lowpass', fc: 1500 + intensity * 2600, fc1: 1000, q: 0.9, vib: 5.2, vibAmt: 3.2 });
  tone(v, { type: 'triangle', f: f * 2, d: dur * 0.7, a: 0.09, v: vel * 0.10 });
  tone(v, { type: 'sine', f: f, d: dur * 1.2, a: 0.09, v: vel * 0.16 });
  v.finish();
}

function drumKick(t, vel) {
  const v = musVoice(t, 1, 0, 0.05);
  const o = v.osc('sine', 140);
  sweep(o.frequency, t, 140, 44, 0.11, true);
  const g = v.g(0);
  o.connect(g); g.connect(v.out);
  env(g.gain, t, vel * 0.85, 0.003, 0.32);
  o.start(t); o.stop(t + 0.40);
  noise(v, { filter: 'lowpass', fc: 2600, fc1: 520, d: 0.018, a: 0.0008, v: vel * 0.32 });
  v.mark(t + 0.42);
  v.finish();
}

function drumSnare(t, vel) {
  const v = musVoice(t, 1, rnd(-0.08, 0.08), 0.3);
  noise(v, { filter: 'bandpass', fc: 1900, q: 0.7, d: 0.13, a: 0.001, v: vel * 0.5 });
  noise(v, { filter: 'highpass', fc: 5200, d: 0.085, a: 0.001, v: vel * 0.22 });
  noise(v, { filter: 'bandpass', fc: 3400, q: 1.1, d: 0.06, a: 0.0008, v: vel * 0.20 });
  tone(v, { type: 'triangle', f: 192, f1: 148, d: 0.09, a: 0.002, v: vel * 0.32 });
  v.finish();
}

function drumHat(t, vel, open) {
  const v = musVoice(t, 1, rnd(-0.3, 0.3), 0.16);
  noise(v, { filter: 'highpass', fc: 7800, q: 0.8, d: open ? 0.15 : 0.034, a: 0.0008, v: vel * 0.95 });
  noise(v, { filter: 'bandpass', fc: 11200, q: 1.4, d: open ? 0.11 : 0.026, a: 0.0006, v: vel * 0.34 });
  v.finish();
}

function musRiser(t, dur, vel) {
  const v = musVoice(t, 1, 0, 0.5);
  const bp = v.bq('bandpass', 400, 1.7);
  const g = v.g(0);
  bp.connect(g);
  g.connect(v.out);
  sweep(bp.frequency, t, 380, 5400, dur, true);

  const src = ac.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  v.mk(src);
  src.connect(bp);

  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.13, t + dur * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  try { src.start(t, Math.random() * 0.6); } catch (e) {}
  stopSrc(src, t + dur + 0.08);
  v.mark(t + dur + 0.1);
  v.finish();
}

function musImpact(t, vel) {
  const v = musVoice(t, 1, 0, 0.6);
  tone(v, { type: 'sine', f: 92, f1: 28, d: 0.85, a: 0.004, v: 0.34 * vel, sweep: 0.35 });
  noise(v, { filter: 'lowpass', fc: 1200, fc1: 80, d: 0.62, a: 0.004, v: 0.26 * vel });
  noise(v, { filter: 'highpass', fc: 4200, d: 0.10, a: 0.001, v: 0.08 * vel });
  v.finish();
}

/** 排一个十六分格 */
function scheduleStep(step, t) {
  if (!ac || !mix) return;
  const bar = Math.floor(step / 16) % 16;
  const inBar = step % 16;
  const chord = PROG[bar];
  const A = bar < 8;
  const hot = intensity;

  /* ---- 贝斯：根音 1/3 拍 + 切分 + 小节尾推进 ---- */
  let bi = -1, bv = 0, bd = 0;
  if (inBar === 0) { bi = 0; bd = 0.30; bv = 0.32; }
  else if (inBar === 6) { bi = (hot > 0.40 ? 7 : 0); bd = 0.15; bv = 0.19; }
  else if (inBar === 8) { bi = 0; bd = 0.26; bv = 0.29; }
  else if (inBar === 14) { bi = (hot > 0.55 ? 12 : 0); bd = 0.12; bv = 0.17; }
  if (bi >= 0) musBass(t, D3 * Math.pow(2, (chord.r + bi) / 12) / 2, bd, bv);

  /* ---- 鼓 ---- */
  if (inBar === 0 || (inBar === 8) || (!A && inBar === 6) || (hot > 0.80 && inBar === 3)) {
    drumKick(t, inBar === 0 ? 0.85 : 0.62);
  }
  if (inBar === 4 || inBar === 12) {
    if (!A || (inBar === 12 && hot > 0.25) || (inBar === 4 && hot > 0.55)) drumSnare(t, 0.48 + hot * 0.26);
  }
  const hatEvery = hot > 0.62 ? 1 : 2;
  if ((!A || hot > 0.12) && inBar % hatEvery === 0) drumHat(t, 0.15 + hot * 0.12, false);
  if (inBar === 14 && (!A || hot > 0.30)) drumHat(t, 0.20, true);

  /* ---- pad ---- */
  if (inBar === 0) musPad(t, chord, BAR * 1.03);

  /* ---- 琶音 ---- */
  if (!A || inBar % 2 === 0 || hot > 0.6) {
    const tones = CH[chord.t];
    const idx = ARP[inBar];
    const semi = chord.r + (idx < tones.length ? tones[idx] : tones[idx - tones.length] + 12);
    const vel = 0.048 + (inBar % 4 === 0 ? 0.026 : 0) + hot * 0.022;
    musArp(t, D3 * Math.pow(2, (semi + 24) / 12), vel);
  }

  /* ---- 旋律（作曲动机） ---- */
  const m = MEL_MAP[step % (16 * 16)];
  if (m && (hot > 0.05 || !A)) {
    const f = D3 * Math.pow(2, (m.s + 12) / 12);   // 相对 D4
    musLead(t, f, m.d * STEP, m.v * (0.72 + hot * 0.35));
  }

  /* ---- 段落结构：16 小节一次 turnaround ---- */
  if (bar === 0 && inBar === 0) musImpact(t, hot > 0.5 ? 0.9 : 0.7);
  if (bar === 8 && inBar === 0) musImpact(t, 0.55);
  if (bar === 15 && inBar === 8) musRiser(t, STEP * 8, 0.8);
  if (bar === 15 && inBar >= 12) drumSnare(t, 0.22 + (inBar - 12) * 0.06);
}

/** 离线渲染用：把一段音乐全部排好（实时调度靠 setInterval） */
function scheduleMusicRange(t0, t1, startStep) {
  let step = startStep || 0;
  let t = t0;
  let guard = 0;
  while (t < t1 && guard++ < 4000) {
    try { scheduleStep(step, t); } catch (e) {}
    step++;
    t += STEP;
  }
  return step;
}

/* ---- 实时调度 + sidechain ---- */
function musicTick() {
  if (isOffline()) return;          // 离线渲染期间不许实时定时器往离线图里塞音符
  if (!ready() || !musicOn) return;
  const t = ac.currentTime;
  if (musicNextT < t - 0.5) musicNextT = t + 0.05;
  const ahead = t + 0.20;
  let guard = 0;
  while (musicNextT < ahead && guard++ < 48) {
    try { scheduleStep(musicStep, musicNextT); } catch (e) {}
    const chord = PROG[Math.floor(musicStep / 16) % 16];
    void chord;
    musicStep++;
    musicNextT += STEP;
  }

  /* sidechain：音效越密，音乐让位越多 */
  try {
    if (mix.sfxAnalyser && scBuf) {
      mix.sfxAnalyser.getFloatTimeDomainData(scBuf);
      let sum = 0;
      for (let i = 0; i < scBuf.length; i++) { const s = scBuf[i]; sum += s * s; }
      const rms = Math.sqrt(sum / scBuf.length);
      sideRMS = Math.max(rms, sideRMS * 0.82);
      const duck = clamp(sideRMS * 5.5, 0, 0.32);
      mix.musDuck.gain.setTargetAtTime(1 - duck, t, 0.07);
    }
  } catch (e) {}

  /* 强度 → 亮度 / 并行失真 */
  if (Math.abs(intensity - lastIntensity) > 0.001) {
    lastIntensity = intensity;
    mix.musLP.frequency.setTargetAtTime(2600 + intensity * 6200, t, 0.35);
    mix.musSat.gain.setTargetAtTime(0.03 + intensity * 0.16, t, 0.5);
  }
}

function startMusic() {
  init();
  if (!ready()) return;
  if (musicOn) return;
  musicOn = true;
  musicStep = 0;
  musicNextT = ac.currentTime + 0.08;
  mix.musFade.gain.cancelScheduledValues(ac.currentTime);
  mix.musFade.gain.setValueAtTime(0.0001, ac.currentTime);
  mix.musFade.gain.exponentialRampToValueAtTime(1, ac.currentTime + 1.1);
  mix.musDuck.gain.cancelScheduledValues(ac.currentTime);
  mix.musDuck.gain.setValueAtTime(1, ac.currentTime);
  sideRMS = 0;
  if (!musicTimer) musicTimer = setInterval(musicTick, 25);
  musicTick();
}

function stopMusic() {
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (ready()) {
    const t = ac.currentTime;
    mix.musFade.gain.cancelScheduledValues(t);
    mix.musFade.gain.setValueAtTime(Math.max(0.0001, mix.musFade.gain.value), t);
    mix.musFade.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    mix.musDuck.gain.cancelScheduledValues(t);
    mix.musDuck.gain.setTargetAtTime(1, t, 0.12);
    sideRMS = 0;
  }
}

function setIntensity(v) {
  intensity = clamp(v, 0, 1);
}

/* ═════════════════════════════ 11. 初始化 / 音量 / 生命周期 ═════════════ */

function init() {
  if (ac) {
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ac = new AC({ latencyHint: 'interactive' });     // 优先小缓冲：256 帧量级
    initT = ac.currentTime;
    mix = buildMixer(ac);
    noiseBuf = makeNoise(ac, 2.0, false);
    brownBuf = makeNoise(ac, 2.0, true);
    startAmbient(2.5);
    nextWhale = ac.currentTime + rnd(9, 18);
    nextCreak = ac.currentTime + rnd(20, 40);
    nextBubble = ac.currentTime + rnd(4, 9);
    if (!ambientTimer) ambientTimer = setInterval(ambientTick, 900);
  } catch (e) {
    ac = null; mix = null;
    return null;
  }
  return ac;
}

function resume() {
  init();
  if (ready() && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
}

/** 兼容两种调用：setVolumes({sfx,music}) 与 setVolumes(sfx, music)（game.js 用的是后者） */
function setVolumes(a, b) {
  let s, m;
  if (a && typeof a === 'object') { s = a.sfx; m = a.music; }
  else { s = a; m = b; }
  if (s != null) volSfx = clamp(+s || 0, 0, 2);
  if (m != null) volMus = clamp(+m || 0, 0, 2);
  if (!ready()) return;
  const t = ac.currentTime;
  mix.sfxBus.gain.setTargetAtTime(volSfx, t, 0.05);
  mix.musBus.gain.setTargetAtTime(volMus * MUS_TRIM, t, 0.05);
  mix.ambBus.gain.setTargetAtTime(volMus * AMB_TRIM, t, 0.08);
}

/* ═════════════════════════════ 12. 离线渲染（自检用，不参与游戏逻辑） ═══════════════
   把整套混音链搬到 OfflineAudioContext 上渲染，用来量峰值 / RMS / 波形。
   用法：await SoundEngine._offlineRender({duration, music, cues:[{at,name,opts}], intensity}) */

function bindContext(ctx) {
  const saved = { ac: ac, mix: mix, noiseBuf: noiseBuf, brownBuf: brownBuf };
  ac = ctx;
  noiseBuf = makeNoise(ctx, 2.0, false);
  brownBuf = makeNoise(ctx, 2.0, true);
  mix = buildMixer(ctx);
  return saved;
}
function unbindContext(saved) {
  ac = saved.ac;
  mix = saved.mix;
  noiseBuf = saved.noiseBuf;
  brownBuf = saved.brownBuf;
}

function offlineRender(opts) {
  opts = opts || {};
  const dur = clamp(opts.duration || 8, 0.5, 120);
  const sr = opts.sampleRate || 44100;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return Promise.resolve({ ok: false, error: 'OfflineAudioContext 不可用' });

  const ctx = new OAC(2, Math.ceil(dur * sr), sr);
  const saved = bindContext(ctx);
  const voiceBase = activeVoices.length;
  const prevIntensity = intensity;

  if (opts.intensity != null) intensity = clamp(opts.intensity, 0, 1);
  // 离线渲染里没有 musicTick，这里补上「强度 → 亮度 / 并行失真」的设定，
  // 保证离线测到的就是实时会听到的声音。
  if (mix && mix.musLP) {
    mix.musLP.frequency.value = 2600 + intensity * 6200;
    mix.musSat.gain.value = 0.03 + intensity * 0.16;
  }
  if (opts.ambience) startAmbient(0.3);
  if (opts.ambience && opts.whaleAt != null) whaleCall(Math.max(0.2, opts.whaleAt));
  if (opts.music) {
    mix.musFade.gain.value = 1;
    const t0 = opts.musicStart == null ? 0.1 : opts.musicStart;
    scheduleMusicRange(t0, dur - 0.02, opts.startStep || 0);
  }
  const cues = opts.cues || [];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const o = Object.assign({}, c.opts || {}, { _t: c.at });
    // 带 x/y 的 cue 走 playAt，用来离线验证距离衰减 / 声像
    if (c.x != null && c.y != null) playAt(c.name, c.x, c.y, o);
    else play(c.name, o);
  }

  return ctx.startRendering().then(function (buf) {
    let peak = 0, sq = 0, n = 0;
    const chans = buf.numberOfChannels;
    const data = [];
    for (let c = 0; c < chans; c++) {
      const d = buf.getChannelData(c);
      data.push(d);
      for (let i = 0; i < d.length; i++) {
        const a = d[i] < 0 ? -d[i] : d[i];
        if (a > peak) peak = a;
        sq += d[i] * d[i];
        n++;
      }
    }
    // 清理这次离线渲染产生的所有声部
    for (let i = activeVoices.length - 1; i >= voiceBase; i--) activeVoices[i].dispose();
    unbindContext(saved);
    intensity = prevIntensity;
    return {
      ok: true, peak: peak, rms: Math.sqrt(sq / Math.max(1, n)), duration: dur,
      sampleRate: sr, channels: chans, frames: buf.length, buffer: buf, data: data,
    };
  }).catch(function (e) {
    for (let i = activeVoices.length - 1; i >= voiceBase; i--) activeVoices[i].dispose();
    unbindContext(saved);
    intensity = prevIntensity;
    return { ok: false, error: String(e && e.message || e) };
  });
}

/* ═════════════════════════════ 13. 对外接口（名字/签名不可变） ═════════════ */

window.SoundEngine = {
  init: init,
  resume: resume,
  play: play,
  playAt: playAt,
  setLaser: setLaser,
  startMusic: startMusic,
  stopMusic: stopMusic,
  setVolumes: setVolumes,
  setIntensity: setIntensity,
  get ready() { return ready(); },

  /* --- 自检 / 调试（游戏逻辑不使用） --- */
  version: 2,
  _debug: function () {
    return {
      state: ac ? ac.state : 'none',
      sampleRate: ac ? ac.sampleRate : 0,
      baseLatency: mix ? mix.sr : 0,
      created: stats.created,
      freed: stats.freed,
      live: stats.created - stats.freed,
      voices: activeVoices.length,
      musicOn: musicOn,
      musicStep: musicStep,
      intensity: intensity,
      sfxVol: volSfx,
      musVol: volMus,
      musLpHz: mix ? Math.round(mix.musLP.frequency.value) : 0,
      musSat: mix ? +mix.musSat.gain.value.toFixed(3) : 0,
      musDuck: mix ? +mix.musDuck.gain.value.toFixed(3) : 0,
      musFade: mix ? +mix.musFade.gain.value.toFixed(3) : 0,
      sfxRms: +sideRMS.toFixed(4),
      whales: stats.whales,
      creaks: stats.creaks,
      firstWhaleSec: stats.firstWhale,
      cues: Object.keys(SFX),
    };
  },
  _offlineRender: offlineRender,
};

/* 首个用户手势后解锁（浏览器自动播放策略） */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const unlock = function () {
    try { if (ac && ac.state === 'suspended') ac.resume(); } catch (e) {}
  };
  ['pointerdown', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { passive: true });
  });
}

})();
