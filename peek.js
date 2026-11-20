// Wander, from the game, now and then looks out at the visitor: on the main page he rises from behind
// an app's picture, two or three times down the page; on Home's page he steps in once from the right
// margin and back. A press on him opens the game's page. Drawn from shots/wander-peek.png: ten frames
// of 12x37 from the game's own sheet (stand, look up, then the eight of the walk). When less
// motion is asked for he does not move: he is already out, standing still. Each peek happens once per visit.
(function () {
  if (!('IntersectionObserver' in window)) return;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;   // then he is simply there, standing, with no motion
  var script = document.currentScript, base = (script && script.dataset.base) || '';
  var mode = (script && script.dataset.mode) || 'rise';
  var W = 12, H = 37, S = 3;                       // a frame, and how many screen pixels to a game pixel
  var STAND = 0, LOOK = 1, WALK = 2;               // where each pose starts in the strip

  function figure(flip) {
    var a = document.createElement('a');
    a.className = 'wander-peek';
    a.href = base + 'wanderthegame/';
    a.title = 'Wander';
    a.setAttribute('aria-hidden', 'true');
    a.tabIndex = -1;
    a.style.cssText = 'position:absolute;display:block;width:' + W * S + 'px;height:' + H * S + 'px;' +
      'background:url(' + base + 'shots/wander-peek.png) 0 0/' + W * S * 10 + 'px ' + H * S + 'px no-repeat;' +
      'image-rendering:pixelated;cursor:pointer;z-index:0;' + (flip ? 'transform:scaleX(-1);' : '');
    return a;
  }
  function pose(el, n) { el.style.backgroundPosition = (-n * W * S) + 'px 0'; }
  function later(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // Moves in steps, as the game moves him: whole game pixels, a few at a time.
  function slide(el, prop, from, to, ms, walk) {
    return new Promise(function (done) {
      var steps = Math.max(1, Math.round(Math.abs(to - from) / S)), i = 0, f = 0;
      var each = ms / steps;
      (function tick() {
        i++; var v = from + (to - from) * (i / steps);
        el.style[prop] = Math.round(v / S) * S + 'px';
        if (walk) { f = (f + 1) % 8; pose(el, WALK + f); }
        if (i < steps) setTimeout(tick, each); else done();
      })();
    });
  }
  function once(target, fn, opts) {
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { io.disconnect(); fn(); }
    }, opts);
    io.observe(target);
  }

  if (mode === 'rise') {
    // Two or three cards spread down the list, each in a row with a card above it (not just under a
    // heading), so he rises into the gap between the rows and never over words.
    var cards = [].slice.call(document.querySelectorAll('.apps > .app')).filter(function (c) {
      var p = c.previousElementSibling, n = 0;
      while (p && n < 4) { if (p.classList.contains('group')) return false; p = p.previousElementSibling; n++; }
      return c.querySelector('img.shot');
    });
    if (!cards.length) return;
    var picks = [0.18, 0.5, 0.82].map(function (q) { return cards[Math.floor(q * (cards.length - 1))]; })
      .filter(function (c, i, all) { return all.indexOf(c) === i; });
    picks.forEach(function (card, k) {
      var shot = card.querySelector('img.shot');
      var holder = shot.parentNode.tagName === 'PICTURE' || shot.parentNode.tagName === 'A' ? shot.parentNode : shot;
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      holder.style.position = holder.style.position || 'relative';
      holder.style.zIndex = '1';
      var w = figure(k % 2 === 1);
      w.style.top = (holder.offsetTop) + 'px';
      w.style.left = Math.round(holder.offsetWidth - W * S - 10) + 'px';   // at the picture's right, clear of the links above
      pose(w, STAND);
      card.insertBefore(w, card.firstChild);
      once(card, function () {
        var top = holder.offsetTop, up = top - Math.round(H * S * 0.4);
        w.style.top = top + 'px';
        w.style.left = (holder.offsetLeft + holder.getBoundingClientRect().width - W * S - 10) + 'px';   // measured now the picture is laid out
        if (still) { w.style.top = up + 'px'; pose(w, LOOK); return; }
        later(400 + k * 150)
          .then(function () { return slide(w, 'top', top, up, 700); })
          .then(function () { return later(700); })
          .then(function () { pose(w, LOOK); return later(1500); })
          .then(function () { pose(w, STAND); return later(500); })
          .then(function () { return slide(w, 'top', up, top, 500); });
      }, { rootMargin: '0px 0px -30% 0px', threshold: 0.25 });
    });
  } else {
    // In from the right margin, once, as the last part of the page comes up: he walks in a little way,
    // looks up, and walks back out.
    var at = document.querySelector(script.dataset.at || 'main');
    if (!at) return;
    var w = figure(true);
    w.style.position = 'fixed';
    w.style.zIndex = '40';
    w.style.bottom = '14vh';
    w.style.right = -W * S + 'px';
    pose(w, STAND);
    document.body.appendChild(w);
    once(at, function () {
      var room = Math.max(0, (innerWidth - (document.querySelector('main') || document.body).getBoundingClientRect().right));
      var into = Math.min(Math.max(room * 0.45, 18), 120);
      if (still) { w.style.right = into + 'px'; pose(w, LOOK); return; }
      slide(w, 'right', -W * S, into, 1600, true)
        .then(function () { pose(w, STAND); return later(600); })
        .then(function () { pose(w, LOOK); return later(1600); })
        .then(function () { pose(w, STAND); return later(400); })
        .then(function () { w.style.transform = 'none'; return slide(w, 'right', into, -W * S - 4, 1500, true); })
        .then(function () { w.remove(); });
    }, { threshold: 0.3 });
  }
})();
