import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TabGroup, SavedTab, SyncStatus, UserSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { AUTO_SAVE_VISIBLE_COUNT, STORAGE_KEY_SETTINGS } from '@/lib/constants';

/**
 * Helper to create a SavedTab for testing.
 */
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

/**
 * Helper to create a TabGroup for testing.
 */
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

// Mock supabase and auth for SyncStatus and popup auth tests
const mockGetSyncStatus = vi.fn(async () => 'synced' as SyncStatus);
vi.mock('@/lib/sync', () => ({
  SyncEngine: vi.fn().mockImplementation(() => ({
    getSyncStatus: mockGetSyncStatus,
  })),
}));
vi.mock('@/lib/sync-queue', () => ({
  SyncQueue: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  }),
}));
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(async () => null),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

describe('Component modules', () => {
  describe('FaviconImg', () => {
    it('exports FaviconImg component', async () => {
      const mod = await import('@/components/FaviconImg');
      expect(mod.FaviconImg).toBeDefined();
      expect(typeof mod.FaviconImg).toBe('function');
    });
  });

  describe('TabItem', () => {
    it('exports TabItem component', async () => {
      const mod = await import('@/components/TabItem');
      expect(mod.TabItem).toBeDefined();
      expect(typeof mod.TabItem).toBe('function');
    });
  });

  describe('TabGroupCard', () => {
    it('exports TabGroupCard component', async () => {
      const mod = await import('@/components/TabGroupCard');
      expect(mod.TabGroupCard).toBeDefined();
      expect(typeof mod.TabGroupCard).toBe('function');
    });
  });
});

describe('Popup logic: group splitting', () => {
  /**
   * Replicates the logic that App.tsx uses to split groups into
   * manual and auto-save sections.
   */
  function splitGroups(groups: TabGroup[]) {
    const manualGroups = groups.filter((g) => !g.isAutoSave);
    const autoGroups = groups.filter((g) => g.isAutoSave);
    return { manualGroups, autoGroups };
  }

  it('splits groups into manual and auto-save', () => {
    const groups: TabGroup[] = [
      makeTabGroup({ id: 'g1', isAutoSave: false }),
      makeTabGroup({ id: 'g2', isAutoSave: true }),
      makeTabGroup({ id: 'g3', isAutoSave: false }),
      makeTabGroup({ id: 'g4', isAutoSave: true }),
    ];

    const { manualGroups, autoGroups } = splitGroups(groups);

    expect(manualGroups).toHaveLength(2);
    expect(autoGroups).toHaveLength(2);
    expect(manualGroups.every((g) => !g.isAutoSave)).toBe(true);
    expect(autoGroups.every((g) => g.isAutoSave)).toBe(true);
  });

  it('returns empty arrays when no groups exist', () => {
    const { manualGroups, autoGroups } = splitGroups([]);

    expect(manualGroups).toHaveLength(0);
    expect(autoGroups).toHaveLength(0);
  });

  it('handles all manual groups', () => {
    const groups: TabGroup[] = [
      makeTabGroup({ id: 'g1', isAutoSave: false }),
      makeTabGroup({ id: 'g2', isAutoSave: false }),
    ];

    const { manualGroups, autoGroups } = splitGroups(groups);

    expect(manualGroups).toHaveLength(2);
    expect(autoGroups).toHaveLength(0);
  });

  it('handles all auto-save groups', () => {
    const groups: TabGroup[] = [
      makeTabGroup({ id: 'g1', isAutoSave: true }),
      makeTabGroup({ id: 'g2', isAutoSave: true }),
    ];

    const { manualGroups, autoGroups } = splitGroups(groups);

    expect(manualGroups).toHaveLength(0);
    expect(autoGroups).toHaveLength(2);
  });
});

describe('Popup logic: auto-save visible count', () => {
  it('AUTO_SAVE_VISIBLE_COUNT limits displayed auto-saves', () => {
    const autoGroups: TabGroup[] = Array.from({ length: 7 }, (_, i) =>
      makeTabGroup({ id: `auto-${i}`, isAutoSave: true }),
    );

    const visibleAutoGroups = autoGroups.slice(0, AUTO_SAVE_VISIBLE_COUNT);

    expect(AUTO_SAVE_VISIBLE_COUNT).toBe(3);
    expect(visibleAutoGroups).toHaveLength(3);
  });

  it('shows all auto-saves when fewer than limit', () => {
    const autoGroups: TabGroup[] = [
      makeTabGroup({ id: 'auto-1', isAutoSave: true }),
      makeTabGroup({ id: 'auto-2', isAutoSave: true }),
    ];

    const visibleAutoGroups = autoGroups.slice(0, AUTO_SAVE_VISIBLE_COUNT);

    expect(visibleAutoGroups).toHaveLength(2);
  });
});

describe('Popup logic: total tab count', () => {
  it('computes total tab count across all groups', () => {
    const groups: TabGroup[] = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1' }),
          makeSavedTab({ id: 't2' }),
        ],
      }),
      makeTabGroup({
        id: 'g2',
        tabs: [
          makeSavedTab({ id: 't3' }),
        ],
      }),
      makeTabGroup({
        id: 'g3',
        tabs: [],
      }),
    ];

    const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

    expect(totalTabs).toBe(3);
  });

  it('returns 0 when no groups exist', () => {
    const groups: TabGroup[] = [];
    const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);
    expect(totalTabs).toBe(0);
  });
});

describe('SyncStatusIndicator component', () => {
  it('exports SyncStatusIndicator function', async () => {
    const mod = await import('@/components/SyncStatus');
    expect(mod.SyncStatusIndicator).toBeDefined();
    expect(typeof mod.SyncStatusIndicator).toBe('function');
  });
});

describe('SyncStatus config mapping', () => {
  const statusConfig: Record<SyncStatus, { label: string; color: string }> = {
    synced: { label: 'Synced', color: 'text-green-600' },
    syncing: { label: 'Syncing...', color: 'text-blue-600' },
    pending: { label: 'Sync pending', color: 'text-orange-500' },
    failed: { label: 'Sync failed', color: 'text-red-600' },
  };

  it('maps "synced" to green label', () => {
    expect(statusConfig['synced'].label).toBe('Synced');
    expect(statusConfig['synced'].color).toBe('text-green-600');
  });

  it('maps "syncing" to blue label', () => {
    expect(statusConfig['syncing'].label).toBe('Syncing...');
    expect(statusConfig['syncing'].color).toBe('text-blue-600');
  });

  it('maps "pending" to orange label', () => {
    expect(statusConfig['pending'].label).toBe('Sync pending');
    expect(statusConfig['pending'].color).toBe('text-orange-500');
  });

  it('maps "failed" to red label', () => {
    expect(statusConfig['failed'].label).toBe('Sync failed');
    expect(statusConfig['failed'].color).toBe('text-red-600');
  });
});

describe('AuthPrompt component', () => {
  it('exports AuthPrompt function', async () => {
    const mod = await import('@/components/AuthPrompt');
    expect(mod.AuthPrompt).toBeDefined();
    expect(typeof mod.AuthPrompt).toBe('function');
  });
});

describe('OtpAuthFlow component', () => {
  it('exports OtpAuthFlow function', async () => {
    const mod = await import('@/components/OtpAuthFlow');
    expect(mod.OtpAuthFlow).toBeDefined();
    expect(typeof mod.OtpAuthFlow).toBe('function');
  });
});

describe('useTabVault hook', () => {
  it('exports useTabVault function', async () => {
    const mod = await import('@/hooks/useTabVault');
    expect(mod.useTabVault).toBeDefined();
    expect(typeof mod.useTabVault).toBe('function');
  });
});

describe('Popup logic: auth prompt display', () => {
  /**
   * Replicates the decision logic for showing the auth prompt after save.
   */
  function shouldShowAuthPrompt(
    isAuthenticated: boolean,
    hasSeenCloudPrompt: boolean,
    hasDismissedCloudPrompt: boolean,
  ): boolean {
    return !isAuthenticated && !hasSeenCloudPrompt;
  }

  it('shows auth prompt after first save when not authenticated and never seen', () => {
    expect(shouldShowAuthPrompt(false, false, false)).toBe(true);
  });

  it('does not show auth prompt when authenticated', () => {
    expect(shouldShowAuthPrompt(true, false, false)).toBe(false);
  });

  it('does not show auth prompt when already seen', () => {
    expect(shouldShowAuthPrompt(false, true, false)).toBe(false);
  });

  it('does not show auth prompt when seen and dismissed', () => {
    expect(shouldShowAuthPrompt(false, true, true)).toBe(false);
  });

  it('does not show auth prompt when authenticated and already seen', () => {
    expect(shouldShowAuthPrompt(true, true, false)).toBe(false);
  });
});

describe('Popup logic: auth prompt dismiss', () => {
  it('sets hasDismissedCloudPrompt on dismiss', async () => {
    // Simulate dismiss action updating settings
    const settings: UserSettings = { ...DEFAULT_SETTINGS };
    const updated = { ...settings, hasDismissedCloudPrompt: true };
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: updated });

    const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
    expect((result[STORAGE_KEY_SETTINGS] as UserSettings).hasDismissedCloudPrompt).toBe(true);
  });

  it('sets hasSeenCloudPrompt when showing prompt', async () => {
    const settings: UserSettings = { ...DEFAULT_SETTINGS };
    const updated = { ...settings, hasSeenCloudPrompt: true };
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: updated });

    const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
    expect((result[STORAGE_KEY_SETTINGS] as UserSettings).hasSeenCloudPrompt).toBe(true);
  });
});

describe('Popup logic: sync status visibility', () => {
  it('shows sync status only when authenticated', () => {
    const showSyncStatus = (isAuthenticated: boolean) => isAuthenticated;

    expect(showSyncStatus(true)).toBe(true);
    expect(showSyncStatus(false)).toBe(false);
  });
});
