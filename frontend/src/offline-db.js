const DB_NAME = 'raktflow_offline_scans';
const DB_VERSION = 1;
const STORE = 'pending_checkins';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'idempotency_key' });
        store.createIndex('created_at', 'created_at');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueCheckIn(payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...payload, created_at: payload.created_at || new Date().toISOString() });
    tx.oncomplete = () => resolve(payload);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCheckIns() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeCheckIns(keys) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    keys.forEach((key) => tx.objectStore(STORE).delete(key));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export { DB_NAME, STORE };
