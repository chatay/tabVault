import { useCallback, useEffect, useMemo, useState } from 'react';
import { StorageService } from '../../lib/storage';
import { TabService } from '../../lib/tabs';
import { getOrCreateDeviceId } from '../../lib/device';
import type { TabGroup, UserSettings } from '../../lib/types';
import { DEFAULT_SETTINGS } from '../../lib/types';
import { TabGroupCard } from '../../components/TabGroupCard';
import { SearchBar } from '../../components/SearchBar';

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [storageService] = useState(() => new StorageService());
  const [tabService, setTabService] = useState<TabService | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Initialize TabService with device ID
  useEffect(() => {
    async function init() {
      const deviceId = await getOrCreateDeviceId();
      setTabService(new TabService(storageService, deviceId));

      // Load settings
      const loadedSettings = await storageService.getSettings();
      setSettings(loadedSettings);
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
    tabService?.openGroup(groupId, settings.restoreBehavior === 'remove');
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

  // Toggle group selection
  function handleToggleSelect(groupId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  // Bulk delete selected groups
  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    await storageService.deleteTabGroups([...selectedIds]);
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }

  // Exit select mode
  function handleCancelSelect() {
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }

  const isSearching = searchQuery.trim().length > 0;
  const hasNoResults = isSearching && filteredGroups.length === 0;

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">TabVault</h1>
        <div className="flex items-center gap-4">
          {!isSelectMode && groups.length > 0 && (
            <button
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setIsSelectMode(true)}
            >
              Select
            </button>
          )}
          <span className="text-sm text-gray-500">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'} &middot;{' '}
            {totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'}
          </span>
        </div>
      </div>

      {/* Selection toolbar */}
      {isSelectMode && (
        <div className="flex items-center justify-between mb-4 px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-sm text-gray-700">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              className="text-sm text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed"
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
            >
              Delete
            </button>
            <button
              className="text-sm text-gray-500 hover:text-gray-700"
              onClick={handleCancelSelect}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          <h2 className="text-sm font-bold text-gray-700 mb-2">
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
              isSelected={selectedIds.has(group.id)}
              onToggleSelect={isSelectMode ? handleToggleSelect : undefined}
            />
          ))}
        </div>
      )}

      {/* Auto-saved -- show ALL, not limited like popup */}
      {autoGroups.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-2">
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
              isSelected={selectedIds.has(group.id)}
              onToggleSelect={isSelectMode ? handleToggleSelect : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
