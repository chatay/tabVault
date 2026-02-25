import { getProfile } from './auth';
import { TIER_LIMITS, SubscriptionTier } from './constants';

export async function isTabLimitReached(): Promise<boolean> {
  const profile = await getProfile();
  if (!profile) return false; // not logged in = local only = no limit

  const limit = TIER_LIMITS[profile.tier];
  return profile.tabCount >= limit;
}

export async function getRemainingTabs(): Promise<number> {
  const profile = await getProfile();
  if (!profile) return Infinity; // not logged in = no limit

  const limit = TIER_LIMITS[profile.tier];
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - profile.tabCount);
}

export function getCheckoutUrl(): string {
  return import.meta.env.WXT_LEMONSQUEEZY_CHECKOUT_URL || '';
}
