import { useCallback, useEffect, useState } from 'react';
import { StorageService } from '../../lib/storage';
import { TabService } from '../../lib/tabs';
import { SyncEngine } from '../../lib/sync';
import { SyncQueue } from '../../lib/sync-queue';
import { getOrCreateDeviceId } from '../../lib/device';
import { getSession, getProfile } from '../../lib/auth';
import { getCheckoutUrl } from '../../lib/billing';
import { AUTO_SAVE_VISIBLE_COUNT, POPUP_WIDTH_PX, CLOUD_FREE_TAB_LIMIT } from '../../lib/constants';
import { SubscriptionTier } from '../../lib/constants';
import type { TabGroup, UserSettings, UserProfile } from '../../lib/types';
import { DEFAULT_SETTINGS } from '../../lib/types';
import { TabGroupCard } from '../../components/TabGroupCard';
import { AuthPrompt } from '../../components/AuthPrompt';
import { SyncStatusIndicator } from '../../components/SyncStatus';

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [storageService] = useState(() => new StorageService());
  const [tabService, setTabService] = useState<TabService | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [limitWarning, setLimitWarning] = useState<{ trying: number; remaining: number } | null>(null);

  // Initialize TabService with device ID and check auth status
  useEffect(() => {
    async function init() {
      const deviceId = await getOrCreateDeviceId();
      setTabService(new TabService(storageService, deviceId));

      // Load settings
      const loadedSettings = await storageService.getSettings();
      setSettings(loadedSettings);

      // Check if user is authenticated and load profile
      const session = await getSession();
      setIsAuthenticated(!!session);
      if (session) {
        const loadedProfile = await getProfile();
        setProfile(loadedProfile);
      }
    }
    init();
  }, [storageService]);

  // Load tab groups from the correct source of truth
  const loadGroups = useCallback(async () => {
    const session = await getSession().catch(() => null);
    if (session) {
      const engine = new SyncEngine(storageService, new SyncQueue());
      const cloudGroups = await engine.pullAllGroups();
      setGroups(cloudGroups);
    } else {
      const loaded = await storageService.getTabGroups();
      setGroups(loaded);
    }
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
    setLimitWarning(null);
    setSaving(true);
    try {
      const result = await tabService.saveCurrentTabs({
        closeAfterSave: settings.closeTabsAfterSaving,
        groupNameFormat: settings.groupNameFormat,
      });

      if (!result.success) {
        setLimitWarning(result.limitExceeded);
        return;
      }

      // Refresh groups and profile from the correct source of truth
      await loadGroups();
      const p = await getProfile();
      if (p) setProfile(p);

      // Notify other views (full-page) that save is fully complete
      // so they can refresh with up-to-date Supabase data
      chrome.runtime.sendMessage({ type: 'tabvault:data-changed' }).catch(() => {});

      // Show auth prompt after first save if not authenticated
      if (!isAuthenticated) {
        const settings = await storageService.getSettings();
        if (!settings.hasSeenCloudPrompt) {
          await storageService.updateSettings({ hasSeenCloudPrompt: true });
          setShowAuthPrompt(true);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // Handle auth prompt dismiss
  async function handleAuthDismiss() {
    setShowAuthPrompt(false);
    await storageService.updateSettings({ hasDismissedCloudPrompt: true });
  }

  // Handle auth success
  function handleAuthSuccess() {
    setShowAuthPrompt(false);
    setIsAuthenticated(true);
  }

  // Open a single tab
  function handleOpenTab(url: string) {
    tabService?.openTab(url);
  }

  // Restore all tabs in a group
  function handleOpenGroup(groupId: string) {
    tabService?.openGroup(groupId, settings.restoreBehavior === 'remove');
  }

  // Delete a tab from a group
  async function handleDeleteTab(groupId: string, tabId: string) {
    await tabService?.deleteTab(groupId, tabId);
    await loadGroups();
    const p = await getProfile();
    if (p) setProfile(p);
    chrome.runtime.sendMessage({ type: 'tabvault:data-changed' }).catch(() => {});
  }

  // Delete an entire group
  async function handleDeleteGroup(groupId: string) {
    await tabService?.deleteGroup(groupId);
    await loadGroups();
    const p = await getProfile();
    if (p) setProfile(p);
    chrome.runtime.sendMessage({ type: 'tabvault:data-changed' }).catch(() => {});
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
    await tabService?.deleteGroups([...selectedIds]);
    setSelectedIds(new Set());
    setIsSelectMode(false);
    await loadGroups();
    const p = await getProfile();
    if (p) setProfile(p);
    chrome.runtime.sendMessage({ type: 'tabvault:data-changed' }).catch(() => {});
  }

  // Exit select mode
  function handleCancelSelect() {
    setSelectedIds(new Set());
    setIsSelectMode(false);
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

  function handleOpenSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('/tabs.html?settings=1') });
  }

  return (
    <div className="flex flex-col bg-[#F8F9FA]" style={{ width: `${POPUP_WIDTH_PX}px`, height: '600px' }}>
      {/* Header — fixed top */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">TabVault</h1>
          <div className="flex items-center gap-2">
            <button
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              onClick={handleOpenSettings}
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
            {!isSelectMode && groups.length > 0 && (
              <button
                className="text-sm px-3 min-h-[44px] rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                onClick={() => setIsSelectMode(true)}
              >
                Select
              </button>
            )}
            <button
              className="bg-blue-600 text-white text-sm px-4 min-h-[44px] rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSaveTabs}
              disabled={saving || !tabService}
            >
              {saving ? 'Saving...' : 'Save Tabs'}
            </button>
          </div>
        </div>

        {/* Selection toolbar */}
        {isSelectMode && (
          <div className="flex items-center justify-between mt-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
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
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Auth Prompt */}
        {showAuthPrompt && (
          <div className="mb-4">
            <AuthPrompt onSuccess={handleAuthSuccess} onDismiss={handleAuthDismiss} />
          </div>
        )}

        {/* Tab limit exceeded */}
        {limitWarning && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900 mb-1">
              Can't save — not enough free slots
            </p>
            <p className="text-xs text-amber-800 mb-3">
              You have {limitWarning.remaining} {limitWarning.remaining === 1 ? 'slot' : 'slots'} remaining but are trying to save {limitWarning.trying} tabs.
              Upgrade for unlimited tabs, or free up space by deleting saved tabs.
            </p>
            <div className="flex items-center gap-2">
              <button
                className="bg-blue-600 text-white text-xs font-medium px-4 min-h-[44px] rounded-lg hover:bg-blue-700 transition-colors"
                onClick={() => {
                  const url = getCheckoutUrl();
                  if (url) chrome.tabs.create({ url });
                }}
              >
                Upgrade to Pro
              </button>
              <button
                className="text-xs font-medium px-4 min-h-[44px] rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/tabs.html') })}
              >
                Manage tabs
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {hasNoGroups && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No tabs saved yet.</p>
            <p className="text-xs mt-1">Click &quot;Save Tabs&quot; to save your open tabs.</p>
          </div>
        )}

        {/* My Saved Groups */}
        {manualGroups.length > 0 && (
          <div className="mb-4">
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

        {/* Auto-saved */}
        {visibleAutoGroups.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-gray-700 mb-2">
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
                isSelected={selectedIds.has(group.id)}
                onToggleSelect={isSelectMode ? handleToggleSelect : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer — sticky bottom */}
      {!hasNoGroups && (
        <div className="shrink-0 px-4 py-2 border-t border-gray-200 bg-[#F8F9FA]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {profile?.tier === SubscriptionTier.CLOUD_FREE ? (
                <>{profile.tabCount} of {CLOUD_FREE_TAB_LIMIT} free tabs synced</>
              ) : profile?.tier === SubscriptionTier.CLOUD_PAID ? (
                <>{profile.tabCount} {profile.tabCount === 1 ? 'tab' : 'tabs'} synced</>
              ) : (
                <>{totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'} saved</>
              )}
              {isAuthenticated && (
                <>
                  {' '}&middot;{' '}
                  <SyncStatusIndicator />
                </>
              )}
            </span>
            <button
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline min-h-[44px]"
              onClick={handleFullView}
            >
              Full view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
