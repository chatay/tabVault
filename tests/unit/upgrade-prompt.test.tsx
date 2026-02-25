// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { UpgradePrompt } from '@/components/UpgradePrompt';

// Mock auth so the billing module import chain works
vi.mock('@/lib/auth', () => ({
  getProfile: vi.fn(async () => null),
}));

// Mock getCheckoutUrl to return a known URL
const MOCK_CHECKOUT_URL = 'https://checkout.lemonsqueezy.com/test';
vi.mock('@/lib/billing', () => ({
  getCheckoutUrl: vi.fn(() => MOCK_CHECKOUT_URL),
}));

// Ensure chrome.tabs.create exists as a mock (setup.ts sets chrome.storage but not chrome.tabs)
beforeEach(() => {
  cleanup();
  // Preserve existing chrome mocks (storage etc.) and add tabs.create
  (globalThis as Record<string, unknown>).chrome = {
    ...(globalThis as Record<string, Record<string, unknown>>).chrome,
    tabs: {
      create: vi.fn(),
    },
  };
});

describe('UpgradePrompt component', () => {
  it('renders the tab count in the message', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    expect(screen.getByText(/50/)).toBeTruthy();
  });

  it('renders the free tab limit (75) in the message', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    expect(screen.getByText(/75/)).toBeTruthy();
  });

  it('displays the correct message with both tab count and limit', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    expect(
      screen.getByText("You've saved 50 of 75 free cloud tabs!"),
    ).toBeTruthy();
  });

  it('displays the upgrade pricing copy', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    expect(
      screen.getByText(/Upgrade to unlimited cloud backup for \$3\/month/),
    ).toBeTruthy();
  });

  it('renders an Upgrade button', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    expect(screen.getByText('Upgrade')).toBeTruthy();
  });

  it('renders a Not now button', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('opens the checkout URL in a new tab when Upgrade is clicked', () => {
    render(<UpgradePrompt tabCount={50} onDismiss={vi.fn()} />);
    const upgradeButton = screen.getByText('Upgrade');
    fireEvent.click(upgradeButton);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: MOCK_CHECKOUT_URL,
    });
  });

  it('calls onDismiss when Not now is clicked', () => {
    const mockDismiss = vi.fn();
    render(<UpgradePrompt tabCount={50} onDismiss={mockDismiss} />);
    const dismissButton = screen.getByText('Not now');
    fireEvent.click(dismissButton);
    expect(mockDismiss).toHaveBeenCalledOnce();
  });

  it('reflects different tab counts in the rendered output', () => {
    render(<UpgradePrompt tabCount={73} onDismiss={vi.fn()} />);
    expect(
      screen.getByText("You've saved 73 of 75 free cloud tabs!"),
    ).toBeTruthy();
  });
});
