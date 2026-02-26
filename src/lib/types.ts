import { SubscriptionTier } from './constants';

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  faviconUrl: string | null;
  position: number;
  createdAt: number;
}

export interface TabGroup {
  id: string;
  name: string;
  tabs: SavedTab[];
  isAutoSave: boolean;
  deviceId: string;
  createdAt: number;
  updatedAt: number;
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
