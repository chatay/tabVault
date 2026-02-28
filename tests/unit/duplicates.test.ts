import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  findDuplicates,
  getDuplicateCountForGroup,
  computeGroupDuplicateDetails,
} from '@/lib/duplicates';
import type { TabGroup } from '@/lib/types';

function makeGroup(
  id: string,
  urls: string[],
): TabGroup {
  return {
    id,
    name: `Group ${id}`,
    tabs: urls.map((url, i) => ({
      id: `${id}-tab-${i}`,
      url,
      title: `Tab ${i}`,
      faviconUrl: null,
      position: i,
      createdAt: Date.now(),
    })),
    isAutoSave: false,
    deviceId: 'test-device',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Test Group 1 — findDuplicates ───

describe('findDuplicates', () => {
  it('no groups → returns empty duplicates array', () => {
    const report = findDuplicates([]);
    expect(report.duplicates).toEqual([]);
    expect(report.totalDuplicateCount).toBe(0);
  });

  it('one group → returns empty duplicates array', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com', 'https://google.com']),
    ]);
    expect(report.duplicates).toEqual([]);
    expect(report.totalDuplicateCount).toBe(0);
  });

  it('two groups, no shared URLs → returns empty duplicates array', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com']),
      makeGroup('g2', ['https://google.com']),
    ]);
    expect(report.duplicates).toEqual([]);
    expect(report.totalDuplicateCount).toBe(0);
  });

  it('two groups, one shared URL → returns 1 duplicate with both groupIds', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com', 'https://docs.com']),
      makeGroup('g2', ['https://github.com', 'https://reddit.com']),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].url).toBe('https://github.com');
    expect(report.duplicates[0].groupIds.sort()).toEqual(['g1', 'g2']);
    expect(report.totalDuplicateCount).toBe(1);
  });

  it('three groups, same URL in all three → returns 1 duplicate with 3 groupIds', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com']),
      makeGroup('g2', ['https://github.com']),
      makeGroup('g3', ['https://github.com']),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0].groupIds.sort()).toEqual(['g1', 'g2', 'g3']);
    expect(report.totalDuplicateCount).toBe(2);
  });

  it('two groups, multiple shared URLs → returns correct count for each', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com', 'https://google.com', 'https://unique.com']),
      makeGroup('g2', ['https://github.com', 'https://google.com', 'https://other.com']),
    ]);
    expect(report.duplicates).toHaveLength(2);
    const urls = report.duplicates.map(d => d.url).sort();
    expect(urls).toEqual(['https://github.com', 'https://google.com']);
    expect(report.totalDuplicateCount).toBe(2);
  });

  it('URL with trailing slash matches URL without trailing slash', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com/']),
      makeGroup('g2', ['https://github.com']),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.totalDuplicateCount).toBe(1);
  });

  it('uppercase URL matches lowercase URL', () => {
    const report = findDuplicates([
      makeGroup('g1', ['HTTPS://GITHUB.COM']),
      makeGroup('g2', ['https://github.com']),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.totalDuplicateCount).toBe(1);
  });

  it('same URL twice in same group → counted as duplicate', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com', 'https://github.com']),
      makeGroup('g2', ['https://google.com']),
    ]);
    expect(report.duplicates).toHaveLength(1);
    expect(report.totalDuplicateCount).toBe(1);
  });

  it('totalDuplicateCount correct — 1 URL in 3 groups = count of 2', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://a.com']),
      makeGroup('g2', ['https://a.com']),
      makeGroup('g3', ['https://a.com']),
    ]);
    expect(report.totalDuplicateCount).toBe(2);
  });
});

// ─── Test Group 2 — getDuplicateCountForGroup ───

describe('getDuplicateCountForGroup', () => {
  it('group with no duplicates → returns 0', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com']),
      makeGroup('g2', ['https://google.com']),
    ]);
    expect(getDuplicateCountForGroup(report, 'g1')).toBe(0);
  });

  it('group with 1 duplicate URL → returns 1', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com', 'https://unique.com']),
      makeGroup('g2', ['https://github.com']),
    ]);
    expect(getDuplicateCountForGroup(report, 'g1')).toBe(1);
  });

  it('group with 3 duplicate URLs → returns 3', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://a.com', 'https://b.com', 'https://c.com']),
      makeGroup('g2', ['https://a.com', 'https://b.com', 'https://c.com']),
    ]);
    expect(getDuplicateCountForGroup(report, 'g1')).toBe(3);
  });

  it('groupId not in report → returns 0', () => {
    const report = findDuplicates([
      makeGroup('g1', ['https://github.com']),
      makeGroup('g2', ['https://github.com']),
    ]);
    expect(getDuplicateCountForGroup(report, 'g999')).toBe(0);
  });
});

// ─── Test Group 3 — computeGroupDuplicateDetails ───

describe('computeGroupDuplicateDetails', () => {
  it('no groups → returns empty map', () => {
    const details = computeGroupDuplicateDetails([]);
    expect(details.size).toBe(0);
  });

  it('one group → returns empty map (MIN_GROUPS not met)', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com', 'https://a.com']),
    ]);
    expect(details.size).toBe(0);
  });

  it('same-group duplicate only → sameGroup=1, crossGroup=0', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com', 'https://a.com', 'https://b.com']),
      makeGroup('g2', ['https://c.com']),
    ]);
    const g1 = details.get('g1')!;
    expect(g1.sameGroup).toBe(1);
    expect(g1.crossGroup).toBe(0);
    expect(g1.total).toBe(1);
  });

  it('cross-group duplicate only → sameGroup=0, crossGroup=1', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com', 'https://b.com']),
      makeGroup('g2', ['https://a.com', 'https://c.com']),
    ]);
    const g1 = details.get('g1')!;
    expect(g1.sameGroup).toBe(0);
    expect(g1.crossGroup).toBe(1);
    expect(g1.total).toBe(1);
  });

  it('both same-group and cross-group → counts both, total is union', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com', 'https://a.com', 'https://b.com']),
      makeGroup('g2', ['https://b.com']),
    ]);
    const g1 = details.get('g1')!;
    expect(g1.sameGroup).toBe(1);  // a.com repeated in g1
    expect(g1.crossGroup).toBe(1); // b.com shared with g2
    expect(g1.total).toBe(2);      // union: a.com + b.com
  });

  it('URL that is both same-group and cross-group → counted in both but total=1', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com', 'https://a.com']),
      makeGroup('g2', ['https://a.com']),
    ]);
    const g1 = details.get('g1')!;
    expect(g1.sameGroup).toBe(1);  // a.com repeated in g1
    expect(g1.crossGroup).toBe(1); // a.com also in g2
    expect(g1.total).toBe(1);      // only 1 unique duplicate URL
  });

  it('group with no duplicates → all zeros', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com']),
      makeGroup('g2', ['https://b.com']),
    ]);
    const g1 = details.get('g1')!;
    expect(g1.sameGroup).toBe(0);
    expect(g1.crossGroup).toBe(0);
    expect(g1.total).toBe(0);
  });

  it('returns details for every group', () => {
    const details = computeGroupDuplicateDetails([
      makeGroup('g1', ['https://a.com']),
      makeGroup('g2', ['https://a.com']),
      makeGroup('g3', ['https://b.com']),
    ]);
    expect(details.size).toBe(3);
    expect(details.get('g1')!.crossGroup).toBe(1);
    expect(details.get('g2')!.crossGroup).toBe(1);
    expect(details.get('g3')!.total).toBe(0);
  });
});

// ─── Test Group 4 — URL normalization ───

describe('URL normalization', () => {
  it('https://github.com/ matches https://github.com', () => {
    expect(normalizeUrl('https://github.com/')).toBe(normalizeUrl('https://github.com'));
  });

  it('HTTPS://GITHUB.COM matches https://github.com', () => {
    expect(normalizeUrl('HTTPS://GITHUB.COM')).toBe(normalizeUrl('https://github.com'));
  });

  it('https://github.com/page does not match https://github.com/other', () => {
    expect(normalizeUrl('https://github.com/page')).not.toBe(
      normalizeUrl('https://github.com/other'),
    );
  });
});
