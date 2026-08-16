export async function registerServiceWorker(onUpdate) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { type: 'module' });
    registration.addEventListener('updatefound', () => onUpdate?.(registration));
    return registration;
  } catch (error) {
    console.warn('Service worker registration unavailable:', error);
  }
}
