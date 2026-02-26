import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncQueue } from '../../src/lib/sync-queue';
import { StorageService } from '../../src/lib/storage';
import {
  STORAGE_KEY_SYNC_FAIL_COUNT,
  STORAGE_KEY_FIRST_SYNC_FAIL_AT,
  SYNC_RETRY_THRESHOLD,
} from '../../src/lib/constants';

// We need to mock supabase, auth, and device modules before importing SyncEngine
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockSelectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
};
const mockDeviceUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'tab_groups') {
      return {
        upsert: mockUpsert,
        delete: vi.fn().mockReturnValue({ eq: mockDelete }),
        select: mockSelectChain.select,
      };
    }
    if (table === 'tabs') {
      return {
        upsert: mockUpsert,
        delete: vi.fn().mockReturnValue({ eq: mockDelete }),
      };
    }
    if (table === 'devices') {
      return { upsert: mockDeviceUpsert };
    }
    return { upsert: mockUpsert };
  }),
};

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => mockSupabase,
}));

const mockSession = { user: { id: 'user-1' } };
vi.mock('../../src/lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
}));

vi.mock('../../src/lib/device', () => ({
  getOrCreateDeviceId: vi.fn(async () => 'device-1'),
}));

// Mock crypto module — identity functions so existing assertions stay unchanged
vi.mock('../../src/lib/crypto', () => ({
  getOrDeriveKey: vi.fn(async () => 'mock-key'),
  encrypt: vi.fn(async (v: string) => v),
  decrypt: vi.fn(async (v: string) => v),
  encryptNullable: vi.fn(async (v: string | null) => v),
  decryptNullable: vi.fn(async (v: string | null) => v),
}));

// Now import SyncEngine after mocks are set up
import { SyncEngine } from '../../src/lib/sync';
import { getSession } from '../../src/lib/auth';
import type { TabGroup } from '../../src/lib/types';

describe('SyncEngine', () => {
  let engine: SyncEngine;
  let storage: StorageService;
  let queue: SyncQueue;

  beforeEach(() => {
    storage = new StorageService();
    queue = new SyncQueue();
    engine = new SyncEngine(storage, queue);
    vi.clearAllMocks();
    // Re-establish default mock behaviors after clearAllMocks
    mockSelectChain.select.mockReturnThis();
    mockSelectChain.eq.mockReturnThis();
    mockSelectChain.order.mockResolvedValue({ data: [], error: null });
    mockDeviceUpsert.mockResolvedValue({ error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'tab_groups') {
        return {
          upsert: mockUpsert,
          delete: vi.fn().mockReturnValue({ eq: mockDelete }),
          select: mockSelectChain.select,
        };
      }
      if (table === 'tabs') {
        return {
          upsert: mockUpsert,
          delete: vi.fn().mockReturnValue({ eq: mockDelete }),
        };
      }
      if (table === 'devices') {
        return { upsert: mockDeviceUpsert };
      }
      return { upsert: mockUpsert };
    });
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
  });

  // --- getSyncStatus ---

  describe('getSyncStatus', () => {
    it('returns "synced" when queue is empty', async () => {
      expect(await engine.getSyncStatus()).toBe('synced');
    });

    it('returns "pending" when queue has items but fail count < threshold', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      expect(await engine.getSyncStatus()).toBe('pending');
    });

    it('returns "failed" when fail count >= SYNC_RETRY_THRESHOLD', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      await chrome.storage.local.set({
        [STORAGE_KEY_SYNC_FAIL_COUNT]: SYNC_RETRY_THRESHOLD,
      });
      expect(await engine.getSyncStatus()).toBe('failed');
    });

    it('returns "failed" when fail count exceeds threshold', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      await chrome.storage.local.set({
        [STORAGE_KEY_SYNC_FAIL_COUNT]: SYNC_RETRY_THRESHOLD + 5,
      });
      expect(await engine.getSyncStatus()).toBe('failed');
    });
  });

  // --- recordSyncFailure / resetSyncFailure (tested via pushGroup behavior) ---

  describe('sync failure tracking', () => {
    it('records sync failure on push error (increments fail count)', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'Network error' } });

      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await engine.pushGroup(group);

      const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_FAIL_COUNT);
      expect(result[STORAGE_KEY_SYNC_FAIL_COUNT]).toBe(1);
    });

    it('records first failure timestamp', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'Network error' } });

      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await engine.pushGroup(group);

      const result = await chrome.storage.local.get(STORAGE_KEY_FIRST_SYNC_FAIL_AT);
      expect(result[STORAGE_KEY_FIRST_SYNC_FAIL_AT]).toBeGreaterThan(0);
    });

    it('increments fail count on subsequent failures', async () => {
      mockUpsert.mockResolvedValue({ error: { message: 'Network error' } });

      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await engine.pushGroup(group);
      await engine.pushGroup(group);

      const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_FAIL_COUNT);
      expect(result[STORAGE_KEY_SYNC_FAIL_COUNT]).toBe(2);
    });

    it('resets failure count on successful push', async () => {
      // Set prior failure
      await chrome.storage.local.set({
        [STORAGE_KEY_SYNC_FAIL_COUNT]: 2,
        [STORAGE_KEY_FIRST_SYNC_FAIL_AT]: Date.now() - 1000,
      });

      mockUpsert.mockResolvedValue({ error: null });

      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await engine.pushGroup(group);

      const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_FAIL_COUNT);
      expect(result[STORAGE_KEY_SYNC_FAIL_COUNT]).toBe(0);
    });
  });

  // --- pushGroup ---

  describe('pushGroup', () => {
    it('does nothing if no session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await engine.pushGroup(group);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('upserts the group to supabase', async () => {
      mockUpsert.mockResolvedValue({ error: null });

      const now = Date.now();
      const group: TabGroup = {
        id: 'g1',
        name: 'My Tabs',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: now,
        updatedAt: now,
      };

      await engine.pushGroup(group);

      expect(mockSupabase.from).toHaveBeenCalledWith('tab_groups');
      expect(mockUpsert).toHaveBeenCalledWith({
        id: 'g1',
        user_id: 'user-1',
        device_id: 'device-1',
        name: 'My Tabs',
        is_auto_save: false,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      });
    });

    it('upserts each tab in the group', async () => {
      mockUpsert.mockResolvedValue({ error: null });

      const now = Date.now();
      const group: TabGroup = {
        id: 'g1',
        name: 'My Tabs',
        tabs: [
          {
            id: 't1',
            url: 'https://example.com',
            title: 'Example',
            faviconUrl: null,
            position: 0,
            createdAt: now,
          },
          {
            id: 't2',
            url: 'https://test.com',
            title: 'Test',
            faviconUrl: 'https://test.com/favicon.ico',
            position: 1,
            createdAt: now,
          },
        ],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: now,
        updatedAt: now,
      };

      await engine.pushGroup(group);

      // group upsert + 2 tab upserts = 3 calls
      expect(mockUpsert).toHaveBeenCalledTimes(3);
      expect(mockSupabase.from).toHaveBeenCalledWith('tabs');
    });

    it('queues group for retry if upsert fails', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'fail' } });

      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await engine.pushGroup(group);

      const items = await queue.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].entityType).toBe('tab_group');
      expect(items[0].entityId).toBe('g1');
    });

    it('queues individual tab if tab upsert fails', async () => {
      // First call (group) succeeds, second call (tab) fails
      mockUpsert
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { message: 'tab fail' } });

      const now = Date.now();
      const group: TabGroup = {
        id: 'g1',
        name: 'Test',
        tabs: [
          {
            id: 't1',
            url: 'https://example.com',
            title: 'Example',
            faviconUrl: null,
            position: 0,
            createdAt: now,
          },
        ],
        isAutoSave: false,
        deviceId: 'device-1',
        createdAt: now,
        updatedAt: now,
      };

      await engine.pushGroup(group);

      const items = await queue.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].entityType).toBe('tab');
      expect(items[0].entityId).toBe('t1');
    });
  });

  // --- pullAllGroups ---

  describe('pullAllGroups', () => {
    it('returns empty array when no session', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);
      const groups = await engine.pullAllGroups();
      expect(groups).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockSelectChain.select.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'fail' },
          }),
        }),
      });
      const groups = await engine.pullAllGroups();
      expect(groups).toEqual([]);
    });

    it('maps remote data to TabGroup format', async () => {
      const now = new Date().toISOString();
      mockSelectChain.select.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'g1',
                name: 'Remote Group',
                is_auto_save: true,
                device_id: 'dev-abc',
                created_at: now,
                updated_at: now,
                tabs: [
                  {
                    id: 't1',
                    url: 'https://example.com',
                    title: 'Example',
                    favicon_url: 'https://example.com/fav.ico',
                    position: 0,
                    created_at: now,
                  },
                ],
              },
            ],
            error: null,
          }),
        }),
      });

      const groups = await engine.pullAllGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('g1');
      expect(groups[0].name).toBe('Remote Group');
      expect(groups[0].isAutoSave).toBe(true);
      expect(groups[0].deviceId).toBe('dev-abc');
      expect(groups[0].tabs).toHaveLength(1);
      expect(groups[0].tabs[0].url).toBe('https://example.com');
      expect(groups[0].tabs[0].faviconUrl).toBe('https://example.com/fav.ico');
    });

    it('sorts tabs by position', async () => {
      const now = new Date().toISOString();
      mockSelectChain.select.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'g1',
                name: 'Group',
                is_auto_save: false,
                device_id: 'dev-1',
                created_at: now,
                updated_at: now,
                tabs: [
                  { id: 't2', url: 'b.com', title: 'B', favicon_url: null, position: 1, created_at: now },
                  { id: 't1', url: 'a.com', title: 'A', favicon_url: null, position: 0, created_at: now },
                ],
              },
            ],
            error: null,
          }),
        }),
      });

      const groups = await engine.pullAllGroups();
      expect(groups[0].tabs[0].id).toBe('t1');
      expect(groups[0].tabs[1].id).toBe('t2');
    });
  });

  // --- flushQueue ---

  describe('flushQueue', () => {
    it('returns zeros when queue is empty', async () => {
      const result = await engine.flushQueue();
      expect(result).toEqual({ succeeded: 0, failed: 0 });
    });

    it('returns all failed when no session', async () => {
      await queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await engine.flushQueue();
      expect(result).toEqual({ succeeded: 0, failed: 1 });
    });

    it('resets sync failure when all queue items succeed', async () => {
      // Set prior failure state
      await chrome.storage.local.set({
        [STORAGE_KEY_SYNC_FAIL_COUNT]: 2,
      });

      // Enqueue a delete operation (simpler to test)
      await queue.enqueue({
        operation: 'delete',
        entityType: 'tab_group',
        entityId: 'g1',
        payload: {},
      });

      mockDelete.mockResolvedValue({ error: null });

      await engine.flushQueue();

      const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_FAIL_COUNT);
      expect(result[STORAGE_KEY_SYNC_FAIL_COUNT]).toBe(0);
    });
  });
});
