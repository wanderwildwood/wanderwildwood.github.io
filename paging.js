// Pages that turn, as the apps' lists do (/opt/projects/STYLE.md, Lists; his word 2026-11-20: "page instead of scroll,
// just like our house rules"). Nothing scrolls continuously: a wheel turn, a swipe, Space or Page Down turns one page
// and stops. A page ends on a block's edge; the block the foot cuts through stays in view, and the next page opens on
// it whole (the apps' cut row). A block taller than the window is read a window at a time. Down the right edge, MMD's
// scrollbar as the apps draw it: a chevron at each end turns a page, a tap on the track jumps there, the thumb says how
// far along you are. No page number. A blank tail after the last block lets the last page start on a block too.
// Not on the game's page, where the scrolling is the walk.
(function () {
  var root = document.documentElement;
  if (!window.matchMedia || !document.querySelector) return;
  var BAR = 22;   // the bar's width, in px
  var BLOCKS = 'main h1, main h2, main h3, main h4, main p, main li, main figure, main nav, main pre, main table, ' +
    'main .app, main .intro, main .hero, main .folder, main .fan, main .drop, main .controls, main > *, body > footer, main footer';
  var SKIP = '.stage, .stage *, button.theme, .peekmark';   // fixed or sticky things move with the window: never an edge

  var css = document.createElement('style');
  css.textContent =
    'html.paged { scroll-behavior: auto !important; scrollbar-width: none; }' +
    'html.paged::-webkit-scrollbar { display: none; }' +
    'html.paged body { margin-right: ' + BAR + 'px; }' +
    'html.paged .page-tail { height: 100vh; }' +
    'html.paged button.theme { margin-right: ' + BAR + 'px; }' +   // fixed things in the right-hand corner clear the bar
    '@media (max-width: 52rem) { html.paged .stage { margin-right: ' + BAR + 'px; } }' +
    '.pbar { position: fixed; z-index: 60; top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px);' +
    '  right: env(safe-area-inset-right, 0px); width: ' + BAR + 'px; display: flex; flex-direction: column;' +
    '  background: var(--paper, #d9d8d3); border-left: 2px solid var(--rule, #c1bfb8); }' +
    '.pbar button { flex: none; height: ' + BAR + 'px; width: 100%; padding: 0; margin: 0; border: 0; background: none;' +
    '  color: var(--ink, #252422); cursor: pointer; display: flex; align-items: center; justify-content: center; }' +
    '.pbar button:disabled { color: var(--rule, #c1bfb8); cursor: default; }' +
    '.pbar button svg { width: 12px; height: 8px; }' +
    '.pbar button:focus-visible { outline: 2px solid var(--ink, #252422); outline-offset: -2px; }' +
    '.pbar .track { position: relative; flex: 1; cursor: pointer; }' +
    '.pbar .thumb { position: absolute; left: 5px; right: 5px; background: var(--ink, #252422); min-height: 20px; }';
  document.head.appendChild(css);

  var tail = document.createElement('div'); tail.className = 'page-tail'; tail.setAttribute('aria-hidden', 'true');
  var bar = document.createElement('div'); bar.className = 'pbar';
  var chev = function (d) { return '<svg viewBox="0 0 12 8" aria-hidden="true"><path fill="currentColor" d="' +
    (d < 0 ? 'M0 8h2V6h2V4h4v2h2v2h2V6h-2V4H8V2H4v2H2v2H0z' : 'M0 0h2v2h2v2h4V2h2V0h2v2h-2v2H8v2H4V4H2V2H0z') + '"/></svg>'; };
  bar.innerHTML = '<button type="button" class="up" aria-label="Previous page" title="Previous page">' + chev(-1) + '</button>' +
    '<div class="track" aria-hidden="true"><div class="thumb"></div></div>' +
    '<button type="button" class="down" aria-label="Next page" title="Next page">' + chev(1) + '</button>';
  var up = bar.querySelector('.up'), down = bar.querySelector('.down'), track = bar.querySelector('.track'), thumb = bar.querySelector('.thumb');

  var on = false;
  function vh() { return window.innerHeight; }
  function y() { return window.pageYOffset || root.scrollTop || 0; }
  // the page's own length, without the blank tail
  function contentH() { return Math.max(vh(), tail.offsetTop); }
  function lastTop() { return Math.max(0, contentH() - vh()); }

  // every block's top and bottom, in page coordinates
  function blocks() {
    var out = [], sy = y();
    document.querySelectorAll(BLOCKS).forEach(function (e) {
      if (e.matches(SKIP) || e === tail) return;
      var r = e.getBoundingClientRect();
      if (r.height < 1 || r.width < 1) return;
      out.push({ top: Math.round(r.top + sy), bottom: Math.round(r.bottom + sy) });
    });
    return out;
  }
  function go(t) {
    t = Math.max(0, Math.min(Math.round(t), tail.offsetTop + tail.offsetHeight - vh()));
    window.scrollTo(0, t);
    paint();
  }
  // forward: the block the foot cuts through comes to the top, whole; if none is cut, the first one below
  function next() {
    var cur = y(), foot = cur + vh(), bs = blocks(), best = Infinity;
    if (cur >= lastTop() - 1 && foot >= contentH() - 1) return;
    // (a block taller than the window is the cut block only when it starts in the lower half of the page: the grid of
    // cards, starting just under the top, would otherwise turn the page a few px)
    bs.forEach(function (b) { if ((b.bottom - b.top <= vh() || b.top - cur >= vh() / 2) && b.top > cur + 2 && b.top < foot && b.bottom > foot && b.top < best) best = b.top; });
    if (best === Infinity) bs.forEach(function (b) { if (b.top >= foot && b.top < best) best = b.top; });
    if (best === Infinity || best - cur > vh()) best = cur + vh() - 40;   // nothing to land on: a window at a time, a line of overlap
    go(best);
  }
  // back: the block now at the top becomes the cut block at the foot of the page before
  function prev() {
    var cur = y(); if (cur <= 0) return;
    var want = cur - vh() + 1, best = Infinity;
    blocks().forEach(function (b) { if (b.top >= want && b.top < cur - 2 && b.top < best) best = b.top; });
    go(best === Infinity ? cur - vh() + 40 : best);
  }
  // a tap on the track: there, then back to the top of the block it landed in
  function jumpTo(frac) {
    var t = frac * contentH() - vh() / 2, best = 0;
    if (t <= 0) return go(0);
    blocks().forEach(function (b) { if (b.top <= t && b.top > best) best = b.top; });
    go(Math.min(best, lastTop()));
  }
  function paint() {
    if (!on) return;
    var h = track.clientHeight, total = contentH(), cur = y();
    var th = Math.max(20, Math.round(h * Math.min(1, vh() / total)));
    var tt = Math.round((h - th) * Math.min(1, cur / Math.max(1, lastTop())));
    thumb.style.height = th + 'px'; thumb.style.top = tt + 'px';
    up.disabled = cur <= 0;
    down.disabled = cur >= lastTop() - 1;
  }

  function editing(t) { return t && t.closest && t.closest('input, textarea, select, [contenteditable]'); }
  var locked = false, quiet;
  function turn(d) { if (d > 0) next(); else prev(); }
  addEventListener('wheel', function (e) {
    if (!on || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    clearTimeout(quiet); quiet = setTimeout(function () { locked = false; }, 220);   // one turn per gesture, however long a trackpad coasts
    if (locked || Math.abs(e.deltaY) < 1) return;
    locked = true; turn(e.deltaY);
  }, { passive: false });
  addEventListener('keydown', function (e) {
    if (!on || e.altKey || e.ctrlKey || e.metaKey || editing(e.target)) return;
    var k = e.key, d = 0;
    if (k === 'PageDown' || k === 'ArrowDown' || (k === ' ' && !e.shiftKey)) d = 1;
    else if (k === 'PageUp' || k === 'ArrowUp' || (k === ' ' && e.shiftKey)) d = -1;
    else if (k === 'Home') { e.preventDefault(); return go(0); }
    else if (k === 'End') { e.preventDefault(); return go(lastTop()); }
    if (!d) return;
    if (k === ' ' && e.target && e.target.closest && e.target.closest('button, a')) return;   // a space on a button presses it
    e.preventDefault(); turn(d);
  });
  var sx = 0, sy0 = 0, moved = false;
  addEventListener('touchstart', function (e) {
    if (!on || e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy0 = e.touches[0].clientY; moved = false;
  }, { passive: true });
  addEventListener('touchmove', function (e) {
    if (!on || e.touches.length !== 1 || editing(e.target)) return;
    var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy0;
    if (Math.abs(dy) > Math.abs(dx)) { e.preventDefault(); moved = true; }   // the page does not slide; it turns at the end of the swipe
  }, { passive: false });
  addEventListener('touchend', function (e) {
    if (!on || !moved) return;
    var dy = (e.changedTouches[0] || {}).clientY - sy0;
    if (Math.abs(dy) > 30) turn(-dy);
  });
  up.addEventListener('click', prev);
  down.addEventListener('click', next);
  track.addEventListener('click', function (e) { var r = track.getBoundingClientRect(); jumpTo((e.clientY - r.top) / r.height); });
  addEventListener('scroll', paint, { passive: true });   // a link to a heading, the browser's find: the bar follows

  function setup() {
    var need = document.body.scrollHeight - (tail.parentNode ? tail.offsetHeight : 0) > vh() + 4;
    if (need && !on) {
      on = true; root.classList.add('paged');
      document.body.appendChild(tail); document.body.appendChild(bar);
    } else if (!need && on) {
      on = false; root.classList.remove('paged'); tail.remove(); bar.remove();
    }
    paint();
  }
  addEventListener('resize', setup);
  addEventListener('load', setup);
  if (document.readyState !== 'loading') setup(); else document.addEventListener('DOMContentLoaded', setup);
})();
