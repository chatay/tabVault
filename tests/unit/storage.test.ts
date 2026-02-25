import { describe, it, expect } from 'vitest';
import { StorageService } from '@/lib/storage';
import { STORAGE_KEY_TAB_GROUPS, STORAGE_KEY_SETTINGS } from '@/lib/constants';
import { DEFAULT_SETTINGS, type TabGroup, type UserSettings } from '@/lib/types';

describe('StorageService', () => {
  const storage = new StorageService();

  describe('getTabGroups', () => {
    it('returns empty array when no groups exist', async () => {
      const groups = await storage.getTabGroups();
      expect(groups).toEqual([]);
    });

    it('returns stored groups', async () => {
      const group: TabGroup = {
        id: 'g1',
        name: 'Test Group',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({ [STORAGE_KEY_TAB_GROUPS]: [group] });
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Test Group');
    });
  });

  describe('saveTabGroup', () => {
    it('adds a new group', async () => {
      const group: TabGroup = {
        id: 'g1',
        name: 'New Group',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.saveTabGroup(group);
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('g1');
    });

    it('replaces existing group with same id', async () => {
      const group: TabGroup = {
        id: 'g1',
        name: 'Original',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.saveTabGroup(group);
      await storage.saveTabGroup({ ...group, name: 'Updated' });
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Updated');
    });
  });

  describe('deleteTabGroup', () => {
    it('removes a group by id', async () => {
      const group: TabGroup = {
        id: 'g1',
        name: 'Delete Me',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.saveTabGroup(group);
      await storage.deleteTabGroup('g1');
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(0);
    });
  });

  describe('deleteTabGroups (bulk)', () => {
    it('deletes multiple groups at once', async () => {
      const makeGroup = (id: string): TabGroup => ({
        id,
        name: `Group ${id}`,
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await storage.saveTabGroup(makeGroup('g1'));
      await storage.saveTabGroup(makeGroup('g2'));
      await storage.saveTabGroup(makeGroup('g3'));

      await storage.deleteTabGroups(['g1', 'g3']);
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('g2');
    });

    it('handles empty array without error', async () => {
      const group: TabGroup = {
        id: 'g1',
        name: 'Keep',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.saveTabGroup(group);

      await storage.deleteTabGroups([]);
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
    });

    it('ignores nonexistent IDs gracefully', async () => {
      const group: TabGroup = {
        id: 'g1',
        name: 'Keep',
        tabs: [],
        isAutoSave: false,
        deviceId: 'device_abc',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.saveTabGroup(group);

      await storage.deleteTabGroups(['nonexistent', 'also-fake']);
      const groups = await storage.getTabGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('g1');
    });
  });

  describe('getSettings', () => {
    it('returns defaults when no settings exist', async () => {
      const settings = await storage.getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('updateSettings', () => {
    it('merges partial settings', async () => {
      await storage.updateSettings({ autoSaveEnabled: true });
      const settings = await storage.getSettings();
      expect(settings.autoSaveEnabled).toBe(true);
      expect(settings.restoreBehavior).toBe('keep');
    });
  });
});
