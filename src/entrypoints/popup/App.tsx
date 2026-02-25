import { useCallback, useEffect, useState } from 'react';
import { StorageService } from '../../lib/storage';
import { TabService } from '../../lib/tabs';
import { getOrCreateDeviceId } from '../../lib/device';
import { AUTO_SAVE_VISIBLE_COUNT, POPUP_WIDTH_PX } from '../../lib/constants';
import type { TabGroup } from '../../lib/types';
import { TabGroupCard } from '../../components/TabGroupCard';

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [storageService] = useState(() => new StorageService());
  const [tabService, setTabService] = useState<TabService | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize TabService with device ID
  useEffect(() => {
    async function init() {
      const deviceId = await getOrCreateDeviceId();
      setTabService(new TabService(storageService, deviceId));
    }
    init();
  }, [storageService]);

  // Load tab groups from storage
  const loadGroups = useCallback(async () => {
    const loaded = await storageService.getTabGroups();
    setGroups(loaded);
  }, [storageService]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Listen for storage changes for live updates
  useEffect(() => {
    function handleStorageChanged() {
      loadGroups();
    }

    chrome.storage.onChanged.addListener(handleStorageChanged);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
  }, [loadGroups]);

  // Save current tabs
  async function handleSaveTabs() {
    if (!tabService || saving) return;
    setSaving(true);
    try {
      await tabService.saveCurrentTabs();
    } finally {
      setSaving(false);
    }
  }

  // Open a single tab
  function handleOpenTab(url: string) {
    tabService?.openTab(url);
  }

  // Restore all tabs in a group
  function handleOpenGroup(groupId: string) {
    tabService?.openGroup(groupId, false);
  }

  // Delete a tab from a group
  function handleDeleteTab(groupId: string, tabId: string) {
    tabService?.deleteTab(groupId, tabId);
  }

  // Delete an entire group
  async function handleDeleteGroup(groupId: string) {
    await storageService.deleteTabGroup(groupId);
  }

  // Rename a group
  function handleRenameGroup(groupId: string, newName: string) {
    tabService?.renameGroup(groupId, newName);
  }

  // Split groups into manual and auto-save
  const manualGroups = groups.filter((g) => !g.isAutoSave);
  const autoGroups = groups.filter((g) => g.isAutoSave);
  const visibleAutoGroups = autoGroups.slice(0, AUTO_SAVE_VISIBLE_COUNT);

  // Total tab count
  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  const hasNoGroups = groups.length === 0;

  function handleFullView() {
    chrome.tabs.create({ url: chrome.runtime.getURL('/tabs.html') });
  }

  return (
    <div className="p-4" style={{ width: `${POPUP_WIDTH_PX}px` }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">TabVault</h1>
        <button
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSaveTabs}
          disabled={saving || !tabService}
        >
          {saving ? 'Saving...' : 'Save Tabs'}
        </button>
      </div>

      {/* Empty state */}
      {hasNoGroups && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No tabs saved yet.</p>
          <p className="text-xs mt-1">Click "Save Tabs" to save your open tabs.</p>
        </div>
      )}

      {/* My Saved Groups */}
      {manualGroups.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            My Saved Groups
          </h2>
          {manualGroups.map((group) => (
            <TabGroupCard
              key={group.id}
              group={group}
              onOpenTab={handleOpenTab}
              onOpenGroup={handleOpenGroup}
              onDeleteTab={handleDeleteTab}
              onDeleteGroup={handleDeleteGroup}
              onRenameGroup={handleRenameGroup}
            />
          ))}
        </div>
      )}

      {/* Auto-saved */}
      {visibleAutoGroups.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Auto-saved
          </h2>
          {visibleAutoGroups.map((group) => (
            <TabGroupCard
              key={group.id}
              group={group}
              onOpenTab={handleOpenTab}
              onOpenGroup={handleOpenGroup}
              onDeleteTab={handleDeleteTab}
              onDeleteGroup={handleDeleteGroup}
              onRenameGroup={handleRenameGroup}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {!hasNoGroups && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'} saved
          </span>
          <button
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            onClick={handleFullView}
          >
            Full view
          </button>
        </div>
      )}
    </div>
  );
}
