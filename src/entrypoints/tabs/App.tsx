import { useEffect, useMemo, useState } from 'react';
import { useTabVault } from '../../hooks/useTabVault';
import { getProfile, signOut } from '../../lib/auth';
import { SubscriptionTier, CLOUD_FREE_TAB_LIMIT, NAV_TAB } from '../../lib/constants';
import type { NavTab } from '../../lib/constants';
import { TabGroupCard } from '../../components/TabGroupCard';
import { SearchBar } from '../../components/SearchBar';
import { SearchResultItem } from '../../components/SearchResultItem';
import { SettingsPanel } from '../../components/SettingsPanel';
import { SmartSearch } from '../../components/SmartSearch';
import { InsightsView, type CleanupProgress } from '../../components/InsightsView';
import { computeGroupDuplicateDetails } from '../../lib/duplicates';

export default function App() {
  const {
    groups,
    tabService,
    settings,
    profile,
    setProfile,
    selectedIds,
    isSelectMode,
    setIsSelectMode,
    handleOpenTab,
    handleOpenGroup,
    handleDeleteTab,
    handleDeleteGroup,
    handleRenameGroup,
    handleToggleSelect,
    handleDeleteSelected,
    handleCancelSelect,
    updateSettings,
  } = useTabVault();

  // --- Tabs-specific state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [cleanupProgress, setCleanupProgress] = useState<CleanupProgress | undefined>(undefined);
  const [activeNav, setActiveNav] = useState<NavTab>(NAV_TAB.MY_TABS);
  const [showSettings, setShowSettings] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('settings') === '1';
  });

  // Apply theme on mount and when darkMode changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  }, [settings.darkMode]);

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
      handleCancelSelect();
    }
  }, [searchQuery, isSelectMode, handleCancelSelect]);

  // Split groups into manual and auto-save (used only in non-search view)
  const manualGroups = groups.filter((g) => !g.isAutoSave);
  const autoGroups = groups.filter((g) => g.isAutoSave);

  // Total tab count
  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  // Duplicate detection — recomputed only when groups change
  const groupDuplicateDetails = useMemo(() => computeGroupDuplicateDetails(groups), [groups]);

  // Settings handlers
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
    await updateSettings({ darkMode: newDarkMode });
  }

  function handleNavChange(tab: NavTab) {
    setActiveNav(tab);
    if (tab !== NAV_TAB.MY_TABS) {
      setSearchQuery('');
      if (isSelectMode) handleCancelSelect();
    }
  }

  async function handleCleanupAllDuplicates(items: Array<{ groupId: string; tabId: string }>) {
    setCleanupProgress({ done: 0, total: items.length });
    try {
      for (let i = 0; i < items.length; i++) {
        await handleDeleteTab(items[i].groupId, items[i].tabId);
        setCleanupProgress({ done: i + 1, total: items.length });
      }
    } finally {
      setCleanupProgress(undefined);
    }
  }

  const isSearching = searchQuery.trim().length > 0;

  const showBanner = !showSettings && (
    (profile === null && groups.length > 0) ||
    profile?.tier === SubscriptionTier.CLOUD_FREE
  );

  return (
    <div className={`app-container min-h-screen flex items-start justify-center ${showBanner ? 'with-banner' : ''}`}>
      <div className="app-inner w-full flex flex-col gap-[14px]">

        {/* Settings view */}
        {showSettings ? (
          <SettingsPanel
            settings={settings}
            onUpdate={updateSettings}
            onBack={handleSettingsBack}
            profile={profile}
            onProfileChange={setProfile}
            onSignOut={handleSignOut}
            onSignIn={handleSignIn}
          />
        ) : (
          <>
            {/* ─── HEADER ─── */}
            <div className="header-card rounded-[14px] flex items-center justify-between">
              <div className="flex items-center gap-[10px]">
                <div className="header-logo w-8 h-8 rounded-lg flex items-center justify-center text-[15px]">
                  🔒
                </div>
                <span className="header-title text-[15px] font-semibold">
                  TabVault
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="header-stats text-[12px]">
                  {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {totalTabs} {totalTabs === 1 ? 'tab' : 'tabs'}
                </span>

                {/* Status badge */}
                {profile === null ? (
                  <button
                    className="badge-local flex items-center gap-[5px] rounded-full text-[11px] font-medium cursor-pointer"
                    onClick={() => setShowSettings(true)}
                    title="Your tabs are local only — sign in to protect them"
                  >
                    <span className="badge-local-dot w-[6px] h-[6px] rounded-full shrink-0" />
                    Local only
                  </button>
                ) : (
                  <button
                    className="badge-cloud flex items-center gap-[5px] rounded-full text-[11px] font-medium cursor-pointer"
                    onClick={() => setShowSettings(true)}
                    title="Cloud sync active"
                  >
                    <span className="badge-cloud-dot w-[6px] h-[6px] rounded-full shrink-0" />
                    {profile.tier === SubscriptionTier.CLOUD_FREE
                      ? `Cloud \u00b7 ${profile.tabCount} of ${CLOUD_FREE_TAB_LIMIT} tabs`
                      : 'Cloud \u00b7 Pro'}
                  </button>
                )}

                {/* Select button */}
                {!isSelectMode && groups.length > 0 && (
                  <button
                    className="header-icon-btn w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-[15px]"
                    onClick={() => setIsSelectMode(true)}
                    title="Select"
                  >
                    ☑
                  </button>
                )}

                {/* Dark mode toggle */}
                <button
                  className="theme-toggle-btn w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-[15px]"
                  onClick={handleToggleDarkMode}
                  title="Toggle dark mode"
                >
                  {settings.darkMode ? '☀️' : '🌙'}
                </button>

                {/* Settings */}
                <button
                  className="header-icon-btn w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer text-[15px]"
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* ─── NAV TABS ─── */}
            <div className="nav-tabs rounded-[12px]">
              <button
                className={`nav-tab${activeNav === NAV_TAB.MY_TABS ? ' active' : ''}`}
                onClick={() => handleNavChange(NAV_TAB.MY_TABS)}
              >
                My Tabs
              </button>
              <button
                className={`nav-tab${activeNav === NAV_TAB.SMART_SEARCH ? ' active' : ''}`}
                onClick={() => handleNavChange(NAV_TAB.SMART_SEARCH)}
              >
                ✦ Smart Search
              </button>
              <button
                className={`nav-tab${activeNav === NAV_TAB.INSIGHTS ? ' active' : ''}`}
                onClick={() => handleNavChange(NAV_TAB.INSIGHTS)}
              >
                Insights
                {cleanupProgress !== undefined && (
                  <span className="nav-busy-dot" />
                )}
              </button>
            </div>

            {/* ─── SELECTION TOOLBAR ─── */}
            {activeNav === NAV_TAB.MY_TABS && isSelectMode && !isSearching && (
              <div className="selection-toolbar rounded-[14px] flex items-center justify-between">
                <span className="selection-count text-[13px] font-medium">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-3">
                  <button
                    className={`toolbar-btn text-[13px] font-medium min-h-[44px] cursor-pointer ${selectedIds.size > 0 ? 'toolbar-delete-active' : 'toolbar-delete-disabled'}`}
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0}
                  >
                    Delete
                  </button>
                  <button
                    className="toolbar-cancel-btn text-[13px] min-h-[44px] cursor-pointer"
                    onClick={handleCancelSelect}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ─── MY TABS VIEW ─── */}
            {activeNav === NAV_TAB.MY_TABS && (
              <>
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
                  <div className="empty-state-card rounded-[14px] text-center">
                    <div className="text-[34px] mb-3 opacity-45">🔍</div>
                    <div className="empty-state-title text-[15px] font-semibold mb-[6px]">
                      No tabs found for &quot;{searchQuery.trim()}&quot;
                    </div>
                    <div className="empty-state-text text-[13px]">
                      Try a different search term
                    </div>
                  </div>
                )}

                {/* ─── MY SAVED GROUPS ─── */}
                {!isSearching && manualGroups.length > 0 && (
                  <div className="flex flex-col gap-[10px]">
                    <div className="flex items-center gap-[10px] px-[2px]">
                      <span className="section-label text-[10px] font-bold uppercase whitespace-nowrap">
                        My Saved Groups
                      </span>
                      <div className="section-divider flex-1 h-px" />
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
                        duplicateInfo={groupDuplicateDetails.get(group.id)}
                      />
                    ))}
                  </div>
                )}

                {/* ─── AUTO-SAVED ─── */}
                {!isSearching && autoGroups.length > 0 && (
                  <div className="flex flex-col gap-[10px] mt-1">
                    <div className="flex items-center gap-[10px] px-[2px]">
                      <span className="section-label text-[10px] font-bold uppercase whitespace-nowrap">
                        Auto-saved
                      </span>
                      <div className="section-divider flex-1 h-px" />
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
                        duplicateInfo={groupDuplicateDetails.get(group.id)}
                      />
                    ))}
                  </div>
                )}

                {/* ─── EMPTY STATE ─── */}
                {!isSearching && groups.length === 0 && (
                  <div className="empty-state-card rounded-[14px] text-center">
                    <div className="text-[34px] mb-3 opacity-45">📁</div>
                    <div className="empty-state-title text-[15px] font-semibold mb-[6px]">
                      No saved tabs yet
                    </div>
                    <div className="empty-state-text text-[13px]">
                      Click the TabVault icon in your toolbar and hit &quot;Save Tabs&quot; to get started.
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─── SMART SEARCH VIEW ─── */}
            {activeNav === NAV_TAB.SMART_SEARCH && (
              <SmartSearch
                groups={groups}
                isAuthenticated={profile !== null}
                onOpenTab={handleOpenTab}
              />
            )}

            {/* ─── INSIGHTS VIEW ─── */}
            {activeNav === NAV_TAB.INSIGHTS && (
              <InsightsView
                groups={groups}
                onDeleteTab={handleDeleteTab}
                onOpenTab={handleOpenTab}
                cleanupProgress={cleanupProgress}
                onCleanupAll={handleCleanupAllDuplicates}
              />
            )}
          </>
        )}
      </div>

      {/* ─── WARNING BANNER (local only) ─── */}
      {profile === null && !showSettings && groups.length > 0 && (
        <div className="warning-banner-wrapper fixed bottom-0 left-0 right-0 z-50 flex justify-center">
          <div className="warning-banner w-full rounded-xl flex items-center gap-3">
            <span className="text-[18px] shrink-0">⚠️</span>
            <div className="warning-banner-text flex-1">
              Your tabs are saved on this device only. A Chrome reinstall or PC reset will erase everything permanently.
            </div>
            <button
              className="banner-cta shrink-0 whitespace-nowrap rounded-full text-white text-[12px] font-semibold cursor-pointer"
              onClick={() => setShowSettings(true)}
            >
              Protect free →
            </button>
          </div>
        </div>
      )}

      {/* ─── USAGE BANNER (cloud free tier) ─── */}
      {profile?.tier === SubscriptionTier.CLOUD_FREE && !showSettings && (
        <div className="warning-banner-wrapper fixed bottom-0 left-0 right-0 z-50 flex justify-center">
          <div className="usage-banner w-full rounded-xl flex items-center gap-3">
            <span className="text-[18px] shrink-0">☁️</span>
            <div className="warning-banner-text flex-1">
              You are using {profile.tabCount} of {CLOUD_FREE_TAB_LIMIT} free tabs.
            </div>
            <button
              className="banner-cta shrink-0 whitespace-nowrap rounded-full text-white text-[12px] font-semibold cursor-pointer"
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
