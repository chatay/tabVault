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
export const STORAGE_KEY_CRYPTO_KEY_PREFIX = 'tabvault_crypto_key_';

// === AI Categorization ===
export const CATEGORIZATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
} as const;

export const CATEGORIZATION_LIMITS = {
  MIN_TABS: 5,
  BATCH_SIZE: 50,
  MAX_TITLE_LENGTH: 80,
  MAX_TOKENS: 4096,
} as const;

// === Abuse Detection ===
export const ABUSE_CHECK_RESULT = {
  NORMAL: 'normal',
  FLAGGED: 'flagged',
  BLOCKED: 'blocked',
} as const;

export const ABUSE_THRESHOLDS = {
  FLAG_AT: 3,
  BLOCK_AT: 5,
  WINDOW_MS: 2 * 60 * 1000,
} as const;

// === Duplicate Detection ===
export const DUPLICATE_DETECTION = {
  /** Minimum number of groups required to run duplicate detection */
  MIN_GROUPS: 2,
} as const;

// === UI ===
export const POPUP_WIDTH_PX = 400;
export const POPUP_MIN_HEIGHT_PX = 300;
export const TAB_LIST_MAX_HEIGHT_PX = 320;
export const TAB_GROUP_INITIAL_VISIBLE = 5;
export const TAB_GROUP_LOAD_MORE_BATCH = 10;
