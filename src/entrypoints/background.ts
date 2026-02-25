import { getOrCreateDeviceId } from '../lib/device';
import { StorageService } from '../lib/storage';
import { TabService } from '../lib/tabs';
import {
  ALARM_AUTO_SAVE,
  ALARM_SYNC_RETRY,
  AUTO_SAVE_INTERVAL_MINUTES,
  SYNC_RETRY_INTERVAL_MINUTES,
  STORAGE_KEY_LAST_AUTO_SAVE_HASH,
} from '../lib/constants';

export default defineBackground(() => {
  // --- Alarm setup on install ---
  chrome.runtime.onInstalled.addListener(async () => {
    await getOrCreateDeviceId();
    await createAlarms();
  });

  // --- Re-create alarms on browser startup (belt-and-suspenders) ---
  chrome.runtime.onStartup.addListener(async () => {
    await ensureAlarm(ALARM_AUTO_SAVE, AUTO_SAVE_INTERVAL_MINUTES);
    await ensureAlarm(ALARM_SYNC_RETRY, SYNC_RETRY_INTERVAL_MINUTES);
  });

  // --- Alarm handlers (top level!) ---
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_AUTO_SAVE) {
      await handleAutoSave();
    }
    if (alarm.name === ALARM_SYNC_RETRY) {
      // Sync retry will be handled in Phase 3 (Task 13)
    }
  });
});

export async function createAlarms(): Promise<void> {
  await chrome.alarms.create(ALARM_AUTO_SAVE, {
    periodInMinutes: AUTO_SAVE_INTERVAL_MINUTES,
  });
  await chrome.alarms.create(ALARM_SYNC_RETRY, {
    periodInMinutes: SYNC_RETRY_INTERVAL_MINUTES,
  });
}

export async function ensureAlarm(name: string, periodInMinutes: number): Promise<void> {
  const existing = await chrome.alarms.get(name);
  if (!existing) {
    await chrome.alarms.create(name, { periodInMinutes });
  }
}

export async function handleAutoSave(): Promise<void> {
  const storageService = new StorageService();
  const settings = await storageService.getSettings();

  if (!settings.autoSaveEnabled) return;

  const chromeTabs = await chrome.tabs.query({});
  const currentHash = chromeTabs
    .map((t) => t.url)
    .filter(Boolean)
    .sort()
    .join('|');

  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_AUTO_SAVE_HASH);
  const lastHash = result[STORAGE_KEY_LAST_AUTO_SAVE_HASH];

  if (currentHash === lastHash) return;

  const deviceId = await getOrCreateDeviceId();
  const tabService = new TabService(storageService, deviceId);
  await tabService.saveCurrentTabs({ isAutoSave: true });

  await chrome.storage.local.set({ [STORAGE_KEY_LAST_AUTO_SAVE_HASH]: currentHash });
}
