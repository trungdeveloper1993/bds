/**
 * Lớp lưu trữ duy nhất của ứng dụng: IndexedDB trên chính thiết bị.
 * Muốn đồng bộ đám mây sau này chỉ cần thay file này.
 */

const DB_NAME = 'bds-manager';
const DB_VERSION = 1;

export type StoreName = 'projects' | 'properties' | 'customers' | 'images' | 'files' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Trình duyệt này không hỗ trợ lưu trữ dữ liệu (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['projects', 'properties', 'customers', 'images', 'files'] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      // meta dùng khoá rời (settings, ...).
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Không mở được cơ sở dữ liệu.'));
    req.onblocked = () => reject(new Error('Dữ liệu đang được mở ở một tab khác. Hãy đóng tab đó và tải lại.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Chạy một transaction và chờ nó hoàn tất (đảm bảo dữ liệu đã ghi xuống đĩa). */
async function run<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    const req = fn(tx);
    if (req) {
      req.onsuccess = () => {
        result = req.result;
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Lỗi ghi dữ liệu.'));
    tx.onabort = () =>
      reject(
        tx.error?.name === 'QuotaExceededError'
          ? new Error('Bộ nhớ thiết bị đã đầy. Hãy xoá bớt ảnh hoặc sao lưu rồi dọn dữ liệu.')
          : (tx.error ?? new Error('Thao tác dữ liệu bị huỷ.')),
      );
  });
}

export const db = {
  getAll<T>(store: StoreName): Promise<T[]> {
    return run<T[]>(store, 'readonly', (tx) => tx.objectStore(store).getAll() as IDBRequest<T[]>);
  },

  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return run<T | undefined>(store, 'readonly', (tx) => tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
  },

  getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
    return run<IDBValidKey[]>(store, 'readonly', (tx) => tx.objectStore(store).getAllKeys());
  },

  put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
    return run<void>(store, 'readwrite', (tx) => {
      tx.objectStore(store).put(value, key);
    });
  },

  putMany(store: StoreName, values: unknown[]): Promise<void> {
    if (values.length === 0) return Promise.resolve();
    return run<void>(store, 'readwrite', (tx) => {
      const os = tx.objectStore(store);
      for (const v of values) os.put(v);
    });
  },

  delete(store: StoreName, keys: IDBValidKey | IDBValidKey[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) return Promise.resolve();
    return run<void>(store, 'readwrite', (tx) => {
      const os = tx.objectStore(store);
      for (const k of list) os.delete(k);
    });
  },

  clear(stores: StoreName[]): Promise<void> {
    return run<void>(stores, 'readwrite', (tx) => {
      for (const s of stores) tx.objectStore(s).clear();
    });
  },
};

/** Xin trình duyệt giữ dữ liệu lâu dài (hạn chế bị tự động dọn khi thiếu bộ nhớ). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo(): Promise<{ persisted: boolean; usage?: number; quota?: number }> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const estimate = await navigator.storage?.estimate?.();
    return { persisted, usage: estimate?.usage, quota: estimate?.quota };
  } catch {
    return { persisted: false };
  }
}
