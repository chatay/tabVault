import { STORAGE_KEY_SYNC_QUEUE, SYNC_MAX_RETRIES } from './constants';
import type { SyncQueueItem } from './types';

export class SyncQueue {
  async getAll(): Promise<SyncQueueItem[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_QUEUE);
    return result[STORAGE_KEY_SYNC_QUEUE] ?? [];
  }

  async enqueue(
    item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retries'>,
  ): Promise<void> {
    const items = await this.getAll();
    items.push({
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retries: 0,
    });
    await chrome.storage.local.set({ [STORAGE_KEY_SYNC_QUEUE]: items });
  }

  async dequeue(itemId: string): Promise<void> {
    const items = await this.getAll();
    const filtered = items.filter((i) => i.id !== itemId);
    await chrome.storage.local.set({ [STORAGE_KEY_SYNC_QUEUE]: filtered });
  }

  async incrementRetries(itemId: string): Promise<void> {
    const items = await this.getAll();
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    item.retries += 1;

    if (item.retries >= SYNC_MAX_RETRIES) {
      await this.dequeue(itemId);
      return;
    }

    await chrome.storage.local.set({ [STORAGE_KEY_SYNC_QUEUE]: items });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_SYNC_QUEUE]: [] });
  }

  async size(): Promise<number> {
    const items = await this.getAll();
    return items.length;
  }
}

export const syncQueue = new SyncQueue();
