import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SavedTab } from '@/lib/types';

// --- Supabase mock ---
const mockFunctionsInvoke = vi.fn();
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'mock-token' } },
});
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: mockGetSession },
    functions: { invoke: mockFunctionsInvoke },
  }),
}));

// Import after mocks are registered
import { trimTitle, splitIntoBatches, categorizeTabs } from '@/lib/categorize';

function makeSavedTab(overrides: Partial<SavedTab> = {}): SavedTab {
  return {
    id: 'tab-1',
    url: 'https://example.com',
    title: 'Example',
    faviconUrl: null,
    position: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeTabs(count: number): SavedTab[] {
  return Array.from({ length: count }, (_, i) =>
    makeSavedTab({ id: `tab-${i}`, title: `Tab ${i}`, position: i }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Helper: build a successful edge function response */
function claudeResponse(payload: {
  subGroups: { name: string; tabIndexes: number[] }[];
  summary: string;
  tags: string[];
}) {
  return {
    data: {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    },
    error: null,
  };
}

// ─── Test Group 1 — Title trimming ───

describe('trimTitle', () => {
  it('returns a title with exactly 80 characters as-is', () => {
    const title = 'A'.repeat(80);
    expect(trimTitle(title)).toBe(title);
    expect(trimTitle(title).length).toBe(80);
  });

  it('trims a title with 81+ characters to 80 and appends "..."', () => {
    const title = 'B'.repeat(100);
    const result = trimTitle(title);
    expect(result).toBe('B'.repeat(80) + '...');
    expect(result.length).toBe(83); // 80 + 3 for "..."
  });

  it('returns a short title unchanged', () => {
    expect(trimTitle('Google')).toBe('Google');
  });

  it('returns empty string for empty string', () => {
    expect(trimTitle('')).toBe('');
  });
});

// ─── Test Group 2 — Batch splitting ───

describe('splitIntoBatches', () => {
  it('10 items with batch size 50 returns 1 batch of 10', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const result = splitIntoBatches(items, 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(10);
  });

  it('50 items with batch size 50 returns 1 batch of 50', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const result = splitIntoBatches(items, 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(50);
  });

  it('51 items with batch size 50 returns 2 batches — 50 and 1', () => {
    const items = Array.from({ length: 51 }, (_, i) => i);
    const result = splitIntoBatches(items, 50);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(50);
    expect(result[1]).toHaveLength(1);
  });

  it('150 items with batch size 50 returns 3 batches of 50', () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    const result = splitIntoBatches(items, 50);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(50);
    expect(result[1]).toHaveLength(50);
    expect(result[2]).toHaveLength(50);
  });

  it('0 items returns empty array', () => {
    const result = splitIntoBatches([], 50);
    expect(result).toHaveLength(0);
  });
});

// ─── Test Group 3 — categorizeTabs main function ───

describe('categorizeTabs', () => {
  it('returns null for fewer than 5 tabs without calling Claude', async () => {
    const result = await categorizeTabs(makeTabs(4));
    expect(result).toBeNull();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('calls Claude when given 5 or more tabs', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockResolvedValueOnce(
      claudeResponse({
        subGroups: [{ name: 'General', tabIndexes: [1, 2, 3, 4, 5] }],
        summary: 'Five general tabs',
        tags: ['general'],
      }),
    );

    const result = await categorizeTabs(tabs);
    expect(mockFunctionsInvoke).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
  });

  it('returns null when all batches fail', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: new Error('Network error') });

    const result = await categorizeTabs(tabs);
    expect(result).toBeNull();
  });

  it('returns partial results when one batch fails and one succeeds', async () => {
    const tabs = makeTabs(51);
    // 1-based indexes for batch 1 (50 tabs)
    const batch1Indexes = Array.from({ length: 50 }, (_, i) => i + 1);

    mockFunctionsInvoke
      .mockResolvedValueOnce(
        claudeResponse({
          subGroups: [{ name: 'Batch1', tabIndexes: batch1Indexes }],
          summary: 'First batch',
          tags: ['batch1'],
        }),
      )
      .mockResolvedValueOnce({ data: null, error: new Error('Network error') });

    const result = await categorizeTabs(tabs);
    expect(result).not.toBeNull();
    expect(result!.subGroups).toHaveLength(1);
    expect(result!.subGroups[0].name).toBe('Batch1');
    expect(result!.subGroups[0].tabs).toHaveLength(50);
  });

  it('places all tabs into exactly one sub-group (no missing, no duplicated)', async () => {
    const tabs = makeTabs(10);
    mockFunctionsInvoke.mockResolvedValueOnce(
      claudeResponse({
        subGroups: [
          { name: 'Group A', tabIndexes: [1, 2, 3, 4, 5, 6] },
          { name: 'Group B', tabIndexes: [7, 8, 9, 10] },
        ],
        summary: 'Ten tabs in two groups',
        tags: ['misc'],
      }),
    );

    const result = await categorizeTabs(tabs);
    expect(result).not.toBeNull();
    const allTabIds = result!.subGroups.flatMap(sg => sg.tabs.map(t => t.id));
    expect(allTabIds.sort()).toEqual(tabs.map(t => t.id).sort());
    expect(new Set(allTabIds).size).toBe(allTabIds.length);
  });

  it('returns a non-empty summary when Claude succeeds', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockResolvedValueOnce(
      claudeResponse({
        subGroups: [{ name: 'All', tabIndexes: [1, 2, 3, 4, 5] }],
        summary: 'A bunch of tabs',
        tags: ['test'],
      }),
    );

    const result = await categorizeTabs(tabs);
    expect(result!.summary).toBe('A bunch of tabs');
  });

  it('returns a non-empty tags array when Claude succeeds', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockResolvedValueOnce(
      claudeResponse({
        subGroups: [{ name: 'All', tabIndexes: [1, 2, 3, 4, 5] }],
        summary: 'Tabs',
        tags: ['ai', 'work'],
      }),
    );

    const result = await categorizeTabs(tabs);
    expect(result!.tags).toEqual(['ai', 'work']);
  });

  it('makes 2 parallel Claude calls for 51 tabs', async () => {
    const tabs = makeTabs(51);
    const batch1Indexes = Array.from({ length: 50 }, (_, i) => i + 1);

    mockFunctionsInvoke
      .mockResolvedValueOnce(
        claudeResponse({
          subGroups: [{ name: 'Batch1', tabIndexes: batch1Indexes }],
          summary: 'First',
          tags: ['a'],
        }),
      )
      .mockResolvedValueOnce(
        claudeResponse({
          subGroups: [{ name: 'Batch2', tabIndexes: [1] }],
          summary: 'Second',
          tags: ['b'],
        }),
      );

    await categorizeTabs(tabs);
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(2);
  });
});

// ─── Test Group 4 — Claude returns broken JSON ───

describe('categorizeTabs — broken Claude responses', () => {
  it('returns null when Claude returns malformed JSON', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: {
        content: [{ type: 'text', text: '{ this is not valid json }}}' }],
      },
      error: null,
    });

    const result = await categorizeTabs(tabs);
    expect(result).toBeNull();
  });

  it('returns null when Claude returns empty response', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { content: [] },
      error: null,
    });

    const result = await categorizeTabs(tabs);
    expect(result).toBeNull();
  });

  it('returns null when edge function throws', async () => {
    const tabs = makeTabs(5);
    mockFunctionsInvoke.mockRejectedValueOnce(new Error('Failed to fetch'));

    const result = await categorizeTabs(tabs);
    expect(result).toBeNull();
  });
});
