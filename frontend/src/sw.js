/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

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

const checkinSync = new BackgroundSyncPlugin('sync-donor-checkins', {
  maxRetentionTime: 24 * 60,
  onSync: async ({ queue }) => {
    let entry;
    const batch = [];
    while ((entry = await queue.shiftRequest())) {
      try {
        const cloned = entry.request.clone();
        batch.push(await cloned.json());
      } catch {
        await queue.unshiftRequest(entry);
        throw new Error('Could not read queued check-in');
      }
    }
    if (!batch.length) return;
    const response = await fetch('/api/v1/checkins/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Offline-Replay': '1' },
      body: JSON.stringify({ items: batch })
    });
    if (!response.ok) throw new Error(`Batch replay failed: ${response.status}`);
  }
});

registerRoute(
  ({ url, request }) => url.pathname === '/api/v1/checkins' && request.method === 'POST',
  new NetworkOnly({ plugins: [checkinSync] }),
  'POST'
);

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
