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
      // Update badge after auto-save in case sync is needed
      const { SyncEngine } = await import('../lib/sync');
      const { SyncQueue } = await import('../lib/sync-queue');
      const engine = new SyncEngine(new StorageService(), new SyncQueue());
      await updateBadge(engine);
    }
    if (alarm.name === ALARM_SYNC_RETRY) {
      const { SyncEngine } = await import('../lib/sync');
      const { SyncQueue } = await import('../lib/sync-queue');
      const engine = new SyncEngine(new StorageService(), new SyncQueue());
      await engine.flushQueue();
      await updateBadge(engine);
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

  const chromeTabs = await chrome.tabs.query({ currentWindow: true });
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

export async function updateBadge(engine?: { getSyncStatus(): Promise<import('../lib/types').SyncStatus> }): Promise<void> {
  if (!engine) {
    const { SyncEngine } = await import('../lib/sync');
    const { SyncQueue } = await import('../lib/sync-queue');
    engine = new SyncEngine(new StorageService(), new SyncQueue());
  }
  const status = await engine.getSyncStatus();

  switch (status) {
    case 'failed':
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      break;
    case 'pending':
      await chrome.action.setBadgeText({ text: '...' });
      await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
      break;
    default:
      await chrome.action.setBadgeText({ text: '' });
  }
}
