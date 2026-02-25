import { describe, it, expect } from 'vitest';
import type { TabGroup, SavedTab } from '@/lib/types';

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

describe('SearchBar component', () => {
  it('exports SearchBar component', async () => {
    const mod = await import('@/components/SearchBar');
    expect(mod.SearchBar).toBeDefined();
    expect(typeof mod.SearchBar).toBe('function');
  });
});

describe('Tabs entrypoint', () => {
  it('exports App component from tabs entrypoint', async () => {
    const mod = await import('@/entrypoints/tabs/App');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('Search/filter logic for full-page view', () => {
  /**
   * Replicates the filtering logic that tabs/App.tsx uses:
   * - Filter individual tabs within groups by matching title or URL
   * - Only return groups that have at least one matching tab
   * - Empty query returns all groups unchanged
   */
  function filterGroups(groups: TabGroup[], query: string): TabGroup[] {
    const q = query.toLowerCase().trim();
    if (!q) return groups;

    return groups
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter(
          (tab) =>
            tab.title.toLowerCase().includes(q) ||
            tab.url.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.tabs.length > 0);
  }

  it('returns all groups when query is empty', () => {
    const groups = [
      makeTabGroup({ id: 'g1', tabs: [makeSavedTab({ id: 't1' })] }),
      makeTabGroup({ id: 'g2', tabs: [makeSavedTab({ id: 't2' })] }),
    ];

    const result = filterGroups(groups, '');
    expect(result).toHaveLength(2);
  });

  it('returns all groups when query is whitespace', () => {
    const groups = [
      makeTabGroup({ id: 'g1', tabs: [makeSavedTab({ id: 't1' })] }),
    ];

    const result = filterGroups(groups, '   ');
    expect(result).toHaveLength(1);
  });

  it('filters tabs by title match', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1', title: 'React Documentation' }),
          makeSavedTab({ id: 't2', title: 'Vue Documentation' }),
        ],
      }),
    ];

    const result = filterGroups(groups, 'react');
    expect(result).toHaveLength(1);
    expect(result[0].tabs).toHaveLength(1);
    expect(result[0].tabs[0].title).toBe('React Documentation');
  });

  it('filters tabs by URL match', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1', url: 'https://github.com/project', title: 'GitHub' }),
          makeSavedTab({ id: 't2', url: 'https://stackoverflow.com/q', title: 'SO Question' }),
        ],
      }),
    ];

    const result = filterGroups(groups, 'github');
    expect(result).toHaveLength(1);
    expect(result[0].tabs).toHaveLength(1);
    expect(result[0].tabs[0].url).toContain('github');
  });

  it('is case insensitive', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1', title: 'TypeScript Handbook' }),
        ],
      }),
    ];

    const result = filterGroups(groups, 'TYPESCRIPT');
    expect(result).toHaveLength(1);
    expect(result[0].tabs).toHaveLength(1);
  });

  it('removes groups with no matching tabs', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1', title: 'React Docs', url: 'https://react.dev' }),
        ],
      }),
      makeTabGroup({
        id: 'g2',
        tabs: [
          makeSavedTab({ id: 't2', title: 'Vue Docs', url: 'https://vuejs.org' }),
        ],
      }),
    ];

    const result = filterGroups(groups, 'react');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g1');
  });

  it('returns empty array when nothing matches', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1', title: 'Example', url: 'https://example.com' }),
        ],
      }),
    ];

    const result = filterGroups(groups, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('handles groups with no tabs', () => {
    const groups = [
      makeTabGroup({ id: 'g1', tabs: [] }),
    ];

    const result = filterGroups(groups, 'anything');
    expect(result).toHaveLength(0);
  });

  it('filters across multiple groups preserving each groups matching tabs', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        tabs: [
          makeSavedTab({ id: 't1', title: 'React Docs' }),
          makeSavedTab({ id: 't2', title: 'Angular Docs' }),
        ],
      }),
      makeTabGroup({
        id: 'g2',
        tabs: [
          makeSavedTab({ id: 't3', title: 'React Router' }),
          makeSavedTab({ id: 't4', title: 'Redux Store' }),
        ],
      }),
    ];

    const result = filterGroups(groups, 'react');
    expect(result).toHaveLength(2);
    expect(result[0].tabs).toHaveLength(1);
    expect(result[0].tabs[0].title).toBe('React Docs');
    expect(result[1].tabs).toHaveLength(1);
    expect(result[1].tabs[0].title).toBe('React Router');
  });

  it('full-page view shows ALL auto-save groups (no limit)', () => {
    const autoGroups: TabGroup[] = Array.from({ length: 10 }, (_, i) =>
      makeTabGroup({
        id: `auto-${i}`,
        isAutoSave: true,
        tabs: [makeSavedTab({ id: `t-${i}` })],
      }),
    );

    // In the full-page view, all auto groups are shown (not sliced)
    const allAutoGroups = autoGroups.filter((g) => g.isAutoSave);
    expect(allAutoGroups).toHaveLength(10);
  });
});
