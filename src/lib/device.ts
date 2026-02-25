import { STORAGE_KEY_DEVICE_ID } from './constants';

export async function getOrCreateDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEY_DEVICE_ID);

  if (result[STORAGE_KEY_DEVICE_ID]) {
    return result[STORAGE_KEY_DEVICE_ID];
  }

  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEY_DEVICE_ID]: deviceId });
  return deviceId;
}

export async function getDeviceName(): Promise<string> {
  const platformInfo = await chrome.runtime.getPlatformInfo();

  const osNames: Record<string, string> = {
    win: 'Windows',
    mac: 'Mac',
    linux: 'Linux',
    cros: 'ChromeOS',
    android: 'Android',
  };

  return `Chrome on ${osNames[platformInfo.os] || platformInfo.os}`;
}
