import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Supabase mock setup ---

const mockSingle = vi.fn();
const mockEqProfiles = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelectProfiles = vi.fn().mockReturnValue({ eq: mockEqProfiles });
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFunctionsInvoke = vi.fn().mockResolvedValue({ error: null });

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: mockSelectProfiles,
        update: mockUpdate,
      };
    }
    if (table === 'abuse_flags') {
      return { insert: mockInsert };
    }
    return {};
  }),
  functions: { invoke: mockFunctionsInvoke },
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => mockSupabase,
}));

// Now import the module under test (after mocks are registered)
import { checkForAbuse } from '@/lib/abuse';
import type { AbuseCheckResult } from '@/lib/types';

// --- Chrome storage mock state ---

// The global setup.ts provides chrome.storage.local, but we need to
// control it precisely per test. We'll use the real mock from setup.ts
// and just clear storage between tests (which setup.ts already does).

const SAVE_WINDOW_MS = 2 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is not blocked
  mockSingle.mockResolvedValue({ data: { ai_blocked: false }, error: null });
});

/**
 * Seed chrome.storage.local with prior save timestamps for a user.
 */
async function seedTimestamps(userId: string, timestamps: number[]) {
  const key = `save_timestamps_${userId}`;
  await chrome.storage.local.set({ [key]: timestamps });
}

/**
 * Read stored timestamps back from chrome.storage.local.
 */
async function getStoredTimestamps(userId: string): Promise<number[]> {
  const key = `save_timestamps_${userId}`;
  const stored = await chrome.storage.local.get(key);
  return stored[key] || [];
}

// ─── Test Group 1 — Save frequency tracker ───

describe('Save frequency tracker', () => {
  it('first save ever returns count of 1 (normal)', async () => {
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
    const ts = await getStoredTimestamps('user-1');
    expect(ts).toHaveLength(1);
  });

  it('2 saves within 2 minutes returns normal', async () => {
    await seedTimestamps('user-1', [Date.now() - 30_000]); // 30s ago
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
    const ts = await getStoredTimestamps('user-1');
    expect(ts).toHaveLength(2);
  });

  it('5 saves within 2 minutes triggers blocked', async () => {
    const now = Date.now();
    // Seed 4 recent saves, this call will be the 5th
    await seedTimestamps('user-1', [
      now - 90_000,
      now - 60_000,
      now - 30_000,
      now - 10_000,
    ]);
    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
  });

  it('a save from 3 minutes ago is not counted', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [now - 3 * 60 * 1000]); // 3 min ago
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
    const ts = await getStoredTimestamps('user-1');
    // Old timestamp pruned, only the new one remains
    expect(ts).toHaveLength(1);
  });

  it('a save from exactly 2 minutes ago is not counted', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [now - SAVE_WINDOW_MS]); // exactly 2 min
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
    const ts = await getStoredTimestamps('user-1');
    expect(ts).toHaveLength(1);
  });

  it('old timestamps are cleaned up and not stored', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [
      now - 5 * 60_000, // 5 min ago — should be pruned
      now - 4 * 60_000, // 4 min ago — should be pruned
      now - 30_000,      // 30s ago — recent, kept
    ]);
    await checkForAbuse('user-1');
    const ts = await getStoredTimestamps('user-1');
    // Only the 30s-ago + the new one
    expect(ts).toHaveLength(2);
  });
});

// ─── Test Group 2 — isPermanentlyBlocked ───

describe('isPermanentlyBlocked', () => {
  it('returns blocked when ai_blocked is true in Supabase', async () => {
    mockSingle.mockResolvedValueOnce({ data: { ai_blocked: true }, error: null });
    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
    // Should not have recorded a save timestamp
    const ts = await getStoredTimestamps('user-1');
    expect(ts).toHaveLength(0);
  });

  it('returns normal when ai_blocked is false', async () => {
    mockSingle.mockResolvedValueOnce({ data: { ai_blocked: false }, error: null });
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
  });

  it('returns normal when Supabase is unavailable', async () => {
    mockSingle.mockRejectedValueOnce(new Error('Network error'));
    // getSupabase itself throws — we need to mock that
    // Actually, isPermanentlyBlocked catches internally, so this exercises
    // the case where .single() rejects
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
  });

  it('returns normal when user does not exist', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
  });
});

// ─── Test Group 3 — checkForAbuse main function ───

describe('checkForAbuse', () => {
  it('already blocked user returns blocked immediately with no save recorded', async () => {
    mockSingle.mockResolvedValueOnce({ data: { ai_blocked: true }, error: null });
    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
    // No save timestamp was recorded
    const ts = await getStoredTimestamps('user-1');
    expect(ts).toHaveLength(0);
    // No insert to abuse_flags or update to profiles
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('1 save in 2 minutes returns normal', async () => {
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
  });

  it('2 saves in 2 minutes returns normal', async () => {
    await seedTimestamps('user-1', [Date.now() - 10_000]);
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
  });

  it('3 saves in 2 minutes returns flagged with abuse_flags row', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [now - 60_000, now - 30_000]);
    const result = await checkForAbuse('user-1');
    expect(result).toBe('flagged');
    // abuse_flags insert called with status 'flagged'
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        saves_in_last_2_minutes: 3,
        status: 'flagged',
      }),
    );
    // profiles.ai_blocked NOT updated
    expect(mockUpdate).not.toHaveBeenCalled();
    // No owner email
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('4 saves in 2 minutes returns flagged', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [now - 90_000, now - 60_000, now - 30_000]);
    const result = await checkForAbuse('user-1');
    expect(result).toBe('flagged');
  });

  it('5 saves in 2 minutes returns blocked with DB writes and email', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [
      now - 90_000,
      now - 60_000,
      now - 30_000,
      now - 10_000,
    ]);
    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
    // profiles.ai_blocked set to true
    expect(mockUpdate).toHaveBeenCalledWith({ ai_blocked: true });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1');
    // abuse_flags row with status 'blocked'
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        saves_in_last_2_minutes: 5,
        status: 'blocked',
      }),
    );
    // Owner email notification triggered
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'notify-owner-blocked-user',
      expect.objectContaining({
        body: expect.objectContaining({
          userId: 'user-1',
          savesInWindow: 5,
        }),
      }),
    );
  });

  it('10 saves in 2 minutes returns blocked', async () => {
    const now = Date.now();
    const timestamps = Array.from({ length: 9 }, (_, i) =>
      now - (9 - i) * 10_000,
    );
    await seedTimestamps('user-1', timestamps);
    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
  });
});

// ─── Test Group 4 — Supabase unavailable ───

describe('Supabase unavailable', () => {
  it('returns normal if Supabase is down during isPermanentlyBlocked', async () => {
    mockSingle.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await checkForAbuse('user-1');
    expect(result).toBe('normal');
  });

  it('does not crash if Supabase is down during blockUserPermanently', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [
      now - 90_000,
      now - 60_000,
      now - 30_000,
      now - 10_000,
    ]);
    // isPermanentlyBlocked succeeds (not blocked)
    mockSingle.mockResolvedValueOnce({ data: { ai_blocked: false }, error: null });
    // But the update call during block fails
    mockUpdateEq.mockRejectedValueOnce(new Error('DB down'));

    // Should still return blocked (the decision is local), just the DB write fails silently
    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
  });

  it('block is still written to database even if Edge Function fails', async () => {
    const now = Date.now();
    await seedTimestamps('user-1', [
      now - 90_000,
      now - 60_000,
      now - 30_000,
      now - 10_000,
    ]);
    mockSingle.mockResolvedValueOnce({ data: { ai_blocked: false }, error: null });
    // Edge function fails
    mockFunctionsInvoke.mockRejectedValueOnce(new Error('Function timeout'));

    const result = await checkForAbuse('user-1');
    expect(result).toBe('blocked');
    // DB write still happened before the edge function call
    expect(mockUpdate).toHaveBeenCalledWith({ ai_blocked: true });
    expect(mockInsert).toHaveBeenCalled();
  });
});
