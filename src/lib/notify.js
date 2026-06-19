// Helper notifiche compatibile con le PWA mobile.
// Su Android/installata, `new Notification()` è bloccato: bisogna usare
// ServiceWorkerRegistration.showNotification(). Qui proviamo prima il SW
// e ricadiamo sul costruttore solo su desktop.

export async function ensureNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
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
  if (typeof window === 'undefined' || !('Notification' in window)) return;
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
