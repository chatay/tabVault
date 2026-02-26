import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the env var before importing crypto module
vi.stubEnv('WXT_ENCRYPTION_SECRET', 'test-secret-that-is-at-least-32-characters-long!!');

import {
  getOrDeriveKey,
  encrypt,
  decrypt,
  encryptNullable,
  decryptNullable,
  clearCachedKey,
} from '@/lib/crypto';
import { STORAGE_KEY_CRYPTO_KEY_PREFIX } from '@/lib/constants';

describe('crypto', () => {
  describe('encrypt / decrypt', () => {
    let key: CryptoKey;

    beforeEach(async () => {
      key = await getOrDeriveKey('user-test-1');
    });

    it('encrypt produces enc: prefixed output', async () => {
      const result = await encrypt('https://example.com', key);
      expect(result.startsWith('enc:')).toBe(true);
    });

    it('encrypt then decrypt round-trips correctly', async () => {
      const plaintext = 'https://example.com/path?query=1&foo=bar';
      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('round-trips empty string', async () => {
      const encrypted = await encrypt('', key);
      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe('');
    });

    it('round-trips unicode text', async () => {
      const plaintext = 'Tabs - Working on project';
      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('round-trips long URL', async () => {
      const plaintext = 'https://example.com/' + 'a'.repeat(8000);
      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext each time (unique IV)', async () => {
      const plaintext = 'https://example.com';
      const a = await encrypt(plaintext, key);
      const b = await encrypt(plaintext, key);
      expect(a).not.toBe(b);
    });

    it('decrypt returns plaintext as-is when no enc: prefix (legacy)', async () => {
      const legacy = 'https://example.com/old-data';
      const result = await decrypt(legacy, key);
      expect(result).toBe(legacy);
    });

    it('decrypt returns empty legacy string as-is', async () => {
      const result = await decrypt('', key);
      expect(result).toBe('');
    });
  });

  describe('encryptNullable / decryptNullable', () => {
    let key: CryptoKey;

    beforeEach(async () => {
      key = await getOrDeriveKey('user-test-2');
    });

    it('encryptNullable returns null for null input', async () => {
      const result = await encryptNullable(null, key);
      expect(result).toBeNull();
    });

    it('decryptNullable returns null for null input', async () => {
      const result = await decryptNullable(null, key);
      expect(result).toBeNull();
    });

    it('encryptNullable encrypts non-null values', async () => {
      const result = await encryptNullable('https://example.com/fav.ico', key);
      expect(result).not.toBeNull();
      expect(result!.startsWith('enc:')).toBe(true);
    });

    it('round-trips non-null value through nullable functions', async () => {
      const plaintext = 'https://example.com/favicon.ico';
      const encrypted = await encryptNullable(plaintext, key);
      const decrypted = await decryptNullable(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('decryptNullable returns legacy plaintext as-is', async () => {
      const result = await decryptNullable('https://old.com/fav.ico', key);
      expect(result).toBe('https://old.com/fav.ico');
    });
  });

  describe('getOrDeriveKey', () => {
    it('returns a CryptoKey that can encrypt and decrypt', async () => {
      const key = await getOrDeriveKey('user-derive-1');
      const encrypted = await encrypt('test', key);
      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe('test');
    });

    it('caches the key in chrome.storage.local', async () => {
      await getOrDeriveKey('user-cache-1');
      const storageKey = `${STORAGE_KEY_CRYPTO_KEY_PREFIX}user-cache-1`;
      const result = await chrome.storage.local.get(storageKey);
      expect(result[storageKey]).toBeDefined();
      // Should be a JWK object
      expect(result[storageKey]).toHaveProperty('kty');
      expect(result[storageKey]).toHaveProperty('k');
    });

    it('loads from cache on second call', async () => {
      const key1 = await getOrDeriveKey('user-cache-2');
      const key2 = await getOrDeriveKey('user-cache-2');
      // Both keys should produce same decryption result
      const encrypted = await encrypt('test', key1);
      const decrypted = await decrypt(encrypted, key2);
      expect(decrypted).toBe('test');
    });

    it('different user IDs produce different keys', async () => {
      const key1 = await getOrDeriveKey('user-a');
      const key2 = await getOrDeriveKey('user-b');

      const plaintext = 'same-input';
      const encrypted1 = await encrypt(plaintext, key1);

      // Decrypting with wrong key should fail
      await expect(decrypt(encrypted1, key2)).rejects.toThrow();
    });
  });

  describe('clearCachedKey', () => {
    it('removes the cached key from chrome.storage.local', async () => {
      await getOrDeriveKey('user-clear-1');
      const storageKey = `${STORAGE_KEY_CRYPTO_KEY_PREFIX}user-clear-1`;

      // Verify key was cached
      let result = await chrome.storage.local.get(storageKey);
      expect(result[storageKey]).toBeDefined();

      // Clear it
      await clearCachedKey('user-clear-1');

      // Verify it's gone
      result = await chrome.storage.local.get(storageKey);
      expect(result[storageKey]).toBeUndefined();
    });
  });
});
