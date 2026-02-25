import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the Supabase client module.
 *
 * We test:
 * 1. chromeStorageAdapter: getItem, setItem, removeItem using chrome.storage.local
 * 2. getSupabase: singleton behavior, env validation, correct options
 */

// We need to mock @supabase/supabase-js before importing our module
const mockCreateClient = vi.fn().mockReturnValue({ auth: {} });

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

// Mock import.meta.env
const originalEnv = { ...import.meta.env };

describe('supabase client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module singleton between tests
    vi.resetModules();
    // Reset env
    import.meta.env.WXT_SUPABASE_URL = 'https://test-project.supabase.co';
    import.meta.env.WXT_SUPABASE_ANON_KEY = 'test-anon-key-1234';
  });

  describe('chromeStorageAdapter', () => {
    it('getItem returns value from chrome.storage.local', async () => {
      // Pre-populate chrome storage
      await chrome.storage.local.set({ 'sb-token': 'my-jwt-token' });

      // Import the module to access the adapter through getSupabase
      const { getSupabase } = await import('@/lib/supabase');
      getSupabase();

      // Verify createClient was called with a storage adapter
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      const options = mockCreateClient.mock.calls[0][2];
      const storage = options.auth.storage;

      // Test getItem
      const value = await storage.getItem('sb-token');
      expect(value).toBe('my-jwt-token');
    });

    it('getItem returns null for missing keys', async () => {
      const { getSupabase } = await import('@/lib/supabase');
      getSupabase();

      const options = mockCreateClient.mock.calls[0][2];
      const storage = options.auth.storage;

      const value = await storage.getItem('nonexistent-key');
      expect(value).toBeNull();
    });

    it('setItem stores value in chrome.storage.local', async () => {
      const { getSupabase } = await import('@/lib/supabase');
      getSupabase();

      const options = mockCreateClient.mock.calls[0][2];
      const storage = options.auth.storage;

      await storage.setItem('session-key', 'session-data');

      // Verify it was stored
      const result = await chrome.storage.local.get('session-key');
      expect(result['session-key']).toBe('session-data');
    });

    it('removeItem removes value from chrome.storage.local', async () => {
      // Pre-populate
      await chrome.storage.local.set({ 'old-token': 'expired' });

      const { getSupabase } = await import('@/lib/supabase');
      getSupabase();

      const options = mockCreateClient.mock.calls[0][2];
      const storage = options.auth.storage;

      await storage.removeItem('old-token');

      // Verify it was removed
      const result = await chrome.storage.local.get('old-token');
      expect(result['old-token']).toBeUndefined();
    });
  });

  describe('getSupabase', () => {
    it('creates client with correct URL and anon key', async () => {
      const { getSupabase } = await import('@/lib/supabase');
      getSupabase();

      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://test-project.supabase.co',
        'test-anon-key-1234',
        expect.objectContaining({
          auth: expect.objectContaining({
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
            flowType: 'pkce',
          }),
        }),
      );
    });

    it('returns singleton (same instance on second call)', async () => {
      const { getSupabase } = await import('@/lib/supabase');
      const first = getSupabase();
      const second = getSupabase();

      expect(first).toBe(second);
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
    });

    it('throws if WXT_SUPABASE_URL is missing', async () => {
      import.meta.env.WXT_SUPABASE_URL = '';
      const { getSupabase } = await import('@/lib/supabase');
      expect(() => getSupabase()).toThrow('Missing Supabase configuration');
    });

    it('throws if WXT_SUPABASE_ANON_KEY is missing', async () => {
      import.meta.env.WXT_SUPABASE_ANON_KEY = '';
      const { getSupabase } = await import('@/lib/supabase');
      expect(() => getSupabase()).toThrow('Missing Supabase configuration');
    });

    it('configures auth storage adapter (not localStorage)', async () => {
      const { getSupabase } = await import('@/lib/supabase');
      getSupabase();

      const options = mockCreateClient.mock.calls[0][2];
      expect(options.auth.storage).toBeDefined();
      expect(options.auth.storage.getItem).toBeInstanceOf(Function);
      expect(options.auth.storage.setItem).toBeInstanceOf(Function);
      expect(options.auth.storage.removeItem).toBeInstanceOf(Function);
    });
  });
});
