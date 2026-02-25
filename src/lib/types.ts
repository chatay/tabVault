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
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoSaveEnabled: false,
  restoreBehavior: 'keep',
  hasSeenCloudPrompt: false,
  hasDismissedCloudPrompt: false,
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
