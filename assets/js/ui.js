/* ============================================================================
   NEXUS · UI 组件
   卡片 / 区块 / 空状态 / Toast / 分段控件 / 交互细节
   ========================================================================== */

import { h, icon, favIcon, state, subscribe, toggleFavorite, reduceMotion } from './core.js';

const coarse = () => window.matchMedia('(hover: none)').matches;

/* ---------------------------------------------------------------- Toast */
let stack;
export function toast(message, { error = false, iconName = 'check', ms = 2400 } = {}) {
  if (!stack) {
    stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
      document.body.append(stack);
    } else {
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
    }
  }
  const el = h('div', {
    class: `toast${error ? ' toast--error' : ''}`,
    role: error ? 'alert' : 'status',
  },
    icon(error ? 'alert' : iconName),
    h('span', null, message)
  );
  stack.append(el);
  const kill = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  };
  setTimeout(kill, ms);
  return kill;
}

/* ---------------------------------------------------------------- 收藏按钮 */
export function favButton(slug, { className = 'card__fav', label } = {}) {
  const pressed = state.favorites.includes(slug);
  const btn = h('button', {
    class: className,
    type: 'button',
    'aria-pressed': String(pressed),
    'aria-label': label || (pressed ? '取消收藏' : '加入收藏'),
    title: pressed ? '取消收藏' : '加入收藏',
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const added = toggleFavorite(slug);
      btn.setAttribute('aria-pressed', String(added));
      btn.setAttribute('aria-label', added ? '取消收藏' : '加入收藏');
      btn.title = added ? '取消收藏' : '加入收藏';
      toast(added ? '已加入收藏' : '已取消收藏', { iconName: added ? 'heart' : 'check' });
    }
  }, favIcon());
  subscribe(() => {
    const on = state.favorites.includes(slug);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? '取消收藏' : '加入收藏');
    btn.title = on ? '取消收藏' : '加入收藏';
  });
  return btn;
}

/* ---------------------------------------------------------------- 卡片倾斜 */
function attachTilt(card) {
  if (coarse()) return;
  let raf = 0;
  let target = { rx: 0, ry: 0, mx: 50, my: 50 };
  let cur = { rx: 0, ry: 0 };
  const MAX = 4;

  const loop = () => {
    cur.rx += (target.rx - cur.rx) * 0.18;
    cur.ry += (target.ry - cur.ry) * 0.18;
    card.style.setProperty('--rx', `${cur.rx.toFixed(2)}deg`);
    card.style.setProperty('--ry', `${cur.ry.toFixed(2)}deg`);
    if (Math.abs(target.rx - cur.rx) > 0.02 || Math.abs(target.ry - cur.ry) > 0.02) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = 0;
    }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  card.addEventListener('pointermove', (e) => {
    if (reduceMotion() || !state.settings.tilt) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    target.rx = (0.5 - py) * MAX * 2;
    target.ry = (px - 0.5) * MAX * 2;
    card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    card.classList.add('is-tilting');
    kick();
  });
  card.addEventListener('pointerleave', () => {
    target.rx = 0;
    target.ry = 0;
    card.classList.remove('is-tilting');
    kick();
  });
}

/* ---------------------------------------------------------------- 游戏卡片 */
export function gameCard(game, { badge = null, eager = false } = {}) {
  const href = `#/game/${game.slug}`;
  const media = h('div', { class: 'card__media' },
    h('img', {
      class: 'card__img',
      src: game.thumb,
      alt: '',
      loading: eager ? 'eager' : 'lazy',
      decoding: 'async',
      draggable: 'false'
    }),
    h('span', { class: 'card__scrim' }),
    h('span', { class: 'card__light' }),
    badge ? h('span', { class: 'card__badge' }, badge) : null,
    h('span', { class: 'card__play', 'aria-hidden': 'true' }, icon('play'), 'Play')
  );

  /* 逗号分隔符绑在条目内部，避免窄屏换行后出现孤立的「·」 */
  const meta = game.meta.map((m) => h('span', { class: 'card__metaitem' }, m));

  const hit = h('a', {
    class: 'card__hit pressable',
    href,
    'aria-label': `${game.title} · ${game.titleZh} — 查看详情`
  },
  media,
  h('div', { class: 'card__body' },
    h('h3', { class: 'card__title' }, game.title, h('small', null, game.titleZh)),
    h('p', { class: 'card__meta' }, ...meta)
  ));

  const card = h('article', { class: 'card', dataset: { slug: game.slug } }, hit, favButton(game.slug));
  attachTilt(card);
  return card;
}

/* ---------------------------------------------------------------- 区块 */
export function section({ title, eyebrow, action, id, className = '', children }) {
  const head = h('div', { class: 'section__head' },
    h('div', { class: 'section__title-group' },
      eyebrow ? h('span', { class: 'eyebrow' }, eyebrow) : null,
      h('h2', { class: 'section__title' }, title)
    ),
    action || null
  );
  return h('section', { class: `section ${className}`, id: id || null }, head, ...([children].flat(4).filter(Boolean)));
}

/* ---------------------------------------------------------------- 空状态 */
export function emptyState({ title, text, action, iconName = 'sparkle' }) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty__mark' }, icon(iconName)),
    h('p', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    action || null
  );
}

/* ---------------------------------------------------------------- 分段控件 */
export function segmented({ items, value, onChange, label }) {
  const ind = h('span', { class: 'seg__ind' });
  const btns = items.map((it) => h('button', {
    class: 'seg__btn',
    type: 'button',
    role: 'tab',
    'aria-selected': String(it.value === value),
    onclick: () => {
      if (it.value === current) return;
      current = it.value;
      btns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === current)));
      moveIndicator();
      onChange(it.value);
    },
    dataset: { v: it.value }
  }, it.label));

  let current = value;
  const wrap = h('div', { class: 'seg', role: 'tablist', 'aria-label': label || '' }, ind, ...btns);

  function moveIndicator() {
    const active = btns.find((b) => b.dataset.v === current) || btns[0];
    if (!active) return;
    ind.style.width = `${active.offsetWidth}px`;
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  requestAnimationFrame(() => requestAnimationFrame(moveIndicator));
  window.addEventListener('resize', () => requestAnimationFrame(moveIndicator));

  return wrap;
}

/* ---------------------------------------------------------------- 开关 */
export function toggleSwitch({ checked, onChange, label }) {
  const btn = h('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-checked': String(!!checked),
    'aria-label': label || '',
    onclick: () => {
      const next = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(next));
      onChange(next);
    }
  });
  return btn;
}

/* ---------------------------------------------------------------- 导航项高亮 */
export function markCurrent(container, path) {
  container.querySelectorAll('[data-nav]').forEach((el) => {
    const match = el.dataset.nav === 'root'
      ? path === '/'
      : path.startsWith(el.dataset.nav);
    if (match) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}
