import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncQueue } from '../../src/lib/sync-queue';
import { StorageService } from '../../src/lib/storage';
import { CATEGORIZATION_STATUS } from '../../src/lib/constants';

// --- Supabase mock ---
const mockUpsert = vi.fn();
const mockSelectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
};
const mockDeviceUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'tab_groups') {
      return {
        upsert: mockUpsert,
        select: mockSelectChain.select,
      };
    }
    if (table === 'tabs') {
      return { upsert: mockUpsert };
    }
    if (table === 'devices') {
      return { upsert: mockDeviceUpsert };
    }
    return { upsert: mockUpsert };
  }),
};

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => mockSupabase,
}));

const mockSession = { user: { id: 'user-1' } };
vi.mock('../../src/lib/auth', () => ({
  getSession: vi.fn(async () => mockSession),
}));

vi.mock('../../src/lib/device', () => ({
  getOrCreateDeviceId: vi.fn(async () => 'device-1'),
}));

// Mock crypto — identity functions so we can inspect payloads directly
// encrypt wraps value with "enc:" prefix for tracking, decrypt removes it
vi.mock('../../src/lib/crypto', () => ({
  getOrDeriveKey: vi.fn(async () => 'mock-key'),
  encrypt: vi.fn(async (v: string) => `enc:${v}`),
  decrypt: vi.fn(async (v: string) => {
    if (v.startsWith('enc:')) return v.slice(4);
    return v;
  }),
  encryptNullable: vi.fn(async (v: string | null) => v === null ? null : `enc:${v}`),
  decryptNullable: vi.fn(async (v: string | null) => {
    if (v === null) return null;
    if (v.startsWith('enc:')) return v.slice(4);
    return v;
  }),
}));

import { SyncEngine } from '../../src/lib/sync';
import { encrypt, decrypt } from '../../src/lib/crypto';
import type { TabGroup, SubGroup } from '../../src/lib/types';

// --- Helpers ---

function makeSubGroup(overrides: Partial<SubGroup> = {}): SubGroup {
  return {
    id: 'sg-1',
    name: 'AI Tools',
    tabs: [
      { id: 't1', url: 'https://ai.com', title: 'AI Site', faviconUrl: null, position: 0, createdAt: Date.now() },
    ],
    ...overrides,
  };
}

function makeTabGroup(overrides: Partial<TabGroup> = {}): TabGroup {
  const now = Date.now();
  return {
    id: 'g1',
    name: 'Test Group',
    tabs: [
      { id: 't1', url: 'https://example.com', title: 'Example', faviconUrl: null, position: 0, createdAt: now },
    ],
    isAutoSave: false,
    deviceId: 'device-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Build a mock Supabase response for pullAllGroups */
function mockPullResponse(remoteGroups: Record<string, unknown>[]) {
  mockSelectChain.select.mockReturnValueOnce({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: remoteGroups,
        error: null,
      }),
    }),
  });
}

function makeRemoteGroup(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'g1',
    name: 'enc:Test Group',
    is_auto_save: false,
    device_id: 'device-1',
    created_at: now,
    updated_at: now,
    sub_groups: null,
    summary: null,
    tags: null,
    tabs: [
      { id: 't1', url: 'enc:https://example.com', title: 'enc:Example', favicon_url: null, position: 0, created_at: now },
    ],
    ...overrides,
  };
}

let engine: SyncEngine;

beforeEach(() => {
  vi.clearAllMocks();
  engine = new SyncEngine(new StorageService(), new SyncQueue());
  // Re-establish mock implementations after clearAllMocks
  mockSelectChain.select.mockReturnThis();
  mockSelectChain.eq.mockReturnThis();
  mockSelectChain.order.mockResolvedValue({ data: [], error: null });
  mockDeviceUpsert.mockResolvedValue({ error: null });
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'tab_groups') {
      return { upsert: mockUpsert, select: mockSelectChain.select };
    }
    if (table === 'tabs') {
      return { upsert: mockUpsert };
    }
    if (table === 'devices') {
      return { upsert: mockDeviceUpsert };
    }
    return { upsert: mockUpsert };
  });
});

// ─── Test Group 1 — Push AI fields ───

describe('Push AI fields', () => {
  it('group with subGroups → sub_groups column is populated', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup({
      subGroups: [makeSubGroup()],
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
    });

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.sub_groups).not.toBeNull();
  });

  it('group with summary → summary column is populated', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup({ summary: 'Research on AI tools' });

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.summary).not.toBeNull();
  });

  it('group with tags → tags column is populated', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup({ tags: ['AI', 'Research'] });

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.tags).not.toBeNull();
  });

  it('group without subGroups → sub_groups column is null', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup();

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.sub_groups).toBeNull();
  });

  it('group without summary → summary column is null', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup();

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.summary).toBeNull();
  });

  it('group without tags → tags column is null', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup();

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.tags).toBeNull();
  });

  it('subGroups are encrypted before push', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const sg = makeSubGroup({ name: 'AI Tools' });
    const group = makeTabGroup({ subGroups: [sg] });

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    // Our mock encrypt prepends "enc:"
    expect(groupCall.sub_groups).toMatch(/^enc:/);
    expect(encrypt).toHaveBeenCalledWith(JSON.stringify([sg]), 'mock-key');
  });

  it('summary is encrypted before push', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup({ summary: 'AI research session' });

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.summary).toBe('enc:AI research session');
  });

  it('tags are encrypted before push', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const group = makeTabGroup({ tags: ['AI', 'Work'] });

    await engine.pushGroup(group);

    const groupCall = mockUpsert.mock.calls[0][0];
    expect(groupCall.tags).toMatch(/^enc:/);
    expect(encrypt).toHaveBeenCalledWith(JSON.stringify(['AI', 'Work']), 'mock-key');
  });
});

// ─── Test Group 2 — Pull AI fields ───

describe('Pull AI fields', () => {
  it('remote group with sub_groups → subGroups decrypted correctly', async () => {
    const sg = makeSubGroup();
    mockPullResponse([makeRemoteGroup({
      sub_groups: `enc:${JSON.stringify([sg])}`,
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].subGroups).toEqual([sg]);
  });

  it('remote group with summary → summary decrypted correctly', async () => {
    mockPullResponse([makeRemoteGroup({
      summary: 'enc:AI research session',
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].summary).toBe('AI research session');
  });

  it('remote group with tags → tags decrypted correctly', async () => {
    mockPullResponse([makeRemoteGroup({
      tags: `enc:${JSON.stringify(['AI', 'Work'])}`,
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].tags).toEqual(['AI', 'Work']);
  });

  it('remote group with null sub_groups → subGroups is undefined', async () => {
    mockPullResponse([makeRemoteGroup({ sub_groups: null })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].subGroups).toBeUndefined();
  });

  it('remote group with null summary → summary is undefined', async () => {
    mockPullResponse([makeRemoteGroup({ summary: null })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].summary).toBeUndefined();
  });

  it('remote group with null tags → tags is undefined', async () => {
    mockPullResponse([makeRemoteGroup({ tags: null })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].tags).toBeUndefined();
  });

  it('remote group with sub_groups → categorizationStatus is DONE', async () => {
    mockPullResponse([makeRemoteGroup({
      sub_groups: `enc:${JSON.stringify([makeSubGroup()])}`,
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].categorizationStatus).toBe(CATEGORIZATION_STATUS.DONE);
  });

  it('remote group without sub_groups → categorizationStatus is undefined', async () => {
    mockPullResponse([makeRemoteGroup({ sub_groups: null })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].categorizationStatus).toBeUndefined();
  });
});

// ─── Test Group 3 — Error handling ───

describe('Error handling', () => {
  it('decryption failure on sub_groups → subGroups is undefined, sync continues', async () => {
    vi.mocked(decrypt).mockImplementation(async (v: string) => {
      if (v === 'bad-sub-groups') throw new Error('decrypt fail');
      if (v.startsWith('enc:')) return v.slice(4);
      return v;
    });
    mockPullResponse([makeRemoteGroup({
      sub_groups: 'bad-sub-groups',
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].subGroups).toBeUndefined();
    expect(groups[0].name).toBe('Test Group');
  });

  it('decryption failure on summary → summary is undefined, sync continues', async () => {
    vi.mocked(decrypt).mockImplementation(async (v: string) => {
      if (v === 'bad-summary') throw new Error('decrypt fail');
      if (v.startsWith('enc:')) return v.slice(4);
      return v;
    });
    mockPullResponse([makeRemoteGroup({
      summary: 'bad-summary',
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].summary).toBeUndefined();
    expect(groups[0].name).toBe('Test Group');
  });

  it('decryption failure on tags → tags is undefined, sync continues', async () => {
    vi.mocked(decrypt).mockImplementation(async (v: string) => {
      if (v === 'bad-tags') throw new Error('decrypt fail');
      if (v.startsWith('enc:')) return v.slice(4);
      return v;
    });
    mockPullResponse([makeRemoteGroup({
      summary: 'enc:A summary',
      tags: 'bad-tags',
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].tags).toBeUndefined();
    expect(groups[0].summary).toBe('A summary');
  });

  it('malformed JSON in sub_groups after decrypt → subGroups is undefined, no crash', async () => {
    mockPullResponse([makeRemoteGroup({
      sub_groups: 'enc:not valid json {{{',
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].subGroups).toBeUndefined();
  });

  it('malformed JSON in tags after decrypt → tags is undefined, no crash', async () => {
    mockPullResponse([makeRemoteGroup({
      tags: 'enc:not valid json [[[',
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].tags).toBeUndefined();
  });
});

// ─── Test Group 4 — Cross device behaviour ───

describe('Cross device behaviour', () => {
  it('group saved on device 1 with categories → pulled on device 2 with categories intact', async () => {
    const sg = makeSubGroup({ name: 'AI Tools' });
    const remoteSg = `enc:${JSON.stringify([sg])}`;
    const remoteTags = `enc:${JSON.stringify(['AI', 'Work'])}`;

    mockPullResponse([makeRemoteGroup({
      sub_groups: remoteSg,
      summary: 'enc:Research on AI tools',
      tags: remoteTags,
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].subGroups).toEqual([sg]);
    expect(groups[0].summary).toBe('Research on AI tools');
    expect(groups[0].tags).toEqual(['AI', 'Work']);
  });

  it('group saved on device 1 without categories → pulled on device 2 without categories', async () => {
    mockPullResponse([makeRemoteGroup({
      sub_groups: null,
      summary: null,
      tags: null,
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].subGroups).toBeUndefined();
    expect(groups[0].summary).toBeUndefined();
    expect(groups[0].tags).toBeUndefined();
  });

  it('categorizationStatus is DONE on device 2 when categories exist', async () => {
    mockPullResponse([makeRemoteGroup({
      sub_groups: `enc:${JSON.stringify([makeSubGroup()])}`,
    })]);

    const groups = await engine.pullAllGroups();
    expect(groups[0].categorizationStatus).toBe(CATEGORIZATION_STATUS.DONE);
  });
});
