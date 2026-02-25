import { getSupabase } from './supabase';
import { getSession } from './auth';
import { StorageService } from './storage';
import { SyncQueue } from './sync-queue';
import { getOrCreateDeviceId } from './device';
import type { TabGroup, SyncStatus } from './types';
import {
  STORAGE_KEY_SYNC_FAIL_COUNT,
  STORAGE_KEY_FIRST_SYNC_FAIL_AT,
  SYNC_RETRY_THRESHOLD,
} from './constants';

export class SyncEngine {
  constructor(
    private storage: StorageService,
    private queue: SyncQueue,
  ) {}

  async pushGroup(group: TabGroup): Promise<void> {
    const session = await getSession();
    if (!session) return;

    const supabase = getSupabase();
    const deviceId = await getOrCreateDeviceId();

    // Upsert the group
    const { error: groupError } = await supabase.from('tab_groups').upsert({
      id: group.id,
      user_id: session.user.id,
      device_id: deviceId,
      name: group.name,
      is_auto_save: group.isAutoSave,
      created_at: new Date(group.createdAt).toISOString(),
      updated_at: new Date(group.updatedAt).toISOString(),
    });

    if (groupError) {
      // Queue for retry if push fails
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
      const { error: tabError } = await supabase.from('tabs').upsert({
        id: tab.id,
        group_id: group.id,
        url: tab.url,
        title: tab.title,
        favicon_url: tab.faviconUrl,
        position: tab.position,
        created_at: new Date(tab.createdAt).toISOString(),
      });

      if (tabError) {
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

    const { data: remoteGroups, error } = await supabase
      .from('tab_groups')
      .select('*, tabs(*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error || !remoteGroups) return [];

    return remoteGroups.map((rg: any) => ({
      id: rg.id,
      name: rg.name,
      isAutoSave: rg.is_auto_save,
      deviceId: rg.device_id,
      createdAt: new Date(rg.created_at).getTime(),
      updatedAt: new Date(rg.updated_at).getTime(),
      tabs: (rg.tabs || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((t: any) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          faviconUrl: t.favicon_url,
          position: t.position,
          createdAt: new Date(t.created_at).getTime(),
        })),
    }));
  }

  async flushQueue(): Promise<{ succeeded: number; failed: number }> {
    const items = await this.queue.getAll();
    if (items.length === 0) return { succeeded: 0, failed: 0 };

    const session = await getSession();
    if (!session) return { succeeded: 0, failed: items.length };

    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const supabase = getSupabase();

        if (item.entityType === 'tab_group' && item.operation === 'create') {
          const group = item.payload as unknown as TabGroup;
          await this.pushGroup(group);
        } else if (item.entityType === 'tab' && item.operation === 'delete') {
          await supabase.from('tabs').delete().eq('id', item.entityId);
        } else if (item.entityType === 'tab_group' && item.operation === 'delete') {
          await supabase.from('tab_groups').delete().eq('id', item.entityId);
        }

        await this.queue.dequeue(item.id);
        succeeded++;
      } catch {
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
