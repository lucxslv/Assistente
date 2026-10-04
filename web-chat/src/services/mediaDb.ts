/**
 * IndexedDB storage adapter for local media and attachments.
 * Allows caching large image dataUrls without exceeding localStorage 5MB quota.
 */

const DB_NAME = 'CharlieMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_attachments';

interface MediaRecord {
  id: string;
  dataUrl: string;
  mimeType: string;
  userId?: string;
  createdAt: number;
}

class MediaDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB não suportado neste ambiente.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Falha ao abrir IndexedDB.'));
      };
    });

    return this.dbPromise;
  }

  /**
   * Salva a imagem ou arquivo no IndexedDB.
   */
  public async saveMedia(id: string, dataUrl: string, mimeType: string, userId?: string): Promise<void> {
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: MediaRecord = {
          id,
          dataUrl,
          mimeType,
          userId,
          createdAt: Date.now(),
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[MediaDB] Erro ao salvar anexo no IndexedDB:', e);
    }
  }

  /**
   * Recupera o dataUrl de um anexo a partir de seu ID.
   */
  public async getMedia(id: string): Promise<string | null> {
    try {
      const db = await this.getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          const record = req.result as MediaRecord | undefined;
          resolve(record ? record.dataUrl : null);
        };
        req.onerror = () => {
          resolve(null);
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Remove um anexo específico.
   */
  public async deleteMedia(id: string): Promise<void> {
    try {
      const db = await this.getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch {
      // Ignora erro
    }
  }

  /**
   * Expurga todos os anexos de um determinado usuário (ou todos se userId não for fornecido).
   */
  public async clearUserMedia(userId?: string): Promise<void> {
    try {
      const db = await this.getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        if (!userId) {
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          return;
        }

        const index = store.index('userId');
        const req = index.openCursor(IDBKeyRange.only(userId));
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });
    } catch {
      // Ignora erro
    }
  }
}

export const mediaDb = new MediaDbService();
