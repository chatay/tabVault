import {
  SubscriptionTier,
  CATEGORIZATION_STATUS,
  ABUSE_CHECK_RESULT,
} from './constants';

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  faviconUrl: string | null;
  position: number;
  createdAt: number;
  lastOpenedAt?: number;
}

export interface SubGroup {
  id: string;
  name: string;
  tabs: SavedTab[];
}

export type CategorizationStatus =
  typeof CATEGORIZATION_STATUS[keyof typeof CATEGORIZATION_STATUS];

export type AbuseCheckResult =
  typeof ABUSE_CHECK_RESULT[keyof typeof ABUSE_CHECK_RESULT];

export interface TabGroup {
  id: string;
  name: string;
  tabs: SavedTab[];
  isAutoSave: boolean;
  deviceId: string;
  createdAt: number;
  updatedAt: number;

  // AI categorization fields
  subGroups?: SubGroup[];
  summary?: string;
  tags?: string[];
  categorizationStatus?: CategorizationStatus;
}

export interface UserSettings {
  autoSaveEnabled: boolean;
  restoreBehavior: 'keep' | 'remove';
  hasSeenCloudPrompt: boolean;
  hasDismissedCloudPrompt: boolean;
  closeTabsAfterSaving: boolean;
  autoSaveIntervalMinutes: 5 | 10 | 15;
  groupNameFormat: 'session-datetime' | 'datetime-only';
  darkMode: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoSaveEnabled: false,
  restoreBehavior: 'keep',
  hasSeenCloudPrompt: false,
  hasDismissedCloudPrompt: false,
  closeTabsAfterSaving: true,
  autoSaveIntervalMinutes: 5,
  groupNameFormat: 'session-datetime',
  darkMode: false,
};

export interface UserProfile {
  id: string;
  email: string;
  tier: SubscriptionTier;
  tabCount: number;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: 'tab_group' | 'tab';
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'failed';

export type SaveResult =
  | { success: true; group: TabGroup }
  | { success: false; limitExceeded: { trying: number; remaining: number } };

export interface SmartSearchResult {
  tab: SavedTab;
  groupName: string;
  groupDate: string;
  reason: string;
  score: number;
}
