// Wander, from the game, along the way down a page, moving as the game's own page moves him: by the scroll.
// Scrolled down, he goes on; scrolled back, he goes back. On the main page he rises from behind the picture
// of each app the game quietly knows about (the cards named in data-cards: nothing says why), looks out over
// its top at the visitor, and sinks out of sight again as it goes. On Home's page he walks in from the
// right margin, looks up, and sits down; scrolled back, he gets up and walks off. A press on him opens the game's page.
// Drawn from shots/wander-peek.png: fourteen frames of 14x37 from the game's own sheet (stand, look up, the
// eight of the walk, the three of sitting down, and sitting).
(function () {
  var script = document.currentScript, base = (script && script.dataset.base) || '';
  var mode = (script && script.dataset.mode) || 'rise';
  var W = 14, H = 37, S = 3, N = 14;               // a frame; screen pixels to a game pixel; frames in the strip
  var STAND = 0, LOOK = 1, WALK = 2, SITDOWN = 10, SIT = 13;
  var STRIDE = 2 * S;                              // a walk frame for every two of his pixels gone, as the game steps him

  function figure() {
    var a = document.createElement('a');
    a.className = 'wander-peek';
    a.href = base + 'wanderthegame/';
    a.title = 'Wander';
    a.setAttribute('aria-hidden', 'true');
    a.tabIndex = -1;
    a.style.cssText = 'position:absolute;display:block;width:' + W * S + 'px;height:' + H * S + 'px;' +
      'background:url(' + base + 'shots/wander-peek.png) 0 0/' + W * S * N + 'px ' + H * S + 'px no-repeat;' +
      'image-rendering:pixelated;cursor:pointer;z-index:0;visibility:hidden;';
    return a;
  }
  function pose(el, n) { el.style.backgroundPosition = (-n * W * S) + 'px 0'; }
  function face(el, left) { el.style.transform = left ? 'scaleX(-1)' : 'none'; }
  function snap(v) { return Math.round(v / S) * S; }   // whole game pixels
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function part(p, a, b) { return clamp((p - a) / (b - a)); }   // how far p is through [a, b]
  function walkFrame(dist) { return WALK + (Math.floor(Math.abs(dist) / STRIDE) % 8); }

  var players = [], queued = false;
  function frame() { queued = false; players.forEach(function (f) { f(); }); }
  function ask() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  addEventListener('load', ask);

  if (mode === 'rise') {
    var ids = ((script && script.dataset.cards) || '').split(',').filter(Boolean);
    ids.map(function (id) { return document.getElementById(id.trim()); })
      .filter(function (c) { return c && c.querySelector('img.shot'); })
      .forEach(function (card) {
        var shot = card.querySelector('img.shot');
        var holder = (shot.parentNode.tagName === 'PICTURE' || shot.parentNode.tagName === 'A') ? shot.parentNode : shot;
        if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
        holder.style.position = 'relative';
        holder.style.zIndex = '1';
        var w = figure();
        card.insertBefore(w, card.firstChild);
        players.push(function () {
          var r = card.getBoundingClientRect(), vh = innerHeight;
          // 0 as the card's top comes up past 90% of the screen, 1 as it goes over 20%
          var p = clamp((vh * 0.9 - r.top) / (vh * 0.7));
          var top = holder.offsetTop, lift = H * S * 0.34;
          var wide = holder.getBoundingClientRect().width;
          var right = holder.offsetLeft + wide - W * S - 6;   // at the picture's right, clear of a heading or links above
          var up = part(p, 0, 0.2) - part(p, 0.8, 1);      // up from behind as it comes, down again as it goes
          var n = up >= 1 ? LOOK : STAND;                  // once up, he looks out at the visitor
          w.style.left = snap(right) + 'px';
          w.style.top = snap(top - lift * up) + 'px';
          w.style.visibility = up > 0 ? 'visible' : 'hidden';
          pose(w, n);
        });
      });
  } else {
    // In from the right margin beside one part of the page, in the page, scrolling with it.
    var at = document.querySelector((script && script.dataset.at) || 'main');
    var main = document.querySelector('main') || document.body;
    if (!at) return;
    var w = figure();
    w.style.zIndex = '40';
    document.body.appendChild(w);
    players.push(function () {
      var room = innerWidth - main.getBoundingClientRect().right;
      if (room < W * S + 24) { w.style.visibility = 'hidden'; return; }   // no margin to stand in: he stays in the game
      var r = at.getBoundingClientRect(), vh = innerHeight;
      var p = clamp((vh * 0.95 - r.top) / (vh * 0.75));
      var into = Math.min(Math.max(room * 0.45 - W * S / 2, 12), 140);
      var off = -W * S - 4;
      var x, n;
      if (p < 0.5) { var a = part(p, 0.05, 0.5); x = off + (into - off) * a; n = a > 0 && a < 1 ? walkFrame(x - off) : STAND; }
      else if (p < 0.68) { x = into; n = LOOK; }
      else { x = into; var s = part(p, 0.68, 0.9); n = s >= 1 ? SIT : s <= 0 ? LOOK : SITDOWN + Math.min(2, Math.floor(s * 3)); }
      face(w, true);                                     // he has come in from the right: facing the page
      w.style.right = snap(x) + 'px';
      w.style.top = Math.round(r.top + scrollY + 24) + 'px';
      w.style.visibility = p > 0.05 ? 'visible' : 'hidden';
      pose(w, n);
    });
  }
  ask();
})();
