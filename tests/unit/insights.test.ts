import { describe, it, expect } from 'vitest';
import type { TabGroup, SavedTab } from '@/lib/types';
import { computeInsightsDuplicates, computeForgottenTabs } from '@/lib/insights';
import { INSIGHTS } from '@/lib/constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_MS = INSIGHTS.FORGOTTEN_TAB_THRESHOLD_DAYS * DAY_MS;
const NOW = 1_700_000_000_000; // fixed "now" for deterministic tests

function makeTab(overrides: Partial<SavedTab> = {}): SavedTab {
  return {
    id: 'tab-1',
    url: 'https://example.com',
    title: 'Example',
    faviconUrl: null,
    position: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<TabGroup> & { tabs?: SavedTab[] } = {}): TabGroup {
  return {
    id: 'g1',
    name: 'Session',
    tabs: [makeTab()],
    isAutoSave: false,
    deviceId: 'dev-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── computeInsightsDuplicates ───────────────────────────────────────────────

describe('computeInsightsDuplicates', () => {
  it('returns empty array when there are no groups', () => {
    expect(computeInsightsDuplicates([])).toEqual([]);
  });

  it('returns empty array when there is only one group (MIN_GROUPS not met)', () => {
    const g = makeGroup({ tabs: [makeTab(), makeTab({ id: 't2' })] });
    expect(computeInsightsDuplicates([g])).toEqual([]);
  });

  it('returns empty array when no URL is duplicated', () => {
    const g1 = makeGroup({ id: 'g1', tabs: [makeTab({ id: 't1', url: 'https://a.com' })] });
    const g2 = makeGroup({ id: 'g2', tabs: [makeTab({ id: 't2', url: 'https://b.com' })] });
    expect(computeInsightsDuplicates([g1, g2])).toEqual([]);
  });

  it('returns an entry for each duplicated URL', () => {
    const url = 'https://dup.com/page';
    const g1 = makeGroup({ id: 'g1', tabs: [makeTab({ id: 't1', url })] });
    const g2 = makeGroup({ id: 'g2', tabs: [makeTab({ id: 't2', url })] });

    const result = computeInsightsDuplicates([g1, g2]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(url.toLowerCase().replace(/\/+$/, ''));
  });

  it('lists all occurrences for a duplicate URL', () => {
    const url = 'https://dup.com';
    const g1 = makeGroup({ id: 'g1', name: 'Work', tabs: [makeTab({ id: 't1', url })] });
    const g2 = makeGroup({ id: 'g2', name: 'Home', tabs: [makeTab({ id: 't2', url })] });

    const result = computeInsightsDuplicates([g1, g2]);
    expect(result[0].occurrences).toHaveLength(2);
  });

  it('marks the oldest occurrence as isKeep=true', () => {
    const url = 'https://dup.com';
    const older = makeTab({ id: 't-old', url, createdAt: NOW - 1000 });
    const newer = makeTab({ id: 't-new', url, createdAt: NOW });

    const g1 = makeGroup({ id: 'g1', tabs: [newer] });
    const g2 = makeGroup({ id: 'g2', tabs: [older] });

    const result = computeInsightsDuplicates([g1, g2]);
    const occurrences = result[0].occurrences;

    // Oldest first after sorting
    expect(occurrences[0].tab.id).toBe('t-old');
    expect(occurrences[0].isKeep).toBe(true);
    expect(occurrences[1].isKeep).toBe(false);
  });

  it('only marks exactly one occurrence as isKeep when there are 3+ occurrences', () => {
    const url = 'https://triple.com';
    const g1 = makeGroup({ id: 'g1', tabs: [makeTab({ id: 't1', url, createdAt: NOW - 200 })] });
    const g2 = makeGroup({ id: 'g2', tabs: [makeTab({ id: 't2', url, createdAt: NOW - 100 })] });
    const g3 = makeGroup({ id: 'g3', tabs: [makeTab({ id: 't3', url, createdAt: NOW })] });

    const result = computeInsightsDuplicates([g1, g2, g3]);
    const keepCount = result[0].occurrences.filter((o) => o.isKeep).length;
    expect(keepCount).toBe(1);
  });

  it('includes groupName and groupDate on each occurrence', () => {
    const url = 'https://example.com';
    const g1 = makeGroup({ id: 'g1', name: 'Morning', tabs: [makeTab({ id: 't1', url })] });
    const g2 = makeGroup({ id: 'g2', name: 'Evening', tabs: [makeTab({ id: 't2', url })] });

    const result = computeInsightsDuplicates([g1, g2]);
    const names = result[0].occurrences.map((o) => o.groupName);
    expect(names).toContain('Morning');
    expect(names).toContain('Evening');
  });
});

// ─── computeForgottenTabs ────────────────────────────────────────────────────

describe('computeForgottenTabs', () => {
  it('returns empty array when there are no groups', () => {
    expect(computeForgottenTabs([], NOW)).toEqual([]);
  });

  it('returns empty array when no tabs exceed the threshold', () => {
    const recentTab = makeTab({ createdAt: NOW - (29 * DAY_MS) }); // 29 days ago
    const g = makeGroup({ tabs: [recentTab] });
    expect(computeForgottenTabs([g], NOW)).toEqual([]);
  });

  it('does NOT include a tab saved exactly 29 days ago', () => {
    const tab = makeTab({ createdAt: NOW - (29 * DAY_MS) });
    const g = makeGroup({ tabs: [tab] });
    expect(computeForgottenTabs([g], NOW)).toHaveLength(0);
  });

  it('includes a tab saved more than 30 days ago with no lastOpenedAt', () => {
    const tab = makeTab({ id: 'old', createdAt: NOW - (31 * DAY_MS) });
    const g = makeGroup({ tabs: [tab] });
    const result = computeForgottenTabs([g], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].tab.id).toBe('old');
  });

  it('does NOT include a tab saved 31 days ago if lastOpenedAt is set', () => {
    const tab = makeTab({
      id: 'opened',
      createdAt: NOW - (31 * DAY_MS),
      lastOpenedAt: NOW - DAY_MS,
    });
    const g = makeGroup({ tabs: [tab] });
    expect(computeForgottenTabs([g], NOW)).toHaveLength(0);
  });

  it('sorts forgotten tabs oldest first', () => {
    const oldest = makeTab({ id: 't-oldest', createdAt: NOW - (60 * DAY_MS) });
    const middle = makeTab({ id: 't-middle', createdAt: NOW - (45 * DAY_MS) });
    const newer  = makeTab({ id: 't-newer',  createdAt: NOW - (31 * DAY_MS) });
    const g = makeGroup({ tabs: [newer, oldest, middle] });

    const result = computeForgottenTabs([g], NOW);
    expect(result.map((r) => r.tab.id)).toEqual(['t-oldest', 't-middle', 't-newer']);
  });

  it('computes daysAgo correctly', () => {
    const tab = makeTab({ createdAt: NOW - (47 * DAY_MS) });
    const g = makeGroup({ tabs: [tab] });
    const result = computeForgottenTabs([g], NOW);
    expect(result[0].daysAgo).toBe(47);
  });

  it('includes groupName on each forgotten tab', () => {
    const tab = makeTab({ createdAt: NOW - (35 * DAY_MS) });
    const g = makeGroup({ name: 'Old Session', tabs: [tab] });
    const result = computeForgottenTabs([g], NOW);
    expect(result[0].groupName).toBe('Old Session');
  });

  it('only includes tabs beyond threshold — mixed group', () => {
    const old = makeTab({ id: 'old', createdAt: NOW - (40 * DAY_MS) });
    const fresh = makeTab({ id: 'fresh', createdAt: NOW - (10 * DAY_MS) });
    const g = makeGroup({ tabs: [old, fresh] });

    const result = computeForgottenTabs([g], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].tab.id).toBe('old');
  });

  it('uses FORGOTTEN_TAB_THRESHOLD_DAYS constant — not hardcoded', () => {
    // Tab right at the boundary: threshold + 1ms over
    const tab = makeTab({ createdAt: NOW - THRESHOLD_MS - 1 });
    const g = makeGroup({ tabs: [tab] });
    expect(computeForgottenTabs([g], NOW)).toHaveLength(1);

    // Tab right at boundary: exactly at threshold (not over)
    const tabAtBoundary = makeTab({ id: 'boundary', createdAt: NOW - THRESHOLD_MS });
    const g2 = makeGroup({ id: 'g2', tabs: [tabAtBoundary] });
    expect(computeForgottenTabs([g2], NOW)).toHaveLength(0);
  });
});
