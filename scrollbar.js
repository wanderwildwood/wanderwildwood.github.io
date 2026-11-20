// MMD's scrollbar, as the apps draw it (/opt/projects/STYLE.md, Lists), down the right edge of the page: a chevron at
// each end moves a screen, a tap on the track jumps there, the thumb shows how far along you are and can be dragged.
// The page itself scrolls as any page does, the wheel a little faster (2026-11-20: paging tried and undone, at his word; the bar kept).
// Not on the game's page, where the scroll is the walk.
(function () {
  var root = document.documentElement;
  if (!document.querySelector) return;
  var BAR = 22;   // the bar's width, in px

  var css = document.createElement('style');
  css.textContent =
    'html.barred { scrollbar-width: none; }' +
    'html.barred::-webkit-scrollbar { display: none; }' +
    'html.barred body { margin-right: ' + BAR + 'px; }' +
    'html.barred button.theme { margin-right: ' + BAR + 'px; }' +   // fixed things in the right-hand corner clear the bar
    '@media (max-width: 52rem) { html.barred .stage { margin-right: ' + BAR + 'px; } }' +
    '.pbar { position: fixed; z-index: 60; top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px);' +
    '  right: env(safe-area-inset-right, 0px); width: ' + BAR + 'px; display: flex; flex-direction: column;' +
    '  background: var(--paper, #d9d8d3); border-left: 2px solid var(--rule, #c1bfb8); touch-action: none; }' +
    '.pbar button { flex: none; height: ' + BAR + 'px; width: 100%; padding: 0; margin: 0; border: 0; background: none;' +
    '  color: var(--ink, #252422); cursor: pointer; display: flex; align-items: center; justify-content: center; }' +
    '.pbar button:disabled { color: var(--rule, #c1bfb8); cursor: default; }' +
    '.pbar button svg { width: 12px; height: 8px; }' +
    '.pbar button:focus-visible { outline: 2px solid var(--ink, #252422); outline-offset: -2px; }' +
    '.pbar .track { position: relative; flex: 1; cursor: pointer; }' +
    '.pbar .thumb { position: absolute; left: 5px; right: 5px; background: var(--ink, #252422); min-height: 20px; cursor: grab; }';
  document.head.appendChild(css);

  var bar = document.createElement('div'); bar.className = 'pbar';
  var chev = function (d) { return '<svg viewBox="0 0 12 8" aria-hidden="true"><path fill="currentColor" d="' +
    (d < 0 ? 'M0 8h2V6h2V4h4v2h2v2h2V6h-2V4H8V2H4v2H2v2H0z' : 'M0 0h2v2h2v2h4V2h2V0h2v2h-2v2H8v2H4V4H2V2H0z') + '"/></svg>'; };
  bar.innerHTML = '<button type="button" class="up" aria-label="Up a screen" title="Up a screen">' + chev(-1) + '</button>' +
    '<div class="track" aria-hidden="true"><div class="thumb"></div></div>' +
    '<button type="button" class="down" aria-label="Down a screen" title="Down a screen">' + chev(1) + '</button>';
  var up = bar.querySelector('.up'), down = bar.querySelector('.down'), track = bar.querySelector('.track'), thumb = bar.querySelector('.thumb');

  var on = false;
  function vh() { return window.innerHeight; }
  function y() { return window.pageYOffset || root.scrollTop || 0; }
  function maxY() { return Math.max(0, root.scrollHeight - vh()); }
  function go(t) { window.scrollTo(0, Math.max(0, Math.min(Math.round(t), maxY()))); }   // at once: no glide on E Ink
  function geom() {
    var h = track.clientHeight, th = Math.max(20, Math.round(h * Math.min(1, vh() / root.scrollHeight)));
    return { h: h, th: th };
  }
  function paint() {
    if (!on) return;
    var g = geom(), cur = y(), m = maxY();
    thumb.style.height = g.th + 'px';
    thumb.style.top = Math.round((g.h - g.th) * (m ? Math.min(1, cur / m) : 0)) + 'px';
    up.disabled = cur <= 0;
    down.disabled = cur >= m - 1;
  }
  up.addEventListener('click', function () { go(y() - vh() + 40); });     // a screen, with a line of overlap to read on from
  down.addEventListener('click', function () { go(y() + vh() - 40); });
  track.addEventListener('click', function (e) {
    if (e.target === thumb) return;
    var r = track.getBoundingClientRect(), g = geom();
    go(((e.clientY - r.top - g.th / 2) / Math.max(1, g.h - g.th)) * maxY());
  });
  var dragging = false, grabY = 0;
  thumb.addEventListener('pointerdown', function (e) {
    dragging = true; grabY = e.clientY - thumb.getBoundingClientRect().top;
    thumb.setPointerCapture(e.pointerId); e.preventDefault();
  });
  thumb.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var r = track.getBoundingClientRect(), g = geom();
    go(((e.clientY - r.top - grabY) / Math.max(1, g.h - g.th)) * maxY());
  });
  thumb.addEventListener('pointerup', function () { dragging = false; });
  thumb.addEventListener('pointercancel', function () { dragging = false; });
  addEventListener('scroll', paint, { passive: true });

  // The wheel a little faster than the browser's own step (his word, 11-20): half as far again, at once, no glide.
  // Pinch-zoom (ctrl), sideways wheels, and anything inside the page that scrolls on its own are left to the browser.
  var WHEEL = 1.5;
  function scrollsItself(t) {
    for (var e = t; e && e !== document.body && e !== root; e = e.parentElement) {
      var o = getComputedStyle(e).overflowY;
      if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return true;
    }
    return false;
  }
  addEventListener('wheel', function (e) {
    if (!on || e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY) || scrollsItself(e.target)) return;
    var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh() : 1);
    e.preventDefault();
    go(y() + d * WHEEL);
  }, { passive: false });

  function setup() {
    var need = root.scrollHeight > vh() + 4;
    if (need && !on) { on = true; root.classList.add('barred'); document.body.appendChild(bar); }
    else if (!need && on) { on = false; root.classList.remove('barred'); bar.remove(); }
    paint();
  }
  addEventListener('resize', setup);
  addEventListener('load', setup);
  if (document.readyState !== 'loading') setup(); else document.addEventListener('DOMContentLoaded', setup);
})();
