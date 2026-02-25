import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ALARM_AUTO_SAVE,
  ALARM_SYNC_RETRY,
  AUTO_SAVE_INTERVAL_MINUTES,
  SYNC_RETRY_INTERVAL_MINUTES,
  STORAGE_KEY_LAST_AUTO_SAVE_HASH,
  STORAGE_KEY_SETTINGS,
} from '@/lib/constants';
import type { UserSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

// --- Mock chrome.alarms API ---
const alarmsStore: Record<string, chrome.alarms.Alarm> = {};

const mockChromeAlarms = {
  create: vi.fn(async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
    alarmsStore[name] = {
      name,
      scheduledTime: Date.now() + (info.periodInMinutes ?? 0) * 60_000,
      periodInMinutes: info.periodInMinutes,
    };
  }),
  get: vi.fn(async (name: string) => {
    return alarmsStore[name] ?? null;
  }),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

// --- Mock chrome.tabs API ---
const mockChromeTabs = {
  query: vi.fn<(queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>(),
  create: vi.fn<(props: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>>(),
};

// --- Mock chrome.runtime API ---
const mockChromeRuntime = {
  onInstalled: { addListener: vi.fn() },
  onStartup: { addListener: vi.fn() },
  getPlatformInfo: vi.fn(async () => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })),
};

// Attach mocks to globalThis.chrome before importing modules
beforeEach(() => {
  // Clear alarms store
  for (const key of Object.keys(alarmsStore)) delete alarmsStore[key];

  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.alarms = mockChromeAlarms;
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.tabs = mockChromeTabs;
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.runtime = mockChromeRuntime;

  mockChromeAlarms.create.mockClear();
  mockChromeAlarms.get.mockClear();
  mockChromeTabs.query.mockReset();
  mockChromeTabs.create.mockReset();
});

// Mock crypto.randomUUID for predictable device IDs
let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidCounter++;
    return `uuid-${uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`;
  });
});

describe('background service worker helpers', () => {
  describe('createAlarms', () => {
    it('creates both auto-save and sync-retry alarms', async () => {
      const { createAlarms } = await import('@/entrypoints/background');

      await createAlarms();

      expect(mockChromeAlarms.create).toHaveBeenCalledTimes(2);
      expect(mockChromeAlarms.create).toHaveBeenCalledWith(ALARM_AUTO_SAVE, {
        periodInMinutes: AUTO_SAVE_INTERVAL_MINUTES,
      });
      expect(mockChromeAlarms.create).toHaveBeenCalledWith(ALARM_SYNC_RETRY, {
        periodInMinutes: SYNC_RETRY_INTERVAL_MINUTES,
      });
    });
  });

  describe('ensureAlarm', () => {
    it('creates alarm when it does not exist', async () => {
      const { ensureAlarm } = await import('@/entrypoints/background');

      await ensureAlarm('test-alarm', 10);

      expect(mockChromeAlarms.get).toHaveBeenCalledWith('test-alarm');
      expect(mockChromeAlarms.create).toHaveBeenCalledWith('test-alarm', {
        periodInMinutes: 10,
      });
    });

    it('does not create alarm when it already exists', async () => {
      // Pre-populate alarms store
      alarmsStore['test-alarm'] = {
        name: 'test-alarm',
        scheduledTime: Date.now() + 600_000,
        periodInMinutes: 10,
      };

      const { ensureAlarm } = await import('@/entrypoints/background');

      await ensureAlarm('test-alarm', 10);

      expect(mockChromeAlarms.get).toHaveBeenCalledWith('test-alarm');
      expect(mockChromeAlarms.create).not.toHaveBeenCalled();
    });
  });

  describe('handleAutoSave', () => {
    it('does nothing when autoSaveEnabled is false', async () => {
      // Settings with auto-save disabled (default)
      const settings: UserSettings = { ...DEFAULT_SETTINGS, autoSaveEnabled: false };
      await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

      const { handleAutoSave } = await import('@/entrypoints/background');

      await handleAutoSave();

      // Should not query tabs since auto-save is disabled
      expect(mockChromeTabs.query).not.toHaveBeenCalled();
    });

    it('does nothing when tab hash has not changed', async () => {
      // Enable auto-save
      const settings: UserSettings = { ...DEFAULT_SETTINGS, autoSaveEnabled: true };
      await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

      // Mock tabs
      mockChromeTabs.query.mockResolvedValue([
        { url: 'https://example.com' } as chrome.tabs.Tab,
        { url: 'https://google.com' } as chrome.tabs.Tab,
      ]);

      // Pre-set the hash to match current tabs
      const expectedHash = ['https://example.com', 'https://google.com'].sort().join('|');
      await chrome.storage.local.set({ [STORAGE_KEY_LAST_AUTO_SAVE_HASH]: expectedHash });

      const { handleAutoSave } = await import('@/entrypoints/background');

      await handleAutoSave();

      // Should have queried tabs but NOT saved (hash unchanged)
      expect(mockChromeTabs.query).toHaveBeenCalledWith({});
      // storage.saveTabGroup should not have been called - check no tab groups exist
      const result = await chrome.storage.local.get('tabvault_tab_groups');
      expect(result['tabvault_tab_groups']).toBeUndefined();
    });

    it('saves tabs and updates hash when tabs have changed', async () => {
      // Enable auto-save
      const settings: UserSettings = { ...DEFAULT_SETTINGS, autoSaveEnabled: true };
      await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

      // Mock tabs.query for the hash check (all tabs)
      mockChromeTabs.query.mockResolvedValue([
        { url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
        { url: 'https://google.com', title: 'Google' } as chrome.tabs.Tab,
      ]);

      const { handleAutoSave } = await import('@/entrypoints/background');

      await handleAutoSave();

      // Should have queried all tabs for the hash
      expect(mockChromeTabs.query).toHaveBeenCalledWith({});

      // Should have stored the hash
      const hashResult = await chrome.storage.local.get(STORAGE_KEY_LAST_AUTO_SAVE_HASH);
      const expectedHash = ['https://example.com', 'https://google.com'].sort().join('|');
      expect(hashResult[STORAGE_KEY_LAST_AUTO_SAVE_HASH]).toBe(expectedHash);
    });

    it('filters undefined URLs from the hash calculation', async () => {
      // Enable auto-save
      const settings: UserSettings = { ...DEFAULT_SETTINGS, autoSaveEnabled: true };
      await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

      mockChromeTabs.query.mockResolvedValue([
        { url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
        { url: undefined, title: 'No URL' } as chrome.tabs.Tab,
        { url: 'https://google.com', title: 'Google' } as chrome.tabs.Tab,
      ]);

      const { handleAutoSave } = await import('@/entrypoints/background');

      await handleAutoSave();

      // Hash should only include defined URLs
      const hashResult = await chrome.storage.local.get(STORAGE_KEY_LAST_AUTO_SAVE_HASH);
      const expectedHash = ['https://example.com', 'https://google.com'].sort().join('|');
      expect(hashResult[STORAGE_KEY_LAST_AUTO_SAVE_HASH]).toBe(expectedHash);
    });
  });
});
