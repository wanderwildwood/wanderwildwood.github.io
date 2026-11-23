// An app's own page: sections come up as they are reached, and the phone beside the words shows the
// app's screen for whatever part has come to the middle of the window, with the flash an E Ink
// screen makes between pages. The dots under the phone pick a screen by hand. A picture that is
// missing just leaves the last one up. An Obtainium link shows only on Android.
(function () {
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var secs = document.querySelectorAll('section.rv');
  function seen(el) { el.classList.add('seen'); }
  if (!('IntersectionObserver' in window) || still) {
    secs.forEach(seen);
  } else {
    var up = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { seen(e.target); up.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    secs.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) seen(el); else up.observe(el);
    });
  }

  if (/Android/.test(navigator.userAgent)) {
    document.querySelectorAll('a.obtainium').forEach(function (a) { a.hidden = false; });
  }

  var stage = document.querySelector('.stage'); if (!stage) return;
  var screen = stage.querySelector('.screen'), cap = stage.querySelector('.cap'), dots = stage.querySelector('.dots');
  var imgs = [].slice.call(screen.querySelectorAll('img'));
  var now = imgs.length ? imgs[0].dataset.name : '';
  imgs.forEach(function (img) {
    img.addEventListener('error', function () { img.dataset.broken = '1'; });
    if (!dots) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.name = img.dataset.name;
    b.setAttribute('aria-label', img.dataset.cap);
    b.title = img.dataset.cap;
    b.setAttribute('aria-pressed', img.dataset.name === now ? 'true' : 'false');
    b.addEventListener('click', function () { show(img.dataset.name); });
    dots.appendChild(b);
  });
  function show(name) {
    if (name === now) return;
    var img = screen.querySelector('img[data-name="' + name + '"]');
    if (!img || img.dataset.broken || (img.complete && !img.naturalWidth)) return;
    now = name;
    imgs.forEach(function (x) { x.classList.toggle('on', x === img); });
    if (!still) { screen.classList.remove('flash'); void screen.offsetWidth; screen.classList.add('flash'); }
    if (cap) cap.textContent = img.dataset.cap;
    if (dots) dots.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.name === name ? 'true' : 'false');
    });
  }
  // Only where the phone stays beside the words: under the name, on a narrow screen, it is out of
  // sight by then, and turning it would only move the dots.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (matchMedia('(max-width: 52rem)').matches) return;
      es.forEach(function (e) { if (e.isIntersecting && e.target.offsetParent !== null) show(e.target.dataset.shot); });
    }, { rootMargin: '-42% 0px -52% 0px' });
    document.querySelectorAll('[data-shot]').forEach(function (m) { io.observe(m); });
  }
  var corner = document.querySelector('button.theme');
  if (corner && !still) corner.addEventListener('click', function () {
    screen.classList.remove('flash'); void screen.offsetWidth; screen.classList.add('flash');
  });
})();
