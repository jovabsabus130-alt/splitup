// Service to manage system notification bar alerts and service worker registration

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      return registration;
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }
  return null;
}

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'denied';
  }
}

export async function sendSystemNotification({ title, body, icon = '/favicon.svg', data = { url: '/dashboard' }, tag = 'splitup-alert' }) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  // 1. Try to display via active Service Worker (appears in mobile/desktop notification bar even in background)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title || 'SplitUp', {
          body: body || 'New activity in SplitUp',
          icon,
          badge: icon,
          vibrate: [200, 100, 200],
          tag,
          renotify: true,
          data,
        });
        return true;
      }
    } catch (err) {
      console.warn('Failed to show via ServiceWorker:', err);
    }
  }

  // 2. Fallback to standard Notification API
  try {
    const notif = new Notification(title || 'SplitUp', {
      body: body || 'New activity in SplitUp',
      icon,
      tag,
      data,
    });
    notif.onclick = () => {
      window.focus();
      if (data && data.url) {
        window.location.href = data.url;
      }
      notif.close();
    };
    return true;
  } catch (err) {
    console.warn('Failed to show notification via standard API:', err);
    return false;
  }
}
