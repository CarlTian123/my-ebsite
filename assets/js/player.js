/* ============================================================================
   NEXUS · 播放器（iframe + Signature Launch）
   真实就绪才收场：先 HEAD 校验入口存在 → 启动动画 → iframe onload → 门开
   ========================================================================== */

import { h, icon, router, pushRecent, state, toggleFavorite, subscribe, commit } from './core.js';
import { toast } from './ui.js';
import { performLaunch, forceCloseLaunch } from './launch.js';

let current = null;
let lastSourceRect = null;

export function pendingSource() {
  return lastSourceRect;
}
export function setPendingSource(rect) {
  lastSourceRect = rect || null;
}

export function teardownPlayer() {
  if (!current) return;
  current.alive = false;
  forceCloseLaunch();
  document.exitFullscreen?.().catch(() => {});
  current = null;
}

export async function renderPlayer({ game, mount }) {
  teardownPlayer();
  const session = {
    game,
    alive: true,
    ready: false,
    source: (mount && mount.source) || lastSourceRect
  };
  current = session;

  const frame = h('iframe', {
    class: 'player-frame',
    title: `${game.title} · ${game.titleZh}`,
    allow: 'autoplay; fullscreen; gamepad; xr-spatial-tracking',
    referrerpolicy: 'no-referrer',
    /* 游戏自身的进度需要 localStorage；同源 iframe 才能共享来源 */
    loading: 'eager'
  });
  frame.src = 'about:blank';

  const status = h('div', { class: 'player-status' },
    h('div', { class: 'player-status__spin' }),
    h('h2', null, '正在进入'),
    h('p', null, 'NEXUS 正在准备 ' + game.title + ' …')
  );

  const favBtn = h('button', {
    class: 'player-bar__btn',
    type: 'button',
    'aria-label': state.favorites.includes(game.slug) ? '取消收藏' : '加入收藏',
    title: '收藏',
    'aria-pressed': String(state.favorites.includes(game.slug)),
    onclick: () => {
      const added = toggleFavorite(game.slug);
      favBtn.setAttribute('aria-pressed', String(added));
      toast(added ? '已加入收藏' : '已取消收藏', { iconName: added ? 'heart' : 'check' });
    }
  }, icon('heart'));

  subscribe(() => {
    const on = state.favorites.includes(game.slug);
    favBtn.setAttribute('aria-pressed', String(on));
  });

  const fsBtn = h('button', {
    class: 'player-bar__btn',
    type: 'button',
    'aria-label': '全屏',
    title: '全屏（F）',
    onclick: () => toggleFullscreen()
  }, icon('expand'));

  const reloadBtn = h('button', {
    class: 'player-bar__btn',
    type: 'button',
    'aria-label': '重新开始',
    title: '重新开始（R）',
    onclick: () => restart()
  }, icon('restart'));

  const bar = h('div', { class: 'player-bar' },
    h('a', {
      class: 'player-bar__back',
      href: `#/game/${game.slug}`,
      onclick: (e) => { e.preventDefault(); leave(); }
    }, icon('back'),
      h('span', { class: 'player-bar__back-text' }, '返回', h('span', { class: 'player-bar__back-brand' }, ' NEXUS'))),
    h('div', { class: 'player-bar__title' },
      h('b', null, `${game.title} · ${game.titleZh}`),
      h('span', null, 'Byebye Games Engine v1.0')
    ),
    h('span', { class: 'player-bar__spacer' }),
    favBtn, reloadBtn, fsBtn
  );

  const stage = h('div', { class: 'player-stage' }, frame, status);
  const view = h('div', { class: 'player-view' }, bar, stage);

  const target = document.getElementById('app') || document.body;
  target.replaceChildren(view);

  function leave() {
    if (!session.alive) return;
    teardownPlayer();
    router.navigate(`/game/${game.slug}`);
  }

  function restart() {
    if (!session.alive) return;
    status.classList.remove('is-hidden');
    status.replaceChildren(
      h('div', { class: 'player-status__spin' }),
      h('h2', null, '正在重新开始'),
      h('p', null, game.title + ' 正在重新载入…')
    );
    frame.classList.remove('is-ready');
    load(game.entry + cacheBust());
  }

  function toggleFullscreen() {
    const el = stage;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {
        toast('浏览器拒绝了全屏请求', { error: true });
      });
    }
  }

  function onKey(e) {
    if (e.key === 'f' || e.key === 'F') {
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
      e.preventDefault();
      toggleFullscreen();
    }
    if (e.key === 'r' || e.key === 'R') {
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      restart();
    }
    if (e.key === 'Escape' && document.fullscreenElement) {
      /* 交回浏览器处理退出全屏 */
    }
  }
  window.addEventListener('keydown', onKey);

  window.addEventListener('beforeunload', () => {}, { once: true });

  /* ---------------------------------------------------------------- 加载 */
  const readyDeferred = {};
  const readyPromise = new Promise((resolve) => { readyDeferred.resolve = resolve; });

  function fail(title, message, { retry = true } = {}) {
    if (!session.alive) return;
    session.ready = false;
    frame.classList.remove('is-ready');
    status.classList.remove('is-hidden');
    status.replaceChildren(
      h('span', { class: 'empty__mark', style: { margin: '0 auto' } }, icon('alert')),
      h('h2', null, title),
      h('p', null, message),
      h('div', { class: 'detail__actions', style: { marginTop: '6px' } },
        retry ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => retryLoad() },
          icon('restart'), '重试') : null,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: leave },
          icon('back'), '返回详情')
      )
    );
    readyDeferred.resolve({ ok: false, reason: message });
  }

  async function preflight(url) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (err) {
      return { ok: false, status: 0, err };
    }
  }

  function cacheBust() {
    return (game.entry.includes('?') ? '&' : '?') + '_n=' + Date.now();
  }

  function entryUrl() {
    const base = game.entry + cacheBust();
    /* 蓝鱼枪战自带 Tian Studio 开场动画；从平台进入时跳过它，游戏文件本身不改 */
    if (game.slug === 'blue-fish') return base + '&noboot=1';
    return base;
  }

  async function load(url) {
    session.ready = false;

    /* 弱网纪律：
       · iframe 立刻开始加载（不等校验），避免两段等待串行相加；
       · 但 ready 必须等「加载完成 + 入口校验通过」两个条件都满足，
         否则 404 页面会先 load 成功、把错误当成正常进入；
       · 校验失败就收回 iframe 并给出可操作错误面。 */
    let loaded = false;
    let verified = false;
    let aborted = false;
    let settled = false;

    function settle() {
      if (settled || aborted || !session.alive) return;
      if (!loaded || !verified) return;
      settled = true;
      session.ready = true;
      /* 同源可访问：监听游戏运行时的未捕获错误 */
      try {
        const win = frame.contentWindow;
        win.addEventListener('error', (ev) => {
          if (!session.alive) return;
          console.warn('[game error]', ev.message);
          runtimeError(ev.message);
        });
        win.addEventListener('unhandledrejection', (ev) => {
          if (!session.alive) return;
          runtimeError(String(ev.reason || '未处理的 Promise 拒绝'));
        });
      } catch {
        /* 跨域时忽略，不影响游玩 */
      }
      frame.classList.add('is-ready');
      status.classList.add('is-hidden');
      readyDeferred.resolve({ ok: true });
    }

    frame.onload = () => {
      if (aborted) return;
      loaded = true;
      settle();
    };

    frame.onerror = () => {
      if (!session.alive || aborted) return;
      fail('游戏加载失败', '浏览器报告游戏页面无法加载，请重试或返回详情。');
    };

    frame.src = url;

    const result = await preflight(url);
    if (!session.alive) return;

    if (!result.ok) {
      aborted = true;
      try { frame.src = 'about:blank'; } catch { /* 忽略 */ }
      const msg = result.status === 404
        ? `找不到游戏入口文件（${game.entry}）。可能已被移动或未上传完整。`
        : result.status
          ? `游戏入口返回 ${result.status}，暂时无法打开。`
          : '网络请求被中断或超时，无法访问游戏入口。';
      fail('游戏入口不可用', msg);
      return;
    }

    verified = true;
    settle();

    /* 兜底：某些浏览器对 iframe 加载失败不触发 onerror */
    setTimeout(() => {
      if (!session.alive || session.ready) return;
      /* 到这一步仍然没有 onload：交给启动动画的失败分支 */
      readyDeferred.resolve({ ok: false, reason: 'timeout' });
    }, 30000);
  }

  let errorShown = false;
  function runtimeError(message) {
    if (errorShown) return;
    errorShown = true;
    status.classList.remove('is-hidden');
    status.replaceChildren(
      h('span', { class: 'empty__mark', style: { margin: '0 auto' } }, icon('alert')),
      h('h2', null, '游戏运行中出错'),
      h('p', null, message || '游戏内部抛出了未处理的错误。你的进度已保存在本机。'),
      h('div', { class: 'detail__actions', style: { marginTop: '6px' } },
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { errorShown = false; status.classList.add('is-hidden'); }
        }, '继续查看'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { errorShown = false; restart(); } },
          icon('restart'), '重新载入'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: leave }, icon('back'), '返回详情')
      )
    );
  }

  async function retryLoad() {
    errorShown = false;
    status.classList.remove('is-hidden');
    status.replaceChildren(
      h('div', { class: 'player-status__spin' }),
      h('h2', null, '正在重试'),
      h('p', null, '重新校验入口…')
    );
    frame.classList.remove('is-ready');
    load(entryUrl());
  }

  /* ---------------------------------------------------------------- 启动 */
  const seen = state.launchSeen.includes(game.slug);
  const wrapReady = Promise.race([
    readyPromise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 32000))
  ]);

  load(entryUrl());

  /* 启动动画与加载并行；E 段等真实 ready */
  if (session.alive) {
    performLaunch({
      game,
      from: session.source,
      fast: seen,
      ready: readyPromise
    }).then((res) => {
      if (!session.alive) return;
      if (!res || res.ok === false) {
        /* 失败面已经由 fail() 渲染，这里只保证遮罩收敛 */
        frame.classList.remove('is-ready');
        return;
      }
      pushRecent(game.slug);
      toast(`已进入 ${game.title}`, { iconName: 'play' });
    });
  }

  /* 记住已启动：同一会话再次进入走快速过渡 */
  if (!state.launchSeen.includes(game.slug)) {
    commit((s) => { s.launchSeen.push(game.slug); });
  }

  return {
    view,
    destroy() {
      window.removeEventListener('keydown', onKey);
      teardownPlayer();
    }
  };
}
