// === Subscription ===
export const CLOUD_FREE_TAB_LIMIT = 75;

export enum SubscriptionTier {
  LOCAL_ONLY = 'local_only',
  CLOUD_FREE = 'cloud_free',
  CLOUD_PAID = 'cloud_paid',
}

export const TIER_LIMITS: Record<SubscriptionTier, number> = {
  [SubscriptionTier.LOCAL_ONLY]: Infinity,
  [SubscriptionTier.CLOUD_FREE]: CLOUD_FREE_TAB_LIMIT,
  [SubscriptionTier.CLOUD_PAID]: Infinity,
};

// === Auto-save ===
export const AUTO_SAVE_INTERVAL_MINUTES = 5;
export const AUTO_SAVE_VISIBLE_COUNT = 3;

// === Sync ===
export const SYNC_RETRY_THRESHOLD = 3;
export const SYNC_RETRY_INTERVAL_MINUTES = 2;
export const SYNC_WARNING_TIMEOUT_MS = 30 * 60 * 1000;
export const SYNC_EMAIL_ALERT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const SYNC_MAX_RETRIES = 5;

// === Alarms ===
export const ALARM_AUTO_SAVE = 'tabvault-auto-save';
export const ALARM_SYNC_RETRY = 'tabvault-sync-retry';

// === Storage Keys ===
export const STORAGE_KEY_TAB_GROUPS = 'tabvault_tab_groups';
export const STORAGE_KEY_SETTINGS = 'tabvault_settings';
export const STORAGE_KEY_DEVICE_ID = 'tabvault_device_id';
export const STORAGE_KEY_SYNC_QUEUE = 'tabvault_sync_queue';
export const STORAGE_KEY_LAST_AUTO_SAVE_HASH = 'tabvault_last_auto_save_hash';
export const STORAGE_KEY_SYNC_FAIL_COUNT = 'tabvault_sync_fail_count';
export const STORAGE_KEY_FIRST_SYNC_FAIL_AT = 'tabvault_first_sync_fail_at';

// === UI ===
export const POPUP_WIDTH_PX = 400;
export const POPUP_MIN_HEIGHT_PX = 300;
