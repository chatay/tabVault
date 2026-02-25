import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionTier } from '@/lib/constants';

/**
 * Tests for the auth module (OTP-based authentication).
 *
 * We mock getSupabase to return a fake Supabase client, then test
 * each auth function: sendOtp, verifyOtp, getSession, signOut, getProfile.
 */

// Create mock functions for the Supabase client methods
const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

// Chain: supabase.from('profiles').select(...).eq(...).single()
const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect.mockReturnValue({
    eq: mockEq.mockReturnValue({
      single: mockSingle,
    }),
  }),
});

const mockSupabaseClient = {
  auth: {
    signInWithOtp: mockSignInWithOtp,
    verifyOtp: mockVerifyOtp,
    getSession: mockGetSession,
    signOut: mockSignOut,
  },
  from: mockFrom,
};

// Mock the supabase module to return our fake client
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => mockSupabaseClient,
}));

describe('auth module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the chain mocks
    mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    });
  });

  describe('sendOtp', () => {
    it('calls signInWithOtp with email and shouldCreateUser', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      const { sendOtp } = await import('@/lib/auth');
      const result = await sendOtp('user@example.com');

      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: { shouldCreateUser: true },
      });
      expect(result).toEqual({ error: null });
    });

    it('returns error message on failure', async () => {
      mockSignInWithOtp.mockResolvedValue({
        error: { message: 'Rate limit exceeded' },
      });

      const { sendOtp } = await import('@/lib/auth');
      const result = await sendOtp('user@example.com');

      expect(result).toEqual({ error: 'Rate limit exceeded' });
    });
  });

  describe('verifyOtp', () => {
    it('calls verifyOtp with email, token, and type email', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });

      const { verifyOtp } = await import('@/lib/auth');
      const result = await verifyOtp('user@example.com', '123456');

      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        token: '123456',
        type: 'email',
      });
      expect(result).toEqual({ error: null });
    });

    it('returns error message on invalid token', async () => {
      mockVerifyOtp.mockResolvedValue({
        error: { message: 'Invalid token' },
      });

      const { verifyOtp } = await import('@/lib/auth');
      const result = await verifyOtp('user@example.com', '000000');

      expect(result).toEqual({ error: 'Invalid token' });
    });
  });

  describe('getSession', () => {
    it('returns session when user is authenticated', async () => {
      const fakeSession = {
        user: { id: 'user-123', email: 'user@example.com' },
        access_token: 'token-abc',
      };
      mockGetSession.mockResolvedValue({
        data: { session: fakeSession },
      });

      const { getSession } = await import('@/lib/auth');
      const session = await getSession();

      expect(session).toEqual(fakeSession);
    });

    it('returns null when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });

      const { getSession } = await import('@/lib/auth');
      const session = await getSession();

      expect(session).toBeNull();
    });
  });

  describe('signOut', () => {
    it('calls supabase signOut', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { signOut } = await import('@/lib/auth');
      await signOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProfile', () => {
    it('returns null when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });

      const { getProfile } = await import('@/lib/auth');
      const profile = await getProfile();

      expect(profile).toBeNull();
    });

    it('returns UserProfile when session and profile data exist', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' },
          },
        },
      });
      mockSingle.mockResolvedValue({
        data: {
          id: 'user-123',
          email: 'user@example.com',
          subscription_tier: 'cloud_free',
          tab_count: 42,
        },
      });

      const { getProfile } = await import('@/lib/auth');
      const profile = await getProfile();

      expect(profile).toEqual({
        id: 'user-123',
        email: 'user@example.com',
        tier: SubscriptionTier.CLOUD_FREE,
        tabCount: 42,
      });
      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(mockSelect).toHaveBeenCalledWith(
        'id, email, subscription_tier, tab_count',
      );
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('returns null when profile data is not found', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' },
          },
        },
      });
      mockSingle.mockResolvedValue({ data: null });

      const { getProfile } = await import('@/lib/auth');
      const profile = await getProfile();

      expect(profile).toBeNull();
    });
  });
});

describe('AuthPrompt component', () => {
  it('exports AuthPrompt component', async () => {
    const mod = await import('@/components/AuthPrompt');
    expect(mod.AuthPrompt).toBeDefined();
    expect(typeof mod.AuthPrompt).toBe('function');
  });
});
