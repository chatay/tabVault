import { useCallback, useEffect, useMemo, useState } from 'react';
import { StorageService } from '../../lib/storage';
import { TabService } from '../../lib/tabs';
import { SyncEngine } from '../../lib/sync';
import { SyncQueue } from '../../lib/sync-queue';
import { getOrCreateDeviceId } from '../../lib/device';
import { getProfile, getSession, signOut } from '../../lib/auth';
import { SubscriptionTier, CLOUD_FREE_TAB_LIMIT } from '../../lib/constants';
import type { TabGroup, UserSettings, UserProfile } from '../../lib/types';
import { DEFAULT_SETTINGS } from '../../lib/types';
import { TabGroupCard } from '../../components/TabGroupCard';
import { SearchBar } from '../../components/SearchBar';
import { SearchResultItem } from '../../components/SearchResultItem';
import { SettingsPanel } from '../../components/SettingsPanel';

export default function App() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [storageService] = useState(() => new StorageService());
  const [tabService, setTabService] = useState<TabService | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showSettings, setShowSettings] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('settings') === '1';
  });
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Apply theme on mount and when darkMode changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  }, [settings.darkMode]);

  // Initialize TabService with device ID and load profile
  useEffect(() => {
    async function init() {
      const deviceId = await getOrCreateDeviceId();
      setTabService(new TabService(storageService, deviceId));

      // Load settings
      const loadedSettings = await storageService.getSettings();
      setSettings(loadedSettings);

      // Check auth and load profile
      const loadedProfile = await getProfile();
      setProfile(loadedProfile);
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

  // Flat search results for search mode
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    return groups.flatMap((group) => {
      const date = new Date(group.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return group.tabs
        .filter(
          (tab) =>
            tab.title.toLowerCase().includes(q) ||
            tab.url.toLowerCase().includes(q),
        )
        .map((tab) => ({
          tab,
          groupName: group.name,
          groupDate: date,
        }));
    });
  }, [groups, searchQuery]);

  // Auto-exit selection mode when search is active
  useEffect(() => {
    if (searchQuery.trim().length > 0 && isSelectMode) {
      setSelectedIds(new Set());
      setIsSelectMode(false);
    }
  }, [searchQuery, isSelectMode]);

  // Split groups into manual and auto-save (used only in non-search view)
  const manualGroups = groups.filter((g) => !g.isAutoSave);
  const autoGroups = groups.filter((g) => g.isAutoSave);

  // Total tab count
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
  async function handleDeleteTab(groupId: string, tabId: string) {
    await tabService?.deleteTab(groupId, tabId);
    const p = await getProfile();
    if (p) setProfile(p);
  }

  // Delete an entire group
  async function handleDeleteGroup(groupId: string) {
    await tabService?.deleteGroup(groupId);
    const p = await getProfile();
    if (p) setProfile(p);
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
    const p = await getProfile();
    if (p) setProfile(p);
  }

  // Exit select mode
  function handleCancelSelect() {
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }

  // Settings handlers
  async function handleSettingsUpdate(partial: Partial<UserSettings>) {
    await storageService.updateSettings(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function handleSettingsBack() {
    setShowSettings(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('settings');
    window.history.replaceState({}, '', url.toString());
  }

  async function handleSignOut() {
    await signOut();
    setProfile(null);
  }

  async function handleSignIn() {
    const loadedProfile = await getProfile();
    setProfile(loadedProfile);

    if (tabService) {
      try {
        await tabService.syncAllToCloud();
        const refreshed = await getProfile();
        if (refreshed) setProfile(refreshed);
      } catch {
        // Sync failed — will retry via background alarm
      }
    }
  }

  // Toggle dark mode
  async function handleToggleDarkMode() {
    const newDarkMode = !settings.darkMode;
    await handleSettingsUpdate({ darkMode: newDarkMode });
  }

  const isSearching = searchQuery.trim().length > 0;

  const showBanner = !showSettings && (
    (profile === null && groups.length > 0) ||
    profile?.tier === SubscriptionTier.CLOUD_FREE
  );

  return (
    <div className="min-h-screen flex items-start justify-center" style={{ background: 'var(--bg)', padding: `32px 20px ${showBanner ? '100px' : '60px'}` }}>
      <div className="w-full flex flex-col gap-[14px]" style={{ maxWidth: '760px' }}>

        {/* Settings view */}
        {showSettings ? (
          <SettingsPanel
            settings={settings}
            onUpdate={handleSettingsUpdate}
            onBack={handleSettingsBack}
            profile={profile}
            onSignOut={handleSignOut}
            onSignIn={handleSignIn}
          />
        ) : (
          <>
            {/* ─── HEADER ─── */}
            <div
              className="rounded-[14px] flex items-center justify-between"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                padding: '14px 18px',
                transition: 'background 0.25s, border-color 0.25s',
              }}
            >
              <div className="flex items-center gap-[10px]">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px]"
                  style={{
                    background: 'linear-gradient(135deg, #4F6EF7, #7C3AED)',
                    boxShadow: '0 2px 8px rgba(79,110,247,0.35)',
                  }}
                >
                  🔒
                </div>
                <span className="text-[15px] font-semibold" style={{ letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
                  TabVault
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'}
                </span>

                {/* Local-only badge */}
                {profile === null && groups.length > 0 && (
                  <button
                    className="flex items-center gap-[5px] rounded-full text-[11px] font-medium cursor-pointer"
                    style={{
                      background: 'var(--warning-soft)',
                      border: '1px solid var(--warning-border)',
                      padding: '4px 10px',
                      color: 'var(--warning-text)',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setShowSettings(true)}
                    title="Your tabs are local only — sign in to protect them"
                  >
                    <span
                      className="w-[6px] h-[6px] rounded-full"
                      style={{ background: 'var(--warning)', animation: 'pulse-dot 2s infinite' }}
                    />
                    Local only
                  </button>
                )}

                {/* Select button */}
                {!isSelectMode && groups.length > 0 && (
                  <button
                    className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-[15px]"
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--surface-2)';
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--surface)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    onClick={() => setIsSelectMode(true)}
                    title="Select"
                  >
                    ☑
                  </button>
                )}

                {/* Dark mode toggle */}
                <button
                  className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-[15px]"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--theme-toggle-bg)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  onClick={handleToggleDarkMode}
                  title="Toggle dark mode"
                >
                  {settings.darkMode ? '☀️' : '🌙'}
                </button>

                {/* Settings */}
                <button
                  className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-[15px]"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-2)';
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--surface)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* ─── SELECTION TOOLBAR ─── */}
            {isSelectMode && !isSearching && (
              <div
                className="rounded-[14px] flex items-center justify-between"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '10px 16px',
                }}
              >
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-3">
                  <button
                    className="text-[13px] font-medium min-h-[44px] cursor-pointer"
                    style={{ color: selectedIds.size > 0 ? 'var(--red)' : 'var(--text-muted)', background: 'none', border: 'none' }}
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0}
                  >
                    Delete
                  </button>
                  <button
                    className="text-[13px] min-h-[44px] cursor-pointer"
                    style={{ color: 'var(--text-secondary)', background: 'none', border: 'none' }}
                    onClick={handleCancelSelect}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ─── SEARCH BAR ─── */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              resultCount={searchResults.length}
              isSearching={isSearching}
            />

            {/* ─── FLAT SEARCH RESULTS ─── */}
            {isSearching && searchResults.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                {searchResults.map(({ tab, groupName, groupDate }) => (
                  <SearchResultItem
                    key={tab.id}
                    tab={tab}
                    groupName={groupName}
                    groupDate={groupDate}
                    query={searchQuery}
                    onOpen={handleOpenTab}
                  />
                ))}
              </div>
            )}

            {/* ─── NO SEARCH RESULTS ─── */}
            {isSearching && searchResults.length === 0 && (
              <div
                className="rounded-[14px] text-center"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '52px 24px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div className="text-[34px] mb-3 opacity-45">🔍</div>
                <div className="text-[15px] font-semibold mb-[6px]" style={{ color: 'var(--text-primary)' }}>
                  No tabs found for &quot;{searchQuery.trim()}&quot;
                </div>
                <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  Try a different search term
                </div>
              </div>
            )}

            {/* ─── MY SAVED GROUPS ─── */}
            {!isSearching && manualGroups.length > 0 && (
              <div className="flex flex-col gap-[10px]">
                <div className="flex items-center gap-[10px] px-[2px]">
                  <span
                    className="text-[10px] font-bold uppercase whitespace-nowrap"
                    style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}
                  >
                    My Saved Groups
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>
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

            {/* ─── AUTO-SAVED ─── */}
            {!isSearching && autoGroups.length > 0 && (
              <div className="flex flex-col gap-[10px] mt-1">
                <div className="flex items-center gap-[10px] px-[2px]">
                  <span
                    className="text-[10px] font-bold uppercase whitespace-nowrap"
                    style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}
                  >
                    Auto-saved
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>
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

            {/* ─── EMPTY STATE ─── */}
            {!isSearching && groups.length === 0 && (
              <div
                className="rounded-[14px] text-center"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '52px 24px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div className="text-[34px] mb-3 opacity-45">📁</div>
                <div className="text-[15px] font-semibold mb-[6px]" style={{ color: 'var(--text-primary)' }}>
                  No saved tabs yet
                </div>
                <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  Click the TabVault icon in your toolbar and hit &quot;Save Tabs&quot; to get started.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── WARNING BANNER (local only) ─── */}
      {profile === null && !showSettings && groups.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{ padding: '0 20px 16px' }}>
          <div
            className="w-full rounded-xl flex items-center gap-3"
            style={{
              maxWidth: '760px',
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning-border)',
              padding: '13px 16px',
              color: 'var(--warning-text)',
              fontSize: '13px',
            }}
          >
            <span className="text-[18px] shrink-0">⚠️</span>
            <div className="flex-1" style={{ lineHeight: '1.5' }}>
              Your tabs are saved on this device only. A Chrome reinstall or PC reset will erase everything permanently.
            </div>
            <button
              className="shrink-0 whitespace-nowrap rounded-full text-white text-[12px] font-semibold cursor-pointer"
              style={{
                background: 'var(--accent)',
                padding: '6px 14px',
                border: 'none',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
              onClick={() => setShowSettings(true)}
            >
              Protect free →
            </button>
          </div>
        </div>
      )}

      {/* ─── USAGE BANNER (cloud free tier) ─── */}
      {profile?.tier === SubscriptionTier.CLOUD_FREE && !showSettings && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{ padding: '0 20px 16px' }}>
          <div
            className="w-full rounded-xl flex items-center gap-3"
            style={{
              maxWidth: '760px',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              padding: '13px 16px',
              color: 'var(--accent)',
              fontSize: '13px',
            }}
          >
            <span className="text-[18px] shrink-0">☁️</span>
            <div className="flex-1" style={{ lineHeight: '1.5' }}>
              You are using {profile.tabCount} of {CLOUD_FREE_TAB_LIMIT} free tabs.
            </div>
            <button
              className="shrink-0 whitespace-nowrap rounded-full text-white text-[12px] font-semibold cursor-pointer"
              style={{
                background: 'var(--accent)',
                padding: '6px 14px',
                border: 'none',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
              onClick={() => setShowSettings(true)}
            >
              Upgrade →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
