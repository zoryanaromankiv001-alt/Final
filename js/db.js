/**
 * ColonyVision Lab: Structured IndexedDB Storage
 * Author: Zoryana Pihach Romankiv (CAI 2840 - Introduction to Computer Vision)
 *
 * Implements Slide 8: "A database hiding in your browser. IndexedDB remembers what the tab forgets."
 * Stores full image Blobs, colony metrics, experiment metadata, and parameters.
 */

export const DB_NAME = 'colonyvision_db';
export const DB_VERSION = 1;

let dbInstance = null;
let dbPromise = null;
const eventListeners = new Set();

export function onDbEvent(cb) {
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
}

function emit(type, detail) {
  for (const cb of eventListeners) {
    try { cb(type, detail); } catch (_) {}
  }
}

/**
 * Open (or reuse) the IndexedDB database connection.
 */
export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('experiments')) {
        const store = db.createObjectStore('experiments', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('name', 'name');
        store.createIndex('colonyCount', 'colonyCount');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onversionchange = () => {
        emit('versionchange');
        dbInstance.close();
        dbInstance = null;
        dbPromise = null;
      };
      dbInstance.onclose = () => {
        emit('closed');
        dbInstance = null;
        dbPromise = null;
      };
      resolve(dbInstance);
    };

    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Failed to open ColonyVision IndexedDB.'));
    };

    req.onblocked = () => {
      emit('blocked');
    };
  });

  return dbPromise;
}

/**
 * Save an experiment record (Blobs must already be constructed before calling).
 */
export async function saveExperiment(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('experiments', 'readwrite');
    const store = tx.objectStore('experiments');

    const entry = {
      id: record.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: record.name || 'Untitled Plate Assay',
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agarType: record.agarType || 'nutrient',
      dilutionFactor: record.dilutionFactor || '10^-1',
      platedVolumeMl: record.platedVolumeMl || 0.1,
      colonyCount: record.colonyCount || 0,
      cfuPerMl: record.cfuPerMl || 0,
      stats: record.stats || {},
      categories: record.categories || {},
      colonies: record.colonies || [],
      dish: record.dish || null,
      timing: record.timing || {},
      thresholdParams: record.thresholdParams || {},
      notes: record.notes || '',
      originalBlob: record.originalBlob || null,
      annotatedBlob: record.annotatedBlob || null,
      maskBlob: record.maskBlob || null,
      thumbBlob: record.thumbBlob || null
    };

    const req = store.put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Save transaction was aborted.'));
  });
}

/**
 * Get an experiment by ID.
 */
export async function getExperiment(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('experiments', 'readonly');
    const store = tx.objectStore('experiments');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all experiments, sorted newest first.
 */
export async function getAllExperiments() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('experiments', 'readonly');
    const store = tx.objectStore('experiments');
    const index = store.index('createdAt');
    const req = index.openCursor(null, 'prev');
    const results = [];

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete an experiment by ID.
 */
export async function deleteExperiment(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('experiments', 'readwrite');
    const store = tx.objectStore('experiments');
    store.delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update an experiment's metadata (e.g. name or notes).
 */
export async function updateExperiment(id, partial) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('experiments', 'readwrite');
    const store = tx.objectStore('experiments');
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result;
      if (!record) {
        reject(new Error(`Experiment #${id} not found.`));
        return;
      }
      Object.assign(record, partial, { updatedAt: new Date().toISOString() });
      store.put(record);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Reset all application data in IndexedDB.
 */
export async function resetAllData() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      emit('blocked');
      resolve(true);
    };
  });
}
