/* ===================================================================
   Tian Studio · 图标系统
   自绘 24×24 线性图标（1.5px 描边 / 圆头 / 无填充），替换掉所有 emoji。
   用法：  ico('coin')                     -> <svg class="ico"><use .../></svg>
           ico('💰')                       -> 走 EMOJI 映射
           ICON_SVG('coin')                -> 裸 <symbol> 串（内部用）
   game.js 里的卡片 / 商店 / 成就 / 价格都通过 ico() 输出。
   =================================================================== */
(function(){
  var P = {
    // —— 货币 / 状态 ——
    coin:      '<circle cx="12" cy="12" r="8.2"/><path d="M9.6 9.4h4.8M9.6 14.6h4.8M12 9.4v5.2"/>',
    lock:      '<rect x="5" y="10.5" width="14" height="9.5" rx="2.6"/><path d="M8.4 10.5V8.2a3.6 3.6 0 0 1 7.2 0v2.3"/>',
    check:     '<path d="M5 12.6l4.3 4.2L19 7.4"/>',
    star:      '<path d="M12 3.6l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/>',
    bolt:      '<path d="M13.2 2.8L5.4 13.4h5.2l-.8 7.8 7.8-10.6h-5.2z"/>',
    heart:     '<path d="M12 20.2S4 15.4 4 9.9a4.1 4.1 0 0 1 8-1.5 4.1 4.1 0 0 1 8 1.5c0 5.5-8 10.3-8 10.3z"/>',
    shield:    '<path d="M12 3.2l7 2.7v5.4c0 4.4-3 7.6-7 9.5-4-1.9-7-5.1-7-9.5V5.9z"/><path d="M9.2 12.2l2 2 3.6-4"/>',
    magnet:    '<path d="M5.4 4.6h4v7.2a2.6 2.6 0 0 0 5.2 0V4.6h4v7.2a6.6 6.6 0 0 1-13.2 0z"/><path d="M5.4 8.4h4M14.6 8.4h4"/>',
    target:    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    drop:      '<path d="M12 3.4s5.6 6.3 5.6 10.1a5.6 5.6 0 0 1-11.2 0C6.4 9.7 12 3.4 12 3.4z"/>',
    snow:      '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
    flame:     '<path d="M12 21c3.6 0 6-2.5 6-6 0-4.4-6-12-6-12s-6 7.6-6 12c0 3.5 2.4 6 6 6z"/><path d="M12 17.6a2.4 2.4 0 0 0 2.4-2.4c0-1.8-2.4-4.6-2.4-4.6s-2.4 2.8-2.4 4.6a2.4 2.4 0 0 0 2.4 2.4z"/>',
    // —— 武器 ——
    gun:       '<path d="M3.6 9.2h11.2l2.6 2.4h3v2.6h-4.6l-1.8 1.9H9.4v2.2H6.2v-4.4H3.6z"/>',
    shotgun:   '<path d="M3 10.4h13.4l3.4 1.2v2.2h-4.2l-1.2 1.4H9.6l-.6 3.4H6.2l.5-3.4H3z"/><path d="M3 10.4V8.2h6.2"/>',
    laser:     '<path d="M4 12h9.4"/><path d="M16.2 8.4l4 3.6-4 3.6z"/><path d="M4.6 5.6l2.8 3M4.6 18.4l2.8-3"/>',
    sniper:    '<path d="M2.4 11.4h9.8l3.4-1.4h5.2v2.2l-3.2 1h-4.2l-2 3.6H8.8l1.2-3.6H2.4z"/><path d="M12.2 9.2V6.6h3.4"/>',
    trident:   '<path d="M12 3.4v17.2"/><path d="M7 6.2v3.4a5 5 0 0 0 10 0V6.2"/><path d="M4.6 6.2h4.8M14.6 6.2h4.8"/>',
    grenade:   '<circle cx="11.4" cy="14" r="6.2"/><path d="M14.6 7.4l2-2M16.6 5.4l2 2M10 4.2h4.4"/>',
    harpoon:   '<path d="M3 21L17.4 6.6"/><path d="M14.2 3.4l6.4 6.4-3.2.8-4-4z"/>',
    // —— 玩法 / 数值 ——
    speed:     '<path d="M3.4 12h9.2l4.4-4.4M3.4 16.4h11.8l3.4-3.4"/><path d="M16.6 7.6l3.4 3.4h-4.6"/>',
    burst:     '<path d="M12 3.4l1.8 5.2 4.6-3.2-1.6 5.4 5.4 1.4-4.6 2.8 3 4.2-5.2-1.4L14 23l-2-4.8-4.8 3.2 1.8-5.6L3.6 14l4.6-2.6-2.6-4.6 5.2 1.6z"/>',
    heal:      '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
    wave:      '<path d="M2.6 9.4q3-2.6 6 0t6 0 6 0"/><path d="M2.6 15.4q3-2.6 6 0t6 0 6 0"/>',
    shark:     '<path d="M2.6 13.6c3.4-4.6 8-6.8 13.4-6.6l3.4-2.6-.6 4.4-2.2 1.8c-2 4-5.6 6-9.4 4.6z"/><path d="M7.4 13.2l-1.2 4.2h3l1-2.8"/>',
    fish:      '<path d="M3 12c2.6-3.4 5.6-5 9-5s6.6 1.8 9 6c-2.4 4.2-5.6 6-9 6s-6.4-2.6-9-7z"/><path d="M17.6 12.4h.02"/><path d="M3 12l-1.6 3.4M3 12l-1.6-3.4"/>',
    trophy:    '<path d="M7.4 3.6h9.2v5.2a4.6 4.6 0 0 1-9.2 0z"/><path d="M7.4 5.4H4.6v2.2c0 2 1.4 3.4 3.2 3.6M16.6 5.4h2.8v2.2c0 2-1.4 3.4-3.2 3.6"/><path d="M12 13.4v3.4M8.6 20.4h6.8l-.8-3.6H9.4z"/>',
    crown:     '<path d="M3.4 17.4l1.4-9 4.4 3.4L12 5.4l2.8 6.4 4.4-3.4 1.4 9z"/><path d="M3.4 20h17.2"/>',
    anchor:    '<circle cx="12" cy="5.6" r="2.2"/><path d="M12 7.8v11.6"/><path d="M8 10.4h8"/><path d="M4.6 14.2a7.4 7.4 0 0 0 14.8 0"/>',
    clover:    '<path d="M12 12c0-2.6-1.4-4.4-3.4-4.4a2.6 2.6 0 0 0 0 5.2c2 0 3.4-1 3.4-.8z"/><path d="M12 12c2.6 0 4.4-1.4 4.4-3.4a2.6 2.6 0 0 1 0 5.2c-2 0-4.4-1-4.4-.8z"/><path d="M12 12c0 2.6-1.4 4.4-3.4 4.4a2.6 2.6 0 0 0 5.2 0c0-2-1-4.4-.8-4.4z"/><path d="M12 12V6.4"/>',
    compass:   '<circle cx="12" cy="12" r="8.4"/><path d="M15.4 8.6l-1.8 5.4-5 1.4 1.8-5.4z"/>',
    leaf:      '<path d="M20 4.6c-8.4-1-14 3-14 8.6a5.4 5.4 0 0 0 5.4 5.4c5.6 0 9.6-5.6 8.6-14z"/><path d="M4.4 19.6l6-6"/>',
    card:      '<rect x="3.6" y="6.4" width="10" height="14" rx="2.2"/><path d="M17 6.4h1.2A2.2 2.2 0 0 1 20.4 9v8.6"/><path d="M8.6 11.4v4M6.6 13.4h4"/>',
    eye:       '<path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
    ghost:     '<path d="M5.4 20.4V11a6.6 6.6 0 0 1 13.2 0v9.4l-2.6-1.8-2.6 1.8-2.8-1.8-2.6 1.8z"/><path d="M9.6 10.6h.02M14.4 10.6h.02"/>',
    paw:       '<circle cx="7" cy="8" r="1.8"/><circle cx="12" cy="6.4" r="1.8"/><circle cx="17" cy="8" r="1.8"/><path d="M8.4 15.4c0-2.4 1.6-4.2 3.6-4.2s3.6 1.8 3.6 4.2c0 2-1.6 3.4-3.6 3.4s-3.6-1.4-3.6-3.4z"/>',
    gift:      '<rect x="3.8" y="9.4" width="16.4" height="4" rx="1.6"/><path d="M5.4 13.4v7.2h13.2v-7.2"/><path d="M12 9.4v11.2"/><path d="M12 9.4C10.6 6 8.6 5 7.4 6.2S8.4 9.4 12 9.4zM12 9.4c1.4-3.4 3.4-4.4 4.6-3.2s-1 3.2-4.6 3.2z"/>',
    warn:      '<path d="M12 3.6l9 15.8H3z"/><path d="M12 9.4v4.4M12 16.8h.02"/>',
    arrow:     '<path d="M5 12h13M13 7l5 5-5 5"/>',
    dot:       '<circle cx="12" cy="12" r="3.2"/>',
    // —— 七把武器：各自独立的剪影 ——
    w_pistol:  '<path d="M4 10.6h8.6l1.8-2.2h5.6v3.4h-3.4l-1 1.8H9.4v3.2H6.6v-3.2H4z"/><path d="M9.4 13.6l1.4 4.8"/>',
    w_smg:     '<path d="M3.4 9.4h9.8l2.6 1.6h4v3H14l-1.6 1.6H7.2v3H4.4v-3H3.4z"/><path d="M7.2 15.6v3.2M10.4 15.6v3.2"/><path d="M3.4 9.4V7.2h4"/>',
    w_spread:  '<path d="M3 12.2h7.6"/><path d="M10.6 9.6l4.6-3.4M10.6 12.2h5.8M10.6 14.8l4.6 3.4"/><path d="M15.2 7.4l3.2-1.2M15.2 17l3.2 1.2"/>',
    w_sniper:  '<path d="M2 12.4h7.6l3.4-1.6h6.4l1.6 1.6-1.6 1.6H13l-3.4-1.6H2z"/><path d="M9.6 8.2h4.2v2.6H9.6z"/><path d="M6.4 12.4v3.4"/>',
    w_laser:   '<path d="M4 12h6.4"/><rect x="10.4" y="8.6" width="5.6" height="6.8" rx="1.6"/><path d="M16 10.4h4M16 13.6h4"/><path d="M4.6 8.4l2.2 2.2M4.6 15.6l2.2-2.2"/>',
    w_mine:    '<rect x="8.6" y="9.4" width="7" height="8.4" rx="2.6"/><path d="M8.6 12.4H5.4M15.6 12.4h3.2"/><path d="M12 9.4V6.4"/><circle cx="12" cy="5.2" r="1.2"/>',
    w_trident: '<path d="M12 4.2v16"/><path d="M7.6 6.6v3.6a4.4 4.4 0 0 0 8.8 0V6.6"/><path d="M5.4 6.6h4.4M14.2 6.6h4.4"/><path d="M9 20.4h6"/>',
    // —— 手柄按键（Xbox / PlayStation 两套） ——
    padA:      '<circle cx="12" cy="12" r="8.2"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
    padB:      '<circle cx="12" cy="12" r="8.2"/><path d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2"/>',
    padX:      '<circle cx="12" cy="12" r="8.2"/><path d="M12 8.6l3.2 5.4H8.8z"/>',
    padY:      '<circle cx="12" cy="12" r="8.2"/><path d="M9.2 14.4L12 8.6l2.8 5.8z"/>',
    padLB:     '<rect x="3.4" y="8.6" width="7.2" height="6.8" rx="2.2"/><path d="M7 15.4v3.4h10v-3.4"/>',
    padRT:     '<rect x="13.4" y="8.6" width="7.2" height="6.8" rx="2.2"/><path d="M17 8.6V5.2H7v3.4"/><path d="M17.4 10.4l.4 3.2"/>',
    padStart:  '<rect x="8.6" y="4.6" width="6.8" height="4" rx="2"/><path d="M12 8.6v10.8"/><path d="M6.4 19.4h11.2"/>',
    padLstick: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="2.8"/><path d="M12 6.6v2M12 15.4v2M6.6 12h2M15.4 12h2"/>',
    padRstick: '<circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="2"/><path d="M12 8.2v1.4M12 14.4v1.4M8.2 12h1.4M14.4 12h1.4"/>',

  };

  // 旧 emoji → 图标名
  var EMOJI = {
    '🔫':'gun','🌀':'compass','🛡':'shield','⚠':'warn','⚡':'bolt','❤':'heart','♥':'heart','💗':'heart',
    '🎯':'target','🧲':'magnet','🩸':'drop','🦈':'shark','🐟':'fish','💰':'coin','🎴':'card','🔥':'flame',
    '★':'star','💥':'burst','🚀':'speed','💨':'speed','🔵':'dot','🎆':'burst','🗡':'trident','💢':'burst',
    '🌿':'leaf','🧭':'compass','💣':'grenade','🌵':'paw','🍀':'clover','🏆':'trophy','🌊':'wave',
    '👑':'crown','⚓':'anchor','✔':'check','🔒':'lock','🎁':'gift','→':'arrow'
  };

  var sprite = Object.keys(P).map(function(k){
    return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + P[k] + '</symbol>';
  }).join('');

  function mount(){
    if (document.getElementById('icoSprite')) return;
    var d = document.createElement('div');
    d.innerHTML = '<svg id="icoSprite" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + sprite + '</svg>';
    document.body.insertBefore(d.firstChild, document.body.firstChild);
  }

  function name(x){
    if (!x) return 'dot';
    if (P[x]) return x;
    return EMOJI[x] || 'dot';
  }
  // 返回带 <svg> 的标记，直接塞进 innerHTML
  window.ico = function(x, cls){
    var n = name(x);
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  };
  window.icoName = name;
  window.icoReady = true;
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount, { once: true });
})();
