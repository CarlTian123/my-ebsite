/* ============================================================================
   NEXUS · core
   DOM 工具 / 图标 / 持久化状态 / 动效能力探测 / 极简 hash 路由
   ========================================================================== */

/* ---------------------------------------------------------------- DOM */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * 轻量元素构造器。
 * h('div', { class: 'x', onclick: fn }, child, 'text')
 * 文本子节点永远走 textContent（不会误解析成 HTML）。
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(3)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* ---------------------------------------------------------------- 图标 */
const ICONS = {
  play: '<path d="M5 3.5v11l9-5.5-9-5.5Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5.5 3.5v11M10.5 3.5v11" stroke-width="2"/>',
  back: '<path d="M10 3 5 8l5 5"/><path d="M5 8h7"/>',
  chevronRight: '<path d="M6 3.5 10.5 8 6 12.5"/>',
  arrowUpRight: '<path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4"/>',
  search: '<circle cx="7.4" cy="7.4" r="4.4"/><path d="M10.7 10.7 14 14"/>',
  heart: '<path d="M8 13.2S2.6 10 2.6 6.4A2.9 2.9 0 0 1 8 4.7a2.9 2.9 0 0 1 5.4 1.7C13.4 10 8 13.2 8 13.2Z"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.9v1.6M8 12.5v1.6M2.5 8h1.6M11.9 8h1.6M4.1 4.1l1.1 1.1M10.8 10.8l1.1 1.1M11.9 4.1l-1.1 1.1M5.2 10.8l-1.1 1.1"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.6v1.4M8 13v1.4M2.6 8h1.4M12 8h1.4M4.3 4.3l1 1M10.7 10.7l1 1M11.7 4.3l-1 1M5.3 10.7l-1 1"/>',
  moon: '<path d="M13 9.4A5.6 5.6 0 0 1 6.6 3 5.7 5.7 0 1 0 13 9.4Z"/>',
  expand: '<path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10"/>',
  restart: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13.4 2.6v2.6h-2.6"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  check: '<path d="M3.2 8.4 6.4 11.5 12.8 4.8"/>',
  download: '<path d="M8 2.5v7.5M4.8 7.2 8 10.5l3.2-3.3M2.8 13h10.4"/>',
  sliders: '<path d="M2.8 5h4.4M10.4 5h2.8M2.8 11h2.8M8.8 11h4.4"/><circle cx="9.4" cy="5" r="1.5"/><circle cx="7.8" cy="11" r="1.5"/>',
  library: '<rect x="2.5" y="3" width="3.2" height="10" rx="1"/><rect x="6.6" y="3" width="3.2" height="10" rx="1"/><path d="M11.6 4.2l2.1 8.3"/>',
  clock: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.2 1.5"/>',
  home: '<path d="M2.6 7.2 8 2.6l5.4 4.6V13a.6.6 0 0 1-.6.6h-3v-3.8H6.2v3.8h-3A.6.6 0 0 1 2.6 13Z"/>',
  gamepad: '<rect x="1.8" y="4.6" width="12.4" height="6.8" rx="3.2"/><path d="M5 8h1.8M5.9 7.1v1.8M10.2 7.6h.01M11.4 8.8h.01"/>',
  alert: '<path d="M8 2.8 14 12.6H2Z"/><path d="M8 6.4v3.1M8 11.2h.01"/>',
  sparkle: '<path d="M8 2.2 9.5 6.5 13.8 8l-4.3 1.5L8 13.8 6.5 9.5 2.2 8l4.3-1.5Z"/>',
  filter: '<path d="M2.6 3.6h10.8L9.4 8.4v4.4L6.6 11.6V8.4Z"/>'
};

export function icon(name, extra = '') {
  const body = ICONS[name] || '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (extra) svg.setAttribute('class', extra);
  svg.innerHTML = body;
  return svg;
}

/* 收藏图标：描边 + 填充两段，动画结束与真实状态一致 */
export function favIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'fav-ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path class="fav-fill" d="M8 13.6S2.2 10.2 2.2 6.4A3.1 3.1 0 0 1 8 4.6a3.1 3.1 0 0 1 5.8 1.8C13.8 10.2 8 13.6 8 13.6Z"/>' +
    '<path class="fav-line" d="M8 13.6S2.2 10.2 2.2 6.4A3.1 3.1 0 0 1 8 4.6a3.1 3.1 0 0 1 5.8 1.8C13.8 10.2 8 13.6 8 13.6Z"/>';
  return svg;
}

/* ---------------------------------------------------------------- 存储 */
const KEY = 'nexus.state.v1';

const memoryStore = new Map();
function detectStorage() {
  try {
    const k = '__nexus_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return {
      getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
      setItem: (k, v) => memoryStore.set(k, v),
      removeItem: (k) => memoryStore.delete(k),
      __fallback: true
    };
  }
}
export const storage = detectStorage();
export const isPersistent = !storage.__fallback;

const DEFAULTS = {
  favorites: [],
  recent: [],
  settings: { theme: 'dark', motion: 'auto', tilt: true },
  launchSeen: []
};

function readState() {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((s) => typeof s === 'string') : [],
      recent: Array.isArray(parsed.recent)
        ? parsed.recent.filter((r) => r && typeof r.slug === 'string').slice(0, 16)
        : [],
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      launchSeen: Array.isArray(parsed.launchSeen) ? parsed.launchSeen.filter((s) => typeof s === 'string') : []
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const state = readState();

let saveQueued = false;
export function save() {
  if (saveQueued) return;
  saveQueued = true;
  requestAnimationFrame(() => {
    saveQueued = false;
    try {
      storage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 配额或权限问题：内存态仍然可用，不打断用户 */
    }
  });
}

/* 订阅：任何持久化状态变化后通知界面 */
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function commit(mutator) {
  mutator(state);
  save();
  listeners.forEach((fn) => {
    try { fn(state); } catch { /* 单个订阅者出错不影响其他 */ }
  });
}

export function toggleFavorite(slug) {
  let added = false;
  commit((s) => {
    const i = s.favorites.indexOf(slug);
    if (i >= 0) s.favorites.splice(i, 1);
    else { s.favorites.unshift(slug); added = true; }
  });
  return added;
}

export function pushRecent(slug) {
  commit((s) => {
    s.recent = s.recent.filter((r) => r.slug !== slug);
    s.recent.unshift({ slug, at: Date.now() });
    s.recent = s.recent.slice(0, 12);
  });
}

export function clearHistory() {
  commit((s) => { s.recent = []; });
}

export function resetAll() {
  commit((s) => {
    s.favorites = [];
    s.recent = [];
    s.settings = { ...DEFAULTS.settings };
  });
}

/* ---------------------------------------------------------------- 主题 / 动效 */
export function applyTheme() {
  const t = state.settings.theme;
  const html = document.documentElement;
  if (t === 'auto') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', t);
  const meta = $('meta[name="theme-color"]');
  if (meta) {
    const light = t === 'light' ||
      (t === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
    meta.setAttribute('content', light ? '#eff1ec' : '#080a0c');
  }
}

export function applyMotionPref() {
  document.documentElement.setAttribute('data-motion', state.settings.motion === 'reduced' ? 'reduced' : 'full');
}

export const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
export function reduceMotion() {
  return state.settings.motion === 'reduced' || (state.settings.motion === 'auto' && mqReduce.matches);
}

/* ---------------------------------------------------------------- 工具 */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function formatRelative(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const d = Math.floor(hrs / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

/* ---------------------------------------------------------------- 路由 */
export const router = (() => {
  const listeners = new Set();
  let current = null;
  const scrollPositions = new Map();

  function parse(hash) {
    const raw = (hash || '').replace(/^#/, '') || '/';
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    const [clean] = path.split('?');
    const parts = clean.split('/').filter(Boolean);
    return { path: clean, parts };
  }

  function emit() {
    const info = parse(location.hash);
    if (current === info.path) return;
    const prev = current;
    current = info.path;
    listeners.forEach((fn) => {
      try { fn(info, prev); } catch (err) { console.error('[router]', err); }
    });
  }

  window.addEventListener('hashchange', () => {
    const prevKey = current;
    if (prevKey) scrollPositions.set(prevKey, window.scrollY);
    emit();
  });

  return {
    start() {
      current = null;
      emit();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    navigate(path, { replace = false } = {}) {
      const target = `#${path}`;
      if (location.hash === target) {
        emit();
        return;
      }
      if (replace) location.replace(target);
      else location.hash = target;
    },
    /* 视图刚插入时高度可能还不够（封面图未解码），分几拍重试；
       期间用户自己滚动过就不再抢方向盘。 */
    restoreScroll(path) {
      const y = scrollPositions.get(path) || 0;
      let applied = -1;
      const apply = () => {
        if (applied >= 0 && Math.abs(window.scrollY - applied) > 4) return; // 用户已接管
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        applied = Math.min(y, max);
        window.scrollTo(0, applied);
      };
      apply();
      requestAnimationFrame(apply);
      setTimeout(apply, 160);
      setTimeout(apply, 420);
    },
    current: () => current
  };
})();

/* ---------------------------------------------------------------- 键盘导航标记 */
export function initInputModality() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') document.body.classList.add('kb-nav');
  }, true);
  window.addEventListener('pointerdown', () => {
    document.body.classList.remove('kb-nav');
  }, true);
}
