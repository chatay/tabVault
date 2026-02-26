import { describe, it, expect } from 'vitest';

describe('billing', () => {
  describe('getCheckoutUrl', () => {
    it('returns empty string when env var is not set', async () => {
      const { getCheckoutUrl } = await import('@/lib/billing');
      expect(getCheckoutUrl()).toBe('');
    });
  });
});
