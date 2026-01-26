// Phase: Image IndexedDB Store
// 存储大图片（场景锚点、母图等），避免 localStorage 5MB 限制

const DB_NAME = 'ink_silk_media_v1';
const DB_VERSION = 1;
const STORE_NAME = 'images';

/**
 * 打开/创建 IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
const openDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Image IndexedDB 打开失败'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

/**
 * 生成唯一 imageId
 */
const generateImageId = () => {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 保存图片
 * @param {Object} params
 * @param {string} params.dataUrl - base64 图片数据
 * @param {Object} [params.meta] - 可选元数据
 * @returns {Promise<string>} imageId
 */
export const putImage = async ({ dataUrl, meta = {} }) => {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid dataUrl');
  }

  const imageId = generateImageId();
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    
    const imageData = {
      id: imageId,
      dataUrl,
      createdAt: Date.now(),
      meta: meta || {}
    };
    
    const request = objectStore.put(imageData);

    request.onsuccess = () => {
      resolve(imageId);
    };

    request.onerror = () => {
      reject(new Error('保存图片失败'));
    };
  });
};

/**
 * 获取图片
 * @param {string} imageId
 * @returns {Promise<{id:string, dataUrl:string, createdAt:number, meta:object}|null>}
 */
export const getImage = async (imageId) => {
  if (!imageId) return null;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(imageId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error('读取图片失败'));
      };
    });
  } catch (error) {
    console.error('getImage error:', error);
    return null;
  }
};

/**
 * 批量获取图片
 * @param {string[]} imageIds
 * @returns {Promise<Array>}
 */
export const getMany = async (imageIds) => {
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return [];
  }

  try {
    const db = await openDB();
    const results = await Promise.all(
      imageIds.map(id => {
        return new Promise((resolve) => {
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const objectStore = transaction.objectStore(STORE_NAME);
          const request = objectStore.get(id);
          
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        });
      })
    );
    
    return results.filter(Boolean);
  } catch (error) {
    console.error('getMany error:', error);
    return [];
  }
};

/**
 * 删除图片
 * @param {string} imageId
 * @returns {Promise<void>}
 */
export const deleteImage = async (imageId) => {
  if (!imageId) return;

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(imageId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('删除图片失败'));
      };
    });
  } catch (error) {
    console.error('deleteImage error:', error);
  }
};

/**
 * 清空所有图片（慎用）
 * @returns {Promise<void>}
 */
export const clearAllImages = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('清空图片失败'));
    };
  });
};

