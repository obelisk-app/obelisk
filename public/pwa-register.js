// Register once, even when hydration completes after window.load.
(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'OBELISK_SW_UPDATED') return;
    var key = 'obelisk-sw-version';
    var nextVersion = String(event.data.version || '');
    try {
      if (nextVersion && localStorage.getItem(key) === nextVersion) return;
      if (nextVersion) localStorage.setItem(key, nextVersion);
    } catch (_error) {}
    window.location.reload();
  });
  function register() {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(function (registration) {
      registration.update().catch(function () {});
    }).catch(function () {});
  }
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
