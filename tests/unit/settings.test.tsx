// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Hoist mock functions so they are available when vi.mock factories run
const { mockGetSettings, mockUpdateSettings, mockSignOut, mockGetProfile } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetProfile: vi.fn(),
}));

// Mock storage module
vi.mock('@/lib/storage', () => ({
  StorageService: class {
    getSettings = mockGetSettings;
    updateSettings = mockUpdateSettings;
  },
}));

// Mock auth module
vi.mock('@/lib/auth', () => ({
  signOut: mockSignOut,
  getProfile: mockGetProfile,
}));

import App from '@/entrypoints/settings/App';
import type { UserSettings, UserProfile } from '@/lib/types';
import { SubscriptionTier } from '@/lib/constants';

const DEFAULT_SETTINGS: UserSettings = {
  autoSaveEnabled: false,
  restoreBehavior: 'keep',
  hasSeenCloudPrompt: false,
  hasDismissedCloudPrompt: false,
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
  mockGetSettings.mockResolvedValue(DEFAULT_SETTINGS);
  mockGetProfile.mockResolvedValue(null);
  mockUpdateSettings.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
});

describe('Settings App', () => {
  it('renders loading state initially', () => {
    // Never-resolving promise to keep in loading state
    mockGetSettings.mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders auto-save checkbox after settings load', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Automatically save tabs every 5 minutes')).toBeTruthy();
    });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeTruthy();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('renders auto-save checkbox checked when autoSaveEnabled is true', async () => {
    mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, autoSaveEnabled: true });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeTruthy();
    });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('toggles auto-save and calls updateSettings', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeTruthy();
    });
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ autoSaveEnabled: true });
  });

  it('renders restore behavior dropdown', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('keep');
    expect(screen.getByText('Keep tabs after restoring')).toBeTruthy();
    expect(screen.getByText('Remove tabs after restoring')).toBeTruthy();
  });

  it('changes restore behavior and calls updateSettings', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'remove' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ restoreBehavior: 'remove' });
  });

  it('shows account section when profile exists', async () => {
    mockGetProfile.mockResolvedValue(MOCK_PROFILE);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeTruthy();
    });
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText(/42/)).toBeTruthy();
    expect(screen.getByText(/75/)).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('shows Pro plan label for paid tier', async () => {
    mockGetProfile.mockResolvedValue({
      ...MOCK_PROFILE,
      tier: SubscriptionTier.CLOUD_PAID,
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Pro')).toBeTruthy();
    });
  });

  it('hides account section when no profile', async () => {
    mockGetProfile.mockResolvedValue(null);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('TabVault Settings')).toBeTruthy();
    });
    expect(screen.queryByText('Sign out')).toBeNull();
    expect(screen.queryByText('Account')).toBeNull();
  });

  it('sign out button calls signOut and clears profile', async () => {
    mockGetProfile.mockResolvedValue(MOCK_PROFILE);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Sign out')).toBeTruthy();
    });
    const signOutButton = screen.getByText('Sign out');
    fireEvent.click(signOutButton);
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
    // After sign out, account section should disappear
    await waitFor(() => {
      expect(screen.queryByText('test@example.com')).toBeNull();
    });
  });

  it('does not show tab count for unlimited (paid) tier', async () => {
    mockGetProfile.mockResolvedValue({
      ...MOCK_PROFILE,
      tier: SubscriptionTier.CLOUD_PAID,
      tabCount: 200,
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Pro')).toBeTruthy();
    });
    // Infinity limit means no "Tabs: X / Y" display
    expect(screen.queryByText(/200 \//)).toBeNull();
  });
});
