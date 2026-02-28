import type { TabGroup, SavedTab } from './types';
import { findDuplicates, normalizeUrl } from './duplicates';
import { INSIGHTS } from './constants';

export interface DuplicateOccurrence {
  tab: SavedTab;
  groupId: string;
  groupName: string;
  groupDate: string;
  /** Oldest occurrence — should be kept, not deleted */
  isKeep: boolean;
}

export interface InsightsDuplicateEntry {
  /** Normalized URL shared by all occurrences */
  url: string;
  occurrences: DuplicateOccurrence[];
}

export interface ForgottenTab {
  tab: SavedTab;
  groupId: string;
  groupName: string;
  daysAgo: number;
}

/**
 * Build the list of duplicate URLs with every saved occurrence, oldest marked as keep.
 * Reuses findDuplicates for detection — inherits its MIN_GROUPS constraint.
 */
export function computeInsightsDuplicates(groups: TabGroup[]): InsightsDuplicateEntry[] {
  const { duplicates } = findDuplicates(groups);
  if (duplicates.length === 0) return [];

  return duplicates.map(({ url }) => {
    const occurrences: DuplicateOccurrence[] = [];

    for (const group of groups) {
      const date = new Date(group.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      for (const tab of group.tabs) {
        if (normalizeUrl(tab.url) === url) {
          occurrences.push({
            tab,
            groupId: group.id,
            groupName: group.name,
            groupDate: date,
            isKeep: false,
          });
        }
      }
    }

    // Sort oldest first so occurrences[0] is the one to keep
    occurrences.sort((a, b) => a.tab.createdAt - b.tab.createdAt);
    if (occurrences.length > 0) occurrences[0].isKeep = true;

    return { url, occurrences };
  });
}

/**
 * Find tabs saved more than FORGOTTEN_TAB_THRESHOLD_DAYS ago that have never
 * been opened through TabVault. Sorted oldest-first.
 *
 * @param now - injectable for testing; defaults to Date.now()
 */
export function computeForgottenTabs(
  groups: TabGroup[],
  now: number = Date.now(),
): ForgottenTab[] {
  const thresholdMs =
    INSIGHTS.FORGOTTEN_TAB_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  const result: ForgottenTab[] = [];

  for (const group of groups) {
    const groupName = group.name;
    for (const tab of group.tabs) {
      const age = now - tab.createdAt;
      if (age > thresholdMs && !tab.lastOpenedAt) {
        result.push({
          tab,
          groupId: group.id,
          groupName,
          daysAgo: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  // Most neglected tabs (oldest) first
  result.sort((a, b) => a.tab.createdAt - b.tab.createdAt);
  return result;
}
