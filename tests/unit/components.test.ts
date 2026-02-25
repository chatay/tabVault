import { describe, it, expect } from 'vitest';
import type { TabGroup, SavedTab } from '@/lib/types';
import { AUTO_SAVE_VISIBLE_COUNT } from '@/lib/constants';

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
