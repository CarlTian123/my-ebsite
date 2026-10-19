/* ============================================================================
   NEXUS · 搜索浮层
   从锚点展开 / 背景压暗 / 自动聚焦 / 即时筛选 / 方向键 + Enter + Esc
   输入永远即时响应，动画只作用于容器，不阻塞键盘
   ========================================================================== */

import { h, icon, router, state } from './core.js';

let layer = null;
let input = null;
let listEl = null;
let games = [];
let selected = 0;
let results = [];
let lastFocus = null;
let onClose = null;

function score(game, q) {
  if (!q) return 1;
  const hay = [
    game.title, game.titleZh, game.subtitle, game.tagline, game.summary,
    ...(game.genres || []), ...(game.tags || []), ...(game.meta || [])
  ].join(' ').toLowerCase();
  const ql = q.toLowerCase().trim();
  if (!hay.includes(ql)) return 0;
  let s = 1;
  if (game.title.toLowerCase().startsWith(ql)) s += 6;
  else if (game.title.toLowerCase().includes(ql)) s += 3;
  if (game.titleZh.includes(ql)) s += 4;
  if (game.subtitle.toLowerCase().includes(ql)) s += 1;
  return s;
}

function renderResults() {
  const q = input.value.trim();
  results = games
    .map((g) => ({ g, s: score(g, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.g);

  if (selected >= results.length) selected = Math.max(0, results.length - 1);

  listEl.replaceChildren();

  if (!results.length) {
    listEl.append(h('div', { class: 'search-empty' },
      h('p', null, q ? `没有找到"${q}"` : '还没有可搜索的游戏'),
      h('p', { class: 'dim mono', style: { marginTop: '8px', fontSize: '11px', letterSpacing: '.1em' } },
        q ? '试试「节奏」「射击」「解谜」' : '')
    ));
    return;
  }

  results.forEach((g, i) => {
    const item = h('button', {
      class: 'sr-item',
      type: 'button',
      role: 'option',
      id: `sr-${i}`,
      'aria-selected': String(i === selected),
      onclick: () => go(g),
      onpointerenter: () => { selected = i; syncSel(); }
    },
    h('img', { class: 'sr-item__art', src: g.thumb, alt: '', loading: 'lazy' }),
    h('span', { class: 'sr-item__main' },
      h('span', { class: 'sr-item__name' }, g.title, ' · ', g.titleZh),
      h('span', { class: 'sr-item__meta' }, g.genres.join(' / '), ' — ', g.subtitle)
    ),
    h('span', { class: 'sr-item__go' }, icon('arrowUpRight'))
    );
    listEl.append(item);
  });
  syncSel();
}

function syncSel() {
  const items = listEl.querySelectorAll('.sr-item');
  items.forEach((it, i) => it.setAttribute('aria-selected', String(i === selected)));
  const active = items[selected];
  if (active) {
    input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function go(game) {
  close({ restoreFocus: false });
  router.navigate(`/game/${game.slug}`);
}

function onKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!results.length) return;
    selected = (selected + 1) % results.length;
    syncSel();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!results.length) return;
    selected = (selected - 1 + results.length) % results.length;
    syncSel();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (results[selected]) go(results[selected]);
    return;
  }
  if (e.key === 'Tab') {
    /* 焦点锁在输入框，避免跑到背后的页面 */
    e.preventDefault();
  }
}

function build(anchorRect) {
  layer = h('div', {
    class: 'search-layer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '搜索游戏',
    onpointerdown: (e) => { if (e.target === layer) close(); }
  });

  input = h('input', {
    type: 'text',
    placeholder: '搜索游戏、类型或玩法…',
    'aria-label': '搜索',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'search-results',
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: () => { selected = 0; renderResults(); },
    onkeydown: onKey
  });

  listEl = h('div', {
    class: 'search-results',
    id: 'search-results',
    role: 'listbox',
    'aria-label': '搜索结果'
  });

  const panel = h('div', {
    class: 'search-panel',
    onpointerdown: (e) => e.stopPropagation()
  },
  h('div', { class: 'search-field' },
    icon('search'),
    input,
    h('kbd', { class: 'search-esc' }, 'ESC')
  ),
  listEl,
  h('div', { class: 'search-foot' },
    h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), '选择'),
    h('span', null, h('kbd', null, '↵'), '打开'),
    h('span', null, h('kbd', null, 'ESC'), '关闭'),
    h('span', { style: { marginLeft: 'auto' } }, 'NEXUS SEARCH')
  )
  );

  if (anchorRect) {
    /* 从搜索按钮的视觉位置展开：transform-origin 指向锚点 */
    const ox = ((anchorRect.left + anchorRect.width / 2) / window.innerWidth) * 100;
    const oy = ((anchorRect.top + anchorRect.height / 2) / window.innerHeight) * 100;
    panel.style.setProperty('--ox', `${ox.toFixed(1)}%`);
    panel.style.setProperty('--oy', `${oy.toFixed(1)}%`);
  }

  layer.append(panel);
  document.body.append(layer);
  document.body.classList.add('is-locked');
  renderResults();
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

export function openSearch({ anchor, games: list, onclose } = {}) {
  if (layer) return;
  games = list || games;
  onClose = onclose || null;
  lastFocus = document.activeElement;
  const rect = anchor ? anchor.getBoundingClientRect() : null;
  build(rect);
  window.addEventListener('keydown', onGlobalKey, true);
}

function onGlobalKey(e) {
  if (e.key === 'Escape') return; // 由 onKey 处理
}

export function close({ restoreFocus = true } = {}) {
  if (!layer) return;
  window.removeEventListener('keydown', onGlobalKey, true);
  layer.remove();
  layer = null;
  listEl = null;
  input = null;
  document.body.classList.remove('is-locked');
  if (restoreFocus && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  if (onClose) onClose();
  onClose = null;
}

export function isSearchOpen() {
  return !!layer;
}

/* ⌘K / Ctrl+K */
export function bindHotkey(openFn) {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openFn();
    }
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '') && !layer) {
      e.preventDefault();
      openFn();
    }
  });
}
