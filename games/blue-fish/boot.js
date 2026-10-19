/* ===================================================================
   Tian Studio · 启动序列
   一段两拍的开场：
     ① Tian Studio 标志描线 → 字标揭示（约 0–1.7s）
     ② 整体收拢上移，Tian Games Engine v1.0 登场（约 1.7–3.7s）
   纯 JS 注入，不改 index.html 结构；点击 / 按键跳过，
   ?noboot=1 或 prefers-reduced-motion 直达终点。
   =================================================================== */
(function(){
  if (window.__bootDone) return;
  var params = new URLSearchParams(location.search);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noBoot = params.has('noboot') || reduce;

  /* ---------- ① 工作室标志：圆环 + T + 水面 + 声呐 ---------- */
  var MARK = '' +
    '<svg class="bootMark" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="bmGrad" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
          '<stop offset=".48" stop-color="#fff" stop-opacity=".30"/>' +
          '<stop offset=".52" stop-color="#dffaff" stop-opacity=".55"/>' +
          '<stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<clipPath id="bmClip">' +
          '<circle cx="60" cy="58" r="42"/>' +
          '<rect x="33" y="41.7" width="54" height="4.6" rx="2.3"/>' +
          '<rect x="57.7" y="41.7" width="4.6" height="48.3" rx="2.3"/>' +
        '</clipPath>' +
      '</defs>' +
      '<circle class="ring" cx="60" cy="58" r="42"/>' +
      '<path class="wave" d="M20 97q20-9 40 0t40 0"/>' +
      '<g clip-path="url(#bmClip)"><rect class="sheen" x="-70" y="-30" width="120" height="180" fill="url(#bmGrad)"/></g>' +
      '<path class="barH" d="M34 44h52"/>' +
      '<path class="stem" d="M60 44v45"/>' +
      '<circle class="ping" cx="60" cy="92" r="2.4"/>' +
      '<circle class="ripple" cx="60" cy="58" r="42"/>' +
    '</svg>';

  /* ---------- ② 引擎标志：六边核心 + 播放三角 + 刻度 ---------- */
  var ENGINE_MARK = '' +
    '<svg class="engMark" viewBox="0 0 96 96" aria-hidden="true">' +
      '<polygon class="hex" points="48,7 82,27 82,69 48,89 14,69 14,27"/>' +
      '<polygon class="hexIn" points="48,20 70,33 70,63 48,76 26,63 26,33"/>' +
      '<path class="play" d="M43 39.5l15 8.5-15 8.5z"/>' +
      '<g class="ticks">' +
        '<path d="M48 1.6v3.4"/><path d="M48 91v3.4"/>' +
        '<path d="M4.4 48h3.4"/><path d="M88.2 48h3.4"/>' +
      '</g>' +
      '<circle class="orb" cx="48" cy="7" r="1.7"/>' +
    '</svg>';

  var el = document.createElement('div');
  el.id = 'boot';
  el.innerHTML =
    '<div class="bootStack">' +
      '<div class="bootStage">' +
        MARK +
        '<div class="bootWord"><span>TIAN</span><span class="thin">STUDIO</span></div>' +
      '</div>' +
      '<div class="bootEngineLock">' +
        ENGINE_MARK +
        '<div class="engWord"><span class="w1">TIAN GAMES</span> <span class="w2">ENGINE</span></div>' +
        '<div class="engMeta"><b class="ver">v1.0</b><span class="engBar"><i></i></span></div>' +
      '</div>' +
    '</div>' +
    '<div class="bootSkip">点击跳过</div>';

  function finish(){
    if (window.__bootDone) return;
    window.__bootDone = true;
    document.body.classList.remove('booting');
    document.body.classList.add('booted');
    if (!el.parentNode) return;
    el.classList.add('out');
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 640);
  }

  function run(){
    document.body.classList.add('booting');
    document.body.appendChild(el);
    var total = reduce ? 300 : 3760;      // 收尾时刻，随后 finish 走 640ms 淡出
    var t = setTimeout(finish, total);
    function skip(){
      clearTimeout(t);
      finish();
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
    }
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    window.__bootSkip = skip;
  }

  window.__bootDone = false;
  window.__bootSkip = finish;
  if (noBoot){
    document.body.classList.add('booted');
    window.__bootDone = true;
  } else if (document.body) {
    run();
  } else {
    window.addEventListener('DOMContentLoaded', run, { once: true });
  }
})();
