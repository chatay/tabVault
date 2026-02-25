import { describe, it, expect } from 'vitest';
import {
  CLOUD_FREE_TAB_LIMIT,
  SubscriptionTier,
  TIER_LIMITS,
  AUTO_SAVE_INTERVAL_MINUTES,
  AUTO_SAVE_VISIBLE_COUNT,
  SYNC_RETRY_THRESHOLD,
  SYNC_RETRY_INTERVAL_MINUTES,
  SYNC_WARNING_TIMEOUT_MS,
  SYNC_EMAIL_ALERT_TIMEOUT_MS,
  SYNC_MAX_RETRIES,
  ALARM_AUTO_SAVE,
  ALARM_SYNC_RETRY,
  STORAGE_KEY_TAB_GROUPS,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_DEVICE_ID,
  STORAGE_KEY_SYNC_QUEUE,
  STORAGE_KEY_LAST_AUTO_SAVE_HASH,
  STORAGE_KEY_SYNC_FAIL_COUNT,
  STORAGE_KEY_FIRST_SYNC_FAIL_AT,
  POPUP_WIDTH_PX,
  POPUP_MIN_HEIGHT_PX,
} from '@/lib/constants';

describe('constants', () => {
  describe('Subscription constants', () => {
    it('should define CLOUD_FREE_TAB_LIMIT as 75', () => {
      expect(CLOUD_FREE_TAB_LIMIT).toBe(75);
    });

    it('should define SubscriptionTier enum with correct values', () => {
      expect(SubscriptionTier.LOCAL_ONLY).toBe('local_only');
      expect(SubscriptionTier.CLOUD_FREE).toBe('cloud_free');
      expect(SubscriptionTier.CLOUD_PAID).toBe('cloud_paid');
    });

    it('should define TIER_LIMITS for all tiers', () => {
      expect(TIER_LIMITS[SubscriptionTier.LOCAL_ONLY]).toBe(Infinity);
      expect(TIER_LIMITS[SubscriptionTier.CLOUD_FREE]).toBe(CLOUD_FREE_TAB_LIMIT);
      expect(TIER_LIMITS[SubscriptionTier.CLOUD_PAID]).toBe(Infinity);
    });

    it('should have TIER_LIMITS entries for exactly 3 tiers', () => {
      expect(Object.keys(TIER_LIMITS)).toHaveLength(3);
    });
  });

  describe('Auto-save constants', () => {
    it('should define AUTO_SAVE_INTERVAL_MINUTES as 5', () => {
      expect(AUTO_SAVE_INTERVAL_MINUTES).toBe(5);
    });

    it('should define AUTO_SAVE_VISIBLE_COUNT as 3', () => {
      expect(AUTO_SAVE_VISIBLE_COUNT).toBe(3);
    });
  });

  describe('Sync constants', () => {
    it('should define SYNC_RETRY_THRESHOLD as 3', () => {
      expect(SYNC_RETRY_THRESHOLD).toBe(3);
    });

    it('should define SYNC_RETRY_INTERVAL_MINUTES as 2', () => {
      expect(SYNC_RETRY_INTERVAL_MINUTES).toBe(2);
    });

    it('should define SYNC_WARNING_TIMEOUT_MS as 30 minutes', () => {
      expect(SYNC_WARNING_TIMEOUT_MS).toBe(30 * 60 * 1000);
    });

    it('should define SYNC_EMAIL_ALERT_TIMEOUT_MS as 24 hours', () => {
      expect(SYNC_EMAIL_ALERT_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('should define SYNC_MAX_RETRIES as 5', () => {
      expect(SYNC_MAX_RETRIES).toBe(5);
    });
  });

  describe('Alarm constants', () => {
    it('should define ALARM_AUTO_SAVE', () => {
      expect(ALARM_AUTO_SAVE).toBe('tabvault-auto-save');
    });

    it('should define ALARM_SYNC_RETRY', () => {
      expect(ALARM_SYNC_RETRY).toBe('tabvault-sync-retry');
    });
  });

  describe('Storage key constants', () => {
    it('should define all storage keys with tabvault_ prefix', () => {
      const keys = [
        STORAGE_KEY_TAB_GROUPS,
        STORAGE_KEY_SETTINGS,
        STORAGE_KEY_DEVICE_ID,
        STORAGE_KEY_SYNC_QUEUE,
        STORAGE_KEY_LAST_AUTO_SAVE_HASH,
        STORAGE_KEY_SYNC_FAIL_COUNT,
        STORAGE_KEY_FIRST_SYNC_FAIL_AT,
      ];
      for (const key of keys) {
        expect(key).toMatch(/^tabvault_/);
      }
    });

    it('should have unique storage key values', () => {
      const keys = [
        STORAGE_KEY_TAB_GROUPS,
        STORAGE_KEY_SETTINGS,
        STORAGE_KEY_DEVICE_ID,
        STORAGE_KEY_SYNC_QUEUE,
        STORAGE_KEY_LAST_AUTO_SAVE_HASH,
        STORAGE_KEY_SYNC_FAIL_COUNT,
        STORAGE_KEY_FIRST_SYNC_FAIL_AT,
      ];
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should define specific storage key values', () => {
      expect(STORAGE_KEY_TAB_GROUPS).toBe('tabvault_tab_groups');
      expect(STORAGE_KEY_SETTINGS).toBe('tabvault_settings');
      expect(STORAGE_KEY_DEVICE_ID).toBe('tabvault_device_id');
      expect(STORAGE_KEY_SYNC_QUEUE).toBe('tabvault_sync_queue');
      expect(STORAGE_KEY_LAST_AUTO_SAVE_HASH).toBe('tabvault_last_auto_save_hash');
      expect(STORAGE_KEY_SYNC_FAIL_COUNT).toBe('tabvault_sync_fail_count');
      expect(STORAGE_KEY_FIRST_SYNC_FAIL_AT).toBe('tabvault_first_sync_fail_at');
    });
  });

  describe('UI constants', () => {
    it('should define POPUP_WIDTH_PX as 400', () => {
      expect(POPUP_WIDTH_PX).toBe(400);
    });

    it('should define POPUP_MIN_HEIGHT_PX as 300', () => {
      expect(POPUP_MIN_HEIGHT_PX).toBe(300);
    });
  });
});
