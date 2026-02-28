import { getOrCreateDeviceId } from '../lib/device';
import { StorageService } from '../lib/storage';
import { TabService, runCategorizationJob } from '../lib/tabs';
import { getSession } from '../lib/auth';
import { dlog } from '../lib/debug-log';
import {
  ALARM_AUTO_SAVE,
  ALARM_SYNC_RETRY,
  AUTO_SAVE_INTERVAL_MINUTES,
  SYNC_RETRY_INTERVAL_MINUTES,
  STORAGE_KEY_LAST_AUTO_SAVE_HASH,
  STORAGE_KEY_SETTINGS,
} from '../lib/constants';

export default defineBackground(() => {
  // --- Alarm setup on install ---
  chrome.runtime.onInstalled.addListener(async () => {
    await getOrCreateDeviceId();
    await createAlarms();
  });

  // --- Categorization job handler (delegated from popup/tabs page) ---
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      message.type === 'tabvault:run-categorization' &&
      message.groupId
    ) {
      // Run in background — survives popup closing
      (async () => {
        try {
          const session = await getSession().catch(() => null);
          if (!session?.user?.id) {
            await dlog.warn('Categorization skipped: no session');
            return;
          }
          await dlog.info('Background: starting categorization for group', message.groupId);
          await runCategorizationJob(message.groupId, session.user.id);
        } catch (e) {
          await dlog.error('Background: categorization crashed', e);
        }
      })();
      // Return true to keep the message channel open (async response)
      sendResponse({ ok: true });
    }
    return undefined;
  });

  // --- Re-create alarms on browser startup (belt-and-suspenders) ---
  chrome.runtime.onStartup.addListener(async () => {
    await ensureAlarm(ALARM_AUTO_SAVE, AUTO_SAVE_INTERVAL_MINUTES);
    await ensureAlarm(ALARM_SYNC_RETRY, SYNC_RETRY_INTERVAL_MINUTES);
  });

  // --- Re-create auto-save alarm when settings change ---
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes[STORAGE_KEY_SETTINGS]) {
      const newSettings = changes[STORAGE_KEY_SETTINGS].newValue;
      if (newSettings?.autoSaveIntervalMinutes) {
        await chrome.alarms.create(ALARM_AUTO_SAVE, {
          periodInMinutes: newSettings.autoSaveIntervalMinutes,
        });
      }
    }
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
  await tabService.saveCurrentTabs({ isAutoSave: true, groupNameFormat: settings.groupNameFormat });

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
      await chrome.action.setTitle({ title: 'TabVault — Sync failed. Click to retry.' });
      break;
    case 'pending':
      await chrome.action.setBadgeText({ text: '...' });
      await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
      await chrome.action.setTitle({ title: 'TabVault — Syncing your tabs to the cloud...' });
      break;
    default:
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'TabVault' });
  }
}
