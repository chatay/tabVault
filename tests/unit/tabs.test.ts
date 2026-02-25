import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '@/lib/storage';
import type { TabGroup, SavedTab } from '@/lib/types';

// Mock chrome.tabs API
const mockChromeTabs = {
  query: vi.fn<(queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>(),
  create: vi.fn<(createProperties: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>>(),
};

// Attach chrome.tabs to the global chrome mock
beforeEach(() => {
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.tabs = mockChromeTabs;

  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.runtime = {
    getPlatformInfo: vi.fn(async () => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })),
  };

  mockChromeTabs.query.mockReset();
  mockChromeTabs.create.mockReset();
  mockChromeTabs.create.mockResolvedValue({} as chrome.tabs.Tab);
});

// Mock crypto.randomUUID to return predictable values
let uuidCounter = 0;
const originalRandomUUID = crypto.randomUUID;

beforeEach(() => {
  uuidCounter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    uuidCounter++;
    return `uuid-${uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`;
  });
});

// Import TabService after mocks are set up
// We'll dynamically import to avoid module resolution issues before implementation exists
let TabService: typeof import('@/lib/tabs').TabService;

beforeEach(async () => {
  const mod = await import('@/lib/tabs');
  TabService = mod.TabService;
});

function makeStorage(): StorageService {
  return new StorageService();
}

function makeSavedTab(overrides: Partial<SavedTab> = {}): SavedTab {
  return {
    id: 'tab-1',
    url: 'https://example.com',
    title: 'Example',
    faviconUrl: null,
    position: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeTabGroup(overrides: Partial<TabGroup> = {}): TabGroup {
  return {
    id: 'group-1',
    name: 'Test Group',
    tabs: [],
    isAutoSave: false,
    deviceId: 'device-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('TabService', () => {
  describe('saveCurrentTabs', () => {
    it('saves all tabs from current window', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      mockChromeTabs.query.mockResolvedValue([
        { url: 'https://example.com', title: 'Example', favIconUrl: 'https://example.com/icon.png' } as chrome.tabs.Tab,
        { url: 'https://google.com', title: 'Google', favIconUrl: null } as chrome.tabs.Tab,
      ]);

      const group = await service.saveCurrentTabs();

      // Verify chrome.tabs.query was called for current window
      expect(mockChromeTabs.query).toHaveBeenCalledWith({ currentWindow: true });

      // Verify group was created with correct tabs
      expect(group.tabs).toHaveLength(2);
      expect(group.tabs[0].url).toBe('https://example.com');
      expect(group.tabs[0].title).toBe('Example');
      expect(group.tabs[0].faviconUrl).toBe('https://example.com/icon.png');
      expect(group.tabs[1].url).toBe('https://google.com');
      expect(group.tabs[1].title).toBe('Google');

      // Verify positions
      expect(group.tabs[0].position).toBe(0);
      expect(group.tabs[1].position).toBe(1);

      // Verify group properties
      expect(group.isAutoSave).toBe(false);
      expect(group.deviceId).toBe('device-1');
      expect(group.name).toContain('Session');

      // Verify it was persisted
      const saved = await storage.getTabGroups();
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe(group.id);
    });

    it('filters out chrome://, edge://, brave://, about: URLs', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      mockChromeTabs.query.mockResolvedValue([
        { url: 'https://valid.com', title: 'Valid' } as chrome.tabs.Tab,
        { url: 'chrome://extensions', title: 'Extensions' } as chrome.tabs.Tab,
        { url: 'edge://settings', title: 'Edge Settings' } as chrome.tabs.Tab,
        { url: 'brave://flags', title: 'Brave Flags' } as chrome.tabs.Tab,
        { url: 'about:blank', title: 'Blank' } as chrome.tabs.Tab,
        { url: 'opera://settings', title: 'Opera' } as chrome.tabs.Tab,
        { url: 'chrome-extension://abc/popup.html', title: 'Extension' } as chrome.tabs.Tab,
        { url: undefined, title: 'No URL' } as chrome.tabs.Tab,
        { url: 'https://also-valid.com', title: 'Also Valid' } as chrome.tabs.Tab,
      ]);

      const group = await service.saveCurrentTabs();

      expect(group.tabs).toHaveLength(2);
      expect(group.tabs[0].url).toBe('https://valid.com');
      expect(group.tabs[1].url).toBe('https://also-valid.com');
    });

    it('with isAutoSave: true creates auto-save group', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      mockChromeTabs.query.mockResolvedValue([
        { url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab,
      ]);

      const group = await service.saveCurrentTabs({ isAutoSave: true });

      expect(group.isAutoSave).toBe(true);
      expect(group.name).toContain('Auto-save');
      expect(group.name).not.toContain('Session');
    });
  });

  describe('renameGroup', () => {
    it('updates the name of an existing group', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const group = makeTabGroup({ id: 'g1', name: 'Old Name' });
      await storage.saveTabGroup(group);

      await service.renameGroup('g1', 'New Name');

      const groups = await storage.getTabGroups();
      expect(groups[0].name).toBe('New Name');
      expect(groups[0].updatedAt).toBeGreaterThanOrEqual(group.updatedAt);
    });

    it('on auto-save group promotes it (sets isAutoSave to false)', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const group = makeTabGroup({ id: 'g1', name: 'Auto-save - Jan 1', isAutoSave: true });
      await storage.saveTabGroup(group);

      await service.renameGroup('g1', 'My Important Tabs');

      const groups = await storage.getTabGroups();
      expect(groups[0].name).toBe('My Important Tabs');
      expect(groups[0].isAutoSave).toBe(false);
    });

    it('does nothing when group is not found', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      // Should not throw
      await service.renameGroup('nonexistent', 'New Name');

      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(0);
    });
  });

  describe('deleteTab', () => {
    it('removes a single tab from a group', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const tab1 = makeSavedTab({ id: 't1', url: 'https://keep.com', position: 0 });
      const tab2 = makeSavedTab({ id: 't2', url: 'https://remove.com', position: 1 });
      const group = makeTabGroup({ id: 'g1', tabs: [tab1, tab2] });
      await storage.saveTabGroup(group);

      await service.deleteTab('g1', 't2');

      const groups = await storage.getTabGroups();
      expect(groups[0].tabs).toHaveLength(1);
      expect(groups[0].tabs[0].id).toBe('t1');
      expect(groups[0].updatedAt).toBeGreaterThanOrEqual(group.updatedAt);
    });

    it('does nothing when group is not found', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      await service.deleteTab('nonexistent', 't1');
      // Should not throw
    });
  });

  describe('moveTab', () => {
    it('moves a tab from one group to another', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const tab1 = makeSavedTab({ id: 't1', url: 'https://move-me.com', position: 0 });
      const tab2 = makeSavedTab({ id: 't2', url: 'https://stay.com', position: 1 });
      const fromGroup = makeTabGroup({ id: 'from', tabs: [tab1, tab2] });

      const existingTab = makeSavedTab({ id: 't3', url: 'https://existing.com', position: 0 });
      const toGroup = makeTabGroup({ id: 'to', tabs: [existingTab] });

      await storage.saveTabGroup(fromGroup);
      await storage.saveTabGroup(toGroup);

      await service.moveTab('t1', 'from', 'to');

      const groups = await storage.getTabGroups();
      const updatedFrom = groups.find((g) => g.id === 'from')!;
      const updatedTo = groups.find((g) => g.id === 'to')!;

      // Tab removed from source
      expect(updatedFrom.tabs).toHaveLength(1);
      expect(updatedFrom.tabs[0].id).toBe('t2');

      // Tab added to destination
      expect(updatedTo.tabs).toHaveLength(2);
      expect(updatedTo.tabs[1].id).toBe('t1');
      expect(updatedTo.tabs[1].position).toBe(1); // appended at end

      // Both groups have updated timestamps
      expect(updatedFrom.updatedAt).toBeGreaterThanOrEqual(fromGroup.updatedAt);
      expect(updatedTo.updatedAt).toBeGreaterThanOrEqual(toGroup.updatedAt);
    });

    it('does nothing when source group is not found', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const toGroup = makeTabGroup({ id: 'to', tabs: [] });
      await storage.saveTabGroup(toGroup);

      await service.moveTab('t1', 'nonexistent', 'to');
      // Should not throw
    });

    it('does nothing when tab is not found in source group', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const fromGroup = makeTabGroup({ id: 'from', tabs: [] });
      const toGroup = makeTabGroup({ id: 'to', tabs: [] });
      await storage.saveTabGroup(fromGroup);
      await storage.saveTabGroup(toGroup);

      await service.moveTab('nonexistent-tab', 'from', 'to');
      // Should not throw, groups unchanged
    });
  });

  describe('openTab', () => {
    it('creates a new chrome tab with the given URL', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      await service.openTab('https://example.com');

      expect(mockChromeTabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
    });
  });

  describe('openGroup', () => {
    it('opens all tabs in a group', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const tab1 = makeSavedTab({ id: 't1', url: 'https://one.com' });
      const tab2 = makeSavedTab({ id: 't2', url: 'https://two.com' });
      const group = makeTabGroup({ id: 'g1', tabs: [tab1, tab2] });
      await storage.saveTabGroup(group);

      await service.openGroup('g1', false);

      expect(mockChromeTabs.create).toHaveBeenCalledTimes(2);
      expect(mockChromeTabs.create).toHaveBeenCalledWith({ url: 'https://one.com', active: false });
      expect(mockChromeTabs.create).toHaveBeenCalledWith({ url: 'https://two.com', active: false });

      // Group should still exist (removeAfterRestore = false)
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
    });

    it('removes group after restore when removeAfterRestore is true', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      const tab1 = makeSavedTab({ id: 't1', url: 'https://one.com' });
      const group = makeTabGroup({ id: 'g1', tabs: [tab1] });
      await storage.saveTabGroup(group);

      await service.openGroup('g1', true);

      expect(mockChromeTabs.create).toHaveBeenCalledTimes(1);

      // Group should be deleted
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(0);
    });

    it('does nothing when group is not found', async () => {
      const storage = makeStorage();
      const service = new TabService(storage, 'device-1');

      await service.openGroup('nonexistent', false);

      expect(mockChromeTabs.create).not.toHaveBeenCalled();
    });
  });
});
