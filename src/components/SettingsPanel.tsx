import { useState } from 'react';
import type { UserSettings, UserProfile } from '../lib/types';
import { SubscriptionTier, CLOUD_FREE_TAB_LIMIT } from '../lib/constants';
import { getSupabase } from '../lib/supabase';
// import { getCheckoutUrl } from '../lib/billing'; // TODO: Re-enable for real payments
import { SyncStatusIndicator } from './SyncStatus';
import { OtpAuthFlow } from './OtpAuthFlow';

interface SettingsPanelProps {
  settings: UserSettings;
  onUpdate: (partial: Partial<UserSettings>) => void;
  onBack: () => void;
  profile: UserProfile | null;
  onProfileChange: (profile: UserProfile) => void;
  onSignOut: () => void;
  onSignIn: () => void;
}

export function SettingsPanel({
  settings,
  onUpdate,
  onBack,
  profile,
  onProfileChange,
  onSignOut,
  onSignIn,
}: SettingsPanelProps) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          onClick={onBack}
          title="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Settings</h1>
      </div>

      {/* Section 1 — Saving */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Saving</h2>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.closeTabsAfterSaving}
            onChange={(e) => onUpdate({ closeTabsAfterSaving: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer shrink-0"
          />
          <span className="text-sm text-[var(--text-secondary)]">Close tabs after saving</span>
        </label>
      </div>

      {/* Section 2 — Restoring */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Restoring</h2>
        <div className="space-y-1">
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="radio"
              name="restoreBehavior"
              value="keep"
              checked={settings.restoreBehavior === 'keep'}
              onChange={() => onUpdate({ restoreBehavior: 'keep' })}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer shrink-0"
            />
            <span className="text-sm text-[var(--text-secondary)]">Keep saved group after restoring</span>
          </label>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="radio"
              name="restoreBehavior"
              value="remove"
              checked={settings.restoreBehavior === 'remove'}
              onChange={() => onUpdate({ restoreBehavior: 'remove' })}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer shrink-0"
            />
            <span className="text-sm text-[var(--text-secondary)]">Remove group after restoring</span>
          </label>
        </div>
      </div>

      {/* Section 3 — Auto-save */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Auto-save</h2>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoSaveEnabled}
            onChange={(e) => onUpdate({ autoSaveEnabled: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer shrink-0"
          />
          <span className="text-sm text-[var(--text-secondary)]">Auto-save open tabs</span>
        </label>
        <div className="mt-3">
          <select
            className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 min-h-[44px] text-sm w-full disabled:opacity-40 disabled:cursor-not-allowed"
            value={settings.autoSaveIntervalMinutes}
            onChange={(e) => onUpdate({ autoSaveIntervalMinutes: Number(e.target.value) as 5 | 10 | 15 })}
            disabled={!settings.autoSaveEnabled}
          >
            <option value={5}>Every 5 minutes</option>
            <option value={10}>Every 10 minutes</option>
            <option value={15}>Every 15 minutes</option>
          </select>
        </div>
      </div>

      {/* Section 4 — Group Names */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Group Names</h2>
        <select
          className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 min-h-[44px] text-sm w-full"
          value={settings.groupNameFormat}
          onChange={(e) => onUpdate({ groupNameFormat: e.target.value as 'session-datetime' | 'datetime-only' })}
        >
          <option value="session-datetime">Session - Jan 1, 3:30 PM</option>
          <option value="datetime-only">Jan 1, 3:30 PM</option>
        </select>
      </div>

      {/* Section 5 — Account */}
      <div className="bg-[var(--accent-soft)] rounded-xl p-4 mb-3 border border-[var(--accent)] border-opacity-30">
        <h2 className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide mb-3">Account</h2>
        {profile ? (
          <AccountLoggedIn profile={profile} onProfileChange={onProfileChange} onSignOut={onSignOut} />
        ) : (
          <AccountLoggedOut onSignIn={onSignIn} />
        )}
      </div>
    </div>
  );
}

// --- Account State 2: Logged In ---

function AccountLoggedIn({
  profile,
  onProfileChange,
  onSignOut,
}: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onSignOut: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const planLabel =
    profile.tier === SubscriptionTier.CLOUD_PAID
      ? 'Pro plan — unlimited tabs'
      : `Free plan — ${CLOUD_FREE_TAB_LIMIT} tabs`;

  const showUpgrade = profile.tier === SubscriptionTier.CLOUD_FREE;

  async function handleUpgrade() {
    const supabase = getSupabase();
    await supabase
      .from('profiles')
      .update({ subscription_tier: SubscriptionTier.CLOUD_PAID })
      .eq('id', profile.id);
    onProfileChange({ ...profile, tier: SubscriptionTier.CLOUD_PAID });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-[var(--text-primary)]">{profile.email}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">Sync:</span>
        <SyncStatusIndicator />
      </div>

      <div>
        <p className="text-sm text-[var(--text-secondary)]">{planLabel}</p>
      </div>

      {showUpgrade && (
        <button
          className="w-full bg-[var(--accent)] text-white text-sm font-medium px-4 min-h-[44px] rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          onClick={handleUpgrade}
        >
          Upgrade to Pro — $3/month
        </button>
      )}

      {!showConfirm ? (
        <button
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] min-h-[44px] min-w-[44px] transition-colors"
          onClick={() => setShowConfirm(true)}
        >
          Sign out
        </button>
      ) : (
        <div className="pt-1">
          <p className="text-xs text-[var(--text-muted)] mb-2">Sign out? Your local tabs will remain safe.</p>
          <div className="flex items-center gap-3">
            <button
              className="text-xs text-[var(--red)] hover:opacity-80 min-h-[44px] min-w-[44px] transition-colors"
              onClick={onSignOut}
            >
              Confirm
            </button>
            <button
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] min-h-[44px] min-w-[44px] transition-colors"
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Account State 1: Logged Out (uses shared OTP flow) ---

function AccountLoggedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div>
      {/* Cloud icon */}
      <div className="flex justify-center mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-[var(--accent)]">
          <path fillRule="evenodd" d="M4.5 9.75a6 6 0 0111.573-2.226 3.75 3.75 0 014.133 4.303A4.5 4.5 0 0118 20.25H6.75a5.25 5.25 0 01-2.23-10.004 6.072 6.072 0 01-.02-.496z" clipRule="evenodd" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-[var(--text-primary)] text-center mb-1">
        Back up your tabs to the cloud
      </h3>
      <OtpAuthFlow
        onSuccess={onSignIn}
        submitLabel="Protect my tabs"
        description="Your tabs are saved on this device only. Add your email to protect them — free for up to 75 tabs."
        variant="full"
      />
    </div>
  );
}
