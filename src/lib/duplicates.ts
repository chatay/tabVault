import type { TabGroup } from './types';
import { DUPLICATE_DETECTION } from './constants';

export interface DuplicateEntry {
  /** Normalized URL (lowercase, no trailing slash) */
  url: string;
  /** IDs of groups that contain this URL */
  groupIds: string[];
}

export interface DuplicateReport {
  /** Each URL that appears 2+ times (across groups or within the same group) */
  duplicates: DuplicateEntry[];
  /** Total number of extra occurrences across all groups (entry with 3 groups = 2 extras) */
  totalDuplicateCount: number;
}

/**
 * Normalize a URL for comparison: lowercase + strip trailing slash.
 */
export function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * Pure function — finds URLs that appear more than once, either across
 * different groups or multiple times within the same group.
 */
export function findDuplicates(groups: TabGroup[]): DuplicateReport {
  const empty: DuplicateReport = { duplicates: [], totalDuplicateCount: 0 };

  if (groups.length < DUPLICATE_DETECTION.MIN_GROUPS) {
    return empty;
  }

  // Map: normalizedUrl → Set of groupIds that contain it
  const urlToGroups = new Map<string, Set<string>>();
  // Map: normalizedUrl → total number of occurrences across all tabs
  const urlToCount = new Map<string, number>();

  for (const group of groups) {
    for (const tab of group.tabs) {
      const normalized = normalizeUrl(tab.url);

      let groupSet = urlToGroups.get(normalized);
      if (!groupSet) {
        groupSet = new Set();
        urlToGroups.set(normalized, groupSet);
      }
      groupSet.add(group.id);

      urlToCount.set(normalized, (urlToCount.get(normalized) ?? 0) + 1);
    }
  }

  const duplicates: DuplicateEntry[] = [];
  let totalDuplicateCount = 0;

  for (const [url, count] of urlToCount) {
    // Duplicate if: appears in 2+ groups OR appears 2+ times total (same-group dupes)
    if (count >= 2) {
      const groupIds = [...urlToGroups.get(url)!];
      duplicates.push({ url, groupIds });
      totalDuplicateCount += count - 1;
    }
  }

  return { duplicates, totalDuplicateCount };
}

/**
 * How many duplicate URLs does a specific group contain?
 */
export function getDuplicateCountForGroup(
  report: DuplicateReport,
  groupId: string,
): number {
  let count = 0;
  for (const entry of report.duplicates) {
    if (entry.groupIds.includes(groupId)) {
      count++;
    }
  }
  return count;
}

export interface GroupDuplicateDetails {
  /** URLs that appear more than once within this group */
  sameGroup: number;
  /** URLs in this group that also appear in at least one other group */
  crossGroup: number;
  /** Total unique duplicate URLs (union of sameGroup and crossGroup) */
  total: number;
}

/**
 * Compute duplicate breakdown for every group in a single pass.
 * Distinguishes same-group duplicates from cross-group duplicates.
 */
export function computeGroupDuplicateDetails(
  groups: TabGroup[],
): Map<string, GroupDuplicateDetails> {
  const result = new Map<string, GroupDuplicateDetails>();

  if (groups.length < DUPLICATE_DETECTION.MIN_GROUPS) {
    return result;
  }

  // Per-group: normalized URL → occurrence count
  const groupUrlCounts = new Map<string, Map<string, number>>();
  // Global: normalized URL → set of group IDs that contain it
  const urlToGroupIds = new Map<string, Set<string>>();

  for (const group of groups) {
    const urlCount = new Map<string, number>();
    for (const tab of group.tabs) {
      const norm = normalizeUrl(tab.url);
      urlCount.set(norm, (urlCount.get(norm) ?? 0) + 1);

      let gs = urlToGroupIds.get(norm);
      if (!gs) {
        gs = new Set();
        urlToGroupIds.set(norm, gs);
      }
      gs.add(group.id);
    }
    groupUrlCounts.set(group.id, urlCount);
  }

  for (const group of groups) {
    const urlCount = groupUrlCounts.get(group.id)!;
    let sameGroup = 0;
    let crossGroup = 0;
    let total = 0;

    for (const [url, count] of urlCount) {
      const isSameGroupDupe = count > 1;
      const isCrossGroupDupe = urlToGroupIds.get(url)!.size > 1;

      if (isSameGroupDupe) sameGroup++;
      if (isCrossGroupDupe) crossGroup++;
      if (isSameGroupDupe || isCrossGroupDupe) total++;
    }

    result.set(group.id, { sameGroup, crossGroup, total });
  }

  return result;
}
