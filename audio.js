/* =========================================================================
   蓝鱼枪战 · 音频引擎 (audio.js)
   -------------------------------------------------------------------------
   特性：
     · 母带压缩 + 水下延迟混响，整体"在水里"的听感
     · 立体声定位：离得越远越轻、按左右位置偏移声像
     · 每把枪都是多层音色（瞬态 + 主体 + 低频尾巴），且每次射击音高随机
     · 环境音床（水流噪音）+ 随机鲸歌 + 随战斗强度变化的背景音乐
   ========================================================================= */
(function () {
'use strict';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let ac = null, master = null, comp = null;
let sfxBus = null, sfxFilter = null, musBus = null, musFilter = null;
let reverb = null, noiseBuf = null, ambientGain = null;
let laser = null;
let volSfx = 0.85, volMus = 0.45;
let musicTimer = null, step = 0, nextT = 0, musicOn = false, intensity = 0;
let nextWhale = 0;

const ready = () => !!ac && ac.state !== 'closed';

/* ---------------- 初始化 ---------------- */
function init(){
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ac = new AC();

    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.24;

    master = ac.createGain(); master.gain.value = 0.92;
    master.connect(comp); comp.connect(ac.destination);

    // 水下延迟（短延迟 + 反馈 + 低通 = 深海回响）
    reverb = ac.createDelay(0.7); reverb.delayTime.value = 0.185;
    const fb = ac.createGain(); fb.gain.value = 0.30;
    const rlp = ac.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 1500; rlp.Q.value = 0.5;
    reverb.connect(fb); fb.connect(rlp); rlp.connect(reverb); reverb.connect(master);

    // 音效总线：低通让声音"发闷"
    sfxFilter = ac.createBiquadFilter(); sfxFilter.type = 'lowpass';
    sfxFilter.frequency.value = 5400; sfxFilter.Q.value = 0.6;
    sfxBus = ac.createGain(); sfxBus.gain.value = volSfx;
    sfxBus.connect(sfxFilter); sfxFilter.connect(master); sfxFilter.connect(reverb);

    // 音乐总线
    musFilter = ac.createBiquadFilter(); musFilter.type = 'lowpass';
    musFilter.frequency.value = 900; musFilter.Q.value = 0.5;
    musBus = ac.createGain(); musBus.gain.value = volMus;
    musBus.connect(musFilter); musFilter.connect(master);

    // 白噪声
    const len = Math.floor(ac.sampleRate * 2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    startAmbient();
    nextWhale = ac.currentTime + 12 + Math.random() * 15;
  } catch (e) { ac = null; }
  return ac;
}

function resume(){
  init();
  if (ready() && ac.state === 'suspended') ac.resume();
}
function setVolumes(sfx, music){
  volSfx = sfx; volMus = music;
  if (!ready()) return;
  sfxBus.gain.value = volSfx;
  musBus.gain.value = volMus;
}

/* ---------------- 基础发声单元 ---------------- */
function panner(pan){
  if (!ac.createStereoPanner) return null;
  const p = ac.createStereoPanner();
  p.pan.value = clamp(pan || 0, -1, 1);
  return p;
}
/** 生成一个带包络的输出节点（已接总线与混响） */
function makeBus(vol, pan, send){
  const g = ac.createGain();
  g.gain.value = 1;
  const p = panner(pan);
  if (p){ g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
  const s = ac.createGain(); s.gain.value = (send === undefined ? 0.17 : send);
  g.connect(s); s.connect(reverb);
  g._vol = vol === undefined ? 1 : vol;
  return g;
}
function env(param, t, a, d, peak){
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.002, a));
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(out, o){
  const t = ac.currentTime + (o.at || 0);
  const osc = ac.createOscillator();
  osc.type = o.type || 'sine';
  const rate = o.rate || 1;
  osc.frequency.setValueAtTime(o.f0 * rate, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * rate), t + (o.d || 0.15) * (o.sweepScale || 1));
  if (o.vib){
    const lfo = ac.createOscillator(), la = ac.createGain();
    lfo.frequency.value = o.vib; la.gain.value = o.vibAmt || 6;
    lfo.connect(la); la.connect(osc.frequency); lfo.start(t); lfo.stop(t + (o.d || 0.2) + 0.2);
  }
  let node = osc;
  if (o.filter){
    const f = ac.createBiquadFilter();
    f.type = o.filter; f.frequency.value = (o.fc || 900) * rate; f.Q.value = o.q || 1;
    osc.connect(f); node = f;
  }
  const g = ac.createGain();
  node.connect(g); g.connect(out);
  const peak = (o.v || 0.2) * out._vol;
  env(g.gain, t, o.a || 0.005, o.d || 0.12, peak);
  osc.start(t); osc.stop(t + (o.d || 0.12) + (o.a || 0) + 0.25);
  return osc;
}
function noise(out, o){
  if (!noiseBuf) return;
  const t = ac.currentTime + (o.at || 0);
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = o.rate || 1;
  const f = ac.createBiquadFilter();
  f.type = o.filter || 'bandpass';
  const base = (o.fc || 900) * (o.rate || 1);
  f.frequency.setValueAtTime(base, t);
  if (o.fc1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.fc1 * (o.rate || 1)), t + (o.d || 0.2));
  f.Q.value = o.q || 1;
  const g = ac.createGain();
  src.connect(f); f.connect(g); g.connect(out);
  const peak = (o.v || 0.2) * out._vol;
  env(g.gain, t, o.a || 0.004, o.d || 0.2, peak);
  src.start(t, Math.random() * 1.2); src.stop(t + (o.d || 0.2) + 0.2);
}

/* ---------------- 音效表 ---------------- */
const SFX = {
  // —— 玩家枪械（每把枪 3 层：瞬态 / 主体 / 尾巴）——
  pistol(out, r){
    noise(out, {filter:'highpass', fc:2600, d:0.035, v:0.30, rate:r});
    tone(out, {type:'square', f0:900, f1:300, d:0.075, v:0.30, rate:r, filter:'lowpass', fc:3200});
    tone(out, {type:'sine', f0:180, f1:70, d:0.10, v:0.34, rate:r});
  },
  smg(out, r){
    noise(out, {filter:'bandpass', fc:3200, fc1:1200, d:0.028, v:0.26, rate:r, q:0.8});
    tone(out, {type:'square', f0:760, f1:380, d:0.032, v:0.18, rate:r, filter:'lowpass', fc:2600});
  },
  shotgun(out, r){
    noise(out, {filter:'lowpass', fc:1600, fc1:160, d:0.30, v:0.52, rate:r, q:0.7});
    tone(out, {type:'sawtooth', f0:170, f1:52, d:0.26, v:0.34, rate:r, filter:'lowpass', fc:700});
    noise(out, {filter:'highpass', fc:3800, d:0.05, v:0.14, rate:r});
  },
  sniper(out, r){
    noise(out, {filter:'highpass', fc:3000, d:0.06, v:0.36, rate:r});
    tone(out, {type:'sawtooth', f0:1500, f1:110, d:0.34, v:0.32, rate:r, filter:'lowpass', fc:2400});
    tone(out, {type:'sine', f0:120, f1:44, d:0.42, v:0.34, rate:r});
  },
  launcher(out, r){
    tone(out, {type:'sine', f0:250, f1:64, d:0.30, v:0.40, rate:r});
    noise(out, {filter:'lowpass', fc:900, fc1:180, d:0.26, v:0.26, rate:r});
    noise(out, {filter:'bandpass', fc:1800, fc1:600, d:0.20, v:0.10, at:0.05, rate:r});
  },
  trident(out, r){
    [0, 0.035, 0.07].forEach((a, i) =>
      tone(out, {type:'triangle', f0:560 + i * 250, f1:300 + i * 120, d:0.17, v:0.22, at:a, rate:r, filter:'lowpass', fc:3600}));
    noise(out, {filter:'bandpass', fc:2400, fc1:900, d:0.14, v:0.10, rate:r});
  },
  laserFire(out, r){
    tone(out, {type:'sawtooth', f0:420, f1:180, d:0.16, v:0.14, rate:r, filter:'bandpass', fc:1200, q:3});
  },
  // —— 命中 / 击杀 ——
  hit(out, r){
    noise(out, {filter:'bandpass', fc:1600, fc1:600, d:0.06, v:0.26, rate:r, q:1.2});
    tone(out, {type:'triangle', f0:420, f1:260, d:0.05, v:0.12, rate:r});
  },
  crit(out, r){
    tone(out, {type:'square', f0:1500, f1:820, d:0.10, v:0.26, rate:r, filter:'lowpass', fc:4200});
    tone(out, {type:'sine', f0:2100, f1:1300, d:0.13, v:0.16, at:0.02, rate:r});
  },
  kill(out, r){
    noise(out, {filter:'lowpass', fc:900, fc1:120, d:0.26, v:0.34, rate:r, q:0.8});
    tone(out, {type:'triangle', f0:380, f1:96, d:0.24, v:0.20, rate:r, filter:'lowpass', fc:900});
  },
  // —— 玩家受击 / 死亡 ——
  hurt(out, r){
    tone(out, {type:'sawtooth', f0:190, f1:62, d:0.30, v:0.42, rate:r, filter:'lowpass', fc:700});
    noise(out, {filter:'lowpass', fc:700, fc1:200, d:0.22, v:0.30, rate:r});
    tone(out, {type:'sine', f0:520, f1:180, d:0.16, v:0.10, at:0.03, rate:r, vib:22, vibAmt:30});
  },
  die(out, r){
    tone(out, {type:'sawtooth', f0:340, f1:36, d:0.95, v:0.44, rate:r, filter:'lowpass', fc:800});
    noise(out, {filter:'lowpass', fc:1300, fc1:90, d:0.85, v:0.34, rate:r});
    tone(out, {type:'sine', f0:90, f1:32, d:0.9, v:0.30, rate:r});
  },
  // —— 护盾 / 冲刺 / 拾取 ——
  shield(out, r){
    tone(out, {type:'sine', f0:320, f1:980, d:0.24, v:0.24, rate:r});
    tone(out, {type:'triangle', f0:640, f1:1500, d:0.20, v:0.12, at:0.03, rate:r});
  },
  shieldBreak(out, r){
    noise(out, {filter:'highpass', fc:2600, d:0.26, v:0.34, rate:r});
    [0, 0.04, 0.08].forEach((a, i) => tone(out, {type:'triangle', f0:1800 - i * 400, f1:600, d:0.14, v:0.16, at:a, rate:r}));
  },
  dash(out, r){
    noise(out, {filter:'bandpass', fc:2600, fc1:260, d:0.34, v:0.30, rate:r, q:0.7});
    tone(out, {type:'sine', f0:700, f1:160, d:0.26, v:0.14, rate:r});
  },
  pickup(out, r){
    tone(out, {type:'sine', f0:700, f1:1400, d:0.16, v:0.26, rate:r});
    tone(out, {type:'sine', f0:1050, f1:2100, d:0.16, v:0.14, at:0.06, rate:r});
  },
  coin(out, r){
    tone(out, {type:'triangle', f0:1250, f1:1250, d:0.10, v:0.16, rate:r});
    tone(out, {type:'triangle', f0:1870, f1:1870, d:0.09, v:0.10, at:0.05, rate:r});
  },
  // —— 系统 / 界面 ——
  level(out, r){
    [523, 659, 784, 1046].forEach((f, i) =>
      tone(out, {type:'triangle', f0:f, d:0.26, v:0.26, at:i * 0.075, rate:r, filter:'lowpass', fc:4200}));
  },
  card(out, r){
    tone(out, {type:'triangle', f0:880, f1:1320, d:0.18, v:0.26, rate:r});
    tone(out, {type:'sine', f0:1320, f1:1980, d:0.16, v:0.12, at:0.07, rate:r});
  },
  ui(out, r){
    tone(out, {type:'sine', f0:620, f1:900, d:0.07, v:0.20, rate:r});
  },
  uiBack(out, r){
    tone(out, {type:'sine', f0:700, f1:420, d:0.09, v:0.18, rate:r});
  },
  // —— 敌人 / 爆炸 / BOSS ——
  enemyShot(out, r){
    tone(out, {type:'square', f0:520, f1:200, d:0.07, v:0.16, rate:r, filter:'lowpass', fc:1800});
    noise(out, {filter:'bandpass', fc:1400, d:0.05, v:0.12, rate:r});
  },
  enemySniper(out, r){
    noise(out, {filter:'highpass', fc:2400, d:0.08, v:0.26, rate:r});
    tone(out, {type:'sawtooth', f0:900, f1:150, d:0.22, v:0.22, rate:r, filter:'lowpass', fc:2200});
  },
  explode(out, r){
    noise(out, {filter:'lowpass', fc:1600, fc1:80, d:0.50, v:0.52, rate:r});
    tone(out, {type:'sine', f0:150, f1:36, d:0.46, v:0.36, rate:r});
    noise(out, {filter:'bandpass', fc:3000, fc1:1200, d:0.16, v:0.14, at:0.02, rate:r});
  },
  tele(out, r){
    tone(out, {type:'sine', f0:380, f1:1500, d:0.55, v:0.16, rate:r});
  },
  boss(out, r){
    tone(out, {type:'sawtooth', f0:130, f1:44, d:1.0, v:0.50, rate:r, filter:'lowpass', fc:560, q:2});
    tone(out, {type:'sine', f0:66, f1:34, d:1.1, v:0.34, rate:r});
    noise(out, {filter:'lowpass', fc:600, d:0.9, v:0.24, rate:r});
  },
  bubble(out, r){
    tone(out, {type:'sine', f0:600 + Math.random() * 500, f1:1500, d:0.06, v:0.10, rate:r});
  },
};

function play(name, opts){
  if (!ready()) return;
  const fn = SFX[name];
  if (!fn) return;
  opts = opts || {};
  try {
    const out = makeBus(opts.vol === undefined ? 1 : opts.vol, opts.pan, opts.send);
    const r = (opts.rate === undefined ? 1 : opts.rate);
    fn(out, r);
  } catch (e) { /* 静默 */ }
}
/** 按世界坐标发声：左右声像 + 距离衰减 */
function playAt(name, x, y, opts){
  if (!ready()) return;
  const W = window.innerWidth || 1280, H = window.innerHeight || 800;
  const dx = x - W / 2, dy = y - H / 2;
  const d = Math.hypot(dx, dy);
  const maxD = Math.max(W, H) * 0.75;
  const vol = clamp(1 - d / maxD, 0.15, 1);
  const pan = clamp(dx / (W * 0.5), -1, 1) * 0.8;
  play(name, Object.assign({ pan, vol: vol * vol }, opts || {}));
}

/* ---------------- 激光持续音 ---------------- */
function setLaser(on){
  if (!ready()) { if (!on) laser = null; return; }
  if (on && !laser){
    try {
      const t = ac.currentTime;
      const o = ac.createOscillator(), o2 = ac.createOscillator();
      const g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 168;
      o2.type = 'square'; o2.frequency.value = 336;
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3.5;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
      const s = ac.createGain(); s.gain.value = 0.2; g.connect(s); s.connect(reverb);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.06);
      o.start(t); o2.start(t);
      laser = { o, o2, g };
    } catch (e) { laser = null; }
  } else if (!on && laser){
    const l = laser; laser = null;
    try {
      const t = ac.currentTime;
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setValueAtTime(Math.max(0.0001, l.g.gain.value), t);
      l.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      l.o.stop(t + 0.16); l.o2.stop(t + 0.16);
    } catch (e) {}
  }
}

/* ---------------- 环境音床 ---------------- */
function startAmbient(){
  if (!ready() || !noiseBuf || ambientGain) return;
  try {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.4;
    ambientGain = ac.createGain(); ambientGain.gain.value = 0.0001;
    src.connect(f); f.connect(ambientGain); ambientGain.connect(master);
    src.start();
    const t = ac.currentTime;
    ambientGain.gain.exponentialRampToValueAtTime(0.055, t + 3);
  } catch (e) { ambientGain = null; }
}
/** 远处的鲸歌：低频滑音，营造深海空间感 */
function whaleCall(t){
  try {
    const base = 180 + Math.random() * 160;
    [0, 0.55].forEach((at, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (i ? 0.8 : 1), t + at);
      o.frequency.exponentialRampToValueAtTime(base * (i ? 1.35 : 0.72), t + at + 1.5);
      f.type = 'lowpass'; f.frequency.value = 900;
      o.connect(f); f.connect(g); g.connect(musBus);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.16, t + at + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 2.2);
      o.start(t + at); o.stop(t + at + 2.4);
    });
  } catch (e) {}
}

/* ---------------- 背景音乐 ---------------- */
const ROOTS = [110.00, 87.31, 130.81, 98.00];        // A2 F2 C3 G2
const SCALE = [0, 3, 5, 7, 10, 12, 15, 19];
const semi = (root, s) => root * Math.pow(2, s / 12);

function scheduleStep(s, t){
  const bar = Math.floor(s / 16) % 4;
  const root = ROOTS[bar];
  const inBar = s % 16;
  const hot = intensity;                              // 0..1 战斗强度

  if (inBar % 4 === 0){                               // 低音
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sine'; o.frequency.value = root / 2;
    f.type = 'lowpass'; f.frequency.value = 300;
    o.connect(f); f.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    o.start(t); o.stop(t + 0.72);
  }
  if (inBar === 0){                                   // 和弦垫
    [0, 7, 12].forEach((n, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = semi(root, n + 12);
      o.connect(g); g.connect(musBus);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06 / (i + 1) * (1 - hot * 0.35), t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.7);
      o.start(t); o.stop(t + 2.9);
    });
  }
  if (inBar % 2 === 1){                               // 琶音
    const n = SCALE[(s * 3) % SCALE.length];
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = semi(root, n + 24);
    f.type = 'lowpass'; f.frequency.value = 2200 + hot * 2600;
    o.connect(f); f.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.start(t); o.stop(t + 0.34);
  }
  if (hot > 0.45 && inBar % 4 === 2){                 // 战斗激烈时加入脉冲
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'square'; o.frequency.value = semi(root, 24);
    f.type = 'highpass'; f.frequency.value = 1800;
    o.connect(f); f.connect(g); g.connect(musBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035 * hot, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t); o.stop(t + 0.16);
  }
}
function musicTick(){
  if (!ready() || !musicOn) return;
  const spb = 60 / 84 / 2;                            // 84 BPM 八分音符
  if (nextT < ac.currentTime) nextT = ac.currentTime + 0.06;
  while (nextT < ac.currentTime + 0.25){
    try { scheduleStep(step, nextT); } catch (e) {}
    step = (step + 1) % 64;
    nextT += spb;
  }
  if (nextWhale && ac.currentTime > nextWhale){
    whaleCall(ac.currentTime + 0.1);
    nextWhale = ac.currentTime + 22 + Math.random() * 30;
  }
  if (musFilter) musFilter.frequency.value = 780 + intensity * 2600;
}
function startMusic(){
  init(); if (!ready() || musicOn) return;
  musicOn = true; step = 0; nextT = ac.currentTime + 0.1;
  if (!musicTimer) musicTimer = setInterval(musicTick, 60);
}
function stopMusic(){
  musicOn = false;
  if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
}
function setIntensity(v){ intensity = clamp(v, 0, 1); }

window.SoundEngine = {
  init, resume, play, playAt, setLaser, startMusic, stopMusic, setVolumes, setIntensity,
  get ready(){ return ready(); },
};
})();
