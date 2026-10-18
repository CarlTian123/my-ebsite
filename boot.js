/* ===================================================================
   Tian Studio · 启动序列
   - 纯 JS 注入，不依赖 index.html 结构（只依赖 boot.css 已被引入）
   - body 上挂 booting → 动画 → booted（主界面淡入）
   - 点击 / 按键可跳过；?noboot=1 或 prefers-reduced-motion 直接跳终点
   =================================================================== */
(function(){
  if (window.__bootDone) return;
  var params = new URLSearchParams(location.search);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noBoot = params.has('noboot') || reduce;

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

  var el = document.createElement('div');
  el.id = 'boot';
  el.innerHTML =
    '<div class="bootStage">' +
      MARK +
      '<div class="bootWord"><span>TIAN</span><span class="thin">STUDIO</span></div>' +
    '</div>' +
    '<div class="bootEngine"><i class="dot"></i><span>TIAN GAMES ENGINE <b class="ver">v1.0</b></span></div>' +
    '<div class="bootSkip">点击跳过</div>';

  function finish(){
    if (window.__bootDone) return;
    window.__bootDone = true;
    document.body.classList.remove('booting');
    document.body.classList.add('booted');
    if (!el.parentNode) return;
    el.classList.add('out');
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 620);
  }

  function run(){
    document.body.classList.add('booting');
    document.body.appendChild(el);
    // 主界面在这之后才淡入
    var total = reduce ? 260 : 2780;
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
