// Wander, from the game, along the way down a page, moving as the game's own page moves him: by the scroll.
// Scrolled down, he goes on; scrolled back, he goes back. On the main page he only looks out, still, from behind
// the picture of each app the game quietly knows about (the cards named in data-cards: nothing says why). On Home's page he walks in along the
// bottom of the screen and stays there, looks up, and sits down by the end; scrolled back, he gets up and walks off. A press on him opens the game's page.
// Drawn from shots/wander-peek.png: fourteen frames of 14x37 from the game's own sheet (stand, look up, the
// eight of the walk, the three of sitting down, and sitting). Sat on Home's page he fills and lights his pipe and
// smokes it: shots/wander-pipe.png, frames of 15x37 from the game's own (its fire's pipelight: the pipe out, the pouch,
// two pinches, the tamp, the sparks, the draws), then eight of the pipe at his mouth, a wisp off the bowl rising as you scroll.
(function () {
  var script = document.currentScript, base = (script && script.dataset.base) || '';
  var mode = (script && script.dataset.mode) || 'rise';
  var W = 14, H = 37, S = 3, N = 14;               // a frame; screen pixels to a game pixel; frames in the strip
  var STAND = 0, LOOK = 1, WALK = 2, SITDOWN = 10, SIT = 13;
  var STRIDE = 2 * S;                              // a walk frame for every two of his pixels gone, as the game steps him
  var PW = 15, RITUAL = [250,250,250,250,375,250,250,250,250,125,250,250,125,250,375,125,250,250,250,250,250,125,125,125,125,250,250,250,250,250,250,250,250];   // the pipe strip's frame width; the ritual's frames, each its ms in the game
  var PIPE_N = RITUAL.length + 8, PUFF = 28;       // frames in the pipe strip; page pixels scrolled to each puff frame

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
  function sheet(el, url, n, w) { if (el.dataset.sheet !== url) { el.dataset.sheet = url; el.style.backgroundImage = 'url(' + url + ')'; el.style.width = w * S + 'px'; el.style.backgroundSize = w * S * n + 'px ' + H * S + 'px'; } }
  function poseW(el, n, w) { el.style.backgroundPosition = (-n * w * S) + 'px 0'; }
  var ritualAll = RITUAL.reduce(function (a, b) { return a + b; }, 0);
  function ritualFrame(t) { var at = t * ritualAll, i = 0; while (i < RITUAL.length - 1 && at >= RITUAL[i]) { at -= RITUAL[i]; i++; } return i; }
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
    // stops a little way in, staying at the bottom of the screen while the page goes by; he looks up, sits down
    // halfway down, fills his pipe and lights it, and smokes it the rest of the way, a wisp off it rising as the page
    // goes by (22 Nov 2026). Scrolled back, it all goes back the way it came, and he walks off.
    var w = figure();
    var pipeUrl = base + 'shots/wander-pipe.png', walkUrl = base + 'shots/wander-peek.png';
    new Image().src = pipeUrl;
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
      else if (p < 0.46) { x = into; n = p >= 0.3 && p < 0.4 ? LOOK : STAND; }
      else { x = into; var s = part(p, 0.46, 0.5); n = s >= 1 ? SIT : s <= 0 ? STAND : SITDOWN + Math.min(2, Math.floor(s * 3)); }
      var piping = n === SIT && p >= 0.52;               // sat a moment first, then the pipe out
      sheet(w, piping ? pipeUrl : walkUrl, piping ? PIPE_N : N, piping ? PW : W);
      if (piping) n = p < 0.72 ? ritualFrame(part(p, 0.52, 0.72))
        : RITUAL.length + Math.floor(Math.max(0, scrollY - 0.72 * span) / PUFF) % 8;
      face(w, true);                                     // come in from the right, facing into the page
      w.style.right = snap(x) + 'px';
      w.style.visibility = p > 0.03 ? 'visible' : 'hidden';
      if (piping) poseW(w, n, PW); else pose(w, n);
    });
  }
  ask();
})();
