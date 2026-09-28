// 操作历史存储：优先 IndexedDB，失败 / 不支持时降级到内存数组
const DB_NAME = 'screen-cap-console';
const DB_VERSION = 1;
const STORE = 'history';
const MAX_RECORDS = 200;

let dbPromise = null;
let memoryFallback = [];
let usingIndexedDB = true;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('time', 'time');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbAdd(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPrune() {
  const records = (await idbAll()).sort((a, b) => b.id - a.id);
  if (records.length <= MAX_RECORDS) return;
  const stale = records.slice(MAX_RECORDS);
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    stale.forEach((r) => store.delete(r.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addHistory(record) {
  const entry = {
    capability: record.capability,
    action: record.action,
    outcome: record.outcome, // success | fail | fallback | info
    detail: record.detail || '',
    time: Date.now()
  };
  if (usingIndexedDB) {
    try {
      await idbAdd(entry);
      await idbPrune();
      return;
    } catch (err) {
      console.warn('[history] IndexedDB 写入失败，降级到内存：', err);
      usingIndexedDB = false;
    }
  }
  memoryFallback.push({ id: Date.now() + Math.random(), ...entry });
  if (memoryFallback.length > MAX_RECORDS) {
    memoryFallback = memoryFallback.slice(-MAX_RECORDS);
  }
}

export async function getHistory() {
  if (usingIndexedDB) {
    try {
      const records = await idbAll();
      return records.sort((a, b) => b.id - a.id);
    } catch (err) {
      console.warn('[history] IndexedDB 读取失败，降级到内存：', err);
      usingIndexedDB = false;
    }
  }
  return [...memoryFallback].sort((a, b) => b.id - a.id);
}

export async function clearHistory() {
  if (usingIndexedDB) {
    try {
      await idbClear();
      return;
    } catch (err) {
      console.warn('[history] IndexedDB 清空失败，降级到内存：', err);
      usingIndexedDB = false;
    }
  }
  memoryFallback = [];
}

export function getStorageMode() {
  return usingIndexedDB ? 'indexeddb' : 'memory';
}
