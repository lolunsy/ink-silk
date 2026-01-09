// Phase 3.0: IndexedDB 演员存储层
// 不依赖第三方库，直接使用原生 window.indexedDB

const DB_NAME = 'ink_silk_db';
const DB_VERSION = 1;
const STORE_NAME = 'actors';

/**
 * 打开/创建 IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export const openDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('IndexedDB 打开失败'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 如果 actors store 不存在，创建它
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // 可选：创建索引
        objectStore.createIndex('name', 'name', { unique: false });
      }
    };
  });
};

/**
 * 获取所有演员
 * @returns {Promise<Array>}
 */
export const getAllActors = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error('读取演员数据失败'));
      };
    });
  } catch (error) {
    console.error('getAllActors error:', error);
    return [];
  }
};

/**
 * 保存单个演员
 * @param {Object} actor - 演员对象
 * @returns {Promise<void>}
 */
export const putActor = async (actor) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.put(actor);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('保存演员数据失败'));
    };
  });
};

/**
 * 批量保存演员（清空后重新写入）
 * @param {Array} actors - 演员数组
 * @returns {Promise<void>}
 */
export const putActors = async (actors) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    // 先清空
    const clearRequest = objectStore.clear();

    clearRequest.onsuccess = () => {
      // 然后批量写入
      let completed = 0;
      let hasError = false;

      if (actors.length === 0) {
        resolve();
        return;
      }

      actors.forEach((actor) => {
        const request = objectStore.put(actor);

        request.onsuccess = () => {
          completed++;
          if (completed === actors.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          hasError = true;
          reject(new Error('批量保存演员数据失败'));
        };
      });
    };

    clearRequest.onerror = () => {
      reject(new Error('清空旧数据失败'));
    };

    transaction.onerror = () => {
      reject(new Error('事务失败'));
    };
  });
};

/**
 * 删除单个演员
 * @param {string|number} id - 演员 ID
 * @returns {Promise<void>}
 */
export const deleteActor = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('删除演员数据失败'));
    };
  });
};

/**
 * 清空所有演员
 * @returns {Promise<void>}
 */
export const clearActors = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('清空演员数据失败'));
    };
  });
};

