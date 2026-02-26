import type { SavedTab, TabGroup, SaveResult } from './types';
import type { StorageService } from './storage';
import { getSession, getProfile } from './auth';
import { getSupabase } from './supabase';
import { SyncEngine } from './sync';
import { SyncQueue } from './sync-queue';
import { CLOUD_FREE_TAB_LIMIT, SubscriptionTier } from './constants';

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
  closeAfterSave?: boolean;
  groupNameFormat?: 'session-datetime' | 'datetime-only';
}

export class TabService {
  constructor(
    private storage: StorageService,
    private deviceId: string,
  ) {}

  async saveCurrentTabs(options: SaveOptions = {}): Promise<SaveResult> {
    const { isAutoSave = false, closeAfterSave = true, groupNameFormat = 'session-datetime' } = options;
    const chromeTabs = await chrome.tabs.query({ currentWindow: true });

    const saveable = chromeTabs.filter((tab) => isValidTabUrl(tab.url));

    // Check limit BEFORE saving anywhere (manual saves only).
    // Auto-saves are a local safety net and always proceed.
    if (!isAutoSave) {
      try {
        const session = await getSession();
        if (session) {
          const profile = await getProfile();
          if (profile?.tier === SubscriptionTier.CLOUD_FREE) {
            const remaining = CLOUD_FREE_TAB_LIMIT - profile.tabCount;
            if (saveable.length > remaining) {
              return {
                success: false,
                limitExceeded: { trying: saveable.length, remaining: Math.max(0, remaining) },
              };
            }
          }
        }
      } catch {
        // No Supabase config or not authenticated — no limit applies
      }
    }

    const now = Date.now();
    const timestamp = formatTimestamp(new Date(now));
    const prefix = isAutoSave ? 'Auto-save' : 'Session';

    const tabs: SavedTab[] = saveable.map((tab, index) => ({
      id: crypto.randomUUID(),
      url: tab.url!,
      title: tab.title || tab.url!,
      faviconUrl: tab.favIconUrl || null,
      position: index,
      createdAt: now,
    }));

    const name = groupNameFormat === 'datetime-only' ? timestamp : `${prefix} - ${timestamp}`;

    const group: TabGroup = {
      id: crypto.randomUUID(),
      name,
      tabs,
      isAutoSave,
      deviceId: this.deviceId,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.saveTabGroup(group);

    // Push to cloud if authenticated
    try {
      const session = await getSession();
      if (session) {
        const engine = new SyncEngine(this.storage, new SyncQueue());
        await engine.pushGroup(group).catch(() => {});
      }
    } catch {
      // No Supabase config or not authenticated — skip cloud sync
    }

    // Close saved tabs (manual saves only, and only when user hasn't disabled it)
    if (!isAutoSave && closeAfterSave && saveable.length > 0) {
      const tabIdsToClose = saveable
        .map((t) => t.id)
        .filter((id): id is number => id !== undefined);

      // Open TabVault full view so the user sees their saved tabs
      await chrome.tabs.create({ url: chrome.runtime.getURL('/tabs.html'), active: true });

      if (tabIdsToClose.length > 0) {
        await chrome.tabs.remove(tabIdsToClose);
      }
    }

    return { success: true, group };
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

    const session = await getSession().catch(() => null);
    if (session) {
      const supabase = getSupabase();
      await supabase.from('tabs').delete().eq('id', tabId);
      await supabase.rpc('recalculate_tab_count', { p_user_id: session.user.id });
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    await this.storage.deleteTabGroup(groupId);

    const session = await getSession().catch(() => null);
    if (session) {
      const supabase = getSupabase();
      // Delete tabs first so the AFTER DELETE trigger can still resolve user_id
      // via tab_groups (CASCADE would delete tabs after the group row is gone)
      await supabase.from('tabs').delete().eq('group_id', groupId);
      await supabase.from('tab_groups').delete().eq('id', groupId);
      await supabase.rpc('recalculate_tab_count', { p_user_id: session.user.id });
    }
  }

  async deleteGroups(groupIds: string[]): Promise<void> {
    await this.storage.deleteTabGroups(groupIds);

    const session = await getSession().catch(() => null);
    if (session) {
      const supabase = getSupabase();
      for (const id of groupIds) {
        // Delete tabs first — same CASCADE timing fix as deleteGroup
        await supabase.from('tabs').delete().eq('group_id', id);
        await supabase.from('tab_groups').delete().eq('id', id);
      }
      await supabase.rpc('recalculate_tab_count', { p_user_id: session.user.id });
    }
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

  async syncAllToCloud(): Promise<void> {
    const session = await getSession();
    if (!session) return;

    const groups = await this.storage.getTabGroups();
    const engine = new SyncEngine(this.storage, new SyncQueue());

    // Register device once before pushing all groups
    await engine.ensureDevice();

    for (const group of groups) {
      await engine.pushGroup(group);
    }
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
      await this.deleteGroup(groupId);
    }
  }
}
