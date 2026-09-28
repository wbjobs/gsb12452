// 操作历史：IndexedDB 持久化（库 screen-console，表 history，自增主键 + time 索引）

const DB_NAME = 'screen-console';
const DB_VERSION = 1;
const STORE = 'history';
const MAX_RECORDS = 500;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('time', 'time', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // 永久失败时允许后续重试（例如隐私模式下配额被拒）
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/**
 * 追加一条历史，永不抛错（IndexedDB 失败时降级到内存，保证主流程不崩）。
 */
const memoryFallback = [];

export async function addHistory(entry) {
  const record = {
    time: Date.now(),
    feature: entry.feature || 'unknown',   // fullscreen | orientation | pip | system
    action: entry.action || '',
    result: entry.result || 'error',       // success | denied | blocked | unsupported | insecure | fallback | error
    message: entry.message || '',
    fromGesture: entry.fromGesture,        // true | false | 'unknown'
  };
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    await trim();
    return record;
  } catch (err) {
    record.result = record.result === 'success' ? 'success' : record.result;
    record.message = record.message
      ? `${record.message}（IndexedDB 不可用，仅保留在内存：${err.message || err.name}）`
      : `IndexedDB 不可用，仅保留在内存：${err.message || err.name}`;
    memoryFallback.unshift(record);
    if (memoryFallback.length > MAX_RECORDS) memoryFallback.length = MAX_RECORDS;
    return record;
  }
}

async function trim() {
  const db = await openDB();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count <= MAX_RECORDS) { resolve(); return; }
      // 按主键顺序取最旧的若干条删除
      const cursorReq = store.openKeyCursor();
      let toDelete = count - MAX_RECORDS;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && toDelete > 0) {
          store.delete(cursor.primaryKey);
          toDelete -= 1;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    };
    countReq.onerror = () => resolve();
  });
}

export async function listHistory(limit = 200) {
  try {
    const db = await openDB();
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('time').openCursor(null, 'prev');
      const out = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && out.length < limit) {
          out.push(cursor.value);
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
    return records.concat(memoryFallback).slice(0, limit);
  } catch {
    return memoryFallback.slice(0, limit);
  }
}

export async function clearHistory() {
  memoryFallback.length = 0;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 内存部分已清空，忽略 DB 失败
  }
}
