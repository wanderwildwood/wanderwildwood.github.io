// Wander, from the game, along the way down a page, moving as the game's own page moves him: by the scroll.
// Scrolled down, he goes on; scrolled back, he goes back. On the main page he only looks out, still, from behind
// the picture of each app the game quietly knows about (the cards named in data-cards: nothing says why). On Home's page he walks in along the
// bottom of the screen and stays there, looks up, and sits down by the end; scrolled back, he gets up and walks off. A press on him opens the game's page.
// Drawn from shots/wander-peek.png: fourteen frames of 14x37 from the game's own sheet (stand, look up, the
// eight of the walk, the three of sitting down, and sitting).
(function () {
  var script = document.currentScript, base = (script && script.dataset.base) || '';
  var mode = (script && script.dataset.mode) || 'rise';
  var W = 14, H = 37, S = 3, N = 14;               // a frame; screen pixels to a game pixel; frames in the strip
  var STAND = 0, LOOK = 1, WALK = 2, SITDOWN = 10, SIT = 13;
  var STRIDE = 2 * S;                              // a walk frame for every two of his pixels gone, as the game steps him

  var feathered = ((script && script.dataset.feather) || '').split(',');   // cards where he has the feather in his hat band, as the game draws it
  function figure(feather) {
    var a = document.createElement('a');
    a.className = 'wander-peek';
    a.href = base + 'wanderthegame/';
    a.title = 'Wander';
    a.setAttribute('aria-hidden', 'true');
    a.tabIndex = -1;
    a.style.cssText = 'position:absolute;display:block;width:' + W * S + 'px;height:' + H * S + 'px;' +
      'background:url(' + base + (feather ? 'shots/wander-peek-feather.png' : 'shots/wander-peek.png') + ') 0 0/' + W * S * N + 'px ' + H * S + 'px no-repeat;' +
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
        var w = figure(feathered.indexOf(card.id) >= 0);
        card.insertBefore(w, card.firstChild);
        players.push(function () {
          var top = holder.offsetTop, lift = H * S * 0.34;
          var right = holder.offsetLeft + holder.getBoundingClientRect().width - W * S - 6;   // at the picture's right
          w.style.left = snap(right) + 'px';
          w.style.top = snap(top - lift) + 'px';
          w.style.visibility = 'visible';
          pose(w, LOOK);                                   // just there, still, looking out over the top
        });
      });
  } else {
    // Along the foot of the screen, as on the game's page: scrolled down, he walks in from the right edge and
    // stops a little way in, staying at the bottom of the screen while the page goes by; he looks up, and by
    // the end of the page he has sat down. Scrolled back, he gets up and walks off the way he came.
    var w = figure();
    w.style.position = 'fixed';
    w.style.bottom = '0';
    w.style.zIndex = '40';
    document.body.appendChild(w);
    players.push(function () {
      var span = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      var p = clamp(scrollY / span);
      var narrow = innerWidth < 52 * 16;
      // where he stops: in the margin on a wide screen; on a phone, just out from the edge (no phone in the corner there now)
      var main = document.querySelector('main') || document.body;
      var room = innerWidth - main.getBoundingClientRect().right;
      var into = narrow ? 16 : Math.min(Math.max(room * 0.5 - W * S / 2, 16), 160);
      var off = -W * S - 4;
      var x, n;
      if (p < 0.22) { var a = part(p, 0.03, 0.22); x = off + (into - off) * a; n = a > 0 && a < 1 ? walkFrame(x - off) : STAND; }
      else if (p < 0.8) { x = into; n = part(p, 0.3, 0.5) > 0 && p < 0.7 ? LOOK : STAND; }
      else { x = into; var s = part(p, 0.8, 0.95); n = s >= 1 ? SIT : s <= 0 ? STAND : SITDOWN + Math.min(2, Math.floor(s * 3)); }
      face(w, true);                                     // come in from the right, facing into the page
      w.style.right = snap(x) + 'px';
      w.style.visibility = p > 0.03 ? 'visible' : 'hidden';
      pose(w, n);
    });
  }
  ask();
})();
