import { useCallback, useEffect, useRef, useState } from 'react';
import { StorageService } from '../lib/storage';
import { TabService } from '../lib/tabs';
import { SyncEngine } from '../lib/sync';
import { SyncQueue } from '../lib/sync-queue';
import { getOrCreateDeviceId } from '../lib/device';
import { getProfile, getSession } from '../lib/auth';
import type { TabGroup, UserSettings, UserProfile } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

/**
 * Shared hook for TabVault state and handlers.
 * Used by both popup/App.tsx and tabs/App.tsx to eliminate duplication.
 *
 * Provides:
 * - Service initialization (StorageService, TabService)
 * - Source-aware group loading (Supabase for logged-in, local for not)
 * - Race-condition-safe loading (only the latest call's result is applied)
 * - Profile management
 * - All CRUD handlers (properly awaited — no fire-and-forget)
 * - Selection management
 * - Cross-view data-changed messaging
 * - Storage change listener
 */
export function useTabVault() {
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [storageService] = useState(() => new StorageService());
  const [tabService, setTabService] = useState<TabService | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Counter to prevent stale loadGroups responses from overwriting newer ones.
  // Each call increments this; only the call whose snapshot matches the current
  // value when the async work finishes will call setGroups.
  const loadVersionRef = useRef(0);

  // --- Initialization ---
  useEffect(() => {
    async function init() {
      const deviceId = await getOrCreateDeviceId();
      setTabService(new TabService(storageService, deviceId));

      const loadedSettings = await storageService.getSettings();
      setSettings(loadedSettings);

      const loadedProfile = await getProfile();
      setProfile(loadedProfile);
    }
    init();
  }, [storageService]);

  // --- Load groups from the correct source of truth ---
  // Race-safe: if two calls overlap, only the latest one's result is used.
  const loadGroups = useCallback(async () => {
    const version = ++loadVersionRef.current;

    const session = await getSession().catch(() => null);
    let result: TabGroup[];

    if (session) {
      const engine = new SyncEngine(storageService, new SyncQueue());
      result = await engine.pullAllGroups();
    } else {
      result = await storageService.getTabGroups();
    }

    // Only apply if no newer call has started since we began
    if (version === loadVersionRef.current) {
      setGroups(result);
    }
  }, [storageService]);

  // Initial load
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Listen for local storage changes (immediate UI feedback)
  useEffect(() => {
    function handleStorageChanged() {
      loadGroups();
    }
    chrome.storage.onChanged.addListener(handleStorageChanged);
    return () => chrome.storage.onChanged.removeListener(handleStorageChanged);
  }, [loadGroups]);

  // Listen for cross-view data-changed messages (sent after Supabase operations
  // complete, so profile.tabCount is up-to-date)
  useEffect(() => {
    async function handleMessage(message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        (message as { type: string }).type === 'tabvault:data-changed'
      ) {
        await loadGroups();
        const p = await getProfile();
        if (p) setProfile(p);
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [loadGroups]);

  // --- Helpers ---

  /** Refresh groups + profile, then notify other views */
  async function refreshAfterMutation() {
    await loadGroups();
    const p = await getProfile();
    if (p) setProfile(p);
    chrome.runtime.sendMessage({ type: 'tabvault:data-changed' }).catch(() => {});
  }

  // --- Handlers (all properly awaited) ---

  async function handleOpenTab(url: string) {
    await tabService?.openTab(url);
  }

  async function handleOpenGroup(groupId: string) {
    const removeAfterRestore = settings.restoreBehavior === 'remove';
    await tabService?.openGroup(groupId, removeAfterRestore);
    if (removeAfterRestore) {
      await refreshAfterMutation();
    }
  }

  async function handleDeleteTab(groupId: string, tabId: string) {
    await tabService?.deleteTab(groupId, tabId);
    await refreshAfterMutation();
  }

  async function handleDeleteGroup(groupId: string) {
    await tabService?.deleteGroup(groupId);
    await refreshAfterMutation();
  }

  async function handleRenameGroup(groupId: string, newName: string) {
    await tabService?.renameGroup(groupId, newName);
    await loadGroups();
  }

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

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    await tabService?.deleteGroups([...selectedIds]);
    setSelectedIds(new Set());
    setIsSelectMode(false);
    await refreshAfterMutation();
  }

  function handleCancelSelect() {
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }

  async function updateSettings(partial: Partial<UserSettings>) {
    await storageService.updateSettings(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  return {
    // State
    groups,
    tabService,
    settings,
    profile,
    setProfile,
    selectedIds,
    isSelectMode,
    setIsSelectMode,

    // Actions
    loadGroups,
    refreshAfterMutation,
    handleOpenTab,
    handleOpenGroup,
    handleDeleteTab,
    handleDeleteGroup,
    handleRenameGroup,
    handleToggleSelect,
    handleDeleteSelected,
    handleCancelSelect,
    updateSettings,

    // Services (exposed for popup-specific / tabs-specific logic)
    storageService,
  };
}
