// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock auth and billing modules
vi.mock('@/lib/auth', () => ({
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock('@/lib/billing', () => ({
  getCheckoutUrl: vi.fn(() => 'https://checkout.example.com'),
}));

vi.mock('@/lib/sync', () => ({
  SyncEngine: class {
    getSyncStatus = vi.fn(async () => 'synced' as const);
  },
}));

vi.mock('@/lib/sync-queue', () => ({
  SyncQueue: class {},
}));

import { SettingsPanel } from '@/components/SettingsPanel';
import type { UserSettings, UserProfile } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { SubscriptionTier } from '@/lib/constants';

const FULL_SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
};

const MOCK_PROFILE: UserProfile = {
  id: 'user-1',
  email: 'test@example.com',
  tier: SubscriptionTier.CLOUD_FREE,
  tabCount: 42,
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(overrides: {
  settings?: Partial<UserSettings>;
  profile?: UserProfile | null;
  onUpdate?: (partial: Partial<UserSettings>) => void;
  onBack?: () => void;
  onProfileChange?: (profile: UserProfile) => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
} = {}) {
  const props = {
    settings: { ...FULL_SETTINGS, ...overrides.settings },
    onUpdate: overrides.onUpdate ?? vi.fn(),
    onBack: overrides.onBack ?? vi.fn(),
    profile: overrides.profile ?? null,
    onProfileChange: overrides.onProfileChange ?? vi.fn(),
    onSignOut: overrides.onSignOut ?? vi.fn(),
    onSignIn: overrides.onSignIn ?? vi.fn(),
  };
  return { ...render(<SettingsPanel {...props} />), props };
}

describe('SettingsPanel', () => {
  it('renders Settings title and back button', () => {
    renderPanel();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByTitle('Back')).toBeTruthy();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    renderPanel({ onBack });
    fireEvent.click(screen.getByTitle('Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  describe('Saving section', () => {
    it('renders close tabs toggle checked by default', () => {
      renderPanel();
      expect(screen.getByText('Close tabs after saving')).toBeTruthy();
      const checkboxes = screen.getAllByRole('checkbox');
      // First checkbox is closeTabsAfterSaving
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    });

    it('calls onUpdate when close tabs toggle is clicked', () => {
      const onUpdate = vi.fn();
      renderPanel({ onUpdate });
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      expect(onUpdate).toHaveBeenCalledWith({ closeTabsAfterSaving: false });
    });
  });

  describe('Restoring section', () => {
    it('renders radio buttons with "keep" selected by default', () => {
      renderPanel();
      expect(screen.getByText('Keep saved group after restoring')).toBeTruthy();
      expect(screen.getByText('Remove group after restoring')).toBeTruthy();
      const radios = screen.getAllByRole('radio');
      expect((radios[0] as HTMLInputElement).checked).toBe(true);
      expect((radios[1] as HTMLInputElement).checked).toBe(false);
    });

    it('calls onUpdate when restore behavior changes', () => {
      const onUpdate = vi.fn();
      renderPanel({ onUpdate });
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[1]);
      expect(onUpdate).toHaveBeenCalledWith({ restoreBehavior: 'remove' });
    });
  });

  describe('Auto-save section', () => {
    it('renders auto-save toggle unchecked by default', () => {
      renderPanel();
      expect(screen.getByText('Auto-save open tabs')).toBeTruthy();
      const checkboxes = screen.getAllByRole('checkbox');
      // Second checkbox is autoSaveEnabled
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
    });

    it('calls onUpdate when auto-save toggle is clicked', () => {
      const onUpdate = vi.fn();
      renderPanel({ onUpdate });
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      expect(onUpdate).toHaveBeenCalledWith({ autoSaveEnabled: true });
    });

    it('renders interval dropdown disabled when auto-save is off', () => {
      renderPanel();
      const selects = screen.getAllByRole('combobox');
      // First combobox is interval dropdown
      expect((selects[0] as HTMLSelectElement).disabled).toBe(true);
    });

    it('renders interval dropdown enabled when auto-save is on', () => {
      renderPanel({ settings: { autoSaveEnabled: true } });
      const selects = screen.getAllByRole('combobox');
      expect((selects[0] as HTMLSelectElement).disabled).toBe(false);
    });

    it('calls onUpdate when interval changes', () => {
      const onUpdate = vi.fn();
      renderPanel({ settings: { autoSaveEnabled: true }, onUpdate });
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[0], { target: { value: '10' } });
      expect(onUpdate).toHaveBeenCalledWith({ autoSaveIntervalMinutes: 10 });
    });
  });

  describe('Group Names section', () => {
    it('renders format dropdown with session-datetime selected', () => {
      renderPanel();
      const selects = screen.getAllByRole('combobox');
      // Second combobox is group name format
      expect((selects[1] as HTMLSelectElement).value).toBe('session-datetime');
    });

    it('calls onUpdate when format changes', () => {
      const onUpdate = vi.fn();
      renderPanel({ onUpdate });
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[1], { target: { value: 'datetime-only' } });
      expect(onUpdate).toHaveBeenCalledWith({ groupNameFormat: 'datetime-only' });
    });
  });

  describe('Account section — logged out', () => {
    it('shows cloud backup invitation when not logged in', () => {
      renderPanel({ profile: null });
      expect(screen.getByText('Back up your tabs to the cloud')).toBeTruthy();
      expect(screen.getByText(/Add your email to protect them/)).toBeTruthy();
      expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
      expect(screen.getByText('Protect my tabs')).toBeTruthy();
    });
  });

  describe('Account section — logged in', () => {
    it('shows email and plan when logged in', () => {
      renderPanel({ profile: MOCK_PROFILE });
      expect(screen.getByText('test@example.com')).toBeTruthy();
      expect(screen.getByText(/Free plan/)).toBeTruthy();
    });

    it('shows upgrade button for free tier', () => {
      renderPanel({ profile: MOCK_PROFILE });
      expect(screen.getByText(/Upgrade to Pro/)).toBeTruthy();
    });

    it('hides upgrade button for paid tier', () => {
      renderPanel({
        profile: { ...MOCK_PROFILE, tier: SubscriptionTier.CLOUD_PAID },
      });
      expect(screen.queryByText(/Upgrade to Pro/)).toBeNull();
      expect(screen.getByText(/Pro plan/)).toBeTruthy();
    });

    it('shows sign out confirmation on click', () => {
      renderPanel({ profile: MOCK_PROFILE });
      fireEvent.click(screen.getByText('Sign out'));
      expect(screen.getByText(/Your local tabs will remain safe/)).toBeTruthy();
      expect(screen.getByText('Confirm')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('calls onSignOut when confirmed', () => {
      const onSignOut = vi.fn();
      renderPanel({ profile: MOCK_PROFILE, onSignOut });
      fireEvent.click(screen.getByText('Sign out'));
      fireEvent.click(screen.getByText('Confirm'));
      expect(onSignOut).toHaveBeenCalledOnce();
    });

    it('cancels sign out and returns to normal view', () => {
      renderPanel({ profile: MOCK_PROFILE });
      fireEvent.click(screen.getByText('Sign out'));
      fireEvent.click(screen.getByText('Cancel'));
      // Should be back to showing "Sign out" link
      expect(screen.getByText('Sign out')).toBeTruthy();
      expect(screen.queryByText('Confirm')).toBeNull();
    });
  });
});
