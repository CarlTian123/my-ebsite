/* ============================================================================
   NEXUS · Signature Launch
   A 意图 → B 空间收敛 → C 品牌揭示 → D 门开 → E 抵达

   纪律：
   · 不显示假进度条，不含任何固定"假装加载"的延时
   · E 段只在 iframe 真正 ready 后执行；失败则给出可操作的错误面
   · 动画全程不阻塞游戏本身（iframe 在遮罩之下已经在加载）
   · 可跳过（Esc / 空格 / 跳过按钮），缩短而不破坏收束
   · 同一会话内重复启动走快速过渡
   ========================================================================== */

import { h, icon, reduceMotion } from './core.js';

const GATE_SVG = `
<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
  <path class="g-back" d="M26 79 L26 28 A9 9 0 0 1 35 19 L55 19 A9 9 0 0 1 64 28 L64 79"
        stroke="currentColor" stroke-width="4.4" stroke-linecap="butt" stroke-linejoin="round"/>
  <path class="g-front" d="M56 101 L56 50 A9 9 0 0 1 65 41 L85 41 A9 9 0 0 1 94 50 L94 101"
        stroke="currentColor" stroke-width="6.2" stroke-linecap="butt" stroke-linejoin="round"/>
  <rect class="g-light" x="38.6" y="61" width="4.8" height="28" rx="2.4"/>
</svg>`;

const T = {
  veilIn: 220,
  flight: 520,
  capIn: 240,
  holdCard: 110,
  cardOut: 300,
  draw: 420,
  drawStagger: 90,
  nameIn: 380,
  holdBrand: 220,
  doorsIn: 520,
  veilOut: 200,
  doorsOut: 620
};

const FAST = {
  veilIn: 120,
  fastBrand: 200,
  doorsOut: 420
};

let el = null;             // 复用的 overlay
let skipResolve = null;    // 跳过闸门
let seenThisSession = new Set();

function build() {
  const cardImg = h('img', { alt: '', draggable: 'false' });
  const cardTitle = h('b', null, '');
  const cardSub = h('span', null, '');
  const cardCap = h('div', { class: 'launch__card-cap' }, cardTitle, cardSub);
  const card = h('div', { class: 'launch__card' }, cardImg, cardCap);

  const gate = h('div', {
    class: 'launch__gate',
    html: GATE_SVG
  });
  const brandName = h('div', { class: 'launch__brand-name' },
    h('b', null, 'Byebye Games Engine'),
    h('span', null, 'v1.0')
  );
  const brand = h('div', { class: 'launch__brand' }, gate, brandName);

  const doorL = h('div', { class: 'launch__door launch__door--l' });
  const doorR = h('div', { class: 'launch__door launch__door--r' });
  const doors = h('div', { class: 'launch__doors' }, doorL, doorR);

  const veil = h('div', { class: 'launch__veil' });

  const skipBtn = h('button', {
    class: 'launch__skip',
    type: 'button',
    onclick: () => doSkip()
  }, '跳过 · ESC');

  const waitLine = h('span', { class: 'mono launch__wait', role: 'status' }, '正在载入游戏…');
  const hint = h('div', { class: 'launch__hint' },
    h('span', { class: 'mono' }, 'Byebye Games Engine v1.0'),
    waitLine,
    skipBtn
  );

  const stage = h('div', { class: 'launch__stage' }, veil, card, brand, doors);
  const root = h('div', {
    class: 'launch',
    hidden: true,
    role: 'status',
    'aria-live': 'polite',
    'aria-label': '正在进入游戏'
  }, stage, hint);

  document.body.append(root);
  return { root, stage, veil, card, cardImg, cardTitle, cardSub, cardCap, brand, gate, brandName, doors, doorL, doorR, hint, skipBtn, waitLine };
}

function ensure() {
  if (!el) el = build();
  return el;
}

function doSkip() {
  if (skipResolve) {
    const r = skipResolve;
    skipResolve = null;
    r();
  }
}

function skipGate() {
  return new Promise((resolve) => {
    skipResolve = resolve;
  });
}

/* 让某个 await 提速：等待可被打断的动画 */
function play(animation) {
  try {
    return animation.finished.catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

/* ---------------------------------------------------------------- 主体 */
/**
 * @param {object} opt
 * @param {object} opt.game      游戏对象
 * @param {DOMRect|null} opt.from 来源矩形（卡片）。null 则从屏幕中央略小处起始
 * @param {boolean} opt.fast     重复启动走加速路径
 * @param {Promise<{ok:boolean,reason?:string}>} opt.ready 真实就绪信号
 * @returns {Promise<{ok:boolean,reason?:string}>}
 */
export async function performLaunch({ game, from, fast = false, ready }) {
  const u = ensure();
  const reduced = reduceMotion();
  const already = seenThisSession.has(game.slug);
  const quick = fast || already || reduced;

  el.root.hidden = false;
  el.root.classList.add('is-active');
  el.cardImg.src = game.cover;
  el.cardImg.alt = '';
  el.cardTitle.textContent = game.title + ' · ' + game.titleZh;
  el.cardSub.textContent = game.subtitle;

  document.body.classList.add('is-locked');
  el.hint.classList.remove('is-in');
  setTimeout(() => el.hint.classList.add('is-in'), quick ? 140 : 700);

  const skipPromise = skipGate();
  let skipped = false;
  skipPromise.then(() => { skipped = true; });

  const keyHandler = (e) => {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      doSkip();
    }
  };
  window.addEventListener('keydown', keyHandler);

  const wasSeen = already;
  seenThisSession.add(game.slug);

  /* 真实就绪信号如果很快就报失败（入口 404 / 资源缺失），不要先播一段
     再报错——立刻把控制权交回调用方去显示错误。 */
  if (!quick) {
    const early = await Promise.race([
      ready.then((r) => ({ r })),
      new Promise((res) => setTimeout(() => res(null), 700))
    ]);
    if (early && early.r && early.r.ok === false) {
      window.removeEventListener('keydown', keyHandler);
      document.body.classList.remove('is-locked');
      el.root.classList.remove('is-active');
      el.root.hidden = true;
      return early.r;
    }
  }

  try {
    if (quick) {
      await quickPath(u, { skipped: () => skipped, skipPromise, reduced });
    } else {
      await fullPath(u, { from, skipped: () => skipped, skipPromise });
    }

    /* ---- E 段：等真实就绪 ----
       两道保险，都不伪造进度：
       ① 2.6s 后把「正在载入游戏…」显示出来，用户知道网络在做事；
       ② 20s 硬超时照样开门——此时交给播放器自己的「正在进入…」状态，
          而不是让用户对着一整块黑门无限等下去。 */
    el.hint.classList.add('is-in');
    const slowTimer = setTimeout(() => {
      el.waitLine.classList.add('is-in');
    }, 1200);
    const watchdog = new Promise((res) => {
      setTimeout(() => res({ ok: true, timedOutByWatchdog: true }), 20000);
    });
    let result;
    try {
      result = await Promise.race([
        ready,
        skipPromise.then(() => ({ ok: true, timedOutBySkip: true })),
        watchdog
      ]);
    } finally {
      clearTimeout(slowTimer);
      el.waitLine.classList.remove('is-in');
    }

    if (!result || result.ok === false) {
      await abortDoors(u, quick);
      return result || { ok: false, reason: 'unknown' };
    }

    await openDoors(u, quick);
    return { ok: true };
  } finally {
    window.removeEventListener('keydown', keyHandler);
    document.body.classList.remove('is-locked');
    el.root.classList.remove('is-active');
    el.hint.classList.remove('is-in');
    requestAnimationFrame(() => { if (el && !el.root.classList.contains('is-active')) el.root.hidden = true; });
    skipResolve = null;
  }
}

/* ---- 完整五段（A/B/C/D 前半） ---- */
async function fullPath(u, { from, skipped, skipPromise }) {
  const rect = from || {
    left: window.innerWidth / 2 - 140,
    top: window.innerHeight / 2 - 90,
    width: 280,
    height: 176
  };

  const targetW = Math.min(window.innerWidth * 0.62, 780);
  const targetH = targetW * 0.5625;
  const targetLeft = (window.innerWidth - targetW) / 2;
  const targetTop = (window.innerHeight - targetH) / 2;

  /* A/B：卡片从来源矩形连续移动到中央，而不是简单缩放 */
  Object.assign(u.card.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: '16px',
    opacity: '1'
  });

  u.veil.style.opacity = '0';
  u.brand.style.opacity = '0';
  u.doors.style.opacity = '0';
  u.doorL.style.transform = 'translateX(-101%)';
  u.doorR.style.transform = 'translateX(101%)';

  const veilIn = u.veil.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: T.veilIn, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards'
  });

  const flight = u.card.animate([
    { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: '16px' },
    { left: `${targetLeft}px`, top: `${targetTop}px`, width: `${targetW}px`, height: `${targetH}px`, borderRadius: '20px' }
  ], { duration: T.flight, easing: 'cubic-bezier(.16,.84,.26,1)', fill: 'forwards' });

  await Promise.all([play(veilIn), play(flight)]);

  u.cardCap.style.opacity = '1';
  const capIn = u.cardCap.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
    { duration: T.capIn, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' });

  await Promise.race([play(capIn), waitSkip(skipPromise)]);
  await sleep(T.holdCard, skipPromise);

  /* C：品牌揭示 */
  const cardOut = u.card.animate([
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(0.955)' }
  ], { duration: T.cardOut, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  await Promise.race([play(cardOut), waitSkip(skipPromise)]);
  u.card.style.opacity = '0';

  u.brand.style.opacity = '1';
  /* 品牌段里隐藏右下角提示，避免和品牌名两处重复 */
  u.hint.classList.remove('is-in');
  u.hint.style.visibility = 'hidden';
  drawGate(u.gate);
  u.brandName.style.opacity = '0';

  const brandIn = u.brand.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 200, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards'
  });
  await play(brandIn);

  const nameIn = u.brandName.animate([
    { opacity: 0, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'none' }
  ], { duration: T.nameIn, delay: 260, easing: 'cubic-bezier(.16,.84,.26,1)', fill: 'forwards' });
  await Promise.race([play(nameIn), waitSkip(skipPromise)]);
  await sleep(T.holdBrand, skipPromise);

  /* D 前半：两扇门从两侧合拢，盖住品牌 */
  u.doors.style.opacity = '1';
  const closeDoors = Promise.all([
    play(u.doorL.animate([{ transform: 'translateX(-101%)' }, { transform: 'translateX(0)' }],
      { duration: T.doorsIn, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' })),
    play(u.doorR.animate([{ transform: 'translateX(101%)' }, { transform: 'translateX(0)' }],
      { duration: T.doorsIn, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }))
  ]);
  await Promise.race([closeDoors, waitSkip(skipPromise)]);

  const brandOut = u.brand.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 180, easing: 'linear', fill: 'forwards'
  });
  /* 门已合上，遮罩可以退场，让"门"成为唯一的遮挡 */
  const veilOut = u.veil.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: T.veilOut, easing: 'linear', fill: 'forwards'
  });
  await Promise.all([play(brandOut), play(veilOut)]);
  u.hint.style.visibility = '';
}

/* ---- 快速路径（重复启动 / 简化动效） ---- */
async function quickPath(u, { skipped, skipPromise, reduced }) {
  u.card.style.opacity = '0';
  u.brand.style.opacity = '0';
  u.doors.style.opacity = '1';
  u.doorL.style.transform = 'translateX(0)';
  u.doorR.style.transform = 'translateX(0)';

  const d = reduced ? 90 : FAST.veilIn;
  const t = u.veil.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: d, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards'
  });
  u.doors.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: reduced ? 60 : 180, easing: 'linear', fill: 'forwards'
  });
  await Promise.race([play(t), waitSkip(skipPromise)]);

  if (!reduced) {
    u.brand.style.opacity = '1';
    drawGate(u.gate, 260);
    u.brandName.style.opacity = '1';
    u.brandName.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FAST.fastBrand, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards'
    });
    u.doors.style.opacity = '0';
    await sleep(FAST.fastBrand, skipPromise);
  }
  const veilOut = u.veil.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: reduced ? 60 : 160, easing: 'linear', fill: 'forwards'
  });
  u.brand.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' });
  await play(veilOut);
}

/* ---- E：门向两侧打开，露出真实游戏画面 ---- */
async function openDoors(u, quick) {
  const dur = quick ? (reduceMotion() ? 120 : FAST.doorsOut) : T.doorsOut;
  u.doors.style.opacity = '1';
  u.doorL.style.transform = 'translateX(0)';
  u.doorR.style.transform = 'translateX(0)';
  drawGate(u.gate, 0);

  await Promise.all([
    play(u.doorL.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-101%)' }],
      { duration: dur, easing: 'cubic-bezier(.16,.84,.26,1)', fill: 'forwards' })),
    play(u.doorR.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(101%)' }],
      { duration: dur, easing: 'cubic-bezier(.16,.84,.26,1)', fill: 'forwards' }))
  ]);
  u.doors.style.opacity = '0';
}

/* ---- 失败：门不合上，直接收敛，露出播放器的错误面 ---- */
async function abortDoors(u, quick) {
  /* 启动失败：整块暗场一起退掉，把「入口不可用」的反馈让出来。
     不按阶段做局部退场——失败可能发生在任何一段。 */
  u.root.classList.remove('is-active');
  const t = u.root.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: quick ? 110 : 200, easing: 'linear', fill: 'forwards'
  });
  await play(t);
  u.root.hidden = true;
  u.root.getAnimations?.().forEach((a) => a.cancel());
}

/* ---- 品牌门线：逐段描出 + 绿光扫过 ---- */
function drawGate(gate, scale = 1) {
  const lines = gate.querySelectorAll('.g-back, .g-front');
  lines.forEach((p, i) => {
    const len = p.getTotalLength ? p.getTotalLength() : 260;
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
    p.style.fill = 'none';
    p.style.stroke = 'currentColor';
    p.getAnimations?.().forEach((a) => a.cancel());
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: T.draw * scale,
      delay: i * T.drawStagger * scale,
      easing: 'cubic-bezier(.3,.6,.2,1)',
      fill: 'forwards'
    });
  });
  const light = gate.querySelector('.g-light');
  if (light) {
    light.style.fill = 'var(--accent)';
    light.style.transformBox = 'fill-box';
    light.style.transformOrigin = 'center';
    light.getAnimations?.().forEach((a) => a.cancel());
    light.animate([
      { transform: 'scaleY(0)', opacity: 0 },
      { transform: 'scaleY(1)', opacity: 1 }
    ], {
      duration: 320 * scale,
      delay: 300 * scale,
      easing: 'cubic-bezier(.16,.84,.26,1)',
      fill: 'forwards'
    });
  }
}

/* ---- 小工具 ---- */
function sleep(ms, skipPromise) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(); } }, ms);
    skipPromise.then(() => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    });
  });
}
function waitSkip(skipPromise) {
  return new Promise((resolve) => skipPromise.then(resolve));
}

/* 强制收敛：路由被中断（例如启动后立刻返回）时调用 */
export function forceCloseLaunch() {
  if (!el) return;
  skipResolve = null;
  document.body.classList.remove('is-locked');
  el.root.classList.remove('is-active');
  el.root.hidden = true;
  el.hint.classList.remove('is-in');
  if (el.veil.getAnimations) el.veil.getAnimations().forEach((a) => a.cancel());
}

export function resetLaunchMemory() {
  seenThisSession = new Set();
}
