/* ============================================================================
   NEXUS · 应用外壳
   数据加载 / 导航 / 路由 / 背景层 / 搜索入口 / 全局错误
   ========================================================================== */

import {
  $, h, icon, router, state, applyTheme, applyMotionPref, reduceMotion,
  rafThrottle, initInputModality, mqReduce
} from './core.js';
import { renderHome, renderDetail, renderCollection, renderSettings, renderStudio } from './views.js';
import { renderPlayer, teardownPlayer, pendingSource } from './player.js';
import { openSearch, bindHotkey, close as closeSearch, isSearchOpen } from './search.js';
import { toast } from './ui.js';

const NEXUS_MARK = `
<svg class="nav__mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path d="M9 9 L24.5 24.5" stroke="currentColor" stroke-width="5.2" stroke-linecap="butt"/>
  <path d="M55 9 L39.5 24.5" stroke="currentColor" stroke-width="5.2" stroke-linecap="butt"/>
  <path d="M9 55 L24.5 39.5" stroke="currentColor" stroke-width="5.2" stroke-linecap="butt"/>
  <path d="M55 55 L39.5 39.5" stroke="currentColor" stroke-width="5.2" stroke-linecap="butt"/>
  <path d="M32 24.6 L39.4 32 L32 39.4 L24.6 32 Z" fill="currentColor"/>
</svg>`;

let GAMES = [];
let SITE = {};
let currentView = null;
let navEl = null;
let searchBtn = null;

/* ---------------------------------------------------------------- 背景六层 */
function buildBackground() {
  const space = h('div', { class: 'bg-space', 'aria-hidden': 'true' },
    h('div', { class: 'bg-base' }),
    h('div', { class: 'bg-wash' }),
    h('div', { class: 'bg-aurora' }),
    h('div', { class: 'bg-grain' }),
    h('div', { class: 'bg-vignette' }),
    h('div', { class: 'bg-field' })
  );
  document.body.prepend(space);

  /* 视差与焦点光场：只改 CSS 变量，全部走 transform */
  const onScroll = rafThrottle(() => {
    if (reduceMotion()) return;
    const y = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
    document.documentElement.style.setProperty('--py', y.toFixed(3));
    document.documentElement.style.setProperty('--px', (window.scrollX / 800).toFixed(3));
    navEl?.classList.toggle('is-scrolled', window.scrollY > 24);
  });
  window.addEventListener('scroll', onScroll, { passive: true });

  let fx = 0.5, fy = 0.4;
  let cx = 0.5, cy = 0.4;
  let raf = 0;
  const loop = () => {
    cx += (fx - cx) * 0.06;
    cy += (fy - cy) * 0.06;
    document.documentElement.style.setProperty('--fx', cx.toFixed(3));
    document.documentElement.style.setProperty('--fy', cy.toFixed(3));
    if (Math.abs(fx - cx) > 0.001 || Math.abs(fy - cy) > 0.001) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  window.addEventListener('pointermove', (e) => {
    if (reduceMotion()) return;
    fx = e.clientX / window.innerWidth;
    fy = e.clientY / window.innerHeight;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
}

/* ---------------------------------------------------------------- 导航 */
function buildNav() {
  searchBtn = h('button', {
    class: 'nav__search',
    type: 'button',
    'aria-label': '搜索游戏（⌘K）',
    onclick: (e) => openSearch({ anchor: e.currentTarget, games: GAMES })
  }, icon('search'), h('span', null, '搜索游戏'), h('kbd', { class: 'nav__kbd' }, '⌘K'));

  navEl = h('nav', { class: 'nav', id: 'nav', 'aria-label': '主导航' },
    h('a', { class: 'nav__brand', href: '#/', 'aria-label': 'NEXUS 首页' },
      h('span', { html: NEXUS_MARK }).firstElementChild,
      h('span', { class: 'nav__word' }, 'NEXUS')
    ),
    h('div', { class: 'nav__links' },
      h('a', { class: 'nav__link', href: '#/', dataset: { nav: 'root' } }, 'Discover'),
      h('a', { class: 'nav__link', href: '#/library', dataset: { nav: '/library' } }, 'Library'),
      h('a', { class: 'nav__link', href: '#/recent', dataset: { nav: '/recent' } }, 'Recently Played')
    ),
    h('div', { class: 'nav__actions' },
      searchBtn,
      h('a', { class: 'icon-btn', href: '#/favorites', 'aria-label': '收藏', dataset: { nav: '/favorites' } }, icon('heart')),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': '设置', dataset: { nav: '/settings' } }, icon('gear'))
    )
  );
  document.body.append(navEl);

  const tabbar = h('nav', { class: 'tabbar', 'aria-label': '底部导航' },
    h('a', { class: 'tabbar__item', href: '#/', dataset: { nav: 'root' } }, icon('home'), '发现'),
    h('a', { class: 'tabbar__item', href: '#/library', dataset: { nav: '/library' } }, icon('library'), '游戏库'),
    h('a', { class: 'tabbar__item', href: '#/recent', dataset: { nav: '/recent' } }, icon('clock'), '最近'),
    h('a', { class: 'tabbar__item', href: '#/favorites', dataset: { nav: '/favorites' } }, icon('heart'), '收藏'),
    h('a', { class: 'tabbar__item', href: '#/settings', dataset: { nav: '/settings' } }, icon('gear'), '设置')
  );
  document.body.append(tabbar);
}

/* ---------------------------------------------------------------- 页脚 */
function buildFooter() {
  return h('footer', { class: 'site-foot' },
    h('div', { class: 'container site-foot__inner' },
      h('div', { class: 'site-foot__brand' },
        h('span', { html: NEXUS_MARK }).firstElementChild,
        h('b', null, 'NEXUS')
      ),
      h('div', { class: 'site-foot__links' },
        h('a', { href: '#/library' }, '全部游戏'),
        h('a', { href: '#/studio' }, '品牌'),
        h('a', { href: '#/settings' }, '设置')
      ),
      h('p', { class: 'site-foot__note' },
        `${SITE.studio || 'Hello Games Studio'} · ${SITE.engine || 'Byebye Games Engine v1.0'}`)
    )
  );
}

/* ---------------------------------------------------------------- 板块高亮 */
function markCurrent(path) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const key = el.dataset.nav;
    const on = key === 'root' ? path === '/' : path.startsWith(key);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

/* ---------------------------------------------------------------- 404 */
function notFound(what = '页面') {
  return h('div', { class: 'page' },
    h('div', { class: 'collection container' },
      h('span', { class: 'eyebrow' }, 'NOT FOUND'),
      h('h1', { class: 'collection__title', style: { marginTop: '12px' } }, '这里什么都没有'),
      h('p', { class: 'collection__desc', style: { marginTop: '12px' } },
        `${what}不存在，可能是地址打错了，或者它已经被移走。`),
      h('div', { class: 'detail__actions', style: { marginTop: 'var(--sp-6)' } },
        h('a', { class: 'btn btn--primary', href: '#/' }, icon('home'), '回到首页'),
        h('a', { class: 'btn btn--ghost', href: '#/library' }, '看全部游戏')
      )
    )
  );
}

/* ---------------------------------------------------------------- 渲染 */
function setView(node, { chrome = true } = {}) {
  if (currentView && currentView._cleanup) {
    try { currentView._cleanup(); } catch { /* ignore */ }
  }
  const app = $('#app');
  app.replaceChildren(node);
  currentView = node;
  document.body.classList.toggle('is-playing', !chrome);
  if (navEl) navEl.hidden = !chrome;
  const tabbar = $('.tabbar');
  if (tabbar) tabbar.hidden = !chrome;
}

function renderRoute(info, prev) {
  const [first, second] = info.parts;
  const path = info.path;
  markCurrent(path);
  closeSearch({ restoreFocus: false });

  if (!first) {
    document.title = 'NEXUS — Ultimate Web Gaming Platform';
    const node = h('div', null, renderHome({ games: GAMES }), buildFooter());
    setView(node);
    router.restoreScroll('/');
    return;
  }

  if (first === 'game' && second) {
    const game = GAMES.find((g) => g.slug === second);
    if (!game) { document.title = '找不到这款游戏 — NEXUS'; setView(h('div', null, notFound('这款游戏'), buildFooter())); return; }
    document.title = `${game.title} · ${game.titleZh} — NEXUS`;
    setView(h('div', null, renderDetail({ game, games: GAMES }), buildFooter()));
    router.restoreScroll(path);
    return;
  }

  if (first === 'play' && second) {
    const game = GAMES.find((g) => g.slug === second);
    if (!game) { document.title = '找不到这款游戏 — NEXUS'; setView(h('div', null, notFound('这款游戏'), buildFooter())); return; }
    document.title = `${game.title} — 正在游玩`;
    setView(h('div'), { chrome: false });
    renderPlayer({ game, mount: { source: pendingSource() } });
    return;
  }

  if (first === 'library' || first === 'recent' || first === 'favorites') {
    const titles = { library: '全部游戏', recent: '最近游玩', favorites: '收藏' };
    document.title = `${titles[first]} — NEXUS`;
    setView(h('div', null, renderCollection({ games: GAMES, kind: first }), buildFooter()));
    router.restoreScroll(path);
    return;
  }

  if (first === 'settings') {
    document.title = '设置 — NEXUS';
    setView(h('div', null, renderSettings({ games: GAMES }), buildFooter()));
    router.restoreScroll(path);
    return;
  }

  if (first === 'studio') {
    document.title = '品牌 — Hello Games Studio';
    setView(h('div', null, renderStudio(), buildFooter()));
    router.restoreScroll(path);
    return;
  }

  document.title = '找不到页面 — NEXUS';
  setView(h('div', null, notFound('这个页面'), buildFooter()));
}

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  applyTheme();
  applyMotionPref();
  initInputModality();
  buildBackground();

  try {
    const res = await fetch('data/games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`games.json ${res.status}`);
    const data = await res.json();
    GAMES = data.games || [];
    SITE = data.site || {};
  } catch (err) {
    document.body.append(h('div', { class: 'page' },
      h('div', { class: 'collection container' },
        h('span', { class: 'eyebrow' }, 'ERROR'),
        h('h1', { class: 'collection__title' }, '游戏清单加载失败'),
        h('p', { class: 'collection__desc' },
          `无法读取 data/games.json（${err.message}）。如果是本地直接打开文件，请用 HTTP 服务器访问。`),
        h('div', { class: 'detail__actions', style: { marginTop: 'var(--sp-6)' } },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => location.reload() }, icon('restart'), '重新加载'))
      )
    ));
    return;
  }

  buildNav();
  bindHotkey(() => openSearch({ anchor: searchBtn, games: GAMES }));

  /* 主题 / 动效跟随系统变化 */
  mqReduce.addEventListener?.('change', () => { applyMotionPref(); });

  router.onChange(renderRoute);
  router.start();

  /* 路由切换时若还有播放器残留，收干净 */
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#/play/')) teardownPlayer();
  });

  /* 全局错误兜底：不让一次异常把整站打黑 */
  window.addEventListener('error', (e) => {
    console.error('[nexus]', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[nexus] promise', e.reason);
  });

  document.body.classList.add('is-ready');
  if (state.settings.theme === 'auto') {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);
  }
}

boot();
