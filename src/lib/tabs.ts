import type { SavedTab, TabGroup } from './types';
import type { StorageService } from './storage';

const FILTERED_PROTOCOLS = ['chrome:', 'edge:', 'brave:', 'opera:', 'about:', 'chrome-extension:'];

function isValidTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !FILTERED_PROTOCOLS.some((protocol) => url.startsWith(protocol));
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface SaveOptions {
  isAutoSave?: boolean;
}

export class TabService {
  constructor(
    private storage: StorageService,
    private deviceId: string,
  ) {}

  async saveCurrentTabs(options: SaveOptions = {}): Promise<TabGroup> {
    const { isAutoSave = false } = options;
    const chromeTabs = await chrome.tabs.query({ currentWindow: true });

    const now = Date.now();
    const timestamp = formatTimestamp(new Date(now));
    const prefix = isAutoSave ? 'Auto-save' : 'Session';

    const tabs: SavedTab[] = chromeTabs
      .filter((tab) => isValidTabUrl(tab.url))
      .map((tab, index) => ({
        id: crypto.randomUUID(),
        url: tab.url!,
        title: tab.title || tab.url!,
        faviconUrl: tab.favIconUrl || null,
        position: index,
        createdAt: now,
      }));

    const group: TabGroup = {
      id: crypto.randomUUID(),
      name: `${prefix} - ${timestamp}`,
      tabs,
      isAutoSave,
      deviceId: this.deviceId,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.saveTabGroup(group);
    return group;
  }

  async renameGroup(groupId: string, newName: string): Promise<void> {
    const groups = await this.storage.getTabGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    group.name = newName;
    group.updatedAt = Date.now();

    if (group.isAutoSave) {
      group.isAutoSave = false;
    }

    await this.storage.saveTabGroup(group);
  }

  async deleteTab(groupId: string, tabId: string): Promise<void> {
    const groups = await this.storage.getTabGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    group.tabs = group.tabs.filter((t) => t.id !== tabId);
    group.updatedAt = Date.now();
    await this.storage.saveTabGroup(group);
  }

  async moveTab(tabId: string, fromGroupId: string, toGroupId: string): Promise<void> {
    const groups = await this.storage.getTabGroups();
    const fromGroup = groups.find((g) => g.id === fromGroupId);
    const toGroup = groups.find((g) => g.id === toGroupId);
    if (!fromGroup || !toGroup) return;

    const tabIndex = fromGroup.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const [tab] = fromGroup.tabs.splice(tabIndex, 1);
    tab.position = toGroup.tabs.length;
    toGroup.tabs.push(tab);

    fromGroup.updatedAt = Date.now();
    toGroup.updatedAt = Date.now();

    await this.storage.saveTabGroup(fromGroup);
    await this.storage.saveTabGroup(toGroup);
  }

  async openTab(url: string): Promise<void> {
    await chrome.tabs.create({ url });
  }

  async openGroup(groupId: string, removeAfterRestore: boolean): Promise<void> {
    const groups = await this.storage.getTabGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    for (const tab of group.tabs) {
      await chrome.tabs.create({ url: tab.url, active: false });
    }

    if (removeAfterRestore) {
      await this.storage.deleteTabGroup(groupId);
    }
  }
}
