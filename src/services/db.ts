import type { SessionHistoryItem } from '../types';

const DB_NAME = 'CVDashboardDB';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';

export class HistoryDB {
  private db: IDBDatabase | null = null;

  private initDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        }
      };
    });
  }

  public async saveSession(session: SessionHistoryItem): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.put(session);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async getSessions(): Promise<SessionHistoryItem[]> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SESSIONS, 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort sessions by start time (most recent first)
        const sessions = request.result as SessionHistoryItem[];
        sessions.sort((a, b) => b.startTime - a.startTime);
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteSession(id: string): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async clearAll(): Promise<void> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const dbService = new HistoryDB();
