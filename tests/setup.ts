import { vi, beforeEach } from 'vitest';

// Mock chrome.storage.local for Vitest
const store: Record<string, unknown> = {};

const chromeStorageMock = {
  local: {
    get: vi.fn(async (keys: string | string[]) => {
      if (typeof keys === 'string') {
        return { [keys]: store[keys] ?? undefined };
      }
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (store[key] !== undefined) result[key] = store[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyList) {
        delete store[key];
      }
    }),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

// @ts-expect-error -- mocking global chrome
globalThis.chrome = { storage: chromeStorageMock };

// Reset store between tests
beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  vi.clearAllMocks();
});
