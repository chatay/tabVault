import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '@/lib/storage';
import { TabService } from '@/lib/tabs';
import { SyncQueue } from '@/lib/sync-queue';
import { DEFAULT_SETTINGS } from '@/lib/types';
import type { UserSettings } from '@/lib/types';
import {
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_LAST_AUTO_SAVE_HASH,
  STORAGE_KEY_TAB_GROUPS,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// Chrome API mocks
// ---------------------------------------------------------------------------

const mockChromeTabs = {
  query: vi.fn<(q: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>(),
  create: vi.fn<(p: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>>(),
  remove: vi.fn<(ids: number | number[]) => Promise<void>>(),
};

const mockChromeAction = {
  setBadgeText: vi.fn(async () => {}),
  setBadgeBackgroundColor: vi.fn(async () => {}),
};

const mockChromeRuntime = {
  onInstalled: { addListener: vi.fn() },
  onStartup: { addListener: vi.fn() },
  getPlatformInfo: vi.fn(async () => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })),
  getURL: vi.fn((path: string) => `chrome-extension://test-id${path}`),
};

const mockChromeAlarms = {
  create: vi.fn(async () => {}),
  get: vi.fn(async () => null),
  onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
};

beforeEach(() => {
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.tabs = mockChromeTabs;
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.action = mockChromeAction;
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.runtime = mockChromeRuntime;
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.alarms = mockChromeAlarms;

  mockChromeTabs.query.mockReset();
  mockChromeTabs.create.mockReset();
  mockChromeTabs.remove.mockReset();
  mockChromeTabs.create.mockResolvedValue({} as chrome.tabs.Tab);
  mockChromeTabs.remove.mockResolvedValue(undefined);
  mockChromeAction.setBadgeText.mockClear();
  mockChromeAction.setBadgeBackgroundColor.mockClear();
});

// Predictable UUIDs
let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidCounter++;
    return `uuid-${uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`;
  });
});

// Mock sync modules so background.ts can import them
vi.mock('@/lib/sync', () => ({
  SyncEngine: vi.fn().mockImplementation(function () {
    return {
      flushQueue: vi.fn(async () => ({ succeeded: 0, failed: 0 })),
      getSyncStatus: vi.fn(async () => 'synced' as const),
    };
  }),
}));

vi.mock('@/lib/sync-queue', async (importOriginal) => {
  // Return the real SyncQueue -- we need it for the lifecycle tests.
  // The mock above is only needed so that background.ts dynamic imports resolve.
  const real = await importOriginal<typeof import('@/lib/sync-queue')>();
  return real;
});

// ---------------------------------------------------------------------------
// 1. Save-and-retrieve flow
// ---------------------------------------------------------------------------

describe('Integration: save-and-retrieve flow', () => {
  it('saves tabs via TabService and retrieves them via StorageService', async () => {
    const storage = new StorageService();
    const tabService = new TabService(storage, 'device-integration');

    mockChromeTabs.query.mockResolvedValue([
      { url: 'https://github.com', title: 'GitHub', favIconUrl: 'https://github.com/favicon.ico' } as chrome.tabs.Tab,
      { url: 'https://docs.vitest.dev', title: 'Vitest Docs', favIconUrl: null } as chrome.tabs.Tab,
    ]);

    const savedGroup = await tabService.saveCurrentTabs();

    // Retrieve from storage independently
    const groups = await storage.getTabGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(savedGroup.id);
    expect(groups[0].tabs).toHaveLength(2);
    expect(groups[0].tabs[0].url).toBe('https://github.com');
    expect(groups[0].tabs[0].title).toBe('GitHub');
    expect(groups[0].tabs[0].faviconUrl).toBe('https://github.com/favicon.ico');
    expect(groups[0].tabs[1].url).toBe('https://docs.vitest.dev');
    expect(groups[0].tabs[1].title).toBe('Vitest Docs');
    expect(groups[0].deviceId).toBe('device-integration');
    expect(groups[0].isAutoSave).toBe(false);
    expect(groups[0].name).toContain('Session');
  });

  it('saves multiple groups and retrieves them in order (newest first)', async () => {
    const storage = new StorageService();
    const tabService = new TabService(storage, 'device-1');

    mockChromeTabs.query.mockResolvedValue([
      { url: 'https://first.com', title: 'First' } as chrome.tabs.Tab,
    ]);
    const first = await tabService.saveCurrentTabs();

    mockChromeTabs.query.mockResolvedValue([
      { url: 'https://second.com', title: 'Second' } as chrome.tabs.Tab,
    ]);
    const second = await tabService.saveCurrentTabs();

    const groups = await storage.getTabGroups();
    expect(groups).toHaveLength(2);
    // saveTabGroup uses unshift, so newest is at index 0
    expect(groups[0].id).toBe(second.id);
    expect(groups[1].id).toBe(first.id);
  });
});

// ---------------------------------------------------------------------------
// 2. Auto-save skips when disabled
// ---------------------------------------------------------------------------

describe('Integration: auto-save skips when disabled', () => {
  it('does not save any tabs when autoSaveEnabled is false', async () => {
    // Ensure autoSaveEnabled is explicitly false
    const settings: UserSettings = { ...DEFAULT_SETTINGS, autoSaveEnabled: false };
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

    mockChromeTabs.query.mockResolvedValue([
      { url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
    ]);

    const { handleAutoSave } = await import('@/entrypoints/background');
    await handleAutoSave();

    // tabs.query should NOT have been called (early return before hash check)
    expect(mockChromeTabs.query).not.toHaveBeenCalled();

    // No tab groups should exist in storage
    const result = await chrome.storage.local.get(STORAGE_KEY_TAB_GROUPS);
    expect(result[STORAGE_KEY_TAB_GROUPS]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Auto-save skips when tabs unchanged
// ---------------------------------------------------------------------------

describe('Integration: auto-save skips when tabs unchanged', () => {
  it('saves only once when handleAutoSave is called twice with same tabs', async () => {
    // Enable auto-save
    const settings: UserSettings = { ...DEFAULT_SETTINGS, autoSaveEnabled: true };
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

    mockChromeTabs.query.mockResolvedValue([
      { url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
      { url: 'https://google.com', title: 'Google' } as chrome.tabs.Tab,
    ]);

    const { handleAutoSave } = await import('@/entrypoints/background');

    // First call - should save
    await handleAutoSave();

    // Verify the hash was stored
    const hashResult = await chrome.storage.local.get(STORAGE_KEY_LAST_AUTO_SAVE_HASH);
    expect(hashResult[STORAGE_KEY_LAST_AUTO_SAVE_HASH]).toBeTruthy();

    // Check how many tab groups were saved after first call
    const groupsAfterFirst = await chrome.storage.local.get(STORAGE_KEY_TAB_GROUPS);
    const firstCount = (groupsAfterFirst[STORAGE_KEY_TAB_GROUPS] as unknown[])?.length ?? 0;
    expect(firstCount).toBe(1);

    // Second call with same tabs - should skip (hash unchanged)
    await handleAutoSave();

    // Verify still only one tab group
    const groupsAfterSecond = await chrome.storage.local.get(STORAGE_KEY_TAB_GROUPS);
    const secondCount = (groupsAfterSecond[STORAGE_KEY_TAB_GROUPS] as unknown[])?.length ?? 0;
    expect(secondCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Sync queue lifecycle
// ---------------------------------------------------------------------------

describe('Integration: sync queue lifecycle', () => {
  it('enqueue items, verify size, dequeue, verify empty', async () => {
    const queue = new SyncQueue();

    // Start empty
    expect(await queue.size()).toBe(0);
    expect(await queue.getAll()).toEqual([]);

    // Enqueue two items
    await queue.enqueue({
      operation: 'create',
      entityType: 'tab_group',
      entityId: 'group-1',
      payload: { name: 'Work Tabs' },
    });

    await queue.enqueue({
      operation: 'update',
      entityType: 'tab',
      entityId: 'tab-1',
      payload: { title: 'Updated Title' },
    });

    // Verify size
    expect(await queue.size()).toBe(2);

    // Get all and verify contents
    const items = await queue.getAll();
    expect(items).toHaveLength(2);
    expect(items[0].entityId).toBe('group-1');
    expect(items[0].operation).toBe('create');
    expect(items[0].retries).toBe(0);
    expect(items[1].entityId).toBe('tab-1');
    expect(items[1].operation).toBe('update');

    // Dequeue first item
    await queue.dequeue(items[0].id);
    expect(await queue.size()).toBe(1);

    // Dequeue second item
    await queue.dequeue(items[1].id);
    expect(await queue.size()).toBe(0);
    expect(await queue.getAll()).toEqual([]);
  });

  it('clear empties the queue completely', async () => {
    const queue = new SyncQueue();

    await queue.enqueue({
      operation: 'create',
      entityType: 'tab_group',
      entityId: 'g1',
      payload: {},
    });
    await queue.enqueue({
      operation: 'delete',
      entityType: 'tab_group',
      entityId: 'g2',
      payload: {},
    });
    await queue.enqueue({
      operation: 'update',
      entityType: 'tab',
      entityId: 't1',
      payload: {},
    });

    expect(await queue.size()).toBe(3);

    await queue.clear();

    expect(await queue.size()).toBe(0);
    expect(await queue.getAll()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Badge states
// ---------------------------------------------------------------------------

describe('Integration: badge states', () => {
  it('shows red "!" badge when engine returns failed status', async () => {
    const mockEngine = {
      getSyncStatus: vi.fn(async () => 'failed' as const),
    };

    const { updateBadge } = await import('@/entrypoints/background');
    await updateBadge(mockEngine);

    expect(mockEngine.getSyncStatus).toHaveBeenCalled();
    expect(mockChromeAction.setBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(mockChromeAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#EF4444' });
  });

  it('shows amber "..." badge when engine returns pending status', async () => {
    const mockEngine = {
      getSyncStatus: vi.fn(async () => 'pending' as const),
    };

    const { updateBadge } = await import('@/entrypoints/background');
    await updateBadge(mockEngine);

    expect(mockEngine.getSyncStatus).toHaveBeenCalled();
    expect(mockChromeAction.setBadgeText).toHaveBeenCalledWith({ text: '...' });
    expect(mockChromeAction.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#F59E0B' });
  });

  it('clears badge when engine returns synced status', async () => {
    const mockEngine = {
      getSyncStatus: vi.fn(async () => 'synced' as const),
    };

    const { updateBadge } = await import('@/entrypoints/background');
    await updateBadge(mockEngine);

    expect(mockEngine.getSyncStatus).toHaveBeenCalled();
    expect(mockChromeAction.setBadgeText).toHaveBeenCalledWith({ text: '' });
    // No color set for synced (badge is cleared)
  });

  it('clears badge when engine returns syncing status', async () => {
    const mockEngine = {
      getSyncStatus: vi.fn(async () => 'syncing' as const),
    };

    const { updateBadge } = await import('@/entrypoints/background');
    await updateBadge(mockEngine);

    expect(mockEngine.getSyncStatus).toHaveBeenCalled();
    expect(mockChromeAction.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });
});
