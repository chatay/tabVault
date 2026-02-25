import {
  STORAGE_KEY_TAB_GROUPS,
  STORAGE_KEY_SETTINGS,
} from './constants';
import { DEFAULT_SETTINGS, type TabGroup, type UserSettings } from './types';

export class StorageService {
  async getTabGroups(): Promise<TabGroup[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_TAB_GROUPS);
    return result[STORAGE_KEY_TAB_GROUPS] ?? [];
  }

  async saveTabGroup(group: TabGroup): Promise<void> {
    const groups = await this.getTabGroups();
    const index = groups.findIndex((g) => g.id === group.id);

    if (index >= 0) {
      groups[index] = group;
    } else {
      groups.unshift(group);
    }

    await chrome.storage.local.set({ [STORAGE_KEY_TAB_GROUPS]: groups });
  }

  async deleteTabGroup(groupId: string): Promise<void> {
    const groups = await this.getTabGroups();
    const filtered = groups.filter((g) => g.id !== groupId);
    await chrome.storage.local.set({ [STORAGE_KEY_TAB_GROUPS]: filtered });
  }

  async getSettings(): Promise<UserSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY_SETTINGS] };
  }

  async updateSettings(partial: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: updated });
  }
}

export const storage = new StorageService();
