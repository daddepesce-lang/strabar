// Self-contained: serialized into the root layout's beforeInteractive script.
export function applyPwaChrome(win) {
  const nav = win.navigator;
  // iOS freezes the OS token on recent Safari versions; prefer Version/27.x.
  const safariVersion = Number(nav.userAgent.match(/Version\/(\d+)/)?.[1] || 0);
  const osVersion = Number(nav.userAgent.match(/OS (\d+)[_\.]/)?.[1] || 0);
  const affected = nav.standalone === true
    && !win.Capacitor?.isNativePlatform?.()
    && (safariVersion || osVersion) >= 27;
  win.document.documentElement.toggleAttribute('data-pwa-ios-blur', affected);
  return affected;
}
