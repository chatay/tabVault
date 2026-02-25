import { useCallback, useEffect, useMemo, useState } from 'react';
import { StorageService } from '../../lib/storage';
import { TabService } from '../../lib/tabs';
import { getOrCreateDeviceId } from '../../lib/device';
import type { TabGroup } from '../../lib/types';
import { TabGroupCard } from '../../components/TabGroupCard';
import { SearchBar } from '../../components/SearchBar';

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [storageService] = useState(() => new StorageService());
  const [tabService, setTabService] = useState<TabService | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groups;

    return groups
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter(
          (tab) =>
            tab.title.toLowerCase().includes(q) ||
            tab.url.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.tabs.length > 0);
  }, [groups, searchQuery]);

  // Split filtered groups into manual and auto-save
  const manualGroups = filteredGroups.filter((g) => !g.isAutoSave);
  const autoGroups = filteredGroups.filter((g) => g.isAutoSave);

  // Total tab count (from unfiltered groups)
  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

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

  const isSearching = searchQuery.trim().length > 0;
  const hasNoResults = isSearching && filteredGroups.length === 0;

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">TabVault</h1>
        <span className="text-sm text-gray-500">
          {groups.length} {groups.length === 1 ? 'group' : 'groups'} &middot;{' '}
          {totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'}
        </span>
      </div>

      {/* Search */}
      <div className="mb-6">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* No results empty state */}
      {hasNoResults && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No tabs match "{searchQuery.trim()}"</p>
        </div>
      )}

      {/* My Saved Groups */}
      {manualGroups.length > 0 && (
        <div className="mb-6">
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

      {/* Auto-saved -- show ALL, not limited like popup */}
      {autoGroups.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Auto-saved
          </h2>
          {autoGroups.map((group) => (
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
    </div>
  );
}
