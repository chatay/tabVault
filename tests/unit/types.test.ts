import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/types';
import type { SavedTab, TabGroup, UserSettings, UserProfile, SyncQueueItem, SyncStatus } from '@/lib/types';
import { SubscriptionTier } from '@/lib/constants';

describe('types', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('should have autoSaveEnabled as false', () => {
      expect(DEFAULT_SETTINGS.autoSaveEnabled).toBe(false);
    });

    it('should have restoreBehavior as "keep"', () => {
      expect(DEFAULT_SETTINGS.restoreBehavior).toBe('keep');
    });

    it('should have hasSeenCloudPrompt as false', () => {
      expect(DEFAULT_SETTINGS.hasSeenCloudPrompt).toBe(false);
    });

    it('should have hasDismissedCloudPrompt as false', () => {
      expect(DEFAULT_SETTINGS.hasDismissedCloudPrompt).toBe(false);
    });

    it('should have exactly 4 keys', () => {
      expect(Object.keys(DEFAULT_SETTINGS)).toHaveLength(4);
    });
  });

  describe('SavedTab type', () => {
    it('should accept a valid SavedTab object', () => {
      const tab: SavedTab = {
        id: 'tab-1',
        url: 'https://example.com',
        title: 'Example',
        faviconUrl: 'https://example.com/favicon.ico',
        position: 0,
        createdAt: Date.now(),
      };
      expect(tab.id).toBe('tab-1');
      expect(tab.faviconUrl).toBe('https://example.com/favicon.ico');
    });

    it('should allow null faviconUrl', () => {
      const tab: SavedTab = {
        id: 'tab-2',
        url: 'https://example.com',
        title: 'Example',
        faviconUrl: null,
        position: 1,
        createdAt: Date.now(),
      };
      expect(tab.faviconUrl).toBeNull();
    });
  });

  describe('TabGroup type', () => {
    it('should accept a valid TabGroup object', () => {
      const group: TabGroup = {
        id: 'group-1',
        name: 'Work Tabs',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device-abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(group.name).toBe('Work Tabs');
      expect(group.tabs).toHaveLength(0);
    });
  });

  describe('UserSettings type', () => {
    it('should accept valid UserSettings', () => {
      const settings: UserSettings = {
        autoSaveEnabled: true,
        restoreBehavior: 'remove',
        hasSeenCloudPrompt: true,
        hasDismissedCloudPrompt: false,
      };
      expect(settings.restoreBehavior).toBe('remove');
    });
  });

  describe('UserProfile type', () => {
    it('should accept a valid UserProfile object', () => {
      const profile: UserProfile = {
        id: 'user-1',
        email: 'test@example.com',
        tier: SubscriptionTier.CLOUD_FREE,
        tabCount: 42,
      };
      expect(profile.tier).toBe('cloud_free');
      expect(profile.tabCount).toBe(42);
    });
  });

  describe('SyncQueueItem type', () => {
    it('should accept a valid SyncQueueItem', () => {
      const item: SyncQueueItem = {
        id: 'sync-1',
        operation: 'create',
        entityType: 'tab_group',
        entityId: 'group-1',
        payload: { name: 'Work Tabs' },
        createdAt: Date.now(),
        retries: 0,
      };
      expect(item.operation).toBe('create');
      expect(item.entityType).toBe('tab_group');
    });
  });

  describe('SyncStatus type', () => {
    it('should accept valid SyncStatus values', () => {
      const statuses: SyncStatus[] = ['synced', 'syncing', 'pending', 'failed'];
      expect(statuses).toHaveLength(4);
      expect(statuses).toContain('synced');
      expect(statuses).toContain('syncing');
      expect(statuses).toContain('pending');
      expect(statuses).toContain('failed');
    });
  });
});
