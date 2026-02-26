import { useState } from 'react';
import type { UserSettings, UserProfile } from '../lib/types';
import { SubscriptionTier, CLOUD_FREE_TAB_LIMIT } from '../lib/constants';
import { sendOtp, verifyOtp } from '../lib/auth';
import { getCheckoutUrl } from '../lib/billing';
import { SyncStatusIndicator } from './SyncStatus';

interface SettingsPanelProps {
  settings: UserSettings;
  onUpdate: (partial: Partial<UserSettings>) => void;
  onBack: () => void;
  profile: UserProfile | null;
  onSignOut: () => void;
  onSignIn: () => void;
}

export function SettingsPanel({
  settings,
  onUpdate,
  onBack,
  profile,
  onSignOut,
  onSignIn,
}: SettingsPanelProps) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          onClick={onBack}
          title="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Section 1 — Saving */}
      <div className="bg-white rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Saving</h2>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.closeTabsAfterSaving}
            onChange={(e) => onUpdate({ closeTabsAfterSaving: e.target.checked })}
            className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
          />
          <span className="text-sm text-gray-700">Close tabs after saving</span>
        </label>
      </div>

      {/* Section 2 — Restoring */}
      <div className="bg-white rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Restoring</h2>
        <div className="space-y-1">
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="radio"
              name="restoreBehavior"
              value="keep"
              checked={settings.restoreBehavior === 'keep'}
              onChange={() => onUpdate({ restoreBehavior: 'keep' })}
              className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
            />
            <span className="text-sm text-gray-700">Keep saved group after restoring</span>
          </label>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="radio"
              name="restoreBehavior"
              value="remove"
              checked={settings.restoreBehavior === 'remove'}
              onChange={() => onUpdate({ restoreBehavior: 'remove' })}
              className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
            />
            <span className="text-sm text-gray-700">Remove group after restoring</span>
          </label>
        </div>
      </div>

      {/* Section 3 — Auto-save */}
      <div className="bg-white rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Auto-save</h2>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoSaveEnabled}
            onChange={(e) => onUpdate({ autoSaveEnabled: e.target.checked })}
            className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
          />
          <span className="text-sm text-gray-700">Auto-save open tabs</span>
        </label>
        <div className="mt-3">
          <select
            className="border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm w-full disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="bg-white rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Group Names</h2>
        <select
          className="border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm w-full"
          value={settings.groupNameFormat}
          onChange={(e) => onUpdate({ groupNameFormat: e.target.value as 'session-datetime' | 'datetime-only' })}
        >
          <option value="session-datetime">Session - Jan 1, 3:30 PM</option>
          <option value="datetime-only">Jan 1, 3:30 PM</option>
        </select>
      </div>

      {/* Section 5 — Account */}
      <div className="bg-[#EFF6FF] rounded-xl p-4 mb-3 border border-[#BFDBFE]">
        <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-3">Account</h2>
        {profile ? (
          <AccountLoggedIn profile={profile} onSignOut={onSignOut} />
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
  onSignOut,
}: {
  profile: UserProfile;
  onSignOut: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const planLabel =
    profile.tier === SubscriptionTier.CLOUD_PAID
      ? 'Pro plan — unlimited tabs'
      : `Free plan — ${CLOUD_FREE_TAB_LIMIT} tabs`;

  const showUpgrade = profile.tier === SubscriptionTier.CLOUD_FREE;

  async function handleUpgrade() {
    const url = getCheckoutUrl();
    if (url) await chrome.tabs.create({ url });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-gray-700">{profile.email}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Sync:</span>
        <SyncStatusIndicator />
      </div>

      <div>
        <p className="text-sm text-gray-600">{planLabel}</p>
      </div>

      {showUpgrade && (
        <button
          className="w-full bg-blue-600 text-white text-sm font-medium px-4 min-h-[44px] rounded-lg hover:bg-blue-700 transition-colors"
          onClick={handleUpgrade}
        >
          Upgrade to Pro — $3/month
        </button>
      )}

      {!showConfirm ? (
        <button
          className="text-xs text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] transition-colors"
          onClick={() => setShowConfirm(true)}
        >
          Sign out
        </button>
      ) : (
        <div className="pt-1">
          <p className="text-xs text-gray-500 mb-2">Sign out? Your local tabs will remain safe.</p>
          <div className="flex items-center gap-3">
            <button
              className="text-xs text-red-600 hover:text-red-800 min-h-[44px] min-w-[44px] transition-colors"
              onClick={onSignOut}
            >
              Confirm
            </button>
            <button
              className="text-xs text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] transition-colors"
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

// --- Account State 1: Logged Out (with OTP sub-states) ---

function AccountLoggedOut({ onSignIn }: { onSignIn: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    const result = await sendOtp(trimmed);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setStep('code');
    }
  }

  async function handleResendCode() {
    setLoading(true);
    setError(null);
    const result = await sendOtp(email.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  }

  async function handleVerifyCode() {
    if (code.length !== 8) return;
    setLoading(true);
    setError(null);
    const result = await verifyOtp(email.trim(), code.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      onSignIn();
    }
  }

  function handleUseDifferentEmail() {
    setStep('email');
    setCode('');
    setError(null);
  }

  if (step === 'code') {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          We sent an 8-digit code to <strong>{email.trim()}</strong>
        </p>
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm tracking-widest text-center mb-3"
          placeholder="00000000"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
          autoFocus
        />
        <button
          className="w-full bg-blue-600 text-white text-sm font-medium px-4 min-h-[44px] rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          onClick={handleVerifyCode}
          disabled={loading || code.length !== 8}
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <button
            className="text-xs text-blue-600 hover:text-blue-800 min-h-[44px] transition-colors"
            onClick={handleResendCode}
            disabled={loading}
          >
            Resend code
          </button>
          <button
            className="text-xs text-gray-500 hover:text-gray-700 min-h-[44px] transition-colors"
            onClick={handleUseDifferentEmail}
          >
            Use a different email
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {/* Cloud icon */}
      <div className="flex justify-center mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-blue-400">
          <path fillRule="evenodd" d="M4.5 9.75a6 6 0 0111.573-2.226 3.75 3.75 0 014.133 4.303A4.5 4.5 0 0118 20.25H6.75a5.25 5.25 0 01-2.23-10.004 6.072 6.072 0 01-.02-.496z" clipRule="evenodd" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-[#1e3a5f] text-center mb-1">
        Back up your tabs to the cloud
      </h3>
      <p className="text-xs text-gray-500 text-center mb-4">
        Your tabs are saved on this device only. Add your email to protect them — free for up to 75 tabs.
      </p>
      <input
        type="email"
        className="w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm mb-3"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
      />
      <button
        className="w-full bg-blue-600 text-white text-sm font-medium px-4 min-h-[44px] rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        onClick={handleSendCode}
        disabled={loading || !email.trim()}
      >
        {loading ? 'Sending...' : 'Protect my tabs'}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
