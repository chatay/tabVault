import { getSupabase } from './supabase';
import { getSession } from './auth';
import { StorageService } from './storage';
import { SyncQueue } from './sync-queue';
import { getOrCreateDeviceId } from './device';
import { getOrDeriveKey, encrypt, decrypt, encryptNullable, decryptNullable } from './crypto';
import type { TabGroup, SyncStatus } from './types';
import {
  STORAGE_KEY_SYNC_FAIL_COUNT,
  STORAGE_KEY_FIRST_SYNC_FAIL_AT,
  SYNC_RETRY_THRESHOLD,
} from './constants';

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

    // Upsert the group (encrypt name)
    const { error: groupError } = await supabase.from('tab_groups').upsert({
      id: group.id,
      user_id: session.user.id,
      device_id: deviceId,
      name: await encrypt(group.name, key),
      is_auto_save: group.isAutoSave,
      created_at: new Date(group.createdAt).toISOString(),
      updated_at: new Date(group.updatedAt).toISOString(),
    });

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

    // Upsert each tab (encrypt url, title, faviconUrl)
    for (const tab of group.tabs) {
      const { error: tabError } = await supabase.from('tabs').upsert({
        id: tab.id,
        group_id: group.id,
        url: await encrypt(tab.url, key),
        title: await encrypt(tab.title, key),
        favicon_url: await encryptNullable(tab.faviconUrl, key),
        position: tab.position,
        created_at: new Date(tab.createdAt).toISOString(),
      });

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
      remoteGroups.map(async (rg: any) => ({
        id: rg.id,
        name: await decrypt(rg.name, key),
        isAutoSave: rg.is_auto_save,
        deviceId: rg.device_id,
        createdAt: new Date(rg.created_at).getTime(),
        updatedAt: new Date(rg.updated_at).getTime(),
        tabs: await Promise.all(
          (rg.tabs || [])
            .sort((a: any, b: any) => a.position - b.position)
            .map(async (t: any) => ({
              id: t.id,
              url: await decrypt(t.url, key),
              title: await decrypt(t.title, key),
              faviconUrl: await decryptNullable(t.favicon_url, key),
              position: t.position,
              createdAt: new Date(t.created_at).getTime(),
            })),
        ),
      })),
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
          // Push group directly — don't use pushGroup() to avoid double-queueing
          // Payload is plaintext; encrypt at the Supabase boundary
          const group = item.payload as unknown as TabGroup;
          const { error: groupError } = await supabase.from('tab_groups').upsert({
            id: group.id,
            user_id: session.user.id,
            device_id: deviceId,
            name: await encrypt(group.name, key),
            is_auto_save: group.isAutoSave,
            created_at: new Date(group.createdAt).toISOString(),
            updated_at: new Date(group.updatedAt).toISOString(),
          });
          if (groupError) throw groupError;

          for (const tab of group.tabs) {
            const { error: tabErr } = await supabase.from('tabs').upsert({
              id: tab.id,
              group_id: group.id,
              url: await encrypt(tab.url, key),
              title: await encrypt(tab.title, key),
              favicon_url: await encryptNullable(tab.faviconUrl, key),
              position: tab.position,
              created_at: new Date(tab.createdAt).toISOString(),
            });
            if (tabErr?.message?.includes('tab_limit_exceeded')) {
              throw new TabLimitExceededError();
            }
          }
        } else if (item.entityType === 'tab' && item.operation === 'create') {
          const tabPayload = item.payload as unknown as Record<string, unknown>;
          const { error: tabErr } = await supabase.from('tabs').upsert({
            id: item.entityId,
            group_id: tabPayload.groupId as string,
            url: await encrypt(tabPayload.url as string, key),
            title: await encrypt(tabPayload.title as string, key),
            favicon_url: await encryptNullable(tabPayload.faviconUrl as string | null, key),
            position: tabPayload.position as number,
            created_at: new Date(tabPayload.createdAt as number).toISOString(),
          });
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
