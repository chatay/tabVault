import { getSupabase } from './supabase';
import { getSession } from './auth';
import { StorageService } from './storage';
import { SyncQueue } from './sync-queue';
import { getOrCreateDeviceId } from './device';
import { getOrDeriveKey, encrypt, decrypt, encryptNullable, decryptNullable } from './crypto';
import type { TabGroup, SavedTab, SyncStatus } from './types';
import {
  STORAGE_KEY_SYNC_FAIL_COUNT,
  STORAGE_KEY_FIRST_SYNC_FAIL_AT,
  SYNC_RETRY_THRESHOLD,
  CATEGORIZATION_STATUS,
} from './constants';

// --- Supabase response types ---

interface SupabaseRemoteTab {
  id: string;
  url: string;
  title: string;
  favicon_url: string | null;
  position: number;
  created_at: string;
}

interface SupabaseRemoteGroup {
  id: string;
  name: string;
  is_auto_save: boolean;
  device_id: string;
  created_at: string;
  updated_at: string;
  tabs: SupabaseRemoteTab[];
  sub_groups: string | null;
  summary: string | null;
  tags: string | null;
}

// --- Shared upsert payload builders ---

async function buildGroupRow(
  group: TabGroup,
  userId: string,
  deviceId: string,
  key: CryptoKey,
) {
  return {
    id: group.id,
    user_id: userId,
    device_id: deviceId,
    name: await encrypt(group.name, key),
    is_auto_save: group.isAutoSave,
    created_at: new Date(group.createdAt).toISOString(),
    updated_at: new Date(group.updatedAt).toISOString(),
    sub_groups: group.subGroups && group.subGroups.length > 0
      ? await encrypt(JSON.stringify(group.subGroups), key)
      : null,
    summary: group.summary
      ? await encrypt(group.summary, key)
      : null,
    tags: group.tags && group.tags.length > 0
      ? await encrypt(JSON.stringify(group.tags), key)
      : null,
  };
}

async function buildTabRow(
  tab: SavedTab,
  groupId: string,
  key: CryptoKey,
) {
  return {
    id: tab.id,
    group_id: groupId,
    url: await encrypt(tab.url, key),
    title: await encrypt(tab.title, key),
    favicon_url: await encryptNullable(tab.faviconUrl, key),
    position: tab.position,
    created_at: new Date(tab.createdAt).toISOString(),
  };
}

export class TabLimitExceededError extends Error {
  constructor() {
    super('tab_limit_exceeded');
    this.name = 'TabLimitExceededError';
  }
}

export class SyncEngine {
  constructor(
    private storage: StorageService,
    private queue: SyncQueue,
  ) {}

  async ensureDevice(): Promise<void> {
    const session = await getSession();
    if (!session) return;

    const supabase = getSupabase();
    const deviceId = await getOrCreateDeviceId();

    await supabase.from('devices').upsert({
      id: deviceId,
      user_id: session.user.id,
      device_name: navigator.userAgent.slice(0, 100),
      last_seen_at: new Date().toISOString(),
    });
  }

  async pushGroup(group: TabGroup): Promise<void> {
    const session = await getSession();
    if (!session) return;

    const supabase = getSupabase();
    const deviceId = await getOrCreateDeviceId();
    const key = await getOrDeriveKey(session.user.id);

    // Ensure device is registered (FK constraint)
    await this.ensureDevice();

    // Upsert the group
    const { error: groupError } = await supabase
      .from('tab_groups')
      .upsert(await buildGroupRow(group, session.user.id, deviceId, key));

    if (groupError) {
      // Queue for retry — payload stays plaintext
      await this.queue.enqueue({
        operation: 'create',
        entityType: 'tab_group',
        entityId: group.id,
        payload: group as unknown as Record<string, unknown>,
      });
      await this.recordSyncFailure();
      return;
    }

    // Upsert each tab
    for (const tab of group.tabs) {
      const { error: tabError } = await supabase
        .from('tabs')
        .upsert(await buildTabRow(tab, group.id, key));

      if (tabError) {
        // Database trigger rejects inserts when tier limit is reached
        if (tabError.message?.includes('tab_limit_exceeded')) {
          throw new TabLimitExceededError();
        }
        await this.queue.enqueue({
          operation: 'create',
          entityType: 'tab',
          entityId: tab.id,
          payload: { ...tab, groupId: group.id } as unknown as Record<string, unknown>,
        });
      }
    }

    await this.resetSyncFailure();
  }

  async pullAllGroups(): Promise<TabGroup[]> {
    const session = await getSession();
    if (!session) return [];

    const supabase = getSupabase();
    const key = await getOrDeriveKey(session.user.id);

    const { data: remoteGroups, error } = await supabase
      .from('tab_groups')
      .select('*, tabs(*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error || !remoteGroups) return [];

    return Promise.all(
      (remoteGroups as SupabaseRemoteGroup[]).map(async (rg) => {
        // Decrypt AI fields safely — never crash sync on bad data
        let subGroups: TabGroup['subGroups'];
        let summary: TabGroup['summary'];
        let tags: TabGroup['tags'];

        try {
          subGroups = rg.sub_groups
            ? JSON.parse(await decrypt(rg.sub_groups, key))
            : undefined;
        } catch {
          subGroups = undefined;
        }

        try {
          summary = rg.summary
            ? await decrypt(rg.summary, key)
            : undefined;
        } catch {
          summary = undefined;
        }

        try {
          tags = rg.tags
            ? JSON.parse(await decrypt(rg.tags, key))
            : undefined;
        } catch {
          tags = undefined;
        }

        return {
          id: rg.id,
          name: await decrypt(rg.name, key),
          isAutoSave: rg.is_auto_save,
          deviceId: rg.device_id,
          createdAt: new Date(rg.created_at).getTime(),
          updatedAt: new Date(rg.updated_at).getTime(),
          tabs: await Promise.all(
            (rg.tabs || [])
              .sort((a, b) => a.position - b.position)
              .map(async (t) => ({
                id: t.id,
                url: await decrypt(t.url, key),
                title: await decrypt(t.title, key),
                faviconUrl: await decryptNullable(t.favicon_url, key),
                position: t.position,
                createdAt: new Date(t.created_at).getTime(),
              })),
          ),
          subGroups,
          summary,
          tags,
          categorizationStatus: rg.sub_groups
            ? CATEGORIZATION_STATUS.DONE
            : undefined,
        };
      }),
    );
  }

  async flushQueue(): Promise<{ succeeded: number; failed: number }> {
    const items = await this.queue.getAll();
    if (items.length === 0) return { succeeded: 0, failed: 0 };

    const session = await getSession();
    if (!session) return { succeeded: 0, failed: items.length };

    const supabase = getSupabase();
    const deviceId = await getOrCreateDeviceId();
    const key = await getOrDeriveKey(session.user.id);
    let succeeded = 0;
    let failed = 0;

    // Ensure device is registered before retrying pushes
    await supabase.from('devices').upsert({
      id: deviceId,
      user_id: session.user.id,
      device_name: navigator.userAgent.slice(0, 100),
      last_seen_at: new Date().toISOString(),
    });

    for (const item of items) {
      try {
        if (item.entityType === 'tab_group' && item.operation === 'create') {
          // Payload is plaintext TabGroup; encrypt via shared builder
          const group = item.payload as unknown as TabGroup;
          const { error: groupError } = await supabase
            .from('tab_groups')
            .upsert(await buildGroupRow(group, session.user.id, deviceId, key));
          if (groupError) throw groupError;

          for (const tab of group.tabs) {
            const { error: tabErr } = await supabase
              .from('tabs')
              .upsert(await buildTabRow(tab, group.id, key));
            if (tabErr?.message?.includes('tab_limit_exceeded')) {
              throw new TabLimitExceededError();
            }
          }
        } else if (item.entityType === 'tab' && item.operation === 'create') {
          const tabPayload = item.payload as unknown as SavedTab & { groupId: string };
          const { error: tabErr } = await supabase
            .from('tabs')
            .upsert(await buildTabRow(tabPayload, tabPayload.groupId, key));
          if (tabErr?.message?.includes('tab_limit_exceeded')) {
            throw new TabLimitExceededError();
          }
          if (tabErr) throw tabErr;
        } else if (item.entityType === 'tab' && item.operation === 'delete') {
          await supabase.from('tabs').delete().eq('id', item.entityId);
        } else if (item.entityType === 'tab_group' && item.operation === 'delete') {
          await supabase.from('tab_groups').delete().eq('id', item.entityId);
        }

        await this.queue.dequeue(item.id);
        succeeded++;
      } catch (err) {
        if (err instanceof TabLimitExceededError) {
          // Don't retry — limit won't change without an upgrade
          await this.queue.dequeue(item.id);
          failed++;
          continue;
        }
        await this.queue.incrementRetries(item.id);
        failed++;
      }
    }

    if (failed === 0) {
      await this.resetSyncFailure();
    }

    return { succeeded, failed };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const queueSize = await this.queue.size();
    if (queueSize === 0) return 'synced';

    const result = await chrome.storage.local.get(STORAGE_KEY_SYNC_FAIL_COUNT);
    const failCount = result[STORAGE_KEY_SYNC_FAIL_COUNT] ?? 0;

    if (failCount >= SYNC_RETRY_THRESHOLD) return 'failed';
    return 'pending';
  }

  private async recordSyncFailure(): Promise<void> {
    const result = await chrome.storage.local.get([
      STORAGE_KEY_SYNC_FAIL_COUNT,
      STORAGE_KEY_FIRST_SYNC_FAIL_AT,
    ]);
    const count = (result[STORAGE_KEY_SYNC_FAIL_COUNT] ?? 0) + 1;
    const firstFailAt = result[STORAGE_KEY_FIRST_SYNC_FAIL_AT] ?? Date.now();

    await chrome.storage.local.set({
      [STORAGE_KEY_SYNC_FAIL_COUNT]: count,
      [STORAGE_KEY_FIRST_SYNC_FAIL_AT]: firstFailAt,
    });
  }

  private async resetSyncFailure(): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEY_SYNC_FAIL_COUNT]: 0,
      [STORAGE_KEY_FIRST_SYNC_FAIL_AT]: null,
    });
  }
}
