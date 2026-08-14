// Service worker do Web Push (VAPID). Kopiowany 1:1 do dist/ przez build
// Expo web (public/* trafia tam bez zmian, patrz index.html/maplibre-*.mjs
// w tym samym katalogu). Rejestrowany ręcznie z src/lib/web-push.ts po
// zgodzie użytkownika — nic tu nie robi zanim ktoś się nie zasubskrybuje.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'DUDIE DAY', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'DUDIE DAY';
  const options = {
    body: payload.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Kliknięcie w powiadomienie systemowe -> otwórz/skup istniejącą kartę apki
// i przekaż dane zdarzenia, żeby klient mógł nawigować (patrz message
// listener w web-push.ts, ten sam wzorzec co obsługa tapów z Expo Push
// na natywnych platformach w use-push-notifications.ts).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.postMessage({ type: 'push-notification-click', data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    }),
  );
});
