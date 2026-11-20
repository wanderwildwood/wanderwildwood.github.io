// Light or dark. The page follows the computer's or phone's setting until the button in the
// corner is pressed; then it keeps the choice (in localStorage, where the browser allows it).
// A choice that is the same as the system's is forgotten, so the page follows the system again.
// The line in each page's <head> sets data-theme before anything is drawn.
//
// In dark, a screenshot with data-dark shows that file instead (the apps' own dark mode), and
// Kumo's and Wander's <picture> follow the button as well as the system (Wander by day in light,
// at nightfall in dark).
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function systemDark() { return !!(mq && mq.matches); }
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : systemDark();
  }

  function apply() {
    var dark = isDark(), chosen = root.hasAttribute('data-theme');
    document.querySelectorAll('button.theme').forEach(function (b) {
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
    });
    document.querySelectorAll('img[data-dark]').forEach(function (img) {
      if (!img.hasAttribute('data-light')) img.setAttribute('data-light', img.getAttribute('src'));
      var want = img.getAttribute(dark ? 'data-dark' : 'data-light');
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
    document.querySelectorAll('source[data-dark-source]').forEach(function (s) {
      s.media = chosen ? (dark ? 'all' : 'not all') : '(prefers-color-scheme: dark)';
    });
    // A picture with a day and a night version (Wander's) says which one is showing.
    document.querySelectorAll('img[data-dark-alt]').forEach(function (img) {
      if (!img.hasAttribute('data-light-alt')) img.setAttribute('data-light-alt', img.getAttribute('alt'));
      img.setAttribute('alt', img.getAttribute(dark ? 'data-dark-alt' : 'data-light-alt'));
    });
  }

  document.querySelectorAll('button.theme').forEach(function (b) {
    b.addEventListener('click', function () {
      var dark = !isDark();
      var t = dark === systemDark() ? null : (dark ? 'dark' : 'light');
      if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
      try { if (t) localStorage.setItem('theme', t); else localStorage.removeItem('theme'); } catch (e) {}
      apply();
    });
  });
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
  }
  apply();
})();
