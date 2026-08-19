/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
self.clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'raktflow-pages', networkTimeoutSeconds: 4 }));
registerRoute(({ request }) => ['style', 'script', 'worker'].includes(request.destination), new StaleWhileRevalidate({ cacheName: 'raktflow-assets' }));
registerRoute(({ request }) => request.destination === 'image', new CacheFirst({
  cacheName: 'raktflow-images',
  plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 })]
}));

// Clinical check-in mutations are deliberately not queued offline. The current
// donor pass uses a server-held symmetric signing secret and must be verified
// online to enforce expiry, latest-screening selection, ownership and replay
// controls. A future offline mode requires asymmetric tokens and encrypted,
// revocable device provisioning; silently accepting unverified queued scans
// would create a blood-safety and privacy risk.

self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() || { title: 'RaktFlow update', body: event.data?.text?.() || 'A verified logistics update is available.' };
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: payload.tag || 'raktflow-alert',
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || '/' },
    actions: payload.actions || [{ action: 'open', title: 'Open RaktFlow' }]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'));
});
