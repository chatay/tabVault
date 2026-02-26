import { getSupabase } from './supabase';
import { clearCachedKey } from './crypto';
import type { UserProfile } from './types';
import { SubscriptionTier } from './constants';

export async function sendOtp(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return { error: error?.message ?? null };
}

export async function verifyOtp(
  email: string,
  token: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { error: error?.message ?? null };
}

export async function getSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session?.user?.id) {
    await clearCachedKey(session.user.id);
  }
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

export async function getProfile(): Promise<UserProfile | null> {
  const session = await getSession();
  if (!session) return null;

  const supabase = getSupabase();
  const { data } = await supabase
    .from('profiles')
    .select('id, email, subscription_tier, tab_count')
    .eq('id', session.user.id)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    tier: data.subscription_tier as SubscriptionTier,
    tabCount: data.tab_count,
  };
}
