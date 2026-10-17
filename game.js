/* =========================================================================
   蓝鱼枪战 · 深海火拼  (Deep Sea Gunfight)
   -------------------------------------------------------------------------
   模块顺序：工具 → 设置 → 画布 → 音频 → 输入 → 枪械 → 卡片 → 敌人
             → 环境 → 状态/重置 → 战斗 → 更新 → 渲染 → 界面 → 主循环
   ========================================================================= */
(() => {
'use strict';

/* ============================== 工具 ============================== */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
function angleLerp(a, b, t){
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const L = dx*dx + dy*dy;
  let t = L ? ((px-ax)*dx + (py-ay)*dy) / L : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx*t), py - (ay + dy*t));
}
function fmtTime(s){
  s = Math.max(0, Math.floor(s));
  return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}

/* ============================== 设置 ============================== */
const SET_KEY = 'fishGunfightSetV2';
const BEST_KEY = 'fishGunfightBestV2';
const DEFAULTS = { sfx:0.85, music:0.45, shake:0.8, particles:'high', dmgNumbers:true, difficulty:'normal' };
let SET = Object.assign({}, DEFAULTS);
try { Object.assign(SET, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) {}
function saveSet(){ try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); } catch(e){} }

const DIFFS = {
  easy:   { name:'轻松', hp:0.8, fire:1.40, spawn:1.35, bspd:0.85, dmg:1 },
  normal: { name:'普通', hp:1.0, fire:1.00, spawn:1.00, bspd:1.00, dmg:1 },
  hard:   { name:'狂暴', hp:1.30, fire:0.72, spawn:0.72, bspd:1.15, dmg:1 },
};
const PSCALE = { low:0.35, medium:0.7, high:1 };
const pcount = n => Math.max(1, Math.round(n * (PSCALE[SET.particles] || 1)));
let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY) || 0); } catch(e){}

/* ============================== 画布 ============================== */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let W = window.innerWidth, H = window.innerHeight, DPR = 1;

function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cvs.width = Math.floor(W * DPR);
  cvs.height = Math.floor(H * DPR);
  if (typeof buildEnv === 'function' && env) buildEnv();
}
window.addEventListener('resize', resize);

/* ============================== 贴图资源层 ============================== */
/* 所有素材都允许缺失：加载失败自动降级为程序化贴图，画面依旧成立 */
const TEX = { img: {}, patterns: {} };
const UI_FONT = '"Rajdhani","Orbitron",system-ui,-apple-system,"PingFang SC",sans-serif';
const DISP_FONT = '"Orbitron","Rajdhani",system-ui,-apple-system,sans-serif';

function makeCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const tex = name => TEX.img[name] || null;

/* —— 程序化兜底：柔和光斑 —— */
function fbGlow(size){
  size = size || 256;
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = size / 2;
  const rg = g.createRadialGradient(r, r, 0, r, r, r);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.16, 'rgba(255,255,255,.80)');
  rg.addColorStop(0.40, 'rgba(255,255,255,.30)');
  rg.addColorStop(0.70, 'rgba(255,255,255,.07)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, size, size);
  return c;
}

/* —— 程序化兜底：焦散水纹（整数频率，因此可无缝平铺） —— */
function fbCaustics(seed){
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const PI2 = Math.PI * 2;
  for (let y = 0; y < S; y++){
    const v = y / S;
    for (let x = 0; x < S; x++){
      const u = x / S;
      let a = Math.sin(PI2 * (3 * u + 2 * v) + seed);
      a += Math.sin(PI2 * (5 * u - 4 * v) + seed * 2.1);
      a += Math.sin(PI2 * (2 * u + 7 * v) + seed * 0.7);
      a += Math.sin(PI2 * (6 * u + 6 * v) + seed * 3.3);
      let n = Math.abs(a) / 4;
      n = Math.pow(1 - n, 6);
      const px = (y * S + x) * 4;
      d[px] = 255; d[px + 1] = 255; d[px + 2] = 255;
      d[px + 3] = Math.min(255, n * 420);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* —— 程序化兜底：胶片颗粒 —— */
function fbGrain(){
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++){
    const v = 128 + (Math.random() - 0.5) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* —— 程序化兜底：星芒 —— */
function fbSpark(){
  const S = 128, c = makeCanvas(S, S), g = c.getContext('2d'), m = S / 2;
  g.globalCompositeOperation = 'lighter';
  const rg = g.createRadialGradient(m, m, 0, m, m, m * 0.6);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.45, 'rgba(255,255,255,.34)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  g.translate(m, m);
  const bar = (w, l, a) => {
    const lg = g.createLinearGradient(-l, 0, l, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,' + a + ')');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(-l, -w / 2, l * 2, w);
  };
  bar(3, m * 0.98, 0.9); g.rotate(Math.PI / 2); bar(3, m * 0.98, 0.9);
  g.rotate(Math.PI / 4); bar(1.6, m * 0.52, 0.45); g.rotate(Math.PI / 2); bar(1.6, m * 0.52, 0.45);
  return c;
}

/* —— 程序化兜底：气泡 —— */
function fbBubble(){
  const S = 128, c = makeCanvas(S, S), g = c.getContext('2d'), m = S / 2, r = S * 0.42;
  const rg = g.createRadialGradient(m, m, r * 0.2, m, m, r);
  rg.addColorStop(0, 'rgba(215,250,255,0)');
  rg.addColorStop(0.72, 'rgba(215,250,255,.05)');
  rg.addColorStop(0.93, 'rgba(230,255,255,.50)');
  rg.addColorStop(1, 'rgba(230,255,255,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill();
  const hg = g.createRadialGradient(m - r * .34, m - r * .38, 0, m - r * .34, m - r * .38, r * .38);
  hg.addColorStop(0, 'rgba(255,255,255,.9)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg; g.beginPath(); g.arc(m - r * .34, m - r * .38, r * .38, 0, TAU); g.fill();
  return c;
}

const TEX_DEFS = [
  ['caustics1', 'assets/img/caustics-1.png', () => fbCaustics(1.7)],
  ['caustics2', 'assets/img/caustics-2.png', () => fbCaustics(4.2)],
  ['glow',      'assets/img/glow.png',       () => fbGlow(256)],
  ['spark',     'assets/img/spark.png',      fbSpark],
  ['bubble',    'assets/img/bubble.png',     fbBubble],
  ['grain',     'assets/img/grain.png',      fbGrain],
];
for (const [name, src, fb] of TEX_DEFS){
  const im = new Image();
  im.decoding = 'async';
  const settle = () => {
    TEX.patterns = {};
    if (name === 'caustics1' || name === 'caustics2') buildCausticLayers();
  };
  im.onload = () => { TEX.img[name] = im; settle(); };
  im.onerror = () => { TEX.img[name] = fb(); settle(); };
  im.src = src;
}

/* 单色着色缓存：白色贴图 × 任意颜色，避免每帧重复调色 */
const TINTED = {};
function tinted(name, color){
  const key = name + '|' + color;
  if (TINTED[key]) return TINTED[key];
  const src = tex(name);
  if (!src) return null;
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  TINTED[key] = c;
  return c;
}
/* 通用柔光贴图：所有粒子/子弹/拾取物的高光都走这里 */
function drawGlow(x, y, size, color, alpha, mode){
  const img = tinted('glow', color);
  if (!img || alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = mode || 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}
function drawSprite(name, x, y, size, color, alpha, rot, mode){
  const img = color ? tinted(name, color) : tex(name);
  if (!img || alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = mode || 'lighter';
  ctx.globalAlpha = alpha;
  if (rot){
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
}
function texPattern(name){
  if (TEX.patterns[name]) return TEX.patterns[name];
  const src = tex(name);
  if (!src) return null;
  const p = ctx.createPattern(src, 'repeat');
  TEX.patterns[name] = p || null;
  return p;
}

/* ============================== 音频 ============================== */
const Sound = Object.assign({}, window.SoundEngine, {
  // 音量跟随设置面板
  applyVol(){ window.SoundEngine.setVolumes(SET.sfx, SET.music); },
});

/* ============================== 输入 ============================== */
const keys = Object.create(null);
const mouse = { x: 0, y: 0, down: false };
let GUN_SWITCH_REQ = 0;

window.addEventListener('keydown', e => {
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();

  if (state.mode === 'cards'){
    if (e.code === 'Digit1' || e.code === 'Numpad1') chooseCard(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') chooseCard(1);
    if (e.code === 'Digit3' || e.code === 'Numpad3') chooseCard(2);
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape'){
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
    else if (state.mode === 'settings') closeSettings();
    return;
  }
  if (e.code === 'KeyR'){ if (state.mode !== 'menu') { startRun(); } return; }
  if (e.code === 'KeyM'){
    SET.sfx = SET.sfx > 0 ? 0 : 0.85; SET.music = SET.music > 0 ? 0 : 0.45;
    Sound.applyVol(); saveSet(); syncSettingsUI();
    showFlash(SET.sfx > 0 ? '声音 开' : '声音 关', '#8fe6ff');
    return;
  }
  // 开始界面：回车 / 空格直接开始
  if (state.mode === 'menu' && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')){
    startRun(); return;
  }
  if (state.mode !== 'playing' && state.mode !== 'paused') return;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight'){ tryDash(); return; }
  if (e.code === 'KeyQ') switchGun(-1);
  if (e.code === 'KeyE') switchGun(1);
  const m = /^Digit([1-7])$/.exec(e.code) || /^Numpad([1-7])$/.exec(e.code);
  if (m) switchGun(parseInt(m[1], 10) - 1, true);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function toLocal(clientX, clientY){
  const r = cvs.getBoundingClientRect();
  mouse.x = clientX - r.left;
  mouse.y = clientY - r.top;
}
cvs.addEventListener('mousemove', e => toLocal(e.clientX, e.clientY));
cvs.addEventListener('mousedown', e => {
  if (e.button === 0){
    mouse.down = true; toLocal(e.clientX, e.clientY);
    if (state.mode === 'playing') ripple(mouse.x, mouse.y, 0.7);
  } else if (e.button === 2){ tryDash(); }          // 右键 = 冲刺
});
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
cvs.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => {
  if (state.mode !== 'playing') return;
  if (Math.abs(e.deltaY) > 2) switchGun(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
// 触屏：单指瞄准开火，双指轻点冲刺
cvs.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state.mode === 'menu'){ startRun(); return; }
  if (e.touches.length >= 2){ tryDash(); return; }
  mouse.down = true; toLocal(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
cvs.addEventListener('touchmove', e => { e.preventDefault(); toLocal(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
cvs.addEventListener('touchend', e => { e.preventDefault(); mouse.down = false; }, { passive: false });

/* ============================== 枪械 ============================== */
const GUN_ORDER = ['pistol','smg','shotgun','sniper','laser','launcher','trident'];
const WEAPONS = {
  pistol:  { name:'水枪手枪', key:1, dmg:1.00, interval:0.22, speed:820,  shots:1, spread:0.030, pierce:0, knock:70,
             size:4.4, color:'#a9f0ff', core:'#ffffff', sfx:'pistol', gun:'pistol',
             desc:'均衡可靠的全自动水枪' },
  smg:     { name:'气泡冲锋枪', key:2, dmg:0.52, interval:0.072, speed:900, shots:1, spread:0.115, pierce:0, knock:35,
             size:3.6, color:'#8ef0c8', core:'#ffffff', sfx:'smg', gun:'smg',
             desc:'射速极高，弹道略散' },
  shotgun: { name:'散射鱼叉', key:3, dmg:0.85, interval:0.60, speed:740, shots:6, spread:0.30, pierce:0, knock:190,
             size:4.2, color:'#ffd28a', core:'#fff5dc', sfx:'shotgun', gun:'shotgun',
             desc:'一轮六发，中近距离凶猛' },
  sniper:  { name:'深海狙击', key:4, dmg:4.60, interval:0.82, speed:1750, shots:1, spread:0.008, pierce:4, knock:230,
             size:5.4, color:'#c3cfff', core:'#ffffff', sfx:'sniper', gun:'sniper', crit:0.15,
             desc:'高伤穿透，一发多杀' },
  laser:   { name:'高压激光', key:5, beam:true, dps:13, interval:0.05, speed:0, shots:1, spread:0, pierce:99, knock:0,
             size:0, color:'#ff8ade', core:'#ffffff', sfx:'laser', gun:'laser',
             desc:'持续光束，灼烧一切' },
  launcher:{ name:'水雷发射器', key:6, dmg:2.40, interval:0.85, speed:540, shots:1, spread:0.02, pierce:0, knock:210,
             size:6.2, color:'#ff9b60', core:'#ffe3b8', sfx:'launcher', gun:'launcher', explode:74,
             desc:'命中后爆炸，范围伤害' },
  trident: { name:'深海三叉戟', key:7, dmg:0.95, interval:0.42, speed:780, shots:3, spread:0.20, pierce:2, knock:130,
             size:5.0, color:'#7ef0c8', core:'#ffffff', sfx:'trident', gun:'trident',
             desc:'三叉齐射，可以穿透' },
};

/* ============================== 卡片 ============================== */
const CARDS = [
  { id:'dmg',    icon:'💥', r:'common', max:6, name:'弹药强化',  d:'伤害 +20%',                 f:s => { s.damage *= 1.20; } },
  { id:'rate',   icon:'⚡', r:'common', max:6, name:'快速装填',  d:'射速 +15%',                 f:s => { s.fireRate *= 1.15; } },
  { id:'spd',    icon:'🌀', r:'common', max:5, name:'鱼鳍训练',  d:'移动速度 +12%',             f:s => { s.speed *= 1.12; } },
  { id:'hp',     icon:'❤️', r:'common', max:6, name:'硬鳞',      d:'生命上限 +4，并回复 4 点',  f:(s,p) => { s.maxHp += 4; p.hp = Math.min(s.maxHp, p.hp + 4); } },
  { id:'crit',   icon:'🎯', r:'common', max:6, name:'致命一击',  d:'暴击率 +8%',                f:s => { s.crit += 0.08; } },
  { id:'bspd',   icon:'🚀', r:'common', max:3, name:'高压推进',  d:'子弹速度 +25%',             f:s => { s.bulletSpeed *= 1.25; } },
  { id:'iframe', icon:'💨', r:'common', max:3, name:'闪避本能',  d:'受击无敌时间 +0.12 秒',     f:s => { s.iframe += 0.12; } },
  { id:'magnet', icon:'🧲', r:'common', max:3, name:'磁力鱼鳔',  d:'拾取范围 +90',              f:s => { s.magnet += 90; } },
  { id:'size',   icon:'🔵', r:'common', max:3, name:'巨型水弹',  d:'子弹体积 +25%，伤害 +8%',   f:s => { s.size *= 1.25; s.damage *= 1.08; } },
  { id:'proj',   icon:'🎆', r:'rare',   max:3, name:'多重弹幕',  d:'弹丸数量 +1',               f:s => { s.projectiles += 1; } },
  { id:'pierce', icon:'🗡️', r:'rare',   max:3, name:'穿甲弹头',  d:'子弹穿透 +1',               f:s => { s.pierce += 1; } },
  { id:'critd',  icon:'💢', r:'rare',   max:3, name:'暴击强化',  d:'暴击伤害 +50%',             f:s => { s.critMul += 0.5; } },
  { id:'regen',  icon:'🌿', r:'rare',   max:3, name:'再生细胞',  d:'每秒回复 0.4 点生命',       f:s => { s.regen += 0.4; } },
  { id:'leech',  icon:'🩸', r:'rare',   max:3, name:'吸血獠牙',  d:'每次击杀回复 1 点生命',     f:s => { s.lifesteal += 1; } },
  { id:'homing', icon:'🧭', r:'rare',   max:3, name:'追踪鱼雷',  d:'子弹自动追踪敌人',          f:s => { s.homing += 1.6; } },
  { id:'boom',   icon:'💣', r:'rare',   max:3, name:'爆裂弹',    d:'命中产生小范围爆炸',        f:s => { s.explosive += 26; } },
  { id:'shield', icon:'🛡️', r:'rare',   max:3, name:'护盾发生器',d:'+1 护盾上限，护盾缓慢充能', f:(s,p) => { s.shieldMax += 1; p.shield = s.shieldMax; } },
  { id:'thorns', icon:'🌵', r:'rare',   max:3, name:'尖刺鳞',    d:'被撞击时反弹伤害',          f:s => { s.thorns += 6; } },
  { id:'luck',   icon:'🍀', r:'rare',   max:2, name:'幸运星',    d:'更容易出现强力卡片',        f:s => { s.luck += 0.6; } },
];
const WEAPON_CARDS = GUN_ORDER.slice(1).map((key, i) => {
  const w = WEAPONS[key];
  return {
    id: 'gun_' + key, icon:'🔫', r:'weapon', max:1,
    name: '解锁 ' + w.name,
    d: w.desc + '（按 ' + (i + 2) + ' 键切换）',
    f: (s, p) => { if (!p.guns.includes(key)) p.guns.push(key); p.gunIndex = GUN_ORDER.indexOf(key); p.cd = 0; },
  };
});
function cardStack(id){ return player && player.cardCounts[id] ? player.cardCounts[id] : 0; }

/* ============================== 敌人类型 ============================== */
const ENEMY_TYPES = {
  scout:  { hp:2,  speed:112, r:14, score:10, keep:[150,320], gun:'pistol',
            fire:{ cd:[1.5,2.6], speed:330, shots:1, spread:0.10, dmg:1, br:4.5 },
            body:['#ff5f7a','#c81f3c'], kind:'scout' },
  shooter:{ hp:3,  speed:74,  r:16, score:14, keep:[180,340], gun:'smg',
            fire:{ cd:[1.4,2.3], speed:340, shots:1, spread:0.07, dmg:1, br:5 },
            body:['#ff4a5f','#b3122f'], kind:'shooter' },
  tank:   { hp:9,  speed:50,  r:23, score:30, keep:[120,260], gun:'shotgun',
            fire:{ cd:[2.3,3.4], speed:300, shots:3, spread:0.34, dmg:1, br:5.5 },
            body:['#ff7a4a','#a02a12'], kind:'tank' },
  sniper: { hp:3,  speed:62,  r:16, score:24, keep:[330,620], gun:'sniper',
            fire:{ cd:[2.6,3.8], speed:900, shots:1, spread:0.008, dmg:2, br:5, tele:1.05 },
            body:['#ff6a8a','#8f0f3a'], kind:'sniper' },
  dasher: { hp:4,  speed:158, r:16, score:20, keep:[0,999], gun:null, contact:1,
            fire:{ cd:[99,99] }, body:['#ff8a6a','#a32a3a'], kind:'dasher' },
  boss:   { hp:70, speed:46,  r:46, score:400, keep:[160,260], gun:'launcher',
            fire:{ cd:[1.6,2.4], speed:280, shots:5, spread:0.5, dmg:1, br:6 },
            body:['#ff4d6d','#6d0f2a'], kind:'boss' },
};

/* ============================== 环境 ============================== */
let env = null, envStatic = null, envStaticCtx = null;
let uid = 1;

function makeKelp(layer, x, baseY, len, segs, hue, alpha){
  return { layer, x, baseY, len, segs, phase: rand(0, TAU), speed: rand(0.4, 0.85),
           amp: rand(16, 46) * (layer === 'near' ? 1.5 : 1), wave: rand(1.6, 2.6),
           width: rand(3, 7) * (layer === 'near' ? 1.7 : 1), hue, alpha,
           leaf: rand(0.8, 1.3) };
}
function makeRock(x, y, r, hue){
  const pts = [];
  const n = randi(6, 10);
  for (let i = 0; i < n; i++){
    const a = (i / n) * TAU;
    const rr = r * rand(0.66, 1.12);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.72]);
  }
  return { x, y, r, pts, hue };
}
function buildEnv(){
  const rnd = Math.random;
  env = { farKelp:[], midKelp:[], nearKelp:[], sand:[], rocks:[], corals:[], plankton:[],
          schools:[], jellies:[], shells:[] };

  // 远景海藻（暗）
  for (let i = 0; i < 14; i++)
    env.farKelp.push(makeKelp('far', rnd() * W, H * rand(0.92, 1.04), rand(160, 330), 7, rand(160, 190), 0.5));
  // 中景海藻
  for (let i = 0; i < 17; i++)
    env.midKelp.push(makeKelp('mid', rnd() * W, H * rand(0.9, 1.02), rand(120, 270), 9, rand(150, 185), 0.8));
  // 前景海藻（压暗，只在底部）
  for (let i = 0; i < 8; i++)
    env.nearKelp.push(makeKelp('near', rnd() * W, H * rand(1.0, 1.1), rand(150, 300), 8, rand(140, 170), 0.95));

  // 石头
  for (let i = 0; i < 13; i++){
    const r = rand(28, 92);
    env.rocks.push(makeRock(rnd() * W, H * rand(0.84, 1.02), r, rand(190, 215)));
  }
  // 珊瑚（静态）
  for (let i = 0; i < 16; i++){
    env.corals.push({ x: rnd() * W, y: H * rand(0.9, 1.05), h: rand(40, 130), w: rand(16, 34),
      hue: rnd() < 0.5 ? rand(300, 345) : rand(20, 45), phase: rand(0, TAU), arms: randi(4, 8) });
  }
  // 浮游生物
  for (let i = 0; i < 110; i++)
    env.plankton.push({ x: rnd() * W, y: rnd() * H, r: rand(0.6, 2.1), s: rand(4, 16), a: rand(0.12, 0.5), ph: rand(0, TAU) });
  // 小鱼群
  for (let i = 0; i < 4; i++){
    const n = randi(5, 9), dir = rnd() < 0.5 ? 1 : -1;
    const school = { x: rnd() * W, y: rand(60, H * 0.75), dir, speed: rand(26, 60), n, fish: [] };
    for (let j = 0; j < n; j++) school.fish.push({ ox: rand(-60, 60), oy: rand(-30, 30), r: rand(5, 9), ph: rand(0, TAU) });
    env.schools.push(school);
  }
  // 水母
  for (let i = 0; i < 5; i++)
    env.jellies.push({ x: rnd() * W, y: rnd() * H, r: rand(16, 34), s: rand(8, 22), ph: rand(0, TAU), hue: rand(250, 310) });
  // 贝壳 / 碎石
  for (let i = 0; i < 40; i++)
    env.shells.push({ x: rnd() * W, y: H * rand(0.94, 1.06), r: rand(2, 6), hue: rand(20, 60), rot: rand(0, TAU) });

  // ---- 预渲染静态层（沙地 + 石头 + 珊瑚 + 贝壳）----
  envStatic = document.createElement('canvas');
  envStatic.width = Math.floor(W * DPR); envStatic.height = Math.floor(H * DPR);
  envStaticCtx = envStatic.getContext('2d');
  const c = envStaticCtx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);

  // 沙地
  const floorY = H * 0.9;
  const sg = c.createLinearGradient(0, floorY, 0, H);
  sg.addColorStop(0, 'rgba(28,66,92,0.0)');
  sg.addColorStop(0.35, 'rgba(30,68,92,0.55)');
  sg.addColorStop(1, 'rgba(46,88,110,0.9)');
  c.fillStyle = sg;
  c.beginPath();
  c.moveTo(0, floorY + 26);
  c.quadraticCurveTo(W * 0.22, floorY - 14, W * 0.46, floorY + 12);
  c.quadraticCurveTo(W * 0.72, floorY + 38, W, floorY - 6);
  c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();

  // 贝壳 / 碎石
  for (const s of env.shells){
    c.save(); c.translate(s.x, s.y); c.rotate(s.rot);
    c.fillStyle = 'hsla(' + s.hue + ',45%,62%,0.35)';
    c.beginPath(); c.ellipse(0, 0, s.r, s.r * 0.6, 0, 0, TAU); c.fill();
    c.restore();
  }
  // 石头
  for (const r of env.rocks){
    c.save(); c.translate(r.x, r.y);
    c.beginPath(); c.moveTo(r.pts[0][0], r.pts[0][1]);
    for (let i = 1; i < r.pts.length; i++){
      const p = r.pts[i], q = r.pts[(i + 1) % r.pts.length];
      c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    c.closePath();
    const rg = c.createLinearGradient(0, -r.r, 0, r.r);
    rg.addColorStop(0, 'hsla(' + r.hue + ',28%,26%,0.9)');
    rg.addColorStop(1, 'hsla(' + r.hue + ',30%,12%,0.95)');
    c.fillStyle = rg; c.fill();
    c.strokeStyle = 'hsla(' + r.hue + ',40%,46%,0.22)'; c.lineWidth = 1.4; c.stroke();
    c.restore();
  }
  // 珊瑚
  for (const co of env.corals) drawCoral(c, co);

  // ---- 色彩分级：压低珊瑚饱和度 + 底部压暗，让礁石退回背景层 ----
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'saturation';
  c.globalAlpha = 0.30;
  c.fillStyle = 'rgb(128,128,128)';
  c.fillRect(0, 0, envStatic.width, envStatic.height);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  const shade = c.createLinearGradient(0, envStatic.height * 0.52, 0, envStatic.height);
  shade.addColorStop(0, 'rgba(1,8,16,0)');
  shade.addColorStop(0.55, 'rgba(1,8,16,0.22)');
  shade.addColorStop(1, 'rgba(1,7,14,0.52)');
  c.fillStyle = shade;
  c.fillRect(0, 0, envStatic.width, envStatic.height);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function drawCoral(c, co){
  c.save(); c.translate(co.x, co.y);
  const col1 = 'hsla(' + co.hue + ',70%,58%,0.55)';
  const col2 = 'hsla(' + co.hue + ',70%,38%,0.5)';
  for (let i = 0; i < co.arms; i++){
    const a = -Math.PI / 2 + (i - (co.arms - 1) / 2) * 0.30;
    const len = co.h * rand(0.55, 1);
    const bend = rand(-0.5, 0.5);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(Math.cos(a) * len * 0.5 + bend * 18, Math.sin(a) * len * 0.5,
                       Math.cos(a) * len + bend * 26, Math.sin(a) * len);
    c.lineCap = 'round';
    c.lineWidth = rand(7, 13);
    c.strokeStyle = i % 2 ? col1 : col2;
    c.stroke();
    // 小枝
    const bx = Math.cos(a) * len * 0.62, by = Math.sin(a) * len * 0.62;
    for (let k = 0; k < 2; k++){
      const sa = a + (k ? 0.75 : -0.75);
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(bx + Math.cos(sa) * len * 0.34, by + Math.sin(sa) * len * 0.34);
      c.lineWidth = rand(4, 7);
      c.strokeStyle = col1;
      c.stroke();
    }
  }
  // 根部
  c.beginPath();
  c.ellipse(0, 4, co.w, co.w * 0.42, 0, 0, TAU);
  c.fillStyle = 'hsla(' + co.hue + ',45%,26%,0.6)';
  c.fill();
  c.restore();
}

/* ============================== 状态 ============================== */
const state = {
  mode:'menu', kills:0, score:0, level:1, killProgress:0, elapsed:0,
  pendingCards:0, cardsTaken:0, bossCount:0, nextBoss:80,
  shake:0, hitFlash:0, gameTime:0, respawnTimer:0, slowmo:0,
  hitStop:0, combo:0, comboT:0, bestCombo:0, comboTier:0,
  currentCards:[], settingsReturn:'menu', runWeapons:0,
  // 波次 / 经济 / 临时增益
  wave:1, waveState:'fight', waveQueue:0, waveT:0, coins:0, waveTookDamage:false,
  rageT:0, shopOffer:[], shopSold:[], waveBest:0, bossKills:0,
};
let player = null, enemies = [], pBullets = [], eBullets = [], parts = [], floats = [], pickups = [];
let boss = null;

/* ============================== 存档：统计与成就 ============================== */
const PROFILE_KEY = 'fishGunfightProfileV1';
const profile = {
  runs:0, totalKills:0, totalDeaths:0, totalCoins:0, bossKills:0,
  bestScore:0, bestWave:0, achievements:{}, weaponKills:{},
};
try { Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')); } catch (e) {}
function saveProfile(){
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
}

const ACHIEVEMENTS = [
  { id:'first_blood', icon:'🩸', name:'第一滴血',   d:'击杀第一条红鱼' },
  { id:'kills100',    icon:'🐟', name:'百鱼斩',     d:'累计击杀 100 条红鱼' },
  { id:'kills1000',   icon:'🏆', name:'千鱼斩',     d:'累计击杀 1000 条红鱼' },
  { id:'wave5',       icon:'🌊', name:'深潜者',     d:'到达第 5 波' },
  { id:'wave10',      icon:'🌀', name:'深海常客',   d:'到达第 10 波' },
  { id:'boss1',       icon:'🦈', name:'鲨王猎手',   d:'击败一只深海鲨王' },
  { id:'boss5',       icon:'👑', name:'鲨王终结者', d:'累计击败 5 只鲨王' },
  { id:'rich',        icon:'💰', name:'暴发户',     d:'单局持有 80 金币' },
  { id:'collector',   icon:'🔫', name:'军火库',     d:'单局解锁全部 7 种枪械' },
  { id:'dealer',      icon:'🎴', name:'卡牌大师',   d:'单局拿到 10 张强化卡' },
  { id:'flawless',    icon:'🛡️', name:'毫发无伤',   d:'满血状态下通关一波' },
  { id:'veteran',     icon:'⚓', name:'老水手',     d:'累计下水 20 次' },
];
let achQueue = [], achTimer = 0;

function unlockAch(id){
  if (profile.achievements[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  profile.achievements[id] = Date.now();
  saveProfile();
  achQueue.push(a);
}
function checkAchievements(){
  const p = profile;
  if (p.totalKills >= 1) unlockAch('first_blood');
  if (p.totalKills >= 100) unlockAch('kills100');
  if (p.totalKills >= 1000) unlockAch('kills1000');
  if (state.wave >= 5) unlockAch('wave5');
  if (state.wave >= 10) unlockAch('wave10');
  if (p.bossKills >= 1) unlockAch('boss1');
  if (p.bossKills >= 5) unlockAch('boss5');
  if (state.coins >= 80) unlockAch('rich');
  if (player && player.guns.length >= GUN_ORDER.length) unlockAch('collector');
  if (state.cardsTaken >= 10) unlockAch('dealer');
  if (p.runs >= 20) unlockAch('veteran');
}
function pumpAch(){
  if (achTimer > 0 || !achQueue.length || !achToast) return;
  const a = achQueue.shift();
  achTimer = 4.2;
  achToast.innerHTML = '<div class="achIcon">' + a.icon + '</div>' +
    '<div><div class="achTitle">成就达成</div><div class="achName">' + a.name + '</div>' +
    '<div class="achDesc">' + a.d + '</div></div>';
  achToast.classList.remove('show');
  void achToast.offsetWidth;
  achToast.classList.add('show');
  Sound.play('card');
}

function baseStats(){
  return {
    maxHp:20, speed:335, damage:1, fireRate:1, bulletSpeed:1, projectiles:0, pierce:0,
    crit:0.05, critMul:2, lifesteal:0, homing:0, explosive:0, size:1, regen:0,
    magnet:110, iframe:0, luck:1, shieldMax:0, thorns:0, knock:1,
  };
}
function makePlayer(){
  return {
    x: W/2, y: H/2, vx:0, vy:0, r:17,
    angle:-Math.PI/2,          // 瞄准方向（枪口，跟随鼠标）
    body:-Math.PI/2,           // 身体朝向（跟随游动方向）
    hp:20, shield:0,
    stats: baseStats(), guns:['pistol'], gunIndex:0, cd:0, invuln:0, hurt:0,
    muzzle:0, alive:true, cardCounts:{}, beam:0, particleT:0, bubbleT:0, regenT:0, shieldT:0,
    dashCd:0, dashT:0, dashA:0, beamSfxT:0, speedNow:0,
  };
}

/* ============================== 波次 ============================== */
function waveBudget(n){ return Math.min(26, 4 + n * 2); }
function isBossWave(n){ return n % 5 === 0; }

function startWave(n){
  state.wave = n;
  state.waveState = 'fight';
  state.waveQueue = waveBudget(n);
  state.waveT = 0;
  state.waveTookDamage = false;
  spawnTimer = 0.45;
  const bw = isBossWave(n);
  if (bw){
    spawnBoss();
    state.waveQueue = Math.floor(state.waveQueue / 2);
  }
  // 开场先放几只进来，避免开局空场
  const opening = Math.min(state.waveQueue, bw ? 2 : 3);
  for (let i = 0; i < opening; i++){
    spawnEnemy(null, !bw && i === 0);
    state.waveQueue--;
  }
  showFlash(bw ? '第 ' + n + ' 波 · 鲨王来袭！' : '第 ' + n + ' 波', bw ? '#ff8fa6' : '#8fe6ff');
  shakeIt(bw ? 9 : 3);
  ripple(player ? player.x : W / 2, player ? player.y : H / 2, 1.5);
  Sound.play(bw ? 'boss' : 'ui');
  closeShop();
  syncHUD();
}

function endWave(){
  const cleared = state.wave;
  const bonus = 6 + cleared * 2;
  state.coins += bonus;
  state.waveBest = Math.max(state.waveBest, cleared);
  profile.bestWave = Math.max(profile.bestWave, cleared);
  if (!state.waveTookDamage && player.alive && player.hp >= player.stats.maxHp) unlockAch('flawless');
  state.waveState = 'intermission';
  state.waveT = 12;
  state.wave++;
  rollShop();
  showFlash('第 ' + cleared + ' 波清除！ +' + bonus + ' 金币', '#ffd166');
  Sound.play('level');
  checkAchievements();
  saveProfile();
  openShop();
  syncHUD();
}

function skipIntermission(){
  if (state.waveState !== 'intermission') return;
  if (state.waveT > 1){ state.coins += 3; showPickupHint('提前出击 +3 金币'); }
  closeShop();
  startWave(state.wave);
}

/* ============================== 商店 ============================== */
const SHOP_ITEMS = [
  { id:'heal',   icon:'❤️', name:'应急修理', d:'立即回复 6 点生命',      cost:8,
    apply(){ player.hp = Math.min(player.stats.maxHp, player.hp + 6); } },
  { id:'shield', icon:'🛡️', name:'护盾电池', d:'护盾上限 +1 并充满',      cost:14,
    apply(){ player.stats.shieldMax += 1; player.shield = player.stats.shieldMax; } },
  { id:'maxhp',  icon:'💗', name:'强化鱼鳔', d:'生命上限 +4 并回满',      cost:18,
    apply(){ player.stats.maxHp += 4; player.hp = player.stats.maxHp; } },
  { id:'card',   icon:'🎴', name:'强化卡包', d:'随机获得 1 张强化卡',      cost:16,
    apply(){ const c = rollCards(1)[0]; c.f(player.stats, player);
             player.cardCounts[c.id] = (player.cardCounts[c.id] || 0) + 1;
             state.cardsTaken++; showFlash(c.icon + ' ' + c.name, '#c9b0ff'); checkAchievements(); } },
  { id:'gun',    icon:'🔫', name:'黑市军火', d:'随机解锁一把未拥有的枪械',  cost:20,
    apply(){ const l = lockedGuns();
             if (!l.length){ player.hp = Math.min(player.stats.maxHp, player.hp + 5); return; }
             const g = pick(l); player.guns.push(g); player.gunIndex = GUN_ORDER.indexOf(g);
             buildGunBar(); showFlash('🔫 ' + WEAPONS[g].name, '#ffd166'); checkAchievements(); } },
  { id:'rage',   icon:'🔥', name:'狂暴药剂', d:'45 秒内伤害 +60%',        cost:12,
    apply(){ state.rageT = 45; } },
  { id:'magnet', icon:'🧲', name:'磁力脉冲', d:'立刻吸来全场掉落物',       cost:6,
    apply(){ for (const p of pickups){ p.x = player.x + rand(-10, 10); p.y = player.y + rand(-10, 10); } } },
  { id:'speed',  icon:'🌀', name:'水流加速', d:'本局移动速度 +8%',         cost:15,
    apply(){ player.stats.speed *= 1.08; } },
  { id:'crit',   icon:'🎯', name:'瞄准芯片', d:'本局暴击率 +10%',          cost:15,
    apply(){ player.stats.crit += 0.10; } },
];
function rollShop(){
  const pool = SHOP_ITEMS.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) out.push(pool.splice(randi(0, pool.length), 1)[0].id);
  state.shopOffer = out;
  state.shopSold = out.map(() => false);
}
function shopItem(id){ return SHOP_ITEMS.find(s => s.id === id); }
function buyShop(i){
  if (state.waveState !== 'intermission') return false;
  const id = state.shopOffer[i];
  if (!id || state.shopSold[i]) return false;
  const it = shopItem(id);
  if (state.coins < it.cost){ Sound.play('uiBack'); showPickupHint('金币不足'); return false; }
  state.coins -= it.cost;
  state.shopSold[i] = true;
  it.apply();
  Sound.play('pickup');
  floatText(player.x, player.y - 34, it.name, '#ffd166', 15);
  burst(player.x, player.y, '#ffd166', 14, 200, 3.5);
  renderShop(); syncHUD(); saveProfile();
  return true;
}

/* ============================== 重置 ============================== */
function resetWorld(){
  player = makePlayer();
  player.hp = player.stats.maxHp;
  enemies = []; pBullets = []; eBullets = []; parts = []; floats = []; pickups = [];
  boss = null;
  state.kills = 0; state.score = 0; state.level = 1; state.killProgress = 0;
  state.elapsed = 0; state.pendingCards = 0; state.cardsTaken = 0; state.bossCount = 0;
  state.nextBoss = 80; state.shake = 0; state.hitFlash = 0; state.respawnTimer = 0;
  state.runWeapons = 1;
  // 波次 / 经济 / 增益
  state.wave = 1; state.waveState = 'fight'; state.waveQueue = 0; state.waveT = 0;
  state.coins = 0; state.waveTookDamage = false; state.rageT = 0;
  state.shopOffer = []; state.shopSold = []; state.bossKills = 0;
  spawnTimer = 0.4;
  mouse.x = W/2 + 200; mouse.y = H/2 - 120;
  buildGunBar();
  closeShop();
  startWave(1);           // 第 1 波由波次系统发牌
  syncHUD();
}
let spawnTimer = 0;

/* ============================== 生成敌人 ============================== */
function difficulty(){ return DIFFS[SET.difficulty] || DIFFS.normal; }
function maxEnemies(){ return Math.min(18, 4 + state.wave); }
function spawnInterval(){ return Math.max(0.5, 1.7 - state.wave * 0.06) * difficulty().spawn; }
function rageMul(){ return state.rageT > 0 ? 1.6 : 1; }

function enemyTypePool(){
  const k = Math.max(state.kills, state.wave * 6);   // 波次推进同样解锁新兵种
  const pool = ['scout','scout','shooter','shooter'];
  if (k >= 8) pool.push('dasher');
  if (k >= 15) pool.push('tank');
  if (k >= 25) pool.push('sniper');
  if (k >= 40) pool.push('tank','dasher','sniper');
  return pool;
}
function spawnEnemy(type, anywhere){
  const t = type || pick(enemyTypePool());
  const def = ENEMY_TYPES[t] || ENEMY_TYPES.scout;
  const d = difficulty();
  const elite = state.kills > 30 && Math.random() < Math.min(0.30, state.kills / 900);
  const scale = 1 + Math.min(1.6, state.kills / 180);
  const m = 70;
  let x, y;
  if (anywhere){
    let tries = 0;
    do { x = m + Math.random() * (W - m*2); y = m + Math.random() * (H - m*2); tries++; }
    while (player && Math.hypot(x - player.x, y - player.y) < 260 && tries < 40);
  } else {
    const side = randi(0, 4);
    if (side === 0){ x = -m; y = Math.random()*H; }
    else if (side === 1){ x = W + m; y = Math.random()*H; }
    else if (side === 2){ x = Math.random()*W; y = -m; }
    else { x = Math.random()*W; y = H + m; }
  }
  const hp = Math.max(1, Math.round(def.hp * d.hp * (elite ? 1.8 : 1) * (t === 'boss' ? 1 : scale * 0.55 + 0.45)));
  const e = {
    id: uid++, type: t, def, elite,
    x, y, vx:0, vy:0, r: def.r * (elite ? 1.22 : 1),
    hp, maxHp: hp, speed: def.speed * rand(0.9, 1.1) * (elite ? 0.9 : 1) * (0.9 + Math.min(0.5, state.kills/500)),
    angle: rand(0, TAU), cd: rand(0.5, 2.0), hurt: 0, muzzle: 0, wob: rand(0, TAU),
    tint: Math.random(), tele: 0, teleTarget: 0, dash: 0, dashCd: rand(1, 3), contactCd: 0,
    beamTick: 0,
  };
  enemies.push(e);
  return e;
}
function spawnBoss(){
  const b = spawnEnemy('boss', true);
  b.r = 46;
  b.x = clamp(b.x, 120, W - 120); b.y = clamp(b.y, 120, H - 120);
  b.pattern = 0; b.patternT = 2.0;
  boss = b;
  state.bossCount++;
  Sound.play('boss');
  showFlash('⚠ 深海鲨王 出现！', '#ff8fa6');
  // 登场演出：定格 + 冲击波 + 震屏，让"鲨王来了"有分量
  state.hitStop = Math.max(state.hitStop, 0.20);
  shakeIt(16);
  shockwave(b.x, b.y, 10, 220, 0.85, 'rgba(255,120,150,0.85)', 5);
  shockwave(b.x, b.y, 4, 120, 0.55, 'rgba(255,220,190,0.8)', 3);
  burst(b.x, b.y, '#ff5570', 34, 300, 5);
  ring(b.x, b.y, 'rgba(255,120,150,0.65)', 20, 240, 0.8);
}

/* ============================== 特效 ============================== */
function addPart(p){
  if (parts.length > 900 - pcount(10)) return;
  parts.push(p);
}

/* ============ 交互反馈：命中标记 / 冲击波 / 水面涟漪 / 连杀 ============ */
const marks = [];
function addMark(m){
  if (marks.length > 48) marks.shift();
  m.t = 0;
  marks.push(m);
}
function hitMarker(kind){
  if (state.mode !== 'playing') return;
  addMark({ kind: kind || 'hit', x: mouse.x, y: mouse.y, life: kind === 'kill' ? 0.34 : 0.17 });
}
function shockwave(x, y, r0, r1, life, color, width){
  addMark({ kind: 'shock', x, y, r0, r1, life, color: color || 'rgba(255,255,255,0.85)', w: width || 3 });
}
function ripple(x, y, strength){
  addMark({ kind: 'ripple', x, y, life: 0.85, s: strength || 1 });
}
function updateMarks(dt){
  for (let i = marks.length - 1; i >= 0; i--){
    marks[i].t += dt;
    if (marks[i].t >= marks[i].life) marks.splice(i, 1);
  }
}
function drawCombo(){
  if (state.mode !== 'playing' || state.combo < 2 || !player) return;
  const c = state.combo;
  const age = 2.4 - state.comboT;
  const pop = clamp(1 - age / 0.20, 0, 1);
  const col = c >= 15 ? '#ff5f7a' : c >= 8 ? '#ffcc66' : '#7ef0c8';
  const x = W - 128, y = H * 0.5;
  const fade = clamp(state.comboT / 0.8, 0, 1);
  const scale = 1 + pop * 0.30 + (c >= 15 ? 0.05 : 0);
  const R = 44;
  ctx.save();
  ctx.translate(x, y);
  // 背板：让数字在礁石/鱼群上也读得清
  const back = ctx.createRadialGradient(0, 0, 0, 0, 0, R + 26);
  back.addColorStop(0, 'rgba(2,12,22,' + (0.62 * fade).toFixed(3) + ')');
  back.addColorStop(0.62, 'rgba(2,12,22,' + (0.34 * fade).toFixed(3) + ')');
  back.addColorStop(1, 'rgba(2,12,22,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = back;
  ctx.beginPath(); ctx.arc(0, 0, R + 26, 0, TAU); ctx.fill();
  // 计时环（画在文字下层）
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(6,26,40,0.72)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = col; ctx.globalAlpha = 0.62 * fade; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(state.comboT / 2.4, 0, 1));
  ctx.stroke();
  drawGlow(0, 0, 108, col, (0.10 + pop * 0.18) * fade);
  ctx.globalCompositeOperation = 'source-over';
  // 数字
  ctx.scale(scale, scale);
  ctx.globalAlpha = (0.55 + 0.45 * fade) * 1;
  ctx.textAlign = 'center';
  ctx.font = '700 ' + (c < 10 ? 40 : c < 100 ? 33 : 27) + 'px ' + DISP_FONT;
  ctx.fillStyle = col;
  ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.fillText('×' + c, 0, 6);
  ctx.shadowBlur = 0;
  ctx.font = '700 9px ' + UI_FONT;
  ctx.fillStyle = 'rgba(223,241,255,0.74)';
  ctx.letterSpacing = '0.22em';
  ctx.fillText('COMBO', 0, 24);
  ctx.letterSpacing = '0px';
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMarks(){
  for (const m of marks){
    const k = m.t / m.life, a = 1 - k;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (m.kind === 'hit' || m.kind === 'kill'){
      const big = m.kind === 'kill';
      const dist = lerp(big ? 15 : 9, big ? 21 : 13, k);
      const len = (big ? 8 : 6) * (1 - k * 0.35);
      ctx.strokeStyle = big ? 'rgba(255,214,120,' + (a * 0.95).toFixed(3) + ')'
                            : 'rgba(255,255,255,' + (a * 0.9).toFixed(3) + ')';
      ctx.lineWidth = big ? 2.6 : 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++){
        const ang = Math.PI / 4 + i * Math.PI / 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(m.x + ca * dist, m.y + sa * dist);
        ctx.lineTo(m.x + ca * (dist + len), m.y + sa * (dist + len));
        ctx.stroke();
      }
      if (big){
        ctx.globalAlpha = a * 0.8;
        ctx.beginPath(); ctx.arc(m.x, m.y, lerp(6, 26, k), 0, TAU);
        ctx.strokeStyle = 'rgba(255,220,150,0.8)'; ctx.lineWidth = 1.6; ctx.stroke();
      }
    } else if (m.kind === 'shock'){
      const r = lerp(m.r0, m.r1, 1 - Math.pow(1 - k, 2.2));
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.w * (0.35 + a * 0.9);
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.28;
      ctx.lineWidth = m.w * 2.6 * a;
      ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.92, 0, TAU); ctx.stroke();
    } else if (m.kind === 'ripple'){
      // 水面涟漪：两圈错开扩散 + 内侧亮环
      for (let i = 0; i < 2; i++){
        const kk = clamp(k - i * 0.16, 0, 1);
        const r = lerp(6, 78 * m.s, 1 - Math.pow(1 - kk, 2.6));
        ctx.globalAlpha = (1 - kk) * (i ? 0.22 : 0.42);
        ctx.strokeStyle = i ? 'rgba(150,225,255,0.9)' : 'rgba(215,248,255,0.95)';
        ctx.lineWidth = i ? 1.4 : 2.2;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, r, r * 0.62, 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
const numRoll = new WeakMap();
function setNum(el, v){
  if (!el) return;
  const cur = numRoll.get(el);
  if (cur && cur.to === v) return;
  const from = cur ? cur.value : (parseInt(el.textContent, 10) || 0);
  if (v > from) popEl(el);          // 变大时弹一下；掉数值（清档）不弹
  if (cur && cur.raf) cancelAnimationFrame(cur.raf);
  const obj = { to: v, value: from, raf: 0 };
  numRoll.set(el, obj);
  const t0 = performance.now();
  const span = Math.min(560, 200 + Math.abs(v - from) * 2.5);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / span);
    const e = 1 - Math.pow(1 - k, 3);
    obj.value = Math.round(from + (v - from) * e);
    el.textContent = obj.value;
    if (k < 1) obj.raf = requestAnimationFrame(step);
    else { obj.value = v; el.textContent = v; obj.raf = 0; }
  };
  obj.raf = requestAnimationFrame(step);
}
function popEl(el){
  if (!el) return;
  el.classList.remove('tick');
  void el.offsetWidth;
  el.classList.add('tick');
}
function burst(x, y, color, n, spd, size, kind){
  n = pcount(n);
  for (let i = 0; i < n; i++){
    const a = Math.random() * TAU, s = spd * rand(0.3, 1.1);
    addPart({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: rand(0.3, 0.75), max: 0.75,
      color, size: size * rand(0.5, 1.4), kind: kind || 'dot', rot: 0, spin: rand(-6, 6) });
  }
}
function ring(x, y, color, r0, r1, life){
  parts.push({ x, y, vx:0, vy:0, life, max: life, color, size: r0, size1: r1, kind:'ring', rot:0, spin:0 });
}
function floatText(x, y, text, color, size){
  if (floats.length > 60) floats.shift();
  floats.push({ x, y, text, color, life: 0.85, max: 0.85, size: size || 15 });
}
function showFlash(text, color){
  flashEl.textContent = text;
  flashEl.style.color = color || '#fff';
  flashEl.classList.remove('show');
  void flashEl.offsetWidth;
  flashEl.classList.add('show');
}
function shakeIt(v){ state.shake = Math.min(26, state.shake + v * (SET.shake || 0)); }

/* ============================== 战斗 ============================== */
function currentWeaponKey(){ return GUN_ORDER[player.gunIndex] || 'pistol'; }
function currentWeapon(){ return WEAPONS[currentWeaponKey()]; }

function fireWeapon(dt){
  const w = currentWeapon();
  const s = player.stats;
  const interval = w.interval / s.fireRate;

  if (w.beam){
    // 激光：持续射线
    player.beam = 1;
    player.cd -= dt;
    player.beamSfxT -= dt;
    if (player.beamSfxT <= 0){ player.beamSfxT = rand(0.24, 0.4); Sound.play('laserFire', { rate: rand(0.9, 1.15) }); }
    const len = 560;
    const ex = player.x + Math.cos(player.angle) * len;
    const ey = player.y + Math.sin(player.angle) * len;
    const dps = w.dps * s.damage * rageMul();
    for (const e of enemies.slice()){
      if (!enemies.includes(e)) continue;
      if (segDist(e.x, e.y, player.x, player.y, ex, ey) < e.r + 7){
        applyDamage(e, dps * dt, { silent: true, noNumber: true });
        if (Math.random() < 0.5) addPart({ x: e.x + rand(-8,8), y: e.y + rand(-8,8), vx: rand(-30,30), vy: rand(-30,30),
          life: 0.3, max: 0.3, color: '#ff9be2', size: rand(2,4), kind:'dot', rot:0, spin:0 });
      }
    }
    if (Math.random() < 0.6){
      const t = Math.random();
      addPart({ x: lerp(player.x, ex, t), y: lerp(player.y, ey, t), vx: rand(-20,20), vy: rand(-40,-5),
        life: 0.35, max: 0.35, color: '#ffb0ea', size: rand(1.5,3.5), kind:'dot', rot:0, spin:0 });
    }
    player.muzzle = 0.05;
    return;
  }

  player.beam = 0;
  player.cd -= dt;
  if (player.cd > 0) return;
  player.cd = interval;
  player.muzzle = 0.06;
  // 每次射击有轻微音高抖动，避免连发时变成单调的"哒哒哒"
  Sound.play(w.sfx, { rate: rand(0.95, 1.06) });

  const shots = w.shots + s.projectiles;
  const spread = w.spread;
  for (let i = 0; i < shots; i++){
    const off = shots > 1 ? (i - (shots - 1) / 2) * (spread * 2 / Math.max(1, shots - 1)) : 0;
    const a = player.angle + off + rand(-0.02, 0.02) * (spread > 0.1 ? 1 : 0.4);
    pBullets.push({
      x: player.x + Math.cos(player.angle) * (player.r + 14),
      y: player.y + Math.sin(player.angle) * (player.r + 14),
      vx: Math.cos(a) * w.speed * s.bulletSpeed,
      vy: Math.sin(a) * w.speed * s.bulletSpeed,
      r: w.size * s.size, dmg: w.dmg * s.damage * rageMul(), life: 1.5,
      pierce: (w.pierce || 0) + s.pierce, hit: null,
      color: w.color, core: w.core,
      homing: s.homing, explode: (w.explode || 0) + s.explosive,
      knock: (w.knock || 60) * s.knock, critBonus: w.crit || 0, isBeam: false,
    });
  }
  // 后坐力
  player.vx -= Math.cos(player.angle) * (w.knock || 40) * 0.25;
  player.vy -= Math.sin(player.angle) * (w.knock || 40) * 0.25;
}

function applyDamage(e, dmg, opt){
  opt = opt || {};
  const s = player.stats;
  let crit = false;
  let d = dmg;
  if (!opt.silent){
    crit = Math.random() < (s.crit + (opt.critBonus || 0));
    if (crit) d *= s.critMul;
  }
  e.hp -= d;
  e.hurt = 0.1;
  // 命中反馈：准星上的命中标记 + 顺着弹道飞出的火花
  if (!opt.silent){
    hitMarker(crit ? 'kill' : 'hit');
    state.hitStop = Math.max(state.hitStop, crit ? 0.035 : 0.014);
    // 击退 + 挤压：让每一发子弹都"推得动"鱼
    const kb = Math.min(240, 26 + d * 34) * (crit ? 1.35 : 1) / (e.type === 'boss' ? 6 : e.type === 'tank' ? 2.2 : 1);
    if (opt.dir !== undefined){
      e.vx += Math.cos(opt.dir) * kb;
      e.vy += Math.sin(opt.dir) * kb;
    }
    e.hitKick = 0.16;
  }
  if (!opt.silent && SET.particles !== 'low' && e.hp > 0){
    const n = crit ? 6 : 3;
    const dir = Math.atan2(e.y - player.y, e.x - player.x);
    for (let i = 0; i < n; i++){
      const a = dir + Math.PI + rand(-0.85, 0.85);
      const sp = rand(70, 240);
      addPart({
        x: e.x + rand(-e.r * 0.4, e.r * 0.4), y: e.y + rand(-e.r * 0.4, e.r * 0.4),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.16, 0.3), max: 0.3, color: crit ? '#ffd166' : '#dff4ff',
        size: rand(1.2, 2.6), kind: 'spark', rot: 0, spin: 0,
      });
    }
  }
  if (!opt.noNumber && SET.dmgNumbers && d >= 0.5){
    floatText(e.x + rand(-8, 8), e.y - e.r - 6, (crit ? '' : '') + Math.round(d * 10) / 10,
      crit ? '#ffd166' : '#dff4ff', crit ? 20 : 14);
  }
  if (e.hp <= 0) killEnemy(e, crit);
  return crit;
}

function killEnemy(e, crit){
  const idx = enemies.indexOf(e);
  if (idx < 0) return;
  enemies.splice(idx, 1);
  state.kills++;
  state.killProgress++;
  state.score += e.def.score + (e.isBoss || e.type === 'boss' ? 0 : 0) + Math.floor(state.elapsed * 0.3);
  const s = player.stats;
  if (s.lifesteal > 0 && player.alive){
    player.hp = Math.min(s.maxHp, player.hp + s.lifesteal);
    floatText(player.x, player.y - 22, '+' + s.lifesteal, '#7ef0c8', 13);
  }
  // —— 手感：定格 + 冲击波 + 连杀计数 ——
  state.combo++;
  state.comboT = 2.4;
  if (state.combo > state.bestCombo) state.bestCombo = state.combo;
  const bossKill = e.type === 'boss';
  state.hitStop = bossKill ? 0.16 : (state.combo >= 8 ? 0.075 : 0.052);
  shockwave(e.x, e.y, e.r * 0.6, e.r * (bossKill ? 7 : 3.4), bossKill ? 0.6 : 0.38,
            bossKill ? 'rgba(255,220,140,0.9)' : 'rgba(255,240,225,0.85)', bossKill ? 5 : 2.6);
  hitMarker(bossKill || state.combo % 5 === 0 ? 'kill' : 'hit');
  shakeIt(bossKill ? 22 : (3 + Math.min(6, state.combo * 0.5)));
  // 连杀里程碑提示（每 5 连）
  if (!bossKill && state.combo > 0 && state.combo % 5 === 0){
    floatText(player.x, player.y - 46, state.combo + ' 连杀！', '#ffd166', 20);
  }
  burst(e.x, e.y, '#ff5570', e.type === 'boss' ? 60 : 18, 240, 4.5);
  burst(e.x, e.y, '#ffd28a', e.type === 'boss' ? 24 : 7, 170, 3);
  ring(e.x, e.y, 'rgba(255,140,170,0.5)', e.r, e.r * 4, 0.5);
  Sound.playAt('kill', e.x, e.y, { rate: rand(0.94, 1.08) });
  if (crit) Sound.play('crit');

  if (e.type === 'boss'){
    boss = null;
    state.bossKills++;
    profile.bossKills++;
    saveProfile();
    checkAchievements();
    showFlash('鲨王被击败！ +' + (e.def.score) + ' 分', '#ffd166');
    for (let i = 0; i < 6; i++) dropPickup(e.x + rand(-60, 60), e.y + rand(-60, 60), i % 2 ? 'hp' : 'shield');
    for (let i = 0; i < 10; i++) dropPickup(e.x + rand(-70, 70), e.y + rand(-70, 70), 'coin');
    ring(e.x, e.y, 'rgba(255,220,140,0.7)', 40, 320, 1.0);
    shakeIt(22);
  } else {
    // 掉落
    const r = Math.random();
    if (r < 0.055) dropPickup(e.x, e.y, 'hp');
    else if (r < 0.10) dropPickup(e.x, e.y, 'shield');
    else if (r < 0.125 && lockedGuns().length) dropPickup(e.x, e.y, 'gun');
    else if (r < 0.34) dropPickup(e.x, e.y, 'coin');
  }

  // 升级
  if (state.killProgress >= 20){
    state.killProgress -= 20;
    state.level++;
  }
  // 跨局统计：每次击杀都检查成就（12 次比较，开销可忽略），每 25 杀才写一次存档
  profile.totalKills++;
  profile.weaponKills[currentWeaponKey()] = (profile.weaponKills[currentWeaponKey()] || 0) + 1;
  checkAchievements();
  if (profile.totalKills % 25 === 0) saveProfile();
  syncHUD();
}

function explode(x, y, radius, dmg, color){
  ring(x, y, 'rgba(255,190,120,0.75)', radius * 0.3, radius * 1.25, 0.42);
  burst(x, y, color || '#ffb066', 20, radius * 4, 5);
  burst(x, y, '#ffe9c0', 10, radius * 3, 3);
  shakeIt(9);
  Sound.playAt('explode', x, y, { rate: rand(0.9, 1.12) });
  for (const e of enemies.slice()){
    if (!enemies.includes(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < radius + e.r){
      const f = clamp(1 - d / (radius + e.r), 0.35, 1);
      applyDamage(e, dmg * f);
      const a = Math.atan2(e.y - y, e.x - x);
      e.vx += Math.cos(a) * 220 * f; e.vy += Math.sin(a) * 220 * f;
    }
  }
}

function damagePlayer(dmg, srcX, srcY){
  if (!player.alive || player.invuln > 0) return;
  const s = player.stats;
  if (player.shield >= 1){
    player.shield = Math.max(0, Math.floor(player.shield) - 1);
    player.invuln = 0.5;
    Sound.play(player.shield === 0 ? 'shieldBreak' : 'shield');
    ring(player.x, player.y, 'rgba(140,225,255,0.8)', player.r, player.r * 3.4, 0.35);
    floatText(player.x, player.y - 26, '护盾抵挡', '#8fe6ff', 14);
    syncHUD();
    return;
  }
  player.hp -= dmg;
  player.invuln = 0.10 + s.iframe;
  player.hurt = 0.2;
  state.hitFlash = 0.35;
  state.hitStop = Math.max(state.hitStop, 0.07);
  state.combo = 0; state.comboT = 0; state.comboTier = 0;   // 挨打就断连杀
  popEl(hpText);
  hudEl.classList.remove('hit'); void hudEl.offsetWidth; hudEl.classList.add('hit');
  state.waveTookDamage = true;      // 本波"毫发无伤"成就作废
  shakeIt(6);
  burst(player.x, player.y, '#ff8fa6', 10, 200, 3.5);
  Sound.play('hurt');
  if (srcX !== undefined){
    const a = Math.atan2(player.y - srcY, player.x - srcX);
    player.vx += Math.cos(a) * 90; player.vy += Math.sin(a) * 90;
  }
  syncHUD();
  if (player.hp <= 0){
    player.hp = 0; player.alive = false;
    state.respawnTimer = 2.6;
    state.slowmo = 0.8;
    shakeIt(20);
    burst(player.x, player.y, '#5fd0ff', 40, 340, 5);
    burst(player.x, player.y, '#ff5570', 22, 260, 4);
    floatText(player.x, player.y - 30, '你被击倒！', '#ff5570', 20);
    showFlash('被击倒 · 2.6 秒后复活', '#ff8fa6');
    Sound.play('die');
    profile.totalDeaths++;
    saveProfile();
    syncHUD();
  }
}

/* ============================== 掉落 ============================== */
function lockedGuns(){ return GUN_ORDER.filter(g => !player.guns.includes(g)); }
function dropPickup(x, y, type){
  pickups.push({ type, x, y, vx: rand(-60, 60), vy: rand(-60, 60), life: 22, r: 12, ph: rand(0, TAU) });
}
function collectPickup(p){
  const s = player.stats;
  if (p.type === 'hp'){
    const heal = 3;
    player.hp = Math.min(s.maxHp, player.hp + heal);
    floatText(player.x, player.y - 24, '+' + heal + ' HP', '#ff8fa6', 15);
    Sound.play('pickup');
  } else if (p.type === 'shield'){
    // 护盾点：没有护盾上限就先开到 1，否则补 1 点（保持整数，避免出现 0.5 点这种怪数值）
    if (s.shieldMax < 1){ s.shieldMax = 1; player.shield = 1; }
    else player.shield = Math.min(s.shieldMax, Math.floor(player.shield) + 1);
    floatText(player.x, player.y - 24, '护盾 +1', '#8fe6ff', 15);
    Sound.play('shield');
  } else if (p.type === 'gun'){
    const locked = lockedGuns();
    if (locked.length){
      const g = pick(locked);
      player.guns.push(g);
      player.gunIndex = GUN_ORDER.indexOf(g);
      buildGunBar();
      floatText(player.x, player.y - 26, '获得 ' + WEAPONS[g].name, '#ffd166', 16);
      showFlash('🔫 获得新枪：' + WEAPONS[g].name, '#ffd166');
    } else {
      player.hp = Math.min(s.maxHp, player.hp + 3);
      floatText(player.x, player.y - 24, '+3 HP', '#ff8fa6', 15);
    }
    Sound.play('pickup');
  } else {
    // 金币：波间整备时用来买东西
    state.coins++;
    profile.totalCoins++;
    state.score += 5;
    floatText(player.x, player.y - 24, '+1 金币', '#ffd166', 14);
    Sound.play('coin');
    if (profile.totalCoins % 50 === 0) saveProfile();
    checkAchievements();
  }
  syncHUD();
}

/* ============================== 冲刺 ============================== */
function tryDash(){
  if (!player || !player.alive || state.mode !== 'playing') return false;
  if (player.dashCd > 0) return false;
  let ax = 0, ay = 0;
  if (keys['KeyA'] || keys['ArrowLeft'])  ax -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
  if (keys['KeyW'] || keys['ArrowUp'])    ay -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  ay += 1;
  const a = (ax || ay) ? Math.atan2(ay, ax) : player.angle;
  const power = player.stats.speed * 2.9;
  player.vx = Math.cos(a) * power;
  player.vy = Math.sin(a) * power;
  player.dashT = 0.20;
  player.dashCd = 2.0;
  player.invuln = Math.max(player.invuln, 0.20 + player.stats.iframe * 0.5);
  player.body = a;
  for (let i = 0; i < pcount(16); i++){
    addPart({ x: player.x - Math.cos(a) * rand(0, 22), y: player.y - Math.sin(a) * rand(0, 22),
      vx: -Math.cos(a) * rand(40, 180) + rand(-40, 40), vy: -Math.sin(a) * rand(40, 180) + rand(-40, 40),
      life: rand(0.35, 0.8), max: 0.8, color: 'rgba(200,245,255,0.8)', size: rand(2, 5),
      kind:'bubble', rot:0, spin:0 });
  }
  ring(player.x, player.y, 'rgba(160,235,255,0.65)', 8, 74, 0.42);
  ripple(player.x, player.y, 1.15);
  shockwave(player.x, player.y, 6, 54, 0.34, 'rgba(170,240,255,0.75)', 2.4);
  player.ghosts = player.ghosts || [];
  for (let g = 0; g < 3; g++){
    player.ghosts.push({
      x: player.x - Math.cos(a) * (g + 1) * 13,
      y: player.y - Math.sin(a) * (g + 1) * 13,
      body: player.body, angle: player.angle, t: 0, life: 0.26 - g * 0.05,
    });
  }
  Sound.play('dash', { rate: rand(0.94, 1.07) });
  shakeIt(6);
  syncHUD();
  return true;
}

/* ============================== 玩家更新 ============================== */
function updatePlayer(dt){
  const s = player.stats;
  // 冲刺计时与"是否活着"无关：倒下也在走冷却
  if (player.dashCd > 0) player.dashCd -= dt;
  if (player.dashT > 0) player.dashT -= dt;
  if (player.ghosts && player.ghosts.length){
    for (let i = player.ghosts.length - 1; i >= 0; i--){
      player.ghosts[i].t += dt;
      if (player.ghosts[i].t >= player.ghosts[i].life) player.ghosts.splice(i, 1);
    }
  }
  if (!player.alive){
    player.speedNow = 0;
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0){
      const keep = { guns: player.guns, gunIndex: player.gunIndex, stats: s, cardCounts: player.cardCounts };
      const nx = W/2, ny = H/2;
      player = makePlayer();
      player.guns = keep.guns; player.gunIndex = keep.gunIndex;
      player.stats = keep.stats; player.cardCounts = keep.cardCounts;
      player.hp = s.maxHp; player.shield = s.shieldMax;
      player.x = nx; player.y = ny; player.invuln = 2.0;
      eBullets.length = 0;
      floatText(nx, ny - 40, '复活！', '#7ef0c8', 20);
      burst(nx, ny, '#5fd0ff', 26, 260, 4);
      ring(nx, ny, 'rgba(126,240,200,0.7)', 10, 140, 0.6);
      buildGunBar(); syncHUD();
    }
    return;
  }

  // ---- 移动：水下有惯性，松手后会滑行一小段 ----
  let ax = 0, ay = 0;
  if (keys['KeyA'] || keys['ArrowLeft'])  ax -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
  if (keys['KeyW'] || keys['ArrowUp'])    ay -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  ay += 1;
  const L = Math.hypot(ax, ay);
  const moving = L > 0;
  if (moving){ ax /= L; ay /= L; }

  const dashing = player.dashT > 0;
  const target = moving ? s.speed * (dashing ? 2.35 : 1) : 0;
  // 有输入时跟手，松手后靠惯性滑行
  const k = Math.min(1, (moving ? (dashing ? 26 : 12) : 4.0) * dt);
  player.vx += (ax * target - player.vx) * k;
  player.vy += (ay * target - player.vy) * k;
  player.x = clamp(player.x + player.vx * dt, player.r, W - player.r);
  player.y = clamp(player.y + player.vy * dt, player.r, H - player.r);
  const sp = Math.hypot(player.vx, player.vy);
  player.speedNow = sp;

  // ---- 朝向：身体跟随游动方向，枪口跟随鼠标 ----
  const want = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  player.angle = angleLerp(player.angle, want, Math.min(1, 26 * dt));
  if (sp > 34){
    // 游动时身体顺着水流方向
    player.body = angleLerp(player.body, Math.atan2(player.vy, player.vx), Math.min(1, 9 * dt));
  } else {
    // 悬停时慢慢转身面向准星（原地"踩水"的感觉）
    player.body = angleLerp(player.body, player.angle, Math.min(1, (sp < 12 ? 4.2 : 3.0) * dt));
  }

  if (player.invuln > 0) player.invuln -= dt;
  if (player.hurt > 0) player.hurt -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;
  player.beam = 0;

  const firing = (mouse.down || keys['Space']);
  if (firing) fireWeapon(dt);
  else {
    player.cd = Math.max(0, player.cd - dt);
    const w = currentWeapon();
    if (!w.beam) player.beam = 0;
  }
  Sound.setLaser(firing && currentWeapon().beam && state.mode === 'playing');

  // 冲刺 / 高速游动时的尾流气泡
  if (dashing && Math.random() < 0.9){
    addPart({ x: player.x - Math.cos(player.body) * 20, y: player.y - Math.sin(player.body) * 20,
      vx: -player.vx * 0.12 + rand(-30, 30), vy: -player.vy * 0.12 + rand(-30, 30),
      life: rand(0.35, 0.8), max: 0.8, color: 'rgba(200,245,255,0.75)', size: rand(2, 5),
      kind:'bubble', rot:0, spin:0 });
  }

  // 回复 / 护盾充能
  if (s.regen > 0 && player.hp < s.maxHp){
    player.regenT += dt;
    if (player.regenT >= 1){ player.regenT -= 1; player.hp = Math.min(s.maxHp, player.hp + s.regen); syncHUD(); }
  }
  if (s.shieldMax > 0 && player.shield < s.shieldMax){
    player.shieldT += dt;
    if (player.shieldT >= 7){ player.shieldT = 0; player.shield = Math.min(s.shieldMax, player.shield + 1); syncHUD(); }
  }
  // 游泳气泡
  player.bubbleT -= dt;
  if (player.bubbleT <= 0 && Math.hypot(player.vx, player.vy) > 60){
    player.bubbleT = rand(0.16, 0.34);
    addPart({ x: player.x - Math.cos(player.angle) * 12, y: player.y - Math.sin(player.angle) * 12,
      vx: rand(-14, 14), vy: rand(-26, -8), life: rand(0.5, 1.0), max: 1.0,
      color: 'rgba(190,240,255,0.7)', size: rand(1.5, 3.4), kind:'bubble', rot:0, spin:0 });
  }
}

/* ============================== 敌人更新 ============================== */
function updateEnemies(dt){
  const d = difficulty();
  for (let i = enemies.length - 1; i >= 0; i--){
    const e = enemies[i];
    if (e.hurt > 0) e.hurt -= dt;
    if (e.hitKick > 0) e.hitKick = Math.max(0, e.hitKick - dt);
    if (e.muzzle > 0) e.muzzle -= dt;
    if (e.contactCd > 0) e.contactCd -= dt;
    const isBoss = e.type === 'boss';

    // --- 行为 ---
    if (e.type === 'dasher'){
      e.dashCd -= dt;
      if (e.dashCd <= 0 && player.alive){
        e.dash = 0.55; e.dashCd = rand(1.8, 3.0);
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        e.vx = Math.cos(a) * e.speed * 2.6; e.vy = Math.sin(a) * e.speed * 2.6;
        burst(e.x, e.y, '#ff8a6a', 6, 120, 2.5);
      }
      if (e.dash > 0){
        e.dash -= dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.vx *= 0.985; e.vy *= 0.985;
      } else if (player.alive){
        // 非冲刺时缓慢逼近，并左右摆动
        const dx = player.x - e.x, dy = player.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.wob += dt * 2.2;
        const a = Math.atan2(dy, dx) + Math.sin(e.wob) * 0.55;
        const spd = e.speed * 0.42;
        const kk = Math.min(1, 2.6 * dt);
        e.vx += (Math.cos(a) * spd - e.vx) * kk;
        e.vy += (Math.sin(a) * spd - e.vy) * kk;
        e.x += e.vx * dt; e.y += e.vy * dt;
      }
    } else if (isBoss){
      updateBossPattern(e, dt);
    } else {
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const [NEAR, FAR] = e.def.keep;
      let mx, my;
      if (player.alive){
        if (dist < NEAR){ mx = -ux; my = -uy; }
        else if (dist > FAR){ mx = ux; my = uy; }
        else { mx = -uy; my = ux; }
      } else { mx = Math.cos(e.wob); my = Math.sin(e.wob); }
      e.wob += dt * (0.8 + e.tint);
      const a = Math.atan2(my, mx) + Math.sin(e.wob * 2.1) * 0.35;
      const kk = Math.min(1, 3.2 * dt);
      e.vx += (Math.cos(a) * e.speed - e.vx) * kk;
      e.vy += (Math.sin(a) * e.speed - e.vy) * kk;
      e.x += e.vx * dt; e.y += e.vy * dt;
    }

    // 边界
    const pad = 30;
    if (e.x < pad){ e.x = pad; e.vx = Math.abs(e.vx); }
    if (e.x > W - pad){ e.x = W - pad; e.vx = -Math.abs(e.vx); }
    if (e.y < pad){ e.y = pad; e.vy = Math.abs(e.vy); }
    if (e.y > H - pad){ e.y = H - pad; e.vy = -Math.abs(e.vy); }

    // 朝向
    if (player.alive){
      const want = Math.atan2(player.y - e.y, player.x - e.x);
      e.angle = angleLerp(e.angle, want, Math.min(1, 7 * dt));
    } else {
      e.angle = angleLerp(e.angle, Math.atan2(e.vy, e.vx), Math.min(1, 2 * dt));
    }

    // --- 射击 ---
    if (e.type === 'dasher'){
      // 撞击伤害
      if (player.alive && e.contactCd <= 0 &&
          dist2(e.x, e.y, player.x, player.y) < (e.r + player.r) * (e.r + player.r)){
        e.contactCd = 0.6;
        damagePlayer(1, e.x, e.y);
        if (player.stats.thorns > 0) applyDamage(e, player.stats.thorns);
        e.vx = -e.vx * 0.6; e.vy = -e.vy * 0.6;
      }
      continue;
    }
    if (!isBoss && player.alive){
      const dist = Math.hypot(player.x - e.x, player.y - e.y);
      if (e.def.fire.tele && e.tele <= 0 && e.cd <= 0 && dist < 700){
        e.tele = e.def.fire.tele;
        e.teleTarget = e.angle;
        Sound.play('tele');
      }
      if (e.tele > 0){
        e.tele -= dt;
        if (e.tele <= 0){
          shootAt(e, e.def.fire, 1);
          e.cd = rand(e.def.fire.cd[0], e.def.fire.cd[1]) * d.fire;
        }
      } else {
        e.cd -= dt;
        if (e.cd <= 0 && dist < 620){
          shootAt(e, e.def.fire, 1);
          e.cd = rand(e.def.fire.cd[0], e.def.fire.cd[1]) * d.fire;
        }
      }
    } else if (isBoss){
      e.cd -= dt;
      if (e.cd <= 0 && player.alive){
        e.cd = rand(e.def.fire.cd[0], e.def.fire.cd[1]) * d.fire;
        shootAt(e, e.def.fire, 1);
      }
    }
  }
}

function shootAt(e, f, mul){
  const d = difficulty();
  e.muzzle = 0.08;
  const n = f.shots || 1;
  for (let i = 0; i < n; i++){
    const off = n > 1 ? (i - (n - 1) / 2) * (f.spread * 2 / Math.max(1, n - 1)) : 0;
    const a = e.angle + off + rand(-0.05, 0.05);
    eBullets.push({
      x: e.x + Math.cos(e.angle) * (e.r + 13),
      y: e.y + Math.sin(e.angle) * (e.r + 13),
      vx: Math.cos(a) * f.speed * d.bspd,
      vy: Math.sin(a) * f.speed * d.bspd,
      r: f.br, dmg: f.dmg * d.dmg, life: 3.5,
      color: e.type === 'sniper' ? '#ffd0e0' : '#ffb14d',
      core: '#fff4d6',
    });
  }
  // 敌人开火：带空间定位的音效，远的听不清、近的有威胁感
  const snap = e.type === 'sniper' ? 'enemySniper' : (e.def.gun === 'shotgun' ? 'shotgun' : 'enemyShot');
  if (Math.random() < (e.type === 'sniper' ? 0.95 : 0.55)){
    Sound.playAt(snap, e.x, e.y, { rate: rand(0.92, 1.1) });
  }
}

function updateBossPattern(e, dt){
  if (!player.alive) return;
  e.patternT -= dt;
  const hpFrac = e.hp / e.maxHp;
  if (e.patternT <= 0){
    e.pattern = (e.pattern + 1) % 4;
    e.patternT = e.pattern === 3 ? 3.4 : 2.6 + rand(0, 0.8);
    if (e.pattern === 3) Sound.play('boss');
  }
  const dist = Math.hypot(player.x - e.x, player.y - e.y) || 1;
  const ux = (player.x - e.x) / dist, uy = (player.y - e.y) / dist;
  const kk = Math.min(1, 2.4 * dt);

  if (e.pattern === 0){        // 靠近
    e.vx += (ux * e.speed - e.vx) * kk;
    e.vy += (uy * e.speed - e.vy) * kk;
  } else if (e.pattern === 1){ // 环绕
    e.vx += (-uy * e.speed - e.vx) * kk;
    e.vy += (ux * e.speed - e.vy) * kk;
  } else if (e.pattern === 2){ // 后退
    e.vx += (-ux * e.speed - e.vx) * kk;
    e.vy += (-uy * e.speed - e.vy) * kk;
  } else {                     // 召唤
    e.vx *= 0.95; e.vy *= 0.95;
    if (!e.summoned){
      e.summoned = true;
      for (let i = 0; i < 3; i++){
        const s = spawnEnemy(pick(['scout', 'dasher']), false);
        s.x = e.x + rand(-70, 70); s.y = e.y + rand(-70, 70);
        burst(s.x, s.y, '#ff9bb0', 12, 160, 3);
      }
    }
  }
  if (e.pattern !== 3) e.summoned = false;
  e.x = clamp(e.x + e.vx * dt, e.r, W - e.r);
  e.y = clamp(e.y + e.vy * dt, e.r, H - e.r);
  e.r = 46 * (hpFrac < 0.4 ? 1.08 : 1);
  if (Math.random() < 0.25 && hpFrac < 0.45){
    addPart({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), vx: rand(-20, 20), vy: rand(-60, -10),
      life: 0.5, max: 0.5, color: '#ff9bb0', size: rand(2, 5), kind: 'dot', rot: 0, spin: 0 });
  }
}

/* ============================== 子弹更新 ============================== */
function updateBullets(dt){
  // 玩家子弹
  for (let i = pBullets.length - 1; i >= 0; i--){
    const b = pBullets[i];
    if (b.homing > 0){
      let bestE = null, bd = 420 * 420;
      for (const e of enemies){
        const dd = dist2(e.x, e.y, b.x, b.y);
        if (dd < bd){ bd = dd; bestE = e; }
      }
      if (bestE){
        const want = Math.atan2(bestE.y - b.y, bestE.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        const na = angleLerp(cur, want, Math.min(1, b.homing * dt));
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40){
      if (b.explode) explode(b.x, b.y, b.explode + 26, b.dmg * 1.1, b.color);
      pBullets.splice(i, 1); continue;
    }
    let removed = false;
    for (let j = enemies.length - 1; j >= 0; j--){
      const e = enemies[j];
      if (Math.hypot(e.x - b.x, e.y - b.y) > e.r + b.r) continue;
      if (b.hit && b.hit.has(e.id)) continue;
      const crit = applyDamage(e, b.dmg, { critBonus: b.critBonus, dir: Math.atan2(b.vy, b.vx) });
      burst(b.x, b.y, b.color, 4, 140, 2.6);
      if (b.explode) explode(b.x, b.y, b.explode + 26, b.dmg * 0.9, b.color);
      if (b.pierce > 0){
        b.pierce--;
        if (!b.hit) b.hit = new Set();
        b.hit.add(e.id);
      } else { pBullets.splice(i, 1); removed = true; }
      if (crit) Sound.play('crit'); else Sound.play('hit');
      break;
    }
    if (removed) continue;
  }
  // 敌人子弹
  for (let i = eBullets.length - 1; i >= 0; i--){
    const b = eBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50){
      eBullets.splice(i, 1); continue;
    }
    if (player.alive &&
        dist2(player.x, player.y, b.x, b.y) < (player.r + b.r) * (player.r + b.r)){
      eBullets.splice(i, 1);
      damagePlayer(b.dmg, b.x, b.y);
    }
  }
}

/* ============================== 拾取 / 粒子 ============================== */
function updatePickups(dt){
  const s = player.stats;
  for (let i = pickups.length - 1; i >= 0; i--){
    const p = pickups[i];
    p.life -= dt;
    p.ph += dt * 3;
    const d = Math.hypot(player.x - p.x, player.y - p.y);
    if (player.alive && d < s.magnet){
      const a = Math.atan2(player.y - p.y, player.x - p.x);
      const pull = clamp(560 - d * 1.6, 60, 560);
      p.vx += Math.cos(a) * pull * dt * 2.2;
      p.vy += Math.sin(a) * pull * dt * 2.2;
    }
    p.vx *= (1 - 1.6 * dt); p.vy *= (1 - 1.6 * dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.x = clamp(p.x, 12, W - 12); p.y = clamp(p.y, 12, H - 12);
    if (p.life <= 0){ pickups.splice(i, 1); continue; }
    if (player.alive && d < player.r + p.r + 4){
      pickups.splice(i, 1);
      collectPickup(p);
    }
  }
}
function updateParticles(dt){
  for (let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'bubble'){ p.vy -= 26 * dt; p.vx *= (1 - 0.6 * dt); }
    else if (p.kind === 'ring'){ /* 静态 */ }
    else { p.vx *= (1 - 2.2 * dt); p.vy *= (1 - 2.2 * dt); p.vy -= 14 * dt; }
    p.rot += p.spin * dt;
    p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--){
    const f = floats[i];
    f.y -= 36 * dt; f.life -= dt;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

/* ============================== 环境更新 ============================== */
function updateAmbient(dt){
  state.gameTime += dt;
  updateMarks(dt);
  if (!env) return;
  for (const s of env.schools){
    s.x += s.dir * s.speed * dt;
    s.y += Math.sin(state.gameTime * 0.5 + s.x * 0.01) * 6 * dt;
    if (s.x > W + 160){ s.x = -160; s.y = rand(60, H * 0.75); }
    if (s.x < -160){ s.x = W + 160; s.y = rand(60, H * 0.75); }
  }
  for (const j of env.jellies){
    j.y -= j.s * dt;
    j.x += Math.sin(state.gameTime * 0.5 + j.ph) * 12 * dt;
    if (j.y < -80){ j.y = H + 80; j.x = Math.random() * W; }
  }
  for (const p of env.plankton){
    p.y -= p.s * dt * 0.35;
    p.x += Math.sin(state.gameTime * 0.6 + p.ph) * 6 * dt;
    if (p.y < -6){ p.y = H + 6; p.x = Math.random() * W; }
  }
}

/* ============================== 主更新 ============================== */
function update(dt){
  updateAmbient(dt);
  if (state.mode !== 'playing') return;

  const slow = state.slowmo > 0 ? 0.35 : 1;
  if (state.slowmo > 0) state.slowmo -= dt;
  dt *= slow;

  state.elapsed += dt;
  updateMarks(dt);
  if (state.comboT > 0){
    state.comboT -= dt;
    if (state.comboT <= 0){ state.combo = 0; state.comboT = 0; state.comboTier = 0; }
  }
  updatePlayer(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateParticles(dt);

  // ---- 波次推进 ----
  if (state.rageT > 0) state.rageT = Math.max(0, state.rageT - dt);
  if (state.waveState === 'fight'){
    if (player.alive){
      spawnTimer -= dt;
      if (state.waveQueue > 0 && spawnTimer <= 0 && enemies.length < maxEnemies()){
        spawnTimer = spawnInterval();
        spawnEnemy(null, false);
        state.waveQueue--;
      }
    }
    if (state.waveQueue <= 0 && enemies.length === 0) endWave();
  } else {
    // 整备期：没有敌人，可以买东西、回血、捡漏
    state.waveT -= dt;
    shopTick += dt;
    if (shopTick >= 0.12){ shopTick = 0; renderShop(); }
    if (state.waveT <= 0) skipIntermission();
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - 40 * dt);
  if (state.hitFlash > 0) state.hitFlash = Math.max(0, state.hitFlash - dt * 2.4);

  // 音乐随战斗强度变化：敌人越多、血量越低，音乐越紧张
  const threat = clamp(enemies.length / 12, 0, 1);
  const danger = player.alive ? clamp(1 - player.hp / player.stats.maxHp, 0, 1) : 1;
  Sound.setIntensity(clamp(threat * 0.7 + danger * 0.5 + (boss ? 0.35 : 0), 0, 1));

  // 升级 → 卡片（等级由 killEnemy 提升，这里只负责弹出卡片界面）
  state.pendingCards = Math.max(state.pendingCards, state.level - 1 - state.cardsTaken);
  if (state.pendingCards > 0) openCards();
  syncHUD();
}

/* ============================== 渲染：鱼 ============================== */
/* 主角蓝鱼：身体按游动方向、枪口按瞄准方向分开绘制
   —— 尾巴摆幅随速度变化，眼睛会看向准星，冲刺时留残影 */
function drawPlayerFish(x, y, r, bodyA, aimA, o){
  o = o || {};
  const t = state.gameTime;
  const R = r;
  const sp = clamp((o.speed || 0) / 340, 0, 1.7);
  const flick = Math.sin(t * (7 + sp * 8)) * (0.14 + sp * 0.34);
  const ghost = !!o.ghost;

  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(R * 1.22, 0);
    ctx.quadraticCurveTo(R * 0.20, -R * 1.02, -R * 0.95, 0);
    ctx.quadraticCurveTo(R * 0.20, R * 1.02, R * 1.22, 0);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(x, y);

  // 身周水光（柔和光斑比硬边圆更细腻）
  if (o.glow) drawGlow(0, 0, R * (ghost ? 3.4 : 5.0), '#5fd0ff', ghost ? 0.18 : 0.26);

  ctx.rotate(bodyA);
  if (!ghost) ctx.scale(1, 1 + Math.sin(t * 2.3) * 0.018);   // 呼吸感

  // ---- 尾鳍（绕尾根摆动）----
  ctx.save();
  ctx.translate(-R * 0.82, 0);
  ctx.rotate(flick);
  const tailG = ctx.createLinearGradient(0, -R * 0.6, -R * 1.5, R * 0.6);
  tailG.addColorStop(0, 'rgba(96,206,255,0.96)');
  tailG.addColorStop(0.55, 'rgba(62,164,238,0.86)');
  tailG.addColorStop(1, 'rgba(200,246,255,0.62)');
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-R * 0.60, -R * 0.92, -R * 1.24, -R * 0.54);
  ctx.quadraticCurveTo(-R * 0.80, 0, -R * 1.24, R * 0.54);
  ctx.quadraticCurveTo(-R * 0.60, R * 0.92, 0, 0);
  ctx.closePath();
  ctx.fillStyle = tailG; ctx.fill();
  if (!ghost){
    ctx.strokeStyle = 'rgba(226,251,255,0.28)'; ctx.lineWidth = 0.9;
    for (let i = -2; i <= 2; i++){
      ctx.beginPath();
      ctx.moveTo(-R * 0.12, i * R * 0.05);
      ctx.quadraticCurveTo(-R * 0.70, i * R * 0.28, -R * 1.16, i * R * 0.38);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ---- 背鳍（半透明，边缘泛光）----
  const dorsal = ctx.createLinearGradient(0, -R * 1.95, 0, -R * 0.34);
  dorsal.addColorStop(0, 'rgba(206,250,255,0.95)');
  dorsal.addColorStop(0.66, 'rgba(74,172,238,0.90)');
  dorsal.addColorStop(1, 'rgba(26,104,200,0.88)');
  ctx.beginPath();
  ctx.moveTo(-R * 0.38, -R * 0.62);
  ctx.quadraticCurveTo(R * 0.12, -R * 1.98, R * 0.92, -R * 0.44);
  ctx.quadraticCurveTo(R * 0.34, -R * 0.80, -R * 0.38, -R * 0.62);
  ctx.closePath();
  ctx.fillStyle = dorsal; ctx.fill();
  ctx.strokeStyle = 'rgba(170,240,255,0.42)'; ctx.lineWidth = 0.8; ctx.stroke();

  // ---- 身体 ----
  bodyPath();
  const bg = ctx.createLinearGradient(0, -R * 1.05, 0, R * 1.05);
  bg.addColorStop(0, ghost ? '#3fa8f0' : '#86e7ff');
  bg.addColorStop(0.26, ghost ? '#2b8fe0' : '#45b6ff');
  bg.addColorStop(0.60, ghost ? '#1c6fc4' : '#1f86e8');
  bg.addColorStop(1, ghost ? '#123f7e' : '#0d4896');
  ctx.fillStyle = bg; ctx.fill();

  if (!ghost){
    ctx.save();
    bodyPath(); ctx.clip();
    // 背部镜面反光
    const sheen = ctx.createLinearGradient(0, -R * 1.02, 0, R * 0.12);
    sheen.addColorStop(0, 'rgba(232,253,255,0.52)');
    sheen.addColorStop(0.36, 'rgba(176,238,255,0.16)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
    // 腹部亮片
    const belly = ctx.createRadialGradient(R * 0.24, R * 0.52, 0, R * 0.24, R * 0.52, R * 1.08);
    belly.addColorStop(0, 'rgba(236,255,255,0.46)');
    belly.addColorStop(1, 'rgba(236,255,255,0)');
    ctx.fillStyle = belly; ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
    // 热带鱼条纹
    ctx.globalAlpha = 0.20; ctx.fillStyle = '#eafcff';
    for (let i = 0; i < 2; i++){
      const bx = R * (0.16 - i * 0.50);
      ctx.beginPath();
      ctx.moveTo(bx, -R * 0.78);
      ctx.quadraticCurveTo(bx + R * 0.26, 0, bx, R * 0.80);
      ctx.quadraticCurveTo(bx + R * 0.46, 0, bx, -R * 0.78);
      ctx.closePath(); ctx.fill();
    }
    // 鳞片微光
    ctx.globalAlpha = 0.09; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9;
    for (let i = -1; i <= 1; i++){
      ctx.beginPath();
      ctx.arc(i * R * 0.30 + R * 0.05, 0, R * 0.34, -1.15, 1.15);
      ctx.stroke();
    }
    ctx.restore();

    // 鳃线
    ctx.beginPath();
    ctx.arc(R * 0.50, -R * 0.04, R * 0.40, -0.95, 0.95);
    ctx.strokeStyle = 'rgba(8,50,96,0.30)'; ctx.lineWidth = 1.1; ctx.stroke();
  }

  // 轮廓边缘光（左上一道硬光，右下极淡）
  bodyPath();
  const rim = ctx.createLinearGradient(-R * 0.2, -R * 1.05, R * 0.4, R * 0.9);
  rim.addColorStop(0, 'rgba(238,253,255,0.86)');
  rim.addColorStop(0.42, 'rgba(184,240,255,0.20)');
  rim.addColorStop(1, 'rgba(120,200,255,0.08)');
  ctx.strokeStyle = rim; ctx.lineWidth = 1.9; ctx.stroke();

  // ---- 胸鳍（两片，扇动）----
  for (let i = 0; i < 2; i++){
    ctx.save();
    ctx.translate(R * (0.26 - i * 0.36), R * (0.32 + i * 0.06));
    ctx.rotate(0.5 + Math.sin(t * 9 + sp * 6 + i * 1.7) * 0.44);
    const fg = ctx.createLinearGradient(-R * 0.2, 0, R * 0.5, 0);
    fg.addColorStop(0, 'rgba(215,251,255,0.52)');
    fg.addColorStop(1, 'rgba(86,186,255,0.22)');
    ctx.beginPath();
    ctx.ellipse(R * 0.20, 0, R * 0.44, R * 0.17, 0, 0, TAU);
    ctx.fillStyle = fg; ctx.fill();
    ctx.restore();
  }

  // ---- 眼睛（瞳孔跟随准星）----
  if (!ghost){
    const ex = R * 0.62, ey = -R * 0.21, er = R * 0.20;
    ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 0.95, 0, 0, TAU);
    ctx.fillStyle = '#f8feff'; ctx.fill();
    ctx.strokeStyle = 'rgba(5,30,56,0.45)'; ctx.lineWidth = 0.9; ctx.stroke();
    const rel = (function(a, b){ let d = ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI; return d; })(aimA, bodyA);
    const px = ex + Math.cos(rel) * er * 0.30, py = ey + Math.sin(rel) * er * 0.30;
    ctx.beginPath(); ctx.arc(px, py, er * 0.66, 0, TAU);
    ctx.fillStyle = '#123a5c'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, er * 0.38, 0, TAU);
    ctx.fillStyle = '#04121f'; ctx.fill();
    ctx.beginPath(); ctx.arc(px + er * 0.24, py - er * 0.26, er * 0.21, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
  }

  // 受击白闪
  if (o.hurt > 0){
    bodyPath();
    ctx.globalAlpha = Math.min(0.62, o.hurt * 3.2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ---- 枪（独立炮塔，永远指向准星）----
  if (!ghost && o.muzzle !== undefined){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aimA);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, TAU);
    ctx.strokeStyle = 'rgba(170,236,255,0.38)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.32, -0.4, 0.9);
    ctx.strokeStyle = 'rgba(220,252,255,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    drawGun(currentWeapon().gun, R * 0.95, o.muzzle, 1.05);
    ctx.restore();
  }
}

function drawFishSprite(x, y, r, angle, o){
  const body1 = o.body1 || '#ff4a5f', body2 = o.body2 || '#b3122f';
  const fin = o.fin || body2, kind = o.kind || 'shooter';
  const hurt = o.hurt || 0, muzzle = o.muzzle || 0, glow = o.glow;
  const t = state.gameTime;
  const R = r;
  const long = kind === 'sniper' ? 1.35 : kind === 'tank' ? 1.05 : kind === 'scout' ? 0.95 : kind === 'boss' ? 1.5 : 1.1;
  const wide = kind === 'tank' ? 1.2 : kind === 'scout' ? 0.82 : kind === 'sniper' ? 0.8 : 1;
  const flick = Math.sin(t * 8 + x * 0.03) * 0.2;

  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(R * 1.18 * long, 0);
    ctx.quadraticCurveTo(R * 0.15 * long, -R * 1.0 * wide, -R * long, 0);
    ctx.quadraticCurveTo(R * 0.15 * long, R * 1.0 * wide, R * 1.18 * long, 0);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(x, y);
  if (glow) drawGlow(0, 0, R * 5.0, glow, 0.30);
  ctx.rotate(angle);

  // ---- 尾鳍 ----
  ctx.save();
  ctx.translate(-R * 0.82 * long, 0);
  ctx.rotate(flick);
  const tg = ctx.createLinearGradient(0, 0, -R * 1.05 * long, 0);
  tg.addColorStop(0, fin);
  tg.addColorStop(1, body1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-R * 0.62 * long, -R * 0.9 * wide, -R * 1.02 * long, -R * 0.26 * wide);
  ctx.quadraticCurveTo(-R * 0.5 * long, 0, -R * 1.02 * long, R * 0.26 * wide);
  ctx.quadraticCurveTo(-R * 0.62 * long, R * 0.9 * wide, 0, 0);
  ctx.closePath();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = tg; ctx.fill();
  ctx.globalAlpha = 1;
  if (R > 13){
    ctx.strokeStyle = 'rgba(255,225,230,0.20)'; ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++){
      ctx.beginPath();
      ctx.moveTo(-R * 0.10 * long, i * R * 0.05 * wide);
      ctx.quadraticCurveTo(-R * 0.60 * long, i * R * 0.22 * wide, -R * 0.95 * long, i * R * 0.30 * wide);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ---- 背鳍 ----
  const dorsalH = kind === 'dasher' || kind === 'boss' ? 1.5 : 1.0;
  const dg = ctx.createLinearGradient(0, -R * (1.4 + 0.45 * dorsalH) * wide, 0, -R * 0.34 * wide);
  dg.addColorStop(0, 'rgba(255,246,248,0.50)');
  dg.addColorStop(0.40, fin);
  dg.addColorStop(1, body2);
  ctx.beginPath();
  ctx.moveTo(-R * 0.10 * long, -R * 0.64 * wide);
  ctx.quadraticCurveTo(R * 0.25 * long, -R * (1.35 + 0.45 * dorsalH) * wide, R * 0.72 * long, -R * 0.42 * wide);
  ctx.closePath();
  ctx.fillStyle = dg; ctx.fill();

  // ---- 身体 ----
  bodyPath();
  const bg = ctx.createLinearGradient(0, -R * wide, 0, R * wide);
  bg.addColorStop(0, body1);
  bg.addColorStop(0.48, body2);
  bg.addColorStop(1, body1);
  ctx.fillStyle = bg; ctx.fill();

  if (R > 10){
    ctx.save();
    bodyPath(); ctx.clip();
    // 背部反光
    const sheen = ctx.createLinearGradient(0, -R * wide, 0, R * 0.10 * wide);
    sheen.addColorStop(0, 'rgba(255,255,255,0.30)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(-R * 2 * long, -R * 2 * wide, R * 4 * long, R * 4 * wide);
    // 腹部高光
    const belly = ctx.createRadialGradient(R * 0.30 * long, R * 0.46 * wide, 0, R * 0.30 * long, R * 0.46 * wide, R * 1.0 * wide);
    belly.addColorStop(0, 'rgba(255,235,238,0.30)');
    belly.addColorStop(1, 'rgba(255,235,238,0)');
    ctx.fillStyle = belly; ctx.fillRect(-R * 2 * long, -R * 2 * wide, R * 4 * long, R * 4 * wide);
    // 鳞片
    ctx.globalAlpha = 0.10; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9;
    for (let i = -1; i <= 1; i++){
      ctx.beginPath();
      ctx.arc(i * R * 0.34 * long - R * 0.10 * long, 0, R * 0.36 * wide, -1.1, 1.1);
      ctx.stroke();
    }
    ctx.restore();
    // 鳃线
    ctx.beginPath();
    ctx.arc(R * 0.42 * long, 0, R * 0.34 * wide, -1.0 * wide, 1.0 * wide);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // 轮廓边缘光（上方一道）
  bodyPath();
  const rim = ctx.createLinearGradient(0, -R * wide, 0, R * 0.6 * wide);
  rim.addColorStop(0, 'rgba(255,235,240,0.55)');
  rim.addColorStop(0.5, 'rgba(255,200,210,0.10)');
  rim.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1, R * 0.08); ctx.stroke();

  // ---- 胸鳍 ----
  ctx.save();
  ctx.translate(R * 0.30 * long, R * 0.26 * wide);
  ctx.rotate(0.72 + Math.sin(t * 7 + x * 0.02) * 0.28);
  const fg2 = ctx.createLinearGradient(0, 0, R * 0.5, 0);
  fg2.addColorStop(0, 'rgba(255,240,244,0.45)');
  fg2.addColorStop(1, fin);
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.34, R * 0.16, 0, 0, TAU);
  ctx.fillStyle = fg2; ctx.globalAlpha = 0.82; ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();

  // ---- 鲨鱼嘴（boss / dasher）----
  if (kind === 'boss' || kind === 'dasher'){
    const mg2 = ctx.createLinearGradient(0, -R * 0.3, 0, R * 0.3);
    mg2.addColorStop(0, '#3d0716');
    mg2.addColorStop(1, '#16020a');
    ctx.beginPath();
    ctx.moveTo(R * 1.10 * long, -R * 0.06);
    ctx.quadraticCurveTo(R * 0.72 * long, -R * 0.32, R * 0.42 * long, -R * 0.04);
    ctx.quadraticCurveTo(R * 0.75 * long, R * 0.34, R * 1.10 * long, R * 0.06);
    ctx.closePath();
    ctx.fillStyle = mg2; ctx.fill();
    ctx.fillStyle = '#fff8fb';
    for (let i = 0; i < 4; i++){
      const tx = R * (0.52 + i * 0.15) * long;
      ctx.beginPath();
      ctx.moveTo(tx, -R * 0.10); ctx.lineTo(tx + R * 0.07, R * 0.02); ctx.lineTo(tx + R * 0.14, -R * 0.10);
      ctx.closePath(); ctx.fill();
    }
  }

  // ---- 眼睛（带眉压，显得凶）----
  const ex = R * (kind === 'sniper' ? 0.62 : 0.56) * long, ey = -R * 0.22 * wide;
  const er = Math.max(1.9, R * 0.165);
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU);
  ctx.fillStyle = '#fff6f8'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 0.9; ctx.stroke();
  const ig = ctx.createRadialGradient(ex + R * 0.04, ey - R * 0.02, 0, ex + R * 0.04, ey, er);
  ig.addColorStop(0, o.pupil || '#5c0a16');
  ig.addColorStop(1, '#160205');
  ctx.beginPath(); ctx.arc(ex + R * 0.04, ey, er * 0.70, 0, TAU); ctx.fillStyle = ig; ctx.fill();
  ctx.beginPath(); ctx.arc(ex + R * 0.08, ey - R * 0.05, Math.max(0.7, er * 0.20), 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  // 眉（压在上方，不遮眼）
  ctx.beginPath();
  ctx.moveTo(ex - er * 1.15, ey - er * 1.55);
  ctx.lineTo(ex + er * 1.25, ey - er * 1.20);
  ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = Math.max(0.9, er * 0.30); ctx.stroke();

  // ---- 枪 ----
  if (o.gun) drawGun(o.gun, R * 0.9, muzzle, kind === 'boss' ? 1.5 : 1);

  // ---- 受击白闪 ----
  if (hurt > 0){
    ctx.globalAlpha = Math.min(1, hurt * 7);
    bodyPath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function pathRoundRect(x, y, w, h, r){
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawGun(type, s, muzzle, scale){
  const k = scale || 1;
  ctx.save();
  ctx.translate(s * 0.72, s * 0.22);
  ctx.rotate(0.12);

  const steel = ['#71869b', '#3a4757', '#151b22'];
  const dark  = ['#4d5f71', '#26303b', '#0c1015'];
  const wood  = ['#8d6742', '#5b4029', '#291b11'];

  // 带倒角与顶部高光的金属块
  const part = (x, y, w, h, cols, rad) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.42, cols[1]);
    g.addColorStop(1, cols[2]);
    const r = rad === undefined ? Math.max(1, h * 0.38) : rad;
    pathRoundRect(x, y, w, h, r);
    ctx.fillStyle = g; ctx.fill();
    ctx.save();
    pathRoundRect(x, y, w, h, r); ctx.clip();
    ctx.fillStyle = 'rgba(236,250,255,0.20)';
    ctx.fillRect(x, y, w, Math.max(0.7, h * 0.20));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + h - Math.max(0.7, h * 0.22), w, h);
    ctx.restore();
    pathRoundRect(x, y, w, h, r);
    ctx.strokeStyle = 'rgba(2,8,14,0.5)';
    ctx.lineWidth = Math.max(0.55, s * 0.022);
    ctx.stroke();
  };

  if (type === 'pistol'){
    part(0, -s * 0.13, s * 1.75, s * 0.26, steel);
    part(s * 1.44, -s * 0.175, s * 0.44, s * 0.20, dark);
    part(s * 0.16, s * 0.09, s * 0.30, s * 0.46, dark, s * 0.05);
  } else if (type === 'smg'){
    part(0, -s * 0.15, s * 1.56, s * 0.30, steel);
    part(s * 1.28, -s * 0.19, s * 0.48, s * 0.22, dark);
    part(s * 0.28, s * 0.10, s * 0.30, s * 0.56, dark, s * 0.05);
    part(s * 0.02, -s * 0.34, s * 0.56, s * 0.18, dark);
  } else if (type === 'shotgun'){
    part(0, -s * 0.22, s * 1.94, s * 0.22, dark);
    part(0, s * 0.03, s * 1.94, s * 0.23, wood);
    part(s * 0.18, s * 0.15, s * 0.34, s * 0.48, wood, s * 0.06);
  } else if (type === 'sniper'){
    part(0, -s * 0.12, s * 2.44, s * 0.22, steel);
    part(s * 2.14, -s * 0.16, s * 0.36, s * 0.15, dark);
    part(s * 0.64, -s * 0.52, s * 0.80, s * 0.26, dark);       // 瞄准镜
    part(s * 0.20, s * 0.05, s * 0.30, s * 0.44, dark, s * 0.05);
  } else if (type === 'laser'){
    part(0, -s * 0.18, s * 1.92, s * 0.36, steel);
    for (let i = 0; i < 3; i++){
      const gx = s * 0.34 + i * s * 0.36;
      const g = ctx.createLinearGradient(0, -s * 0.30, 0, s * 0.30);
      g.addColorStop(0, 'rgba(255,206,248,0.95)');
      g.addColorStop(0.5, 'rgba(255,116,222,0.95)');
      g.addColorStop(1, 'rgba(150,32,148,0.95)');
      pathRoundRect(gx, -s * 0.30, s * 0.16, s * 0.60, s * 0.05);
      ctx.fillStyle = g; ctx.fill();
    }
    drawGlow(s * 2.02, 0, s * 0.8, '#ff8ee2', 0.6);
    ctx.beginPath(); ctx.arc(s * 2.02, 0, s * 0.13, 0, TAU);
    ctx.fillStyle = '#ffe8fb'; ctx.fill();
  } else if (type === 'launcher'){
    part(0, -s * 0.34, s * 2.02, s * 0.68, dark, s * 0.15);
    part(s * 1.84, -s * 0.30, s * 0.34, s * 0.60, steel, s * 0.09);
    part(s * 0.26, s * 0.28, s * 0.36, s * 0.48, wood, s * 0.07);
    ctx.beginPath(); ctx.arc(s * 2.02, 0, s * 0.20, 0, TAU);
    ctx.fillStyle = '#170f0a'; ctx.fill();
  } else if (type === 'trident'){
    part(0, -s * 0.08, s * 1.94, s * 0.16, ['#8fb2bd', '#44626d', '#102227'], s * 0.04);
    part(s * 1.80, -s * 0.42, s * 0.15, s * 0.84, ['#a7c8d2', '#4e6f7a', '#0f2228'], s * 0.04);
    const prong = (dir) => {
      ctx.beginPath();
      ctx.moveTo(s * 1.94, dir * s * 0.48);
      ctx.quadraticCurveTo(s * 2.20, dir * s * 0.30, s * 2.26, 0);
      ctx.quadraticCurveTo(s * 2.08, dir * s * 0.16, s * 1.94, dir * s * 0.20);
      ctx.closePath();
      ctx.fillStyle = '#d9f2f7'; ctx.fill();
    };
    prong(1); prong(-1);
    ctx.beginPath();
    ctx.moveTo(s * 1.94, -s * 0.09); ctx.lineTo(s * 2.30, 0); ctx.lineTo(s * 1.94, s * 0.09);
    ctx.closePath(); ctx.fillStyle = '#eafbff'; ctx.fill();
  } else {
    part(0, -s * 0.13, s * 1.75, s * 0.26, steel);
  }

  // 枪口火焰
  if (muzzle > 0){
    const mx = type === 'sniper' ? s * 2.5 : type === 'trident' ? s * 2.32 : s * 2.0;
    const m = Math.min(1, muzzle * 2.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(mx, 0, s * 1.7 * k, '#ffd9a0', 0.80 * m);
    drawSprite('spark', mx, 0, s * 1.7 * k, '#fff6d8', 0.85 * m, state.gameTime * 7, 'lighter');
    ctx.restore();
  }
  ctx.restore();
}

/* ============================== 渲染：环境 ============================== */
function kelpPoints(k){
  const pts = [];
  for (let i = 0; i <= k.segs; i++){
    const t = i / k.segs;
    const sway = Math.sin(state.gameTime * k.speed + k.phase + t * k.wave) * k.amp * Math.pow(t, 1.35);
    pts.push([k.x + sway, k.baseY - t * k.len]);
  }
  return pts;
}
function drawKelp(k){
  const pts = kelpPoints(k);
  ctx.save();
  ctx.globalAlpha = k.alpha;
  ctx.lineCap = 'round';
  // 茎
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++){
    const p = pts[i], q = pts[i - 1];
    ctx.quadraticCurveTo(q[0], q[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.lineWidth = k.width;
  ctx.strokeStyle = 'hsla(' + k.hue + ',55%,' + (k.layer === 'near' ? 12 : 22) + '%,0.95)';
  ctx.stroke();
  // 叶片
  for (let i = 1; i < pts.length - 1; i += 2){
    const p = pts[i], q = pts[i - 1];
    const a = Math.atan2(p[1] - q[1], p[0] - q[0]) + (i % 4 === 1 ? 1 : -1) * 0.9;
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(k.width * 2.4, 0, k.width * 3.4 * k.leaf, k.width * 1.1, 0, 0, TAU);
    ctx.fillStyle = 'hsla(' + k.hue + ',60%,' + (k.layer === 'near' ? 15 : 28) + '%,0.75)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
/* ---------------- 水体：缓存渐变 + 焦散叠层 + 光柱 ---------------- */
const waterCache = { key: '', grad: null, pool: null, side: null, haze: null };
let causticLayers = null;
/* 胶片颗粒：预生成一次（明暗双向噪点），每帧只做一次 drawImage
   —— 之前用 pattern + 'overlay' 每帧整屏合成，是最大的性能开销 */
let grainCv = null, grainKey = '';
function ensureGrain(){
  const key = W + 'x' + H;
  if (grainCv && grainKey === key) return grainCv;
  const pad = 96, w = Math.ceil((W + pad) * DPR), h = Math.ceil((H + pad) * DPR);
  if (w <= 0 || h <= 0) return null;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const pat = texPattern('grain');
  if (pat){
    // 用素材里的无缝颗粒铺满，再把整体不透明度压到 ~6%
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
    // 把颗粒的均值压到深水色附近，叠上去只加颗粒、不提亮画面
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#42505c';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 0.94;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  } else {
    // 素材未就绪时的兜底：明暗双向噪点
    const img = g.createImageData(w, h);
    const d = img.data;
    let seed = 1337;
    for (let i = 0; i < d.length; i += 4){
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = (seed >>> 8) / 16777216;
      const v = 128 + (n * 2 - 1) * 118;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 16;
    }
    g.putImageData(img, 0, 0);
  }
  grainCv = c; grainKey = key;
  return c;
}

function buildCausticLayers(){
  const a = tex('caustics1'), b = tex('caustics2');
  if (!a || !b){ causticLayers = null; return; }
  const pad = 110, w = Math.ceil(W + pad * 2), h = Math.ceil(H + pad * 2);
  const bake = (src, ox, oy, scale) => {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const p = g.createPattern(src, 'repeat');
    if (!p) return null;
    g.save();
    g.translate(ox, oy);
    g.scale(scale, scale);
    g.fillStyle = p;
    g.fillRect(-ox / scale - 4, -oy / scale - 4, w / scale + 8, h / scale + 8);
    g.restore();
    // 垂直遮罩：水面最亮 → 中层稀薄 → 海床附近再亮一点
    g.globalCompositeOperation = 'destination-in';
    const mg = g.createLinearGradient(0, 0, 0, h);
    mg.addColorStop(0.00, 'rgba(0,0,0,0.96)');
    mg.addColorStop(0.22, 'rgba(0,0,0,0.50)');
    mg.addColorStop(0.58, 'rgba(0,0,0,0.15)');
    mg.addColorStop(0.86, 'rgba(0,0,0,0.44)');
    mg.addColorStop(1.00, 'rgba(0,0,0,0.20)');
    g.fillStyle = mg; g.fillRect(0, 0, w, h);
    // 统一染色，避免叠加后发白发灰
    g.globalCompositeOperation = 'source-in';
    const tg = g.createLinearGradient(0, 0, 0, h);
    tg.addColorStop(0, '#cdf6ff');
    tg.addColorStop(0.5, '#63cfff');
    tg.addColorStop(1, '#3f9fe0');
    g.fillStyle = tg; g.fillRect(0, 0, w, h);
    return c;
  };
  const la = bake(a, 41, 23, 1.32);
  const lb = bake(b, 307, 113, 1.86);
  causticLayers = (la && lb) ? { a: la, b: lb, pad } : null;
}

function ensureWaterCache(){
  const key = W + 'x' + H;
  if (waterCache.key === key) return;
  waterCache.key = key;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, '#0a3d61');
  g.addColorStop(0.15, '#0a3a5e');
  g.addColorStop(0.40, '#062a45');
  g.addColorStop(0.72, '#03192b');
  g.addColorStop(1.00, '#010a13');
  waterCache.grad = g;
  const px = W * 0.5, py = -H * 0.22, pr = Math.max(W, H) * 0.60;
  const pool = ctx.createRadialGradient(px, py, 0, px, py, pr);
  pool.addColorStop(0, 'rgba(52,168,255,0.10)');
  pool.addColorStop(0.42, 'rgba(30,112,200,0.045)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  waterCache.pool = pool;
  const side = ctx.createRadialGradient(W * 0.1, H * 0.6, 0, W * 0.1, H * 0.6, Math.max(W, H) * 0.62);
  side.addColorStop(0, 'rgba(48,104,180,0.10)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  waterCache.side = side;
  const haze = ctx.createLinearGradient(0, H * 0.46, 0, H);
  haze.addColorStop(0, 'rgba(1,9,18,0)');
  haze.addColorStop(0.62, 'rgba(1,9,18,0.30)');
  haze.addColorStop(1, 'rgba(1,9,18,0.66)');
  waterCache.haze = haze;
  buildCausticLayers();
}

function drawWater(){
  ensureWaterCache();
  const t = state.gameTime;
  ctx.fillStyle = waterCache.grad; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = waterCache.pool; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = waterCache.side; ctx.fillRect(0, 0, W, H);

  // 焦散：两层不同尺度/相位互相干扰，缓慢漂移
  if (causticLayers){
    const L = causticLayers;
    const ox = Math.sin(t * 0.055) * 32, oy = Math.cos(t * 0.043) * 20;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.105 + Math.sin(t * 0.37) * 0.025;
    ctx.drawImage(L.a, -L.pad + ox, -L.pad + oy);
    ctx.globalAlpha = 0.075 + Math.sin(t * 0.29 + 1.9) * 0.022;
    ctx.drawImage(L.b, -L.pad - ox * 0.8, -L.pad - oy * 1.3);
    ctx.restore();
  }

  // 光柱
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const beams = 6;
  for (let i = 0; i < beams; i++){
    const seed = i * 1.618;
    const x = W * (i + 0.5) / beams + Math.sin(t * 0.19 + seed) * (64 + i * 8);
    const wTop = 42 + (i % 3) * 30;
    const skew = 80 + Math.sin(t * 0.13 + seed) * 44;
    const a = (0.038 + (i % 4) * 0.012) * (0.70 + Math.sin(t * 0.31 + seed * 2) * 0.30);
    const gg = ctx.createLinearGradient(x, 0, x + skew, H);
    gg.addColorStop(0, 'rgba(196,247,255,' + a.toFixed(3) + ')');
    gg.addColorStop(0.42, 'rgba(140,220,255,' + (a * 0.5).toFixed(3) + ')');
    gg.addColorStop(1, 'rgba(110,190,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(x - wTop, 0);
    ctx.lineTo(x + wTop, 0);
    ctx.lineTo(x + skew + wTop * 2.2, H);
    ctx.lineTo(x + skew - wTop * 2.2, H);
    ctx.closePath(); ctx.fill();
    // 光柱中心那道更紧的高光
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x - wTop * 0.34, 0);
    ctx.lineTo(x + wTop * 0.34, 0);
    ctx.lineTo(x + skew + wTop * 0.7, H);
    ctx.lineTo(x + skew - wTop * 0.7, H);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 浮游生物 / 悬浮微粒
  for (const p of env.plankton){
    const a = p.a * (0.55 + Math.sin(t * 1.4 + p.ph) * 0.45);
    const y = p.y + Math.sin(t * 0.5 + p.ph) * 6;
    if (p.r > 1.05) drawGlow(p.x, y, p.r * 11, '#cdf4ff', a * 0.55);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#d9f6ff';
    ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawSchools(){
  for (const s of env.schools){
    for (const f of s.fish){
      const fx = s.x + f.ox * s.dir, fy = s.y + f.oy + Math.sin(state.gameTime * 3 + f.ph) * 4;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(s.dir, 1);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(f.r, 0);
      ctx.quadraticCurveTo(0, -f.r * 0.7, -f.r, 0);
      ctx.quadraticCurveTo(0, f.r * 0.7, f.r, 0);
      ctx.fillStyle = '#7fc9e8'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-f.r * 0.8, 0); ctx.lineTo(-f.r * 1.9, -f.r * 0.7); ctx.lineTo(-f.r * 1.9, f.r * 0.7);
      ctx.closePath(); ctx.fillStyle = '#5aa8ca'; ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
function drawJellies(){
  for (const j of env.jellies){
    const pulse = 1 + Math.sin(state.gameTime * 1.6 + j.ph) * 0.12;
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, j.r * pulse, j.r * 0.78 * pulse, 0, Math.PI, TAU);
    ctx.fillStyle = 'hsla(' + j.hue + ',70%,66%,0.75)'; ctx.fill();
    ctx.strokeStyle = 'hsla(' + j.hue + ',80%,80%,0.5)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath();
    for (let i = -2; i <= 2; i++){
      ctx.moveTo(i * j.r * 0.34, 0);
      ctx.quadraticCurveTo(i * j.r * 0.34 + Math.sin(state.gameTime * 2 + i) * 8, j.r * 1.1,
                           i * j.r * 0.34 + Math.sin(state.gameTime * 2 + i + 1) * 12, j.r * 2.1);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function drawVignette(){
  const g = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.30,
                                     W / 2, H * 0.5, Math.max(W, H) * 0.82);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,6,14,0.30)');
  g.addColorStop(1, 'rgba(0,6,14,0.82)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // 海床深度雾（把近景压进暗部，制造纵深）
  if (waterCache.haze){ ctx.fillStyle = waterCache.haze; ctx.fillRect(0, 0, W, H); }

  // 低血脉冲：只在边缘发红光，不挡战斗区
  if (player && player.alive && player.hp / player.stats.maxHp < 0.35){
    const k = 1 - (player.hp / player.stats.maxHp) / 0.35;
    const pulse = 0.5 + Math.sin(state.gameTime * 5.2) * 0.5;
    const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34,
                                        W / 2, H / 2, Math.max(W, H) * 0.66);
    rg.addColorStop(0, 'rgba(255,40,80,0)');
    rg.addColorStop(1, 'rgba(255,36,74,' + (0.07 + k * 0.17 * pulse).toFixed(3) + ')');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }

  // 受击闪红
  if (state.hitFlash > 0){
    ctx.fillStyle = 'rgba(255,40,80,' + (state.hitFlash * 0.22) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // 胶片颗粒：一次 drawImage，随机偏移避免死板
  const gc = ensureGrain();
  if (gc){
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(gc, -(Math.random() * 96) | 0, -(Math.random() * 96) | 0, gc.width / DPR, gc.height / DPR);
    ctx.restore();
  }
}

/* ============================== 渲染：实体 ============================== */
function bulletTrail(b, lenFactor, width, color, alpha){
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < 1) return;
  const len = clamp(sp * lenFactor, 6, 44);
  const tx = b.x - b.vx / sp * len, ty = b.y - b.vy / sp * len;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(b.x, b.y, tx, ty);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = g; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.restore();
}

function drawBullets(){
  const t = state.gameTime;
  for (const b of pBullets){
    // 拖尾：外宽内窄两层，速度越快越长
    bulletTrail(b, 0.036, b.r * 3.0, b.color, 0.34);
    bulletTrail(b, 0.026, b.r * 1.5, b.color, 0.85);
    drawGlow(b.x, b.y, b.r * 12.5, b.color, 0.55);
    drawGlow(b.x, b.y, b.r * 4.6, '#ffffff', 0.95);
    drawSprite('spark', b.x, b.y, b.r * 9, b.color, 0.26, t * 11);
  }
  for (const b of eBullets){
    const pulse = 0.85 + Math.sin(t * 16 + b.x * 0.1) * 0.15;
    bulletTrail(b, 0.026, b.r * 2.4, 'rgba(255,150,70,1)', 0.32);
    bulletTrail(b, 0.018, b.r * 1.2, 'rgba(255,196,120,1)', 0.75);
    drawGlow(b.x, b.y, b.r * 12 * pulse, '#ff7a2a', 0.50);
    drawGlow(b.x, b.y, b.r * 3.8, '#fff1d6', 0.95);
  }
}

function drawPickups(){
  const t = state.gameTime;
  for (const p of pickups){
    const bob = Math.sin(p.ph + t * 1.6) * 3;
    const fade = p.life < 3 ? (Math.sin(p.life * 12) * 0.5 + 0.5) : 1;
    const col = p.type === 'hp' ? '#ff5f7a' : p.type === 'shield' ? '#5fd0ff' : p.type === 'gun' ? '#ffd166' : '#ffe89a';
    const a = 0.4 + fade * 0.6;
    // 光晕 + 呼吸环
    drawGlow(p.x, p.y + bob, 54, col, a * 0.42);
    drawGlow(p.x, p.y + bob, 22, col, a * 0.55);
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    const rr = 13 + Math.sin(t * 2.2 + p.ph) * 1.6;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU);
    ctx.fillStyle = 'rgba(4,18,32,0.78)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = '700 11px ' + UI_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.type === 'hp' ? '♥' : p.type === 'shield' ? '◈' : p.type === 'gun' ? '⟐' : '★', 0, 0.5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}

function drawParticles(){
  for (const p of parts){
    const a = Math.max(0, p.life / p.max);
    if (p.kind === 'ring'){
      const k = 1 - a;
      const r = lerp(p.size, p.size1, k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3.4 * a + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.28;
      ctx.lineWidth = 9 * a + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.96, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'bubble'){
      drawSprite('bubble', p.x, p.y, p.size * 6.5, null, a * 0.62);
    } else {
      // 火花：柔光 + 亮核
      const sz = p.size * (0.45 + a * 1.5);
      drawGlow(p.x, p.y, sz * 5.2, p.color, a * 0.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.4, sz * 0.5), 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloats(){
  ctx.textAlign = 'center';
  for (const f of floats){
    const k = 1 - f.life / f.max;                       // 0 → 1
    const a = Math.max(0, f.life / f.max);
    const pop = k < 0.16 ? 0.72 + (k / 0.16) * 0.44
                         : 1.16 - Math.min((k - 0.16) / 0.34, 1) * 0.16;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(f.x, f.y);
    ctx.scale(pop, pop);
    ctx.font = '700 ' + f.size + 'px ' + UI_FONT;
    ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(0,10,20,0.72)';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function drawBeam(){
  if (!player.alive || !player.beam) return;
  const from = { x: player.x + Math.cos(player.angle) * (player.r + 12), y: player.y + Math.sin(player.angle) * (player.r + 12) };
  const len = 560;
  const to = { x: from.x + Math.cos(player.angle) * len, y: from.y + Math.sin(player.angle) * len };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,120,220,0.22)'; ctx.lineWidth = 18; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,150,235,0.55)'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,255,0.95)'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(to.x, to.y, 7, 0, TAU); ctx.fillStyle = 'rgba(255,200,250,0.8)'; ctx.fill();
  ctx.restore();
}
function drawSniperSights(){
  for (const e of enemies){
    if (e.tele > 0 && player.alive){
      const frac = 1 - e.tele / e.def.fire.tele;
      ctx.save();
      ctx.globalAlpha = 0.25 + frac * 0.5;
      ctx.strokeStyle = '#ff5f7a'; ctx.lineWidth = 1.2; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.angle) * 1200, e.y + Math.sin(e.angle) * 1200);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* ============================== 渲染主函数 ============================== */
function render(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (state.shake > 0.3){
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawWater();
  if (!env) return;

  for (const k of env.farKelp) drawKelp(k);
  if (envStatic) ctx.drawImage(envStatic, 0, 0, W, H);
  drawSchools();
  drawJellies();
  for (const k of env.midKelp) drawKelp(k);

  drawSniperSights();
  for (const e of enemies){
    const def = e.def;
    const isBoss = e.type === 'boss';
    const spriteOpts = {
      kind: def.kind, body1: e.elite ? '#ffd166' : def.body[0], body2: e.elite ? '#b37b12' : def.body[1],
      fin: e.elite ? '#8a5c00' : def.body[1],
      gun: def.gun, hurt: e.hurt, muzzle: e.muzzle,
      glow: isBoss ? '#ff3c5a' : (e.elite ? '#ffcc66' : null),
    };
    // 被打中时整体压扁一下，配合击退，手感才"实"
    const kick = e.hitKick || 0;
    if (kick > 0){
      const sq = 1 + Math.sin((kick / 0.16) * Math.PI) * 0.14;
      ctx.save();
      ctx.scale(sq, 1 / sq);
      drawFishSprite(e.x / sq, e.y * sq, e.r, e.angle, spriteOpts);
      ctx.restore();
    } else {
      drawFishSprite(e.x, e.y, e.r, e.angle, spriteOpts);
    }
    if (e.hp < e.maxHp && !isBoss){
      const w = e.r * 2.5, hh = 3.2;
      const bx = e.x - w / 2, by = e.y - e.r - 15;
      ctx.fillStyle = 'rgba(2,8,14,0.72)';
      pathRoundRect(bx - 1.2, by - 1.2, w + 2.4, hh + 2.4, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      pathRoundRect(bx, by, w, hh, 1.6); ctx.fill();
      const hpw = w * clamp(e.hp / e.maxHp, 0, 1);
      if (hpw > 0.4){
        const hg = ctx.createLinearGradient(bx, 0, bx + w, 0);
        if (e.elite){ hg.addColorStop(0, '#ffe6a3'); hg.addColorStop(1, '#ffb03a'); }
        else { hg.addColorStop(0, '#ff8a9c'); hg.addColorStop(1, '#e8324f'); }
        ctx.fillStyle = hg;
        pathRoundRect(bx, by, hpw, hh, 1.6); ctx.fill();
      }
    }
  }

  drawPickups();
  drawBullets();

  if (player && player.alive){
    const blink = player.invuln > 0 && Math.floor(state.gameTime * 14) % 2 === 0;
    // 冲刺残影（随时间淡出的实体影子）
    if (player.ghosts && player.ghosts.length){
      for (const gh of player.ghosts){
        const ga = clamp(1 - gh.t / gh.life, 0, 1) * 0.42;
        if (ga <= 0.01) continue;
        ctx.save();
        ctx.globalAlpha = ga;
        drawPlayerFish(gh.x, gh.y, player.r * (0.92 + ga * 0.08), gh.body, gh.angle,
                       { ghost: true });
        ctx.restore();
      }
    }
    ctx.save();
    ctx.globalAlpha = blink ? 0.5 : 1;
    drawPlayerFish(player.x, player.y, player.r, player.body, player.angle, {
      hurt: player.hurt, muzzle: player.muzzle, speed: player.speedNow,
      glow: player.invuln > 0.1 ? 'rgba(110,215,255,0.34)' : 'rgba(110,215,255,0.15)',
    });
    ctx.restore();
    // 护盾罩（双层，带呼吸）
    if (player.shield > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 + Math.sin(state.gameTime * 6) * 0.08;
      ctx.strokeStyle = '#8fe6ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r * 2.0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.09; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r * 2.0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // 水下投影 + 缓慢呼吸的水光（取代原来的标记圈）
    {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#01121e';
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + player.r * 1.05, player.r * 1.25, player.r * 0.40, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(player.x, player.y + player.r * 0.2, player.r * 5.0, '#3fb0ff',
               0.10 + Math.sin(state.gameTime * 2.2) * 0.025);
      ctx.restore();
    }
  } else if (player && !player.alive){
    const p = 1 - state.respawnTimer / 2.6;
    ctx.save();
    ctx.strokeStyle = 'rgba(126,240,200,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W/2, H/2, 34, -Math.PI/2, -Math.PI/2 + TAU * clamp(p, 0, 1)); ctx.stroke();
    ctx.fillStyle = '#cfeffb'; ctx.font = '700 14px ' + UI_FONT; ctx.textAlign = 'center';
    ctx.fillText('复活中…', W/2, H/2 + 6);
    ctx.restore();
  }

  drawBeam();
  drawParticles();
  drawMarks();
  drawFloats();
  drawCombo();
  for (const k of env.nearKelp) drawKelp(k);
  drawVignette();

  // 准星
  if (state.mode === 'playing'){
    // 光标下的敌人（命中会变色并弹出锁定括弧）
    let target = null, bestD = 1e9;
    for (const e of enemies){
      const d = Math.hypot(e.x - mouse.x, e.y - mouse.y);
      if (d < e.r * 1.4 && d < bestD){ bestD = d; target = e; }
    }
    const t2 = state.gameTime;
    const col = target ? (target.type === 'boss' ? '255,122,149' : '126,240,200') : '191,234,255';
    // 开火后准星会被后坐力撑开一下
    const kick = player && player.alive ? Math.max(0, player.muzzle) * 46 : 0;
    ctx.save();
    ctx.translate(mouse.x, mouse.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 外环三段，命中时转得更急
    ctx.strokeStyle = 'rgba(' + col + ',' + (target ? 0.95 : 0.60) + ')';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++){
      const a = t2 * (target ? 1.7 : 0.5) + i * (TAU / 3);
      ctx.beginPath(); ctx.arc(0, 0, (target ? 13 : 11) + kick, a, a + 1.02); ctx.stroke();
    }
    // 四刻线
    ctx.strokeStyle = 'rgba(' + col + ',' + (target ? 0.9 : 0.45) + ')';
    for (let i = 0; i < 4; i++){
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (6.5 + kick * 0.6), Math.sin(a) * (6.5 + kick * 0.6));
      ctx.lineTo(Math.cos(a) * (10.5 + kick), Math.sin(a) * (10.5 + kick));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
    // 锁定括弧
    if (target){
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(t2 * 1.2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(' + col + ',0.72)'; ctx.lineWidth = 1.6;
      const s = target.r + 9;
      for (let i = 0; i < 4; i++){
        const a0 = i * Math.PI / 2 + 0.14;
        ctx.beginPath(); ctx.arc(0, 0, s, a0, a0 + 0.46); ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/* ============================== HUD ============================== */
const $ = id => document.getElementById(id);
const hudEl = $('hud');
const hpText = $('hpText'), hpMax = $('hpMax'), hpFill = $('hpFill');
const shWrap = $('shWrap'), shText = $('shText'), shFill = $('shFill');
const lvText = $('lvText'), xpText = $('xpText'), xpFill = $('xpFill');
const killText = $('killText'), scoreText = $('scoreText'), timeText = $('timeText');
const diffText = $('diffText'), bestText = $('bestText');
const weaponName = $('weaponName'), weaponKey = $('weaponKey');
const gunBar = $('gunBar'), buffsEl = $('buffs'), flashEl = $('flash'), lowhp = $('lowhp');
const bossBar = $('bossBar'), bossFill = $('bossFill'), bossName = $('bossName');
const overlay = $('overlay');
const scrStart = $('scrStart'), scrPause = $('scrPause'), scrSettings = $('scrSettings'),
      scrCards = $('scrCards'), scrProfile = $('scrProfile');
const cardRow = $('cardRow'), cardTitle = $('cardTitle'), cardSub = $('cardSub');
const pauseStats = $('pauseStats'), startTip = $('startTip'), pickupHint = $('pickupHint');
const dashPill = $('dashPill');
const leftPanelEl = $('leftPanel');
const waveText = $('waveText'), waveLeftText = $('waveLeftText'), coinText = $('coinText'), ragePill = $('ragePill');
const shopEl = $('shop'), shopBodyEl = $('shopBody'), shopTimerEl = $('shopTimer'),
      shopCoinEl = $('shopCoin'), shopWaveEl = $('shopWave'), shopSkipEl = $('shopSkip');
const achToast = $('achToast');
const profileStatsEl = $('profileStats'), achGridEl = $('achGrid'), achCountEl = $('achCount'), profileSubEl = $('profileSub');
let shopTick = 0;

/* ---------------- 波间商店界面 ---------------- */
function renderShop(){
  if (!shopEl || shopEl.classList.contains('hidden')) return;
  shopTimerEl.textContent = Math.ceil(Math.max(0, state.waveT)) + 's';
  setNum(shopCoinEl, state.coins);
  shopWaveEl.textContent = state.wave;
  const sig = state.shopOffer.join(',') + '|' + state.shopSold.join(',') + '|' +
    state.shopOffer.map(id => (state.coins >= shopItem(id).cost) ? 1 : 0).join('');
  if (shopBodyEl.dataset.sig === sig) return;
  shopBodyEl.dataset.sig = sig;
  shopBodyEl.innerHTML = state.shopOffer.map((id, i) => {
    const it = shopItem(id);
    const sold = state.shopSold[i];
    const afford = state.coins >= it.cost;
    const cls = sold ? 'sold' : (afford ? '' : 'poor');
    return '<div class="shopCard ' + cls + '" data-buy="' + i + '">' +
      '<div class="si">' + it.icon + '</div>' +
      '<div class="sBody"><div class="sn">' + it.name + '</div><div class="sd">' + it.d + '</div></div>' +
      '<div class="sc">' + (sold ? '✔ 已购' : '💰 ' + it.cost) + '</div></div>';
  }).join('');
}
function openShop(){
  if (!shopEl) return;
  renderShop();
  shopEl.classList.remove('hidden');
}
function closeShop(){ if (shopEl) shopEl.classList.add('hidden'); }

shopBodyEl.addEventListener('click', e => {
  const card = e.target.closest ? e.target.closest('[data-buy]') : null;
  if (card) buyShop(parseInt(card.dataset.buy, 10));
});
shopSkipEl.addEventListener('click', () => { Sound.play('ui'); skipIntermission(); });

/* ---------------- 档案界面 ---------------- */
function renderProfile(){
  const wname = key => (WEAPONS[key] ? WEAPONS[key].name : key);
  let favKey = '—', favN = 0;
  for (const k in profile.weaponKills){ if (profile.weaponKills[k] > favN){ favN = profile.weaponKills[k]; favKey = k; } }
  const rows = [
    ['下水次数', profile.runs],
    ['累计击杀', profile.totalKills],
    ['累计阵亡', profile.totalDeaths],
    ['累计金币', profile.totalCoins],
    ['击败鲨王', profile.bossKills],
    ['最高波次', profile.bestWave],
    ['最高分', Math.max(profile.bestScore, best)],
    ['最常用枪', favN ? wname(favKey) : '—'],
  ];
  profileStatsEl.innerHTML = rows.map(r =>
    '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  const got = ACHIEVEMENTS.filter(a => profile.achievements[a.id]).length;
  achCountEl.textContent = got + ' / ' + ACHIEVEMENTS.length;
  achGridEl.innerHTML = ACHIEVEMENTS.map(a => {
    const on = !!profile.achievements[a.id];
    return '<div class="achCard' + (on ? ' on' : '') + '">' +
      '<div class="ai">' + (on ? a.icon : '🔒') + '</div>' +
      '<div class="an">' + a.name + '</div><div class="ad">' + a.d + '</div></div>';
  }).join('');
  profileSubEl.textContent = 'PROFILE · 跨局累计 · 已解锁 ' + got + ' 项成就';
}

function syncHUD(){
  if (!player) return;
  const s = player.stats;
  hpText.textContent = Math.max(0, Math.ceil(player.hp));
  hpMax.textContent = ' / ' + Math.round(s.maxHp);
  const hpPct = clamp(player.hp / s.maxHp * 100, 0, 100);
  hpFill.style.width = hpPct + '%';
  // 供 CSS 做"掉血残影"：真实血条先跳，后面的鬼影慢慢追上来
  leftPanelEl.style.setProperty('--hp', hpPct + '%');
  if (s.shieldMax > 0){
    shWrap.classList.remove('hidden');
    shText.textContent = player.shield + ' / ' + s.shieldMax;
    shFill.style.width = clamp(player.shield / s.shieldMax * 100, 0, 100) + '%';
  } else shWrap.classList.add('hidden');
  lvText.textContent = 'Lv.' + state.level;
  xpText.textContent = state.killProgress + ' / 20';
  xpFill.style.width = clamp(state.killProgress / 20 * 100, 0, 100) + '%';
  setNum(killText, state.kills);
  setNum(scoreText, state.score);
  timeText.textContent = fmtTime(state.elapsed);
  diffText.textContent = difficulty().name;
  bestText.textContent = Math.max(best, state.score);
  // 波次 / 金币 / 狂暴
  if (state.waveState === 'intermission'){
    waveText.textContent = '整备 ' + Math.ceil(Math.max(0, state.waveT)) + 's';
  } else {
    waveText.textContent = '第 ' + state.wave + ' 波' + (isBossWave(state.wave) ? ' 🦈' : '');
  }
  waveLeftText.textContent = state.waveState === 'intermission' ? '—' : (state.waveQueue + enemies.length);
  setNum(coinText, state.coins);
  ragePill.classList.toggle('hidden', state.rageT <= 0);
  if (state.rageT > 0) ragePill.textContent = '🔥 狂暴 ×1.6 · ' + Math.ceil(state.rageT) + 's';
  const w = currentWeapon();
  weaponName.textContent = w.name;
  weaponKey.textContent = (player.gunIndex + 1) + ' 键 · ' + (w.beam ? '光束' : '弹道');
  lowhp.style.opacity = (player.alive && player.hp / s.maxHp <= 0.25) ? '1' : '0';
  const cooling = player.dashCd > 0;
  dashPill.classList.toggle('cool', cooling);
  dashPill.textContent = cooling ? player.dashCd.toFixed(1) + 's' : '就绪 Shift';
  if (boss && boss.hp > 0){
    bossBar.classList.remove('hidden');
    bossFill.style.width = clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%';
  } else bossBar.classList.add('hidden');
  syncGunBar();
  syncBuffs();
}
function buildGunBar(){
  gunBar.innerHTML = '';
  GUN_ORDER.forEach((key, i) => {
    const unlocked = player.guns.includes(key);
    const d = document.createElement('div');
    d.className = 'gunSlot' + (unlocked ? '' : ' locked') + (i === player.gunIndex ? ' on' : '');
    d.dataset.key = key;
    d.title = unlocked ? (WEAPONS[key].name + '：' + WEAPONS[key].desc) : (WEAPONS[key].name + '（未解锁）');
    d.innerHTML = '<div class="gk">' + (i + 1) + '</div><div class="gn">' + WEAPONS[key].name + '</div>';
    // 直接点击枪械条也能换枪
    d.addEventListener('click', () => { if (state.mode === 'playing' || state.mode === 'paused') switchGun(i, true); });
    gunBar.appendChild(d);
  });
}
function syncGunBar(){
  [...gunBar.children].forEach((el, i) => {
    el.classList.toggle('on', i === player.gunIndex);
  });
}
function syncBuffs(){
  const items = [];
  for (const c of CARDS.concat(WEAPON_CARDS)){
    const n = player.cardCounts[c.id] || 0;
    if (n > 0) items.push('<div class="chip">' + c.icon + ' ' + c.name + (c.max > 1 ? ' <i>×' + n + '</i>' : '') + '</div>');
  }
  const html = items.join('');
  if (buffsEl.dataset.h !== html){ buffsEl.innerHTML = html; buffsEl.dataset.h = html; }
}
function switchGun(i, absolute){
  if (!player) return;
  let idx = absolute ? i : player.gunIndex + i;
  idx = (idx + GUN_ORDER.length) % GUN_ORDER.length;
  let tries = 0;
  while (!player.guns.includes(GUN_ORDER[idx]) && tries < GUN_ORDER.length){ idx = (idx + 1) % GUN_ORDER.length; tries++; }
  if (!player.guns.includes(GUN_ORDER[idx])) return;
  if (idx === player.gunIndex) return;
  player.gunIndex = idx;
  player.cd = 0;
  Sound.play('ui');
  const w = currentWeapon();
  showPickupHint('切换到 ' + w.name);
  syncHUD();
}
let hintT = 0;
function showPickupHint(text){ pickupHint.textContent = text; pickupHint.style.opacity = '1'; hintT = 1.6; }

/* ============================== 卡片界面 ============================== */
let cardChoices = [];
function rollCards(n){
  const pool = [];
  for (const c of CARDS){
    const st = cardStack(c.id);
    if (st >= c.max) continue;
    let w = c.r === 'rare' ? 1.0 * (1 + (player.stats.luck - 1) * 0.9) : 2.3;
    pool.push({ c, w });
  }
  const locked = lockedGuns();
  for (const key of locked){
    const c = WEAPON_CARDS.find(x => x.id === 'gun_' + key);
    if (c) pool.push({ c, w: 2.6 * (1 + (player.stats.luck - 1) * 0.5) });
  }
  const out = [];
  for (let i = 0; i < n && pool.length; i++){
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total, k = 0;
    while (k < pool.length - 1 && r > pool[k].w){ r -= pool[k].w; k++; }
    out.push(pool[k].c);
    pool.splice(k, 1);
  }
  while (out.length < n){
    out.push({ id:'supply', icon:'🎁', r:'common', max:99, name:'深海补给',
      d:'立即回复 6 点生命并获得 100 分', f:(s, p) => { p.hp = Math.min(s.maxHp, p.hp + 6); state.score += 100; } });
  }
  return out;
}
let cardLock = false;
function openCards(){
  cardChoices = rollCards(3);
  cardTitle.textContent = '武 器 升 级  Lv.' + state.level;
  cardSub.textContent = '还剩 ' + state.pendingCards + ' 次强化 · 按 1 / 2 / 3 或点击选择';
  cardRow.innerHTML = '';
  cardChoices.forEach((c, i) => {
    const st = cardStack(c.id);
    const el = document.createElement('div');
    el.className = 'ucard ' + c.r;
    el.innerHTML =
      '<div class="ukey">' + (i + 1) + '</div>' +
      (c.max > 1 && st > 0 ? '<div class="stack">已选 ×' + st + '</div>' : '') +
      '<div class="ui">' + c.icon + '</div>' +
      '<div class="un">' + c.name + '</div>' +
      '<div class="ud">' + c.d + '</div>' +
      '<div class="ur">' + (c.r === 'weapon' ? '★ 武器卡' : c.r === 'rare' ? '稀有' : '普通') + '</div>';
    el.addEventListener('click', () => {
      // 选牌先"按下去"再结算，让手指/鼠标有落点
      if (el.classList.contains('chosen') || cardLock) return;
      cardLock = true;
      el.classList.add('chosen');
      cardRow.classList.add('choosing');
      Sound.play('ui');
      setTimeout(() => {
        cardRow.classList.remove('choosing');
        el.classList.remove('chosen');
        cardLock = false;
        chooseCard(i);
      }, 190);
    });
    cardRow.appendChild(el);
  });
  setMode('cards');
  Sound.play('level');
}
function chooseCard(i){
  if (state.mode !== 'cards' || !cardChoices[i]) return;
  const c = cardChoices[i];
  c.f(player.stats, player);
  player.cardCounts[c.id] = (player.cardCounts[c.id] || 0) + 1;
  state.cardsTaken++;
  state.pendingCards = Math.max(0, state.pendingCards - 1);
  player.hp = Math.min(player.stats.maxHp, player.hp);
  floatText(player.x, player.y - 40, c.name + '！', '#8ef0c8', 18);
  burst(player.x, player.y, '#7ef0c8', 20, 240, 4);
  Sound.play('card');
  showFlash(c.icon + ' ' + c.name, c.r === 'weapon' ? '#ffd166' : c.r === 'rare' ? '#c9b0ff' : '#8fd8ff');
  syncHUD();
  if (state.pendingCards > 0){ openCards(); }
  else {
    // 回到游戏
    setMode('playing');
    Sound.play('ui');
  }
}

/* ============================== 界面切换 ============================== */
const SCREENS = [
  ['menu', scrStart], ['paused', scrPause], ['settings', scrSettings],
  ['cards', scrCards], ['profile', scrProfile],
];
const leaveTimers = new WeakMap();
// 淡出后再 display:none：既保留过渡，又不让隐藏层里的动画继续空转
const fadeTimers = new WeakMap();
function fadeLayer(el, off, ms){
  if (!el) return;
  const t = fadeTimers.get(el);
  if (t){ clearTimeout(t); fadeTimers.delete(el); }
  if (off){
    el.classList.add('off');
    fadeTimers.set(el, setTimeout(() => {
      if (el.classList.contains('off')) el.classList.add('hidden');
      fadeTimers.delete(el);
    }, ms));
  } else {
    el.classList.remove('hidden');
    // 先让浏览器认下 opacity:0 这一帧，再淡入
    requestAnimationFrame(() => el.classList.remove('off'));
  }
}
function showScreen(el, on){
  if (!el) return;
  const t = leaveTimers.get(el);
  if (t){ clearTimeout(t); leaveTimers.delete(el); }
  if (on){
    // 入场：先脱离 display:none，再让 CSS 的 cardIn 走一遍
    el.classList.remove('leaving');
    el.classList.remove('hidden');
  } else {
    if (el.classList.contains('hidden')) return;
    // 出场卡立即移出 flex 流（绝对定位 + 淡出），避免和入场卡并排闪一下
    el.classList.add('leaving');
    leaveTimers.set(el, setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('leaving');
      leaveTimers.delete(el);
    }, 210));
  }
}
function setMode(m){
  state.mode = m;
  for (const [mode, el] of SCREENS) showScreen(el, m === mode);
  fadeLayer(overlay, m === 'playing', 320);
  // 主菜单/设置/档案时不显示游戏内 HUD，画面更干净（淡出，不硬切）
  fadeLayer(hudEl, m === 'menu' || m === 'settings' || m === 'profile', 260);
  if (m !== 'playing'){ Sound.setLaser(false); closeShop(); }
  if (m === 'paused') fillPauseStats();
  if (m === 'profile') renderProfile();
  if (m === 'menu'){
    startTip.textContent = best > 0 ? '历史最高分 ' + best : '第一次下水？放松，红鱼也要瞄准的';
    syncDiffPills();
  }
}
function syncDiffPills(){
  const pills = document.querySelectorAll('#diffPills .pill');
  for (let i = 0; i < pills.length; i++){
    pills[i].classList.toggle('active', pills[i].dataset.diff === SET.difficulty);
  }
}
function fillPauseStats(){
  const s = player.stats;
  pauseStats.innerHTML =
    '<div><span>击杀红鱼</span><b>' + state.kills + '</b></div>' +
    '<div><span>得分</span><b>' + state.score + '</b></div>' +
    '<div><span>武器等级</span><b>Lv.' + state.level + '</b></div>' +
    '<div><span>存活时间</span><b>' + fmtTime(state.elapsed) + '</b></div>' +
    '<div><span>当前枪械</span><b>' + currentWeapon().name + '</b></div>' +
    '<div><span>强化卡</span><b>' + state.cardsTaken + ' 张</b></div>' +
    '<div><span>生命</span><b>' + Math.ceil(player.hp) + ' / ' + Math.round(s.maxHp) + '</b></div>' +
    '<div><span>伤害加成</span><b>×' + s.damage.toFixed(2) + '</b></div>';
}
function startRun(){
  resetWorld();
  setMode('playing');
  Sound.resume(); Sound.startMusic();
  last = performance.now();
  profile.runs++;
  saveProfile();
  checkAchievements();
  pumpAch();
}
function pauseGame(){
  if (state.mode !== 'playing') return;
  setMode('paused');
  Sound.setLaser(false);
}
function resumeGame(){
  if (state.mode !== 'paused') return;
  setMode('playing');
  Sound.resume();
  last = performance.now();
}
function openSettings(from){
  state.settingsReturn = from;
  syncSettingsUI();
  setMode('settings');
}
function closeSettings(){ setMode(state.settingsReturn || 'menu'); }
function syncSettingsUI(){
  $('setSfx').value = Math.round(SET.sfx * 100);
  $('setMusic').value = Math.round(SET.music * 100);
  $('setShake').value = Math.round(SET.shake * 100);
  $('valSfx').textContent = Math.round(SET.sfx * 100) + '%';
  $('valMusic').textContent = Math.round(SET.music * 100) + '%';
  $('valShake').textContent = Math.round(SET.shake * 100) + '%';
  $('setParticles').value = SET.particles;
  $('setDiff').value = SET.difficulty;
  $('setDmg').classList.toggle('on', SET.dmgNumbers);
  syncDiffPills();
}

/* 设置控件绑定 */
$('setSfx').addEventListener('input', e => { SET.sfx = e.target.value / 100; Sound.applyVol(); saveSet(); syncSettingsUI(); });
$('setMusic').addEventListener('input', e => { SET.music = e.target.value / 100; Sound.applyVol(); saveSet(); syncSettingsUI(); });
$('setShake').addEventListener('input', e => { SET.shake = e.target.value / 100; saveSet(); syncSettingsUI(); });
$('setParticles').addEventListener('change', e => { SET.particles = e.target.value; saveSet(); });
$('setDiff').addEventListener('change', e => { SET.difficulty = e.target.value; saveSet(); syncHUD(); syncDiffPills(); });
$('setDmg').addEventListener('click', () => { SET.dmgNumbers = !SET.dmgNumbers; saveSet(); syncSettingsUI(); });
$('btnWipe').addEventListener('click', () => {
  best = 0; try { localStorage.removeItem(BEST_KEY); } catch(e){}
  syncHUD(); Sound.play('ui'); showFlash('最高分已清空', '#8fe6ff');
});
$('btnSettingsBack').addEventListener('click', () => { Sound.play('uiBack'); closeSettings(); });

// 开始界面的难度快捷选择
document.querySelectorAll('#diffPills .pill').forEach(btn => {
  btn.addEventListener('click', () => {
    SET.difficulty = btn.dataset.diff;
    saveSet(); syncDiffPills(); syncHUD();
    Sound.play('ui');
    startTip.textContent = '难度已切换：' + difficulty().name;
  });
});

$('btnStart').addEventListener('click', () => { Sound.play('ui'); startRun(); });
$('btnProfile').addEventListener('click', () => { Sound.play('ui'); setMode('profile'); });
$('btnProfileBack').addEventListener('click', () => { Sound.play('uiBack'); setMode('menu'); });
$('btnProfileWipe').addEventListener('click', () => {
  profile.runs = 0; profile.totalKills = 0; profile.totalDeaths = 0; profile.totalCoins = 0;
  profile.bossKills = 0; profile.bestScore = 0; profile.bestWave = 0;
  profile.achievements = {}; profile.weaponKills = {};
  saveProfile(); renderProfile(); Sound.play('uiBack'); showFlash('档案已清空', '#8fe6ff');
});
$('btnSettingsMenu').addEventListener('click', () => { Sound.play('ui'); openSettings('menu'); });
$('btnResume').addEventListener('click', () => { Sound.play('ui'); resumeGame(); });
$('btnSettingsPause').addEventListener('click', () => { Sound.play('ui'); openSettings('paused'); });
$('btnRestart').addEventListener('click', () => { Sound.play('ui'); startRun(); });
$('btnMenu').addEventListener('click', () => { Sound.play('uiBack'); resetWorld(); setMode('menu'); });

/* ============================== 主循环 ============================== */
let last = performance.now();
let hudT = 0;
let ambientAcc = 0;
function frame(now){
  let dt = (now - last) / 1000;
  last = now;
  if (!isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(0.033, dt);
  // 命中定格：打击瞬间把时间几乎按住，是"手感"最直接的来源
  if (state.hitStop > 0){
    state.hitStop -= dt;
    dt *= 0.06;
  }

  if (state.mode === 'playing') update(dt);
  else { updateAmbient(dt); if (state.shake > 0) state.shake = Math.max(0, state.shake - 40*dt); }

  if (hintT > 0){ hintT -= dt; if (hintT <= 0) pickupHint.style.opacity = '0'; }
  if (achTimer > 0){ achTimer -= dt; if (achTimer <= 0) achToast.classList.remove('show'); }
  pumpAch();

  if (state.mode === 'playing' || state.mode === 'paused'){
    hudT += dt;
    if (hudT >= 0.1){ hudT = 0; syncHUD(); }
    if (state.score > best){
      best = state.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch(e){}
      if (state.score > profile.bestScore){ profile.bestScore = state.score; saveProfile(); }
    }
  }
  // 停在二级界面时把背景渲染降频：既省帧又让界面动画抢到主线程，过渡才跟手
  const idleMode = state.mode !== 'playing' && state.mode !== 'menu';
  if (idleMode){
    ambientAcc += dt;
    if (ambientAcc >= 1 / 24){
      ambientAcc = 0;
      render();
    }
  } else {
    render();
  }
  requestAnimationFrame(frame);
}

/* ============================== 启动 ============================== */
resize();
buildEnv();
resetWorld();
setMode('menu');
syncSettingsUI();
requestAnimationFrame(frame);

/* ============================== 测试接口 ============================== */
window.__fishGame = {
  get state(){
    return {
      mode: state.mode, kills: state.kills, score: state.score, level: state.level,
      killProgress: state.killProgress, pendingCards: state.pendingCards,
      cardsTaken: state.cardsTaken, hp: player.hp, maxHp: player.stats.maxHp,
      shield: player.shield, maxShield: player.stats.shieldMax, alive: player.alive, enemies: enemies.length,
      pBullets: pBullets.length, eBullets: eBullets.length, boss: !!boss,
      gun: currentWeaponKey(), guns: player.guns.slice(), elapsed: Math.round(state.elapsed * 10) / 10,
      parts: parts.length, pickups: pickups.length,
      dashCd: Math.round(player.dashCd * 100) / 100,
      speedNow: Math.round(Math.hypot(player.vx, player.vy)),
      body: Math.round(player.body * 100) / 100, aim: Math.round(player.angle * 100) / 100,
      wave: state.wave, waveState: state.waveState, waveQueue: state.waveQueue,
      waveT: Math.round(state.waveT * 10) / 10, coins: state.coins, rageT: Math.round(state.rageT),
      shopOffer: state.shopOffer.slice(), shopSold: state.shopSold.slice(),
      bossKills: state.bossKills,
      combo: state.combo, comboT: Math.round(state.comboT * 100) / 100,
      bestCombo: state.bestCombo, hitStop: Math.round(state.hitStop * 1000) / 1000,
      marks: marks.length,
    };
  },
  get choices(){ return cardChoices.map(c => ({ id: c.id, name: c.name, r: c.r })); },
  get stats(){ return Object.assign({}, player.stats); },
  get profile(){ return JSON.parse(JSON.stringify(profile)); },
  get achievements(){ return ACHIEVEMENTS.map(a => ({ id:a.id, name:a.name, got: !!profile.achievements[a.id] })); },
  get achQueue(){ return achQueue.length; },
  get achToastShown(){ return achToast.classList.contains('show'); },
  resetProfile(){
    profile.runs = 0; profile.totalKills = 0; profile.totalDeaths = 0; profile.totalCoins = 0;
    profile.bossKills = 0; profile.bestScore = 0; profile.bestWave = 0;
    profile.achievements = {}; profile.weaponKills = {};
    achQueue.length = 0; achTimer = 0; achToast.classList.remove('show');
    saveProfile();
  },
  get enemyList(){ return enemies.map(e => ({ id:e.id, x:e.x, y:e.y, hp:e.hp, maxHp:e.maxHp, r:e.r, type:e.type })); },
  CFG: { PLAYER_MAX_HP:20, ENEMY_HP:3, KILLS_PER_LEVEL:20, BOSS_WAVE_EVERY:5 },
  WEAPONS, CARDS, GUN_ORDER, SHOP_ITEMS,
  buyShop(i){ return buyShop(i); },
  skipIntermission(){ skipIntermission(); },
  addCoins(n){ state.coins += (n || 1); syncHUD(); },
  forceWaveEnd(){ enemies.length = 0; if (boss) boss = null; },
  nextWave(){ skipIntermission(); },
  start(){ startRun(); },
  pause(){ pauseGame(); },
  resume(){ resumeGame(); },
  menu(){ resetWorld(); setMode('menu'); },
  chooseCard(i){ chooseCard(i); },
  dash(){ return tryDash(); },
  movePlayer(x, y){ player.x = x; player.y = y; player.vx = 0; player.vy = 0; },
  addKills(n){
    for (let i = 0; i < (n || 1); i++){
      state.kills++; state.killProgress++; state.score += 10;
      if (state.killProgress >= 20){ state.killProgress -= 20; state.level++; }
      if (state.kills >= state.nextBoss && !boss){ state.nextBoss += 80; spawnBoss(); }
    }
    syncHUD();
  },
  hurtPlayer(n){
    if (!player.alive) return;
    player.invuln = 0;
    for (let i = 0; i < (n || 1); i++){ player.invuln = 0; damagePlayer(1, 0, 0); }
    syncHUD();
  },
  heal(n){ player.hp = Math.min(player.stats.maxHp, player.hp + (n || 99)); syncHUD(); },
  setCombo(n){ state.combo = Math.max(0, n | 0); state.comboT = state.combo > 0 ? 2.4 : 0; state.bestCombo = Math.max(state.bestCombo, state.combo); },
  invuln(sec){ player.invuln = Math.max(player.invuln, sec || 5); },
  spawn(n, type){ const out = []; for (let i = 0; i < (n || 1); i++) out.push(spawnEnemy(type || null, true).type); return out; },
  spawnBoss(){ spawnBoss(); return !!boss; },
  unlockAll(){ GUN_ORDER.forEach(g => { if (!player.guns.includes(g)) player.guns.push(g); }); buildGunBar(); syncHUD(); },
  switchGun(i){ switchGun(i, true); },
  grant(id){
    const c = CARDS.concat(WEAPON_CARDS).find(x => x.id === id);
    if (!c) return false;
    c.f(player.stats, player);
    player.cardCounts[c.id] = (player.cardCounts[c.id] || 0) + 1;
    syncHUD(); return true;
  },
  SET, Sound,
};
})();
