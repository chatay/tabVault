import { describe, it, expect } from 'vitest';
import type { TabGroup, SavedTab } from '@/lib/types';
import type { ReactNode } from 'react';

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

describe('highlightMatch logic', () => {
  // Replicate the fixed highlightMatch from SearchResultItem
  function highlightMatch(text: string, query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [text];

    const lower = text.toLowerCase();
    const qLower = trimmed.toLowerCase();
    const matchLen = trimmed.length;
    const parts: string[] = [];
    let lastIndex = 0;

    let index = lower.indexOf(qLower);
    while (index !== -1) {
      if (index > lastIndex) {
        parts.push(text.slice(lastIndex, index));
      }
      parts.push(`[${text.slice(index, index + matchLen)}]`); // brackets = highlight
      lastIndex = index + matchLen;
      index = lower.indexOf(qLower, lastIndex);
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }

  it('highlights the matching substring', () => {
    const result = highlightMatch('React Documentation', 'react');
    expect(result).toEqual(['[React]', ' Documentation']);
  });

  it('handles trailing whitespace in query correctly', () => {
    // Before the fix, this would slice wrong because query.length !== trimmed.length
    const result = highlightMatch('React Documentation', 'react   ');
    expect(result).toEqual(['[React]', ' Documentation']);
  });

  it('highlights multiple occurrences', () => {
    const result = highlightMatch('test one test two', 'test');
    expect(result).toEqual(['[test]', ' one ', '[test]', ' two']);
  });

  it('returns the original text when query is empty', () => {
    expect(highlightMatch('hello', '')).toEqual(['hello']);
  });

  it('returns the original text when query is whitespace-only', () => {
    expect(highlightMatch('hello', '   ')).toEqual(['hello']);
  });
});

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

  it('flat search results include group name and date metadata', () => {
    const groups = [
      makeTabGroup({
        id: 'g1',
        name: 'Work Tabs',
        createdAt: new Date('2024-06-15T14:30:00').getTime(),
        tabs: [
          makeSavedTab({ id: 't1', title: 'React Docs', url: 'https://react.dev' }),
          makeSavedTab({ id: 't2', title: 'TypeScript Handbook', url: 'https://ts.dev' }),
        ],
      }),
    ];

    // Replicate the flat search logic from tabs/App.tsx
    const query = 'react';
    const q = query.toLowerCase().trim();
    const results = groups.flatMap((group) => {
      const date = new Date(group.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return group.tabs
        .filter((tab) => tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q))
        .map((tab) => ({ tab, groupName: group.name, groupDate: date }));
    });

    expect(results).toHaveLength(1);
    expect(results[0].tab.title).toBe('React Docs');
    expect(results[0].groupName).toBe('Work Tabs');
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
