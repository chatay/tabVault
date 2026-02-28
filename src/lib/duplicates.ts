import type { TabGroup } from './types';
import { DUPLICATE_DETECTION } from './constants';

export interface DuplicateEntry {
  /** Normalized URL (lowercase, no trailing slash) */
  url: string;
  /** IDs of groups that contain this URL */
  groupIds: string[];
}

export interface DuplicateReport {
  /** Each URL that appears in 2+ groups */
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
 * Pure function — finds URLs that appear in 2+ different groups.
 * Same URL appearing multiple times within the SAME group is NOT a cross-group duplicate.
 */
export function findDuplicates(groups: TabGroup[]): DuplicateReport {
  const empty: DuplicateReport = { duplicates: [], totalDuplicateCount: 0 };

  if (groups.length < DUPLICATE_DETECTION.MIN_GROUPS) {
    return empty;
  }

  // Map: normalizedUrl → Set of groupIds that contain it
  const urlToGroups = new Map<string, Set<string>>();

  for (const group of groups) {
    // Collect unique normalized URLs within this group
    const seenInGroup = new Set<string>();

    for (const tab of group.tabs) {
      const normalized = normalizeUrl(tab.url);
      if (seenInGroup.has(normalized)) continue;
      seenInGroup.add(normalized);

      let groupSet = urlToGroups.get(normalized);
      if (!groupSet) {
        groupSet = new Set();
        urlToGroups.set(normalized, groupSet);
      }
      groupSet.add(group.id);
    }
  }

  const duplicates: DuplicateEntry[] = [];
  let totalDuplicateCount = 0;

  for (const [url, groupSet] of urlToGroups) {
    if (groupSet.size >= DUPLICATE_DETECTION.MIN_GROUPS) {
      const groupIds = [...groupSet];
      duplicates.push({ url, groupIds });
      // 1 URL in 3 groups = 2 extras (the first is the "original")
      totalDuplicateCount += groupIds.length - 1;
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
