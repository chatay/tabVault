import { STORAGE_KEY_CRYPTO_KEY_PREFIX } from './constants';

const ENCRYPTED_PREFIX = 'enc:';
const IV_BYTE_LENGTH = 12;
const SALT = new TextEncoder().encode('tabvault-e2e-salt');

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function getOrDeriveKey(userId: string): Promise<CryptoKey> {
  const storageKey = `${STORAGE_KEY_CRYPTO_KEY_PREFIX}${userId}`;

  // Try loading cached JWK
  const result = await chrome.storage.local.get(storageKey);
  if (result[storageKey]) {
    return crypto.subtle.importKey(
      'jwk',
      result[storageKey],
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  // Derive a new key via HKDF
  const secret = import.meta.env.WXT_ENCRYPTION_SECRET as string;
  const secretBytes = new TextEncoder().encode(secret);
  const infoBytes = new TextEncoder().encode(userId);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'HKDF',
    false,
    ['deriveKey'],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: infoBytes },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  // Cache as JWK
  const jwk = await crypto.subtle.exportKey('jwk', derivedKey);
  await chrome.storage.local.set({ [storageKey]: jwk });

  return derivedKey;
}

export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return ENCRYPTED_PREFIX + toBase64(combined);
}

export async function decrypt(
  value: string,
  key: CryptoKey,
): Promise<string> {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value; // Legacy plaintext
  }

  const data = fromBase64(value.slice(ENCRYPTED_PREFIX.length));
  const iv = data.slice(0, IV_BYTE_LENGTH);
  const ciphertext = data.slice(IV_BYTE_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

export async function encryptNullable(
  value: string | null,
  key: CryptoKey,
): Promise<string | null> {
  if (value === null) return null;
  return encrypt(value, key);
}

export async function decryptNullable(
  value: string | null,
  key: CryptoKey,
): Promise<string | null> {
  if (value === null) return null;
  return decrypt(value, key);
}

export async function clearCachedKey(userId: string): Promise<void> {
  const storageKey = `${STORAGE_KEY_CRYPTO_KEY_PREFIX}${userId}`;
  await chrome.storage.local.remove(storageKey);
}
