// SplitUp Background Service Worker for System Notifications
const CACHE_NAME = 'splitup-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push events (for Web Push Protocol)
self.addEventListener('push', (event) => {
  let payload = { title: 'SplitUp Notification', body: 'You have a new update in SplitUp', data: {} };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (err) {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body || 'You have a new activity in SplitUp',
    icon: payload.icon || '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    tag: payload.tag || 'splitup-notification',
    renotify: true,
    data: payload.data || { url: '/dashboard' },
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'SplitUp', options));
});

// Handle clicking on system notification in the notification bar
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window tab is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Listen for direct messages from the React app to display notifications in the notification bar
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title || 'SplitUp', {
      body: options?.body || 'New update in SplitUp',
      icon: options?.icon || '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200],
      tag: options?.tag || 'splitup-alert',
      renotify: true,
      data: options?.data || { url: '/dashboard' },
    });
  }
});
