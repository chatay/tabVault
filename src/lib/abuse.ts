import { getSupabase } from './supabase';
import { ABUSE_THRESHOLDS, ABUSE_CHECK_RESULT } from './constants';
import type { AbuseCheckResult } from './types';

async function recordSaveAndGetCount(userId: string): Promise<number> {
  const key = `save_timestamps_${userId}`;
  const stored = await chrome.storage.local.get(key);
  const timestamps: number[] = stored[key] || [];
  const now = Date.now();

  const recent = timestamps.filter(t => now - t < ABUSE_THRESHOLDS.WINDOW_MS);
  recent.push(now);

  await chrome.storage.local.set({ [key]: recent });
  return recent.length;
}

async function isPermanentlyBlocked(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const { data } = await supabase
      .from('profiles')
      .select('ai_blocked')
      .eq('id', userId)
      .single();

    return data?.ai_blocked === true;
  } catch {
    return false;
  }
}

async function blockUserPermanently(
  userId: string,
  savesInWindow: number,
): Promise<void> {
  try {
    const supabase = getSupabase();

    await supabase
      .from('profiles')
      .update({ ai_blocked: true })
      .eq('id', userId);

    await supabase
      .from('abuse_flags')
      .insert({
        user_id: userId,
        saves_in_last_2_minutes: savesInWindow,
        status: ABUSE_CHECK_RESULT.BLOCKED,
      });

    await supabase.functions.invoke('notify-owner-blocked-user', {
      body: {
        userId,
        savesInWindow,
        triggeredAt: new Date().toISOString(),
      },
    });
  } catch {
    // Fail silently — block was best-effort
  }
}

async function flagUserForReview(
  userId: string,
  savesInWindow: number,
): Promise<void> {
  try {
    const supabase = getSupabase();

    await supabase
      .from('abuse_flags')
      .insert({
        user_id: userId,
        saves_in_last_2_minutes: savesInWindow,
        status: ABUSE_CHECK_RESULT.FLAGGED,
      });
  } catch {
    // Fail silently
  }
}

export async function checkForAbuse(
  userId: string,
): Promise<AbuseCheckResult> {
  const blocked = await isPermanentlyBlocked(userId);
  if (blocked) return ABUSE_CHECK_RESULT.BLOCKED;

  const savesInWindow = await recordSaveAndGetCount(userId);

  if (savesInWindow >= ABUSE_THRESHOLDS.BLOCK_AT) {
    await blockUserPermanently(userId, savesInWindow);
    return ABUSE_CHECK_RESULT.BLOCKED;
  }

  if (savesInWindow >= ABUSE_THRESHOLDS.FLAG_AT) {
    await flagUserForReview(userId, savesInWindow);
    return ABUSE_CHECK_RESULT.FLAGGED;
  }

  return ABUSE_CHECK_RESULT.NORMAL;
}
