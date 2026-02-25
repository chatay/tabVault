import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionTier } from '@/lib/constants';
import type { UserProfile } from '@/lib/types';

// Mock auth module
const mockGetProfile = vi.fn<() => Promise<UserProfile | null>>();
vi.mock('@/lib/auth', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...(args as [])),
}));

// Helper to create a UserProfile
function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    email: 'test@example.com',
    tier: SubscriptionTier.CLOUD_FREE,
    tabCount: 0,
    ...overrides,
  };
}

describe('billing', () => {
  beforeEach(() => {
    mockGetProfile.mockReset();
  });

  describe('isTabLimitReached', () => {
    it('returns false when no profile (not logged in)', async () => {
      mockGetProfile.mockResolvedValue(null);
      const { isTabLimitReached } = await import('@/lib/billing');
      expect(await isTabLimitReached()).toBe(false);
    });

    it('returns true when CLOUD_FREE user is at the limit', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_FREE, tabCount: 75 }),
      );
      const { isTabLimitReached } = await import('@/lib/billing');
      expect(await isTabLimitReached()).toBe(true);
    });

    it('returns true when CLOUD_FREE user is above the limit', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_FREE, tabCount: 100 }),
      );
      const { isTabLimitReached } = await import('@/lib/billing');
      expect(await isTabLimitReached()).toBe(true);
    });

    it('returns false when CLOUD_FREE user is below the limit', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_FREE, tabCount: 50 }),
      );
      const { isTabLimitReached } = await import('@/lib/billing');
      expect(await isTabLimitReached()).toBe(false);
    });

    it('returns false for CLOUD_PAID user (unlimited)', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_PAID, tabCount: 500 }),
      );
      const { isTabLimitReached } = await import('@/lib/billing');
      expect(await isTabLimitReached()).toBe(false);
    });

    it('returns false for LOCAL_ONLY user (unlimited)', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.LOCAL_ONLY, tabCount: 1000 }),
      );
      const { isTabLimitReached } = await import('@/lib/billing');
      expect(await isTabLimitReached()).toBe(false);
    });
  });

  describe('getRemainingTabs', () => {
    it('returns Infinity when no profile (not logged in)', async () => {
      mockGetProfile.mockResolvedValue(null);
      const { getRemainingTabs } = await import('@/lib/billing');
      expect(await getRemainingTabs()).toBe(Infinity);
    });

    it('returns remaining count for CLOUD_FREE with 50 tabs', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_FREE, tabCount: 50 }),
      );
      const { getRemainingTabs } = await import('@/lib/billing');
      expect(await getRemainingTabs()).toBe(25);
    });

    it('returns 0 for CLOUD_FREE at the limit', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_FREE, tabCount: 75 }),
      );
      const { getRemainingTabs } = await import('@/lib/billing');
      expect(await getRemainingTabs()).toBe(0);
    });

    it('returns 0 for CLOUD_FREE above the limit', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_FREE, tabCount: 80 }),
      );
      const { getRemainingTabs } = await import('@/lib/billing');
      expect(await getRemainingTabs()).toBe(0);
    });

    it('returns Infinity for CLOUD_PAID user', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.CLOUD_PAID, tabCount: 500 }),
      );
      const { getRemainingTabs } = await import('@/lib/billing');
      expect(await getRemainingTabs()).toBe(Infinity);
    });

    it('returns Infinity for LOCAL_ONLY user', async () => {
      mockGetProfile.mockResolvedValue(
        makeProfile({ tier: SubscriptionTier.LOCAL_ONLY, tabCount: 10 }),
      );
      const { getRemainingTabs } = await import('@/lib/billing');
      expect(await getRemainingTabs()).toBe(Infinity);
    });
  });

  describe('getCheckoutUrl', () => {
    it('returns empty string when env var is not set', async () => {
      const { getCheckoutUrl } = await import('@/lib/billing');
      expect(getCheckoutUrl()).toBe('');
    });
  });
});
