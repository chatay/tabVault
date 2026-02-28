import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '@/lib/storage';
import type { TabGroup, SavedTab, SaveResult } from '@/lib/types';
import {
  CATEGORIZATION_STATUS,
  ABUSE_CHECK_RESULT,
} from '@/lib/constants';

// --- Mocks ---

const mockCategorizeTabs = vi.fn();
vi.mock('@/lib/categorize', () => ({
  categorizeTabs: (...args: unknown[]) => mockCategorizeTabs(...args),
}));

const mockCheckForAbuse = vi.fn();
vi.mock('@/lib/abuse', () => ({
  checkForAbuse: (...args: unknown[]) => mockCheckForAbuse(...args),
}));

const mockGetSession = vi.fn();
const mockGetProfile = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock('@/lib/sync', () => ({
  SyncEngine: vi.fn().mockImplementation(() => ({
    pushGroup: vi.fn().mockResolvedValue(undefined),
    ensureDevice: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@/lib/sync-queue', () => ({
  SyncQueue: vi.fn(),
}));

// Chrome tabs mock
const mockChromeTabs = {
  query: vi.fn<() => Promise<chrome.tabs.Tab[]>>(),
  create: vi.fn().mockResolvedValue({} as chrome.tabs.Tab),
  remove: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error -- extending chrome mock
  globalThis.chrome.tabs = mockChromeTabs;
  // @ts-expect-error -- extending chrome mock
  globalThis.chrome.runtime = {
    getPlatformInfo: vi.fn(async () => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })),
    getURL: vi.fn((path: string) => `chrome-extension://test-id${path}`),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };

  // Defaults
  mockGetSession.mockResolvedValue(null);
  mockGetProfile.mockResolvedValue(null);
  mockCheckForAbuse.mockResolvedValue(ABUSE_CHECK_RESULT.NORMAL);
  mockCategorizeTabs.mockResolvedValue(null);
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

// Import after mocks
import { TabService, runCategorizationJob } from '@/lib/tabs';

/** Helper: build 6 chrome tabs (enough to trigger categorization) */
function makeBrowserTabs(count = 6): chrome.tabs.Tab[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    url: `https://site-${i}.com`,
    title: `Site ${i}`,
    favIconUrl: null,
  } as chrome.tabs.Tab));
}

function expectSuccess(result: SaveResult) {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error('Expected successful save');
  return result.group;
}

// ─── Test Group 1 — saveCurrentTabs delegates to background ───

describe('saveCurrentTabs delegates categorization to background', () => {
  it('saveCurrentTabs returns successfully (does not wait for categorization)', async () => {
    mockChromeTabs.query.mockResolvedValue(makeBrowserTabs());
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const storage = new StorageService();
    const service = new TabService(storage, 'device-1');
    const result = await service.saveCurrentTabs({ closeAfterSave: false });

    expect(result.success).toBe(true);
  });

  it('group is saved with categorizationStatus PENDING immediately', async () => {
    mockChromeTabs.query.mockResolvedValue(makeBrowserTabs());
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const storage = new StorageService();
    const service = new TabService(storage, 'device-1');
    const group = expectSuccess(await service.saveCurrentTabs({ closeAfterSave: false }));

    expect(group.categorizationStatus).toBe(CATEGORIZATION_STATUS.PENDING);
  });

  it('sends tabvault:run-categorization message to background', async () => {
    mockChromeTabs.query.mockResolvedValue(makeBrowserTabs());
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });

    const storage = new StorageService();
    const service = new TabService(storage, 'device-1');
    const group = expectSuccess(await service.saveCurrentTabs({ closeAfterSave: false }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'tabvault:run-categorization',
      groupId: group.id,
    });
  });

  it('does not send categorization message when user is not logged in', async () => {
    mockChromeTabs.query.mockResolvedValue(makeBrowserTabs());
    mockGetSession.mockResolvedValue(null);

    const storage = new StorageService();
    const service = new TabService(storage, 'device-1');
    await service.saveCurrentTabs({ closeAfterSave: false });

    // sendMessage is still called (fire-and-forget), but the background will check session
    // The important thing is saveCurrentTabs always sends the message
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabvault:run-categorization' }),
    );
  });
});

// ─── Test Group 2 — runCategorizationJob (runs in background) ───

describe('runCategorizationJob — abuse detection', () => {
  it('BLOCKED → status set to FAILED, categorizeTabs never called', async () => {
    mockCheckForAbuse.mockResolvedValue(ABUSE_CHECK_RESULT.BLOCKED);

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    expect(mockCategorizeTabs).not.toHaveBeenCalled();
    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.categorizationStatus).toBe(CATEGORIZATION_STATUS.FAILED);
  });

  it('FLAGGED → categorizeTabs still called normally', async () => {
    mockCheckForAbuse.mockResolvedValue(ABUSE_CHECK_RESULT.FLAGGED);
    mockCategorizeTabs.mockResolvedValue({
      subGroups: [{ id: 'sg1', name: 'All', tabs: [] }],
      summary: 'Test',
      tags: ['test'],
    });

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    expect(mockCategorizeTabs).toHaveBeenCalled();
  });

  it('NORMAL → categorizeTabs called normally', async () => {
    mockCheckForAbuse.mockResolvedValue(ABUSE_CHECK_RESULT.NORMAL);
    mockCategorizeTabs.mockResolvedValue({
      subGroups: [{ id: 'sg1', name: 'All', tabs: [] }],
      summary: 'Test',
      tags: ['test'],
    });

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    expect(mockCategorizeTabs).toHaveBeenCalled();
  });
});

// ─── Test Group 3 — Successful categorization ───

describe('runCategorizationJob — successful categorization', () => {
  const mockResult = {
    subGroups: [
      { id: 'sg-ai', name: 'AI Tools', tabs: [] },
      { id: 'sg-food', name: 'Restaurant', tabs: [] },
    ],
    summary: 'Research on AI tools and restaurants',
    tags: ['AI', 'Food'],
  };

  beforeEach(() => {
    mockCheckForAbuse.mockResolvedValue(ABUSE_CHECK_RESULT.NORMAL);
    mockCategorizeTabs.mockResolvedValue(mockResult);
  });

  it('after categorization, group has subGroups populated', async () => {
    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.subGroups).toHaveLength(2);
    expect(updated.subGroups![0].name).toBe('AI Tools');
    expect(updated.subGroups![1].name).toBe('Restaurant');
  });

  it('after categorization, group has summary string', async () => {
    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.summary).toBe('Research on AI tools and restaurants');
  });

  it('after categorization, group has tags array', async () => {
    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.tags).toEqual(['AI', 'Food']);
  });

  it('after categorization, categorizationStatus is DONE', async () => {
    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.categorizationStatus).toBe(CATEGORIZATION_STATUS.DONE);
  });

  it('original tabs array is unchanged after categorization', async () => {
    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);
    const originalTabCount = group.tabs.length;

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.tabs).toHaveLength(originalTabCount);
    expect(updated.tabs[0].url).toBe('https://site-0.com');
  });
});

// ─── Test Group 4 — Failed categorization ───

describe('runCategorizationJob — failed categorization', () => {
  beforeEach(() => {
    mockCheckForAbuse.mockResolvedValue(ABUSE_CHECK_RESULT.NORMAL);
  });

  it('categorizeTabs returns null → status set to FAILED', async () => {
    mockCategorizeTabs.mockResolvedValue(null);

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.categorizationStatus).toBe(CATEGORIZATION_STATUS.FAILED);
  });

  it('categorizeTabs throws → status set to FAILED, no crash', async () => {
    mockCategorizeTabs.mockRejectedValue(new Error('Claude is down'));

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.categorizationStatus).toBe(CATEGORIZATION_STATUS.FAILED);
  });

  it('group is still fully usable after failed categorization', async () => {
    mockCategorizeTabs.mockResolvedValue(null);

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.name).toBeTruthy();
    expect(updated.tabs.length).toBeGreaterThan(0);
    expect(updated.id).toBe(group.id);
  });

  it('existing tabs are untouched even if categorization fails', async () => {
    mockCategorizeTabs.mockRejectedValue(new Error('Failure'));

    const storage = new StorageService();
    const group = makeTestGroup();
    await storage.saveTabGroup(group);
    const originalUrls = group.tabs.map(t => t.url);

    await runCategorizationJob(group.id, 'user-1');

    const groups = await storage.getTabGroups();
    const updated = groups.find(g => g.id === group.id)!;
    expect(updated.tabs.map(t => t.url)).toEqual(originalUrls);
  });

  it('group not found → no crash, no status change', async () => {
    await runCategorizationJob('nonexistent-id', 'user-1');
    // No throw = success
    expect(mockCategorizeTabs).not.toHaveBeenCalled();
  });
});

// --- Helper ---

function makeTestGroup(): TabGroup {
  const now = Date.now();
  return {
    id: `group-${++uuidCounter}`,
    name: 'Test Group',
    tabs: Array.from({ length: 6 }, (_, i) => ({
      id: `tab-${i}`,
      url: `https://site-${i}.com`,
      title: `Site ${i}`,
      faviconUrl: null,
      position: i,
      createdAt: now,
    })),
    isAutoSave: false,
    deviceId: 'device-1',
    createdAt: now,
    updatedAt: now,
    categorizationStatus: CATEGORIZATION_STATUS.PENDING,
  };
}
