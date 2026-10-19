/* ============================================================================
   NEXUS · 页面视图
   首页 / 详情 / 集合 / 设置 / 品牌
   ========================================================================== */

import {
  h, icon, router, state, subscribe, reduceMotion, formatRelative,
  toggleFavorite, clearHistory, resetAll, applyTheme, applyMotionPref, isPersistent, commit
} from './core.js';
import { gameCard, section, emptyState, segmented, toggleSwitch, toast, favButton } from './ui.js';

/* ---------------------------------------------------------------- 入场错峰 */
const io = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
  : null;

function reveal(el, delay = 0) {
  if (!el) return el;
  if (reduceMotion()) { el.classList.add('is-in'); return el; }
  el.style.setProperty('--d', `${delay}ms`);
  el.classList.add('stage');
  if (io) io.observe(el);
  else el.classList.add('is-in');
  return el;
}

/* ---------------------------------------------------------------- 环境光 */
/* 自定义属性里的 url() 会在声明它的 CSS 文件里解析，必须给绝对地址 */
function absAsset(p) {
  try { return new URL(p, document.baseURI).href; } catch { return p; }
}

function setAmbient(game) {
  const [a, b] = game.aurora || ['rgba(159,216,232,0.12)', 'rgba(31,74,84,0.28)'];
  const root = document.documentElement.style;
  root.setProperty('--aurora', a);
  root.setProperty('--aurora-2', b);
}

/* ============================================================================
   首页
   ========================================================================== */
export function renderHome({ games }) {
  const featured = games.filter((g) => g.featured !== false);
  let index = 0;

  const heroArt = h('div', { class: 'hero__art' });
  const eyebrowText = h('span', { class: 'mono', style: { letterSpacing: '0.24em', fontSize: '11px' } });
  const titleEl = h('h1', { class: 'hero__title' });
  const descEl = h('p', { class: 'hero__desc' });
  const metaEl = h('div', { class: 'hero__meta' });
  const actionsEl = h('div', { class: 'hero__actions' });
  const dotsEl = h('div', { class: 'hero__dots', role: 'tablist', 'aria-label': '精选游戏' });
  const counterEl = h('span', { class: 'hero__counter' });

  const heroInner = reveal(h('div', { class: 'hero__inner' },
    reveal(h('div', { class: 'hero__eyebrow' }, eyebrowText, h('span', { class: 'rule' })), 60),
    reveal(titleEl, 140),
    reveal(descEl, 220),
    reveal(metaEl, 300),
    reveal(actionsEl, 380)
  ), 0);

  const hero = h('header', { class: 'hero' },
    h('div', { class: 'hero__bg' }, heroArt, h('div', { class: 'hero__veil' })),
    h('div', { class: 'container' }, heroInner),
    h('div', { class: 'hero__switch' },
      dotsEl,
      counterEl
    ),
    h('div', { class: 'hero__glowline' })
  );

  function select(i, animate = true) {
    index = (i + featured.length) % featured.length;
    const g = featured[index];

    titleEl.replaceChildren(...[document.createTextNode(g.title + ' '), h('em', null, g.titleZh)]);
    descEl.textContent = g.tagline + ' ' + (g.summary.split('。')[0] + '。');
    eyebrowText.textContent = `精选 · ${String(index + 1).padStart(2, '0')} / ${String(featured.length).padStart(2, '0')}`;
    counterEl.textContent = `${g.genres.join(' · ').toUpperCase()}`;

    metaEl.replaceChildren(...[
      h('span', { class: 'chip chip--accent' }, 'FEATURED'),
      ...g.meta.slice(0, 3).map((m) => h('span', { class: 'chip' }, m))
    ]);

    actionsEl.replaceChildren(
      h('button', {
        class: 'btn btn--primary btn--lg',
        type: 'button',
        onclick: (e) => launch(g, e.currentTarget)
      }, icon('play'), '开始游戏'),
      h('a', { class: 'btn btn--ghost btn--lg', href: `#/game/${g.slug}` }, '查看详情', icon('chevronRight'))
    );

    heroArt.style.setProperty('--hero-img', `url("${absAsset(g.hero)}")`);
    heroArt.style.setProperty('--img-bright', String(g.heroBright ?? 0.8));

    dotsEl.replaceChildren(...featured.map((fg, k) => h('button', {
      class: 'hero__dot',
      type: 'button',
      role: 'tab',
      'aria-selected': String(k === index),
      'aria-label': fg.title,
      onclick: () => select(k)
    })));

    setAmbient(g);

    if (animate && !reduceMotion()) {
      /* 文字换内容时不要整块黑掉：从 0.15 起淡入，最长一档也只等 84ms */
      [titleEl, descEl, metaEl, actionsEl].forEach((el, n) => {
        el.getAnimations?.().forEach((a) => a.cancel());
        el.animate([
          { opacity: 0.15, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 320, delay: n * 28, easing: 'cubic-bezier(.16,.84,.26,1)', fill: 'backwards' });
      });
      heroArt.getAnimations?.().forEach((a) => a.cancel());
      heroArt.animate([{ opacity: 0.2 }, { opacity: 0.55 }],
        { duration: 520, easing: 'cubic-bezier(.22,.61,.36,1)' });
    }
  }

  select(0, false);

  /* 缓慢自动轮换；指针移入、页面不可见、偏好减弱动效时暂停 */
  let timer = 0;
  let hovered = false;
  const tick = () => {
    if (hovered || document.hidden || reduceMotion()) return;
    select(index + 1);
  };
  timer = setInterval(tick, 9000);
  hero.addEventListener('pointerenter', () => { hovered = true; });
  hero.addEventListener('pointerleave', () => { hovered = false; });

  /* ---- 内容区 ---- */
  const featuredSection = reveal(section({
    eyebrow: 'FEATURED',
    title: '精选',
    className: 'container',
    children: h('div', { class: 'rail' }, featured.map((g, i) => gameCard(g, { eager: true })))
  }), 0);

  /* 类型筛选 */
  const genres = ['全部', ...Array.from(new Set(games.flatMap((g) => g.genres)))];
  let activeGenre = '全部';
  const gridEl = h('div', { class: 'grid' });
  const countEl = h('span', { class: 'filter-count' });

  const chipsEl = h('div', { class: 'filter-bar' },
    h('span', { class: 'eyebrow', style: { marginRight: '4px' } }, 'TYPE'),
    ...genres.map((name) => h('button', {
      class: `chip${name === '全部' ? ' chip--accent' : ''}`,
      type: 'button',
      'aria-pressed': String(name === activeGenre),
      onclick: (e) => {
        activeGenre = name;
        chipsEl.querySelectorAll('.chip').forEach((c) => {
          const on = c.dataset.genre === activeGenre;
          c.setAttribute('aria-pressed', String(on));
          c.classList.toggle('chip--accent', on);
        });
        fillGrid();
      },
      dataset: { genre: name }
    }, name)),
    h('span', { class: 'filter-bar__spacer' }),
    countEl
  );

  function fillGrid() {
    const list = activeGenre === '全部' ? games : games.filter((g) => g.genres.includes(activeGenre));
    countEl.textContent = `${String(list.length).padStart(2, '0')} TITLES`;
    gridEl.replaceChildren(...list.map((g, i) => {
      const card = gameCard(g);
      card.style.setProperty('--d', `${i * 60}ms`);
      card.classList.add('stage');
      requestAnimationFrame(() => card.classList.add('is-in'));
      return card;
    }));
    if (!list.length) {
      gridEl.replaceChildren(emptyState({
        title: '这个类型还没有游戏',
        text: '换一个类型看看，或者回到全部。',
        action: h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => chipsEl.querySelector(`[data-genre="全部"]`).click()
        }, '回到全部')
      }));
    }
  }
  fillGrid();

  const allSection = reveal(section({
    eyebrow: 'ALL GAMES',
    title: '全部游戏',
    className: 'container',
    children: [chipsEl, gridEl]
  }), 0);

  /* 最近游玩 */
  const recentGames = state.recent
    .map((r) => ({ ...r, game: games.find((g) => g.slug === r.slug) }))
    .filter((r) => r.game)
    .slice(0, 6);

  const recentSection = reveal(section({
    eyebrow: 'RECENTLY PLAYED',
    title: '最近游玩',
    className: 'container',
    action: recentGames.length
      ? h('a', { class: 'btn btn--quiet btn--sm', href: '#/recent' }, '全部记录', icon('chevronRight'))
      : null,
    children: recentGames.length
      ? h('div', { class: 'rail' }, recentGames.map((r) => gameCard(r.game, { badge: formatRelative(r.at) })))
      : emptyState({
        title: '还没有游玩记录',
        text: '从上面挑一款开始。第一次启动会经过一段完整的进入动画，之后再进会快很多。',
        iconName: 'clock',
        action: h('a', { class: 'btn btn--ghost btn--sm', href: '#/game/' + featured[0].slug }, '先看看 ' + featured[0].title)
      })
  }), 0);

  /* 收藏 */
  const favGames = state.favorites.map((s) => games.find((g) => g.slug === s)).filter(Boolean);

  const favSection = reveal(section({
    eyebrow: 'FAVORITES',
    title: '收藏',
    className: 'container',
    action: favGames.length
      ? h('a', { class: 'btn btn--quiet btn--sm', href: '#/favorites' }, '管理收藏', icon('chevronRight'))
      : null,
    children: favGames.length
      ? h('div', { class: 'grid' }, favGames.map((g) => gameCard(g)))
      : emptyState({
        title: '收藏夹是空的',
        text: '在任意卡片的右上角点一下心形，就会出现在这里。收藏保存在本机浏览器。',
        iconName: 'heart'
      })
  }), 0);

  const wrap = h('div', { class: 'page' },
    hero,
    h('div', { class: 'home-sections container' },
      featuredSection,
      allSection,
      recentSection,
      favSection
    )
  );

  /* 收藏/历史变化时整页轻量刷新（只重绘相关区块） */
  const unsub = subscribe(() => {
    /* 最简单可靠：重绘最近与收藏两块 */
    const parent = wrap.querySelectorAll('.home-sections > .section');
    if (parent[2]) parent[2].replaceWith(recentNode());
    if (parent[3]) parent[3].replaceWith(favNode());
  });

  function recentNode() {
    const rg = state.recent.map((r) => ({ ...r, game: games.find((g) => g.slug === r.slug) })).filter((r) => r.game).slice(0, 6);
    return section({
      eyebrow: 'RECENTLY PLAYED', title: '最近游玩', className: 'container',
      action: rg.length ? h('a', { class: 'btn btn--quiet btn--sm', href: '#/recent' }, '全部记录', icon('chevronRight')) : null,
      children: rg.length
        ? h('div', { class: 'rail' }, rg.map((r) => gameCard(r.game, { badge: formatRelative(r.at) })))
        : emptyState({ title: '还没有游玩记录', text: '开始任意一款游戏后会记录在这里。', iconName: 'clock' })
    });
  }
  function favNode() {
    const fg = state.favorites.map((s) => games.find((g) => g.slug === s)).filter(Boolean);
    return section({
      eyebrow: 'FAVORITES', title: '收藏', className: 'container',
      action: fg.length ? h('a', { class: 'btn btn--quiet btn--sm', href: '#/favorites' }, '管理收藏', icon('chevronRight')) : null,
      children: fg.length
        ? h('div', { class: 'grid' }, fg.map((g) => gameCard(g)))
        : emptyState({ title: '收藏夹是空的', text: '点卡片右上角的心形即可收藏。', iconName: 'heart' })
    });
  }

  hero._cleanup = () => { clearInterval(timer); unsub(); };
  return wrap;
}

/* 启动：记录来源矩形，交给播放器做空间收敛 */
function launch(game, sourceEl) {
  import('./player.js').then((m) => {
    const rect = sourceEl ? sourceEl.getBoundingClientRect() : null;
    m.setPendingSource(rect);
    router.navigate(`/play/${game.slug}`);
  });
}

/* ============================================================================
   详情
   ========================================================================== */
export function renderDetail({ game, games }) {
  const isFav = state.favorites.includes(game.slug);
  const related = games.filter((g) => g.slug !== game.slug);

  const playBtn = h('button', {
    class: 'btn btn--primary btn--lg',
    type: 'button',
    onclick: (e) => launch(game, e.currentTarget)
  }, icon('play'), '开始游戏');

  const favBtn = h('button', {
    class: 'btn btn--ghost btn--lg',
    type: 'button',
    'aria-pressed': String(isFav),
    onclick: () => {
      const added = toggleFavorite(game.slug);
      favBtn.setAttribute('aria-pressed', String(added));
      favBtn.replaceChildren(icon(added ? 'heart' : 'heart'), added ? '已收藏' : '收藏');
      favBtn.style.color = added ? 'var(--accent)' : '';
      toast(added ? '已加入收藏' : '已取消收藏', { iconName: 'heart' });
    }
  }, icon('heart'), isFav ? '已收藏' : '收藏');
  if (isFav) favBtn.style.color = 'var(--accent)';

  const head = h('div', { class: 'detail__head' },
    reveal(h('div', { class: 'detail__cover' },
      h('img', { src: game.cover, alt: `${game.title} 封面`, decoding: 'async' })
    ), 0),
    h('div', { class: 'detail__col' },
      reveal(h('h1', { class: 'detail__title' }, game.title), 40),
      reveal(h('p', { class: 'dim', style: { fontSize: 'var(--fs-sm)', marginTop: '-10px' } },
        `${game.subtitle}　·　${game.titleZh}`), 80),
      reveal(h('div', { class: 'detail__sub' },
        ...game.genres.map((g) => h('span', { class: 'chip chip--accent' }, g)),
        ...game.tags.map((t) => h('span', { class: 'chip' }, t))
      ), 120),
      reveal(h('p', { class: 'detail__desc' }, game.summary), 160),
      reveal(h('div', { class: 'detail__actions' }, playBtn, favBtn), 200),
      reveal(h('div', { class: 'spec' },
        ...game.facts.map((f) => h('div', { class: 'spec__cell' },
          h('span', { class: 'spec__k' }, f.k),
          h('span', { class: 'spec__v' }, f.v)
        ))
      ), 240)
    )
  );

  const body = h('div', { class: 'detail__body' },
    reveal(h('div', { class: 'prose' },
      h('h2', null, '玩法'),
      h('ul', null, ...game.howToPlay.map((line) => h('li', null, line)))
    ), 0),
    reveal(h('div', { class: 'prose' },
      h('h2', null, '操作'),
      h('div', { class: 'keys' },
        ...game.controls.map((c) => h('div', { class: 'keys__row' },
          h('span', { style: { display: 'inline-flex', gap: '5px', flexWrap: 'wrap' } },
            ...c.keys.map((k) => h('kbd', { class: 'kbd' }, k))
          ),
          h('span', { class: 'dim' }, c.desc)
        ))
      ),
      game.note ? h('p', { style: { marginTop: '12px', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, game.note) : null
    ), 80)
  );

  const relatedSection = related.length
    ? reveal(section({
      eyebrow: 'MORE FROM HELLO GAMES STUDIO',
      title: '相关游戏',
      className: '',
      children: h('div', { class: 'grid' }, related.map((g) => gameCard(g)))
    }), 0)
    : null;

  return h('div', { class: 'page' },
    h('div', { class: 'detail container' },
      reveal(h('a', { class: 'backlink', href: '#/', onclick: (e) => { e.preventDefault(); router.navigate('/'); } },
        icon('back'), '返回全部游戏'), 0),
      head,
      body,
      relatedSection
    )
  );
}

/* ============================================================================
   集合（全部 / 最近 / 收藏）
   ========================================================================== */
export function renderCollection({ games, kind }) {
  const map = {
    library: { eyebrow: 'LIBRARY', title: '全部游戏', desc: 'Hello Games Studio 目前在 NEXUS 上的全部作品。' },
    recent: { eyebrow: 'RECENTLY PLAYED', title: '最近游玩', desc: '按最近一次进入的时间排序，保存在本机浏览器。' },
    favorites: { eyebrow: 'FAVORITES', title: '收藏', desc: '你标记过的游戏。收藏保存在本机浏览器，换设备不会同步。' }
  };
  const meta = map[kind] || map.library;

  const list = kind === 'recent'
    ? state.recent.map((r) => ({ ...r, game: games.find((g) => g.slug === r.slug) })).filter((r) => r.game)
    : kind === 'favorites'
      ? state.favorites.map((s) => games.find((g) => g.slug === s)).filter(Boolean)
      : games;

  const head = h('div', { class: 'collection__head' },
    reveal(h('span', { class: 'eyebrow' }, meta.eyebrow), 0),
    reveal(h('h1', { class: 'collection__title' }, meta.title), 60),
    reveal(h('p', { class: 'collection__desc' }, meta.desc), 120)
  );

  let content;
  if (kind === 'recent' && !list.length) {
    content = emptyState({
      title: '还没有游玩记录',
      text: '玩过的游戏会按时间排在前面，方便下次直接进入。',
      iconName: 'clock',
      action: h('a', { class: 'btn btn--primary btn--sm', href: '#/' }, icon('play'), '去看全部游戏')
    });
  } else if (kind === 'favorites' && !list.length) {
    content = emptyState({
      title: '收藏夹是空的',
      text: '在心形按钮上点一下就能收藏，收藏会持久保存在这台设备上。',
      iconName: 'heart',
      action: h('a', { class: 'btn btn--primary btn--sm', href: '#/' }, '去挑一款')
    });
  } else if (kind === 'recent') {
    content = h('div', { class: 'grid' }, list.map((r) => gameCard(r.game, { badge: formatRelative(r.at) })));
  } else {
    content = h('div', { class: 'grid' }, list.map((g) => gameCard(g)));
  }

  const extra = kind === 'recent' && list.length
    ? h('div', { style: { marginTop: 'var(--sp-6)' } },
      h('button', {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        onclick: () => {
          clearHistory();
          toast('已清空游玩记录');
          router.navigate('/recent', { replace: true });
        }
      }, icon('close'), '清空记录'))
    : null;

  return h('div', { class: 'page' },
    h('div', { class: 'collection container' }, head, reveal(content, 0), extra)
  );
}

/* ============================================================================
   设置
   ========================================================================== */
export function renderSettings({ games }) {
  const themeSeg = segmented({
    label: '主题',
    value: state.settings.theme,
    items: [
      { value: 'auto', label: '跟随系统' },
      { value: 'dark', label: '深色' },
      { value: 'light', label: '浅色' }
    ],
    onChange: (v) => {
      commit((s) => { s.settings.theme = v; });
      applyTheme();
    }
  });

  const motionSeg = segmented({
    label: '动效',
    value: state.settings.motion,
    items: [
      { value: 'auto', label: '跟随系统' },
      { value: 'reduced', label: '减弱' }
    ],
    onChange: (v) => {
      commit((s) => { s.settings.motion = v; });
      applyMotionPref();
      toast(v === 'reduced' ? '已减弱动效' : '动效恢复默认');
    }
  });

  const tiltSwitch = toggleSwitch({
    checked: state.settings.tilt,
    label: '卡片 3D 倾斜',
    onChange: (v) => {
      commit((s) => { s.settings.tilt = v; });
      toast(v ? '已开启卡片倾斜' : '已关闭卡片倾斜');
    }
  });

  const tiltRow = h('button', {
    class: 'row', type: 'button',
    style: { width: '100%', textAlign: 'left', cursor: 'pointer' }
  },
  h('span', { class: 'row__main' },
    h('span', { class: 'row__label' }, '卡片 3D 倾斜'),
    h('span', { class: 'row__hint' }, '指针移动时卡片最大倾斜 4°。触屏设备自动关闭。')
  ),
  h('span', { class: 'row__ctl' }, tiltSwitch)
  );
  tiltRow.addEventListener('click', (e) => {
    if (e.target.closest('.switch')) return;
    tiltSwitch.click();
  });

  const storageRow = h('div', { class: 'row' },
    h('span', { class: 'row__main' },
      h('span', { class: 'row__label' }, '本机存档'),
      h('span', { class: 'row__hint' },
        isPersistent
          ? '收藏、最近游玩、各游戏进度都保存在这台设备的浏览器里。清理浏览器数据会一起清掉。'
          : '当前浏览器禁用了 localStorage（可能是隐私模式），本次的收藏与记录只存在内存里，关闭页面即消失。'
      )
    ),
    h('span', { class: 'row__ctl' },
      h('span', { class: `chip${isPersistent ? ' chip--accent' : ''}` }, isPersistent ? '可用' : '不可用'))
  );

  const group1 = h('div', { class: 'settings__group' },
    h('h2', null, '外观'),
    h('div', { class: 'row' },
      h('span', { class: 'row__main' },
        h('span', { class: 'row__label' }, '主题'),
        h('span', { class: 'row__hint' }, '深色为主，浅色是一套完整配置，不是简单反色。')
      ),
      h('span', { class: 'row__ctl' }, themeSeg)
    ),
    h('div', { class: 'row' },
      h('span', { class: 'row__main' },
        h('span', { class: 'row__label' }, '动效'),
        h('span', { class: 'row__hint' }, '减弱后关闭视差与空间变形，保留必要的状态反馈。')
      ),
      h('span', { class: 'row__ctl' }, motionSeg)
    ),
    tiltRow
  );

  const group2 = h('div', { class: 'settings__group' },
    h('h2', null, '存档与数据'),
    storageRow,
    h('div', { class: 'row' },
      h('span', { class: 'row__main' },
        h('span', { class: 'row__label' }, '清空游玩记录'),
        h('span', { class: 'row__hint' }, '只清空 NEXUS 的"最近游玩"列表，不影响游戏内部进度。')
      ),
      h('span', { class: 'row__ctl' },
        h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => { clearHistory(); toast('已清空游玩记录'); }
        }, '清空'))
    ),
    h('div', { class: 'row' },
      h('span', { class: 'row__main' },
        h('span', { class: 'row__label' }, '重置全部平台数据'),
        h('span', { class: 'row__hint' }, '清空收藏、最近游玩与外观设置。游戏内部记录需要到游戏里清。')
      ),
      h('span', { class: 'row__ctl' },
        h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => {
            resetAll(); applyTheme(); applyMotionPref();
            toast('已重置平台数据');
          }
        }, '重置'))
    )
  );

  const group3 = h('div', { class: 'settings__group' },
    h('h2', null, '关于'),
    h('div', { class: 'row' },
      h('span', { class: 'row__main' },
        h('span', { class: 'row__label' }, 'NEXUS'),
        h('span', { class: 'row__hint' }, 'Hello Games Studio · Byebye Games Engine v1.0')
      ),
      h('span', { class: 'row__ctl' }, h('a', { class: 'btn btn--quiet btn--sm', href: '#/studio' }, '品牌页', icon('chevronRight')))
    ),
    h('div', { class: 'row' },
      h('span', { class: 'row__main' },
        h('span', { class: 'row__label' }, '游戏数量'),
        h('span', { class: 'row__hint' }, '全部为本站原创，无第三方素材。')
      ),
      h('span', { class: 'row__ctl' }, h('span', { class: 'chip' }, `${games.length} TITLES`))
    )
  );

  return h('div', { class: 'page' },
    h('div', { class: 'settings container' },
      reveal(h('span', { class: 'eyebrow' }, 'SETTINGS'), 0),
      reveal(h('h1', { class: 'collection__title', style: { marginTop: '12px' } }, '设置'), 60),
      reveal(h('p', { class: 'collection__desc', style: { marginTop: '10px' } },
        '这些设置只影响平台本身，不改变任何游戏内部的玩法与画面。'), 120),
      reveal(group1, 160),
      reveal(group2, 220),
      reveal(group3, 280)
    )
  );
}

/* ============================================================================
   品牌页
   ========================================================================== */
const BRAND_ASSETS = {
  hello: [
    ['hello-mark.svg', '独立图形'],
    ['hello-lockup-h.svg', '横向组合'],
    ['hello-lockup-v.svg', '竖向组合'],
    ['hello-wordmark.svg', '完整名称排版'],
    ['hello-mono.svg', '单色'],
    ['hello-accent.svg', '强调色'],
    ['hello-favicon.svg', 'Favicon'],
    ['hello-animated.svg', '动态版（SMIL）']
  ],
  byebye: [
    ['byebye-mark.svg', '独立图形'],
    ['byebye-lockup-h.svg', '横向组合'],
    ['byebye-lockup-v.svg', '竖向组合'],
    ['byebye-wordmark.svg', '完整名称排版'],
    ['byebye-mono.svg', '单色'],
    ['byebye-accent.svg', '强调色'],
    ['byebye-favicon.svg', 'Favicon'],
    ['byebye-animated.svg', '动态版（SMIL）']
  ]
};

function brandBlock({ key, name, concept, variant = 'dark', delay = 0 }) {
  const svgPath = `assets/brand/${key}-mark.svg`;
  const stage = h('div', { class: 'brand-block__stage', dataset: { variant } },
    h('img', { src: svgPath, alt: `${name} 标志`, style: { width: '58%', height: '58%' }, decoding: 'async' })
  );

  const animBtn = h('button', {
    class: 'btn btn--ghost btn--sm',
    type: 'button',
    onclick: async () => {
      animBtn.disabled = true;
      animBtn.textContent = '载入中…';
      try {
        const res = await fetch(`assets/brand/${key}-animated.svg`);
        const text = await res.text();
        stage.innerHTML = '';
        const holder = h('div', { style: { width: '70%', height: '70%', color: 'inherit' }, html: text });
        const svg = holder.querySelector('svg');
        if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = 'auto'; }
        stage.append(holder);
        animBtn.textContent = '重新播放';
        animBtn.disabled = false;
      } catch {
        animBtn.textContent = '载入失败';
        animBtn.disabled = false;
      }
    }
  }, icon('play'), '播放品牌动画');

  const assets = h('div', { class: 'asset-list' },
    ...BRAND_ASSETS[key].map(([file, label]) => h('a', {
      class: 'asset-link',
      href: `assets/brand/${file}`,
      download: file,
      title: `下载 ${file}`
    }, h('span', null, label), icon('download')))
  );

  return reveal(h('div', { class: 'brand-block' },
    stage,
    h('div', { class: 'brand-block__info' },
      h('span', { class: 'eyebrow' }, variant === 'light' ? 'LIGHT VARIANT' : 'MARK'),
      h('h2', { class: 'brand-block__name' }, name),
      h('p', { class: 'dim', style: { lineHeight: '1.7', maxWidth: '52ch' } }, concept),
      h('div', { class: 'brand-block__meta' }, animBtn),
      assets
    )
  ), delay);
}

export function renderStudio() {
  const hello = brandBlock({
    key: 'hello',
    name: 'Hello — The Open Hello',
    concept: '一圈几乎闭合的轮廓，缺口开在右上。环抱的中心节点是酸橙绿—— studios 的自指：把开放的入口留给自己做的每一款游戏。没有手柄、没有机器人、没有 AI 星光，只有一条线和一个点。',
    variant: 'dark',
    delay: 0
  });

  const helloLight = brandBlock({
    key: 'hello',
    name: 'Hello — 浅色变体',
    concept: '同一份轮廓在浅色底上的呈现：线由 #E8ECEF 变为墨黑，节点保持品牌酸橙绿。可用于浅色文档与印刷。',
    variant: 'light',
    delay: 20
  });

  const byebye = brandBlock({
    key: 'byebye',
    name: 'Byebye — The Passing Gate',
    concept: '两个错位的开放门框，构成一道正在穿过的入口。后门更细、更远；前门更重、更近；门洞里一道绿光是引擎在跑的证据。它只表示"正在通过一道门"，不假装是真实的底层引擎。',
    variant: 'dark',
    delay: 40
  });

  const byebyeLight = brandBlock({
    key: 'byebye',
    name: 'Byebye — 浅色变体',
    concept: '门框的粗细对比在浅色下依然成立：后门 4.4、前门 6.2，比例不变。',
    variant: 'light',
    delay: 60
  });

  return h('div', { class: 'page' },
    h('div', { class: 'studio container' },
      reveal(h('div', { class: 'studio__head' },
        h('span', { class: 'eyebrow' }, 'STUDIO · BRAND'),
        h('h1', { class: 'studio__title' }, '两个标志，一个入口'),
        h('p', { class: 'collection__desc' },
          'NEXUS 的视觉由两层品牌构成：Hello Games Studio 是做什么的工作室，Byebye Games Engine v1.0 是进入游戏时经过的那道门。下面是两个标志的完整形态、几何说明与可下载的 SVG 源文件。')
      ), 0),

      reveal(h('div', { class: 'section', style: { paddingTop: 'var(--sp-8)' } },
        h('div', { class: 'section__head' },
          h('div', { class: 'section__title-group' },
            h('span', { class: 'eyebrow' }, 'NEXUS'),
            h('h2', { class: 'section__title' }, '平台标志')
          )
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' } },
          h('div', {
            style: {
              width: '132px', height: '132px', display: 'grid', placeItems: 'center',
              border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
              background: 'radial-gradient(70% 70% at 50% 40%, var(--accent-soft), transparent 70%), var(--surface-1)'
            }
          }, h('img', { src: 'assets/brand/nexus-mark.svg', alt: 'NEXUS 标志', style: { width: '64%' } })),
          h('div', { style: { display: 'grid', gap: '10px', maxWidth: '50ch' } },
            h('p', { class: 'dim', style: { lineHeight: '1.7' } },
              '四段对角短线朝中心汇聚，落在中间的菱形节点上。酸橙绿只出现在节点——它是"输入汇入一处"的最小表达。'),
            h('a', { class: 'asset-link', href: 'assets/brand/nexus-mark.svg', download: 'nexus-mark.svg', style: { maxWidth: '260px' } },
              h('span', null, 'nexus-mark.svg'), icon('download'))
          )
        )
      ), 60),

      hello,
      helloLight,
      byebye,
      byebyeLight,

      reveal(h('div', { class: 'section' },
        h('div', { class: 'section__head' },
          h('div', { class: 'section__title-group' },
            h('span', { class: 'eyebrow' }, 'USAGE'),
            h('h2', { class: 'section__title' }, '使用约定')
          )
        ),
        h('div', { class: 'prose' },
          h('ul', null,
            h('li', null, h('b', null, '留白'), '：图形四周至少留出图形高度的 1/4，不要贴边。'),
            h('li', null, h('b', null, '最小尺寸'), '：独立图形不小于 16px（favicon），横向组合不小于 96px 宽。'),
            h('li', null, h('b', null, '不允许'), '：改颜色为品牌酸橙绿以外的彩色、加描边、加投影、旋转、拉伸、在图形内部叠加文字。'),
            h('li', null, h('b', null, '动效'), '：Hello 为 1.8 秒四阶段（描线 → 分段形成 → 节点高光 → 名称显现），Byebye 为 1.96 秒六阶段（两侧进入 → 靠近 → 入口形成 → 绿光扫过 → 对齐 + 名称 → 入口打开）。两者的末帧与静态版坐标完全一致。')
          )
        )
      ), 80)
    )
  );
}
