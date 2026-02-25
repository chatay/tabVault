import { describe, it, expect, beforeEach } from 'vitest';
import { SyncQueue } from '../../src/lib/sync-queue';

describe('SyncQueue', () => {
  let queue: SyncQueue;

  beforeEach(() => {
    queue = new SyncQueue();
  });

  describe('enqueue', () => {
    it('adds an operation to the queue', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: { name: 'Test' },
      });

      const items = await queue.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].entityId).toBe('g1');
      expect(items[0].retries).toBe(0);
    });

    it('assigns a unique id and timestamp', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g2',
        payload: {},
      });

      const items = await queue.getAll();
      const item = items.find(i => i.entityId === 'g2');
      expect(item?.id).toBeTruthy();
      expect(item?.createdAt).toBeGreaterThan(0);
    });
  });

  describe('dequeue', () => {
    it('removes a specific item by id', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      const items = await queue.getAll();
      await queue.dequeue(items[0].id);
      expect(await queue.getAll()).toHaveLength(0);
    });
  });

  describe('incrementRetries', () => {
    it('increments retry count', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      const items = await queue.getAll();
      await queue.incrementRetries(items[0].id);
      const updated = await queue.getAll();
      expect(updated[0].retries).toBe(1);
    });

    it('removes item after max retries (5)', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      const items = await queue.getAll();
      // Increment 5 times to hit SYNC_MAX_RETRIES
      for (let i = 0; i < 5; i++) {
        await queue.incrementRetries(items[0].id);
      }
      expect(await queue.getAll()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('removes all items', async () => {
      await queue.enqueue({ operation: 'create', entityType: 'tab_group', entityId: 'g1', payload: {} });
      await queue.enqueue({ operation: 'create', entityType: 'tab_group', entityId: 'g2', payload: {} });
      await queue.clear();
      expect(await queue.getAll()).toHaveLength(0);
    });
  });

  describe('size', () => {
    it('returns the number of items', async () => {
      await queue.enqueue({ operation: 'create', entityType: 'tab_group', entityId: 'g1', payload: {} });
      await queue.enqueue({ operation: 'update', entityType: 'tab', entityId: 't1', payload: {} });
      expect(await queue.size()).toBe(2);
    });
  });
});
