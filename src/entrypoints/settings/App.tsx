import { useEffect, useState } from 'react';
import { StorageService } from '../../lib/storage';
import { signOut, getProfile } from '../../lib/auth';
import type { UserSettings, UserProfile } from '../../lib/types';
import { TIER_LIMITS, SubscriptionTier } from '../../lib/constants';

const storageService = new StorageService();

export default function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    storageService.getSettings().then(setSettings);
    getProfile().then(setProfile);
  }, []);

  async function updateSetting<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) {
    await storageService.updateSettings({ [key]: value });
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  if (!settings) return <div className="p-6">Loading...</div>;

  const limit = profile ? TIER_LIMITS[profile.tier] : null;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">TabVault Settings</h1>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Auto-save</h2>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.autoSaveEnabled}
            onChange={(e) => updateSetting('autoSaveEnabled', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Automatically save tabs every 5 minutes</span>
        </label>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
          Restore Behavior
        </h2>
        <select
          className="border rounded px-3 py-2 text-sm w-full"
          value={settings.restoreBehavior}
          onChange={(e) => updateSetting('restoreBehavior', e.target.value as 'keep' | 'remove')}
        >
          <option value="keep">Keep tabs after restoring</option>
          <option value="remove">Remove tabs after restoring</option>
        </select>
      </section>

      {profile && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Account</h2>
          <p className="text-sm mb-1">Signed in as <strong>{profile.email}</strong></p>
          <p className="text-sm mb-1">
            Plan: <strong>{profile.tier === SubscriptionTier.CLOUD_PAID ? 'Pro' : 'Free'}</strong>
          </p>
          {limit !== Infinity && (
            <p className="text-sm mb-3">
              Tabs: {profile.tabCount} / {limit}
            </p>
          )}
          <button
            className="text-red-600 text-sm hover:underline"
            onClick={async () => {
              await signOut();
              setProfile(null);
            }}
          >
            Sign out
          </button>
        </section>
      )}
    </div>
  );
}
