// Helper notifiche compatibile con le PWA mobile.
// Su Android/installata, `new Notification()` è bloccato: bisogna usare
// ServiceWorkerRegistration.showNotification(). Qui proviamo prima il SW
// e ricadiamo sul costruttore solo su desktop.

export async function ensureNotificationPermission() {
  if (typeof window === 'undefined') return 'unsupported';
  // App nativa: il permesso è quello di sistema (Android 13+ / iOS) e passa dal plugin push,
  // non da `Notification.requestPermission()` — che nella WebView non è affidabile.
  if (window.Capacitor?.isNativePlatform?.()) {
    const { nativePushPermission, nativeRequestPushPermission } = await import('./native');
    const current = await nativePushPermission();
    if (current === 'granted' || current === 'denied') return current;
    const asked = await nativeRequestPushPermission();
    return asked === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }
  return Notification.permission;
}

export async function notify(title, body, options = {}) {
  if (typeof window === 'undefined') return;
  // App nativa: niente service worker, la notifica locale la programma il sistema.
  if (window.Capacitor?.isNativePlatform?.()) {
    const { nativeLocalNotify } = await import('./native');
    await nativeLocalNotify(title, body);
    return;
  }
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const payload = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [80, 40, 80],
    ...options,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, payload);
        return;
      }
    }
    // Fallback desktop
    new Notification(title, payload);
  } catch (err) {
    console.warn('Notifica non mostrata:', err);
  }
}
