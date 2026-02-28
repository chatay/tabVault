import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TabGroup, SavedTab } from '@/lib/types';

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
import {
  flattenTabsForSearch,
  buildTabsPayload,
  parseSmartSearchResponse,
  runSmartSearch,
} from '@/lib/smart-search';

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

function makeGroup(overrides: Partial<TabGroup> & { tabs?: SavedTab[] } = {}): TabGroup {
  return {
    id: 'group-1',
    name: 'Work',
    tabs: [makeSavedTab()],
    isAutoSave: false,
    deviceId: 'dev-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── flattenTabsForSearch ───────────────────────────────────────────────────

describe('flattenTabsForSearch', () => {
  it('returns empty array for empty groups', () => {
    expect(flattenTabsForSearch([])).toEqual([]);
  });

  it('flattens tabs from multiple groups with group context', () => {
    const g1 = makeGroup({
      id: 'g1',
      name: 'Work',
      tabs: [makeSavedTab({ id: 't1', createdAt: 1000 })],
      createdAt: 100,
    });
    const g2 = makeGroup({
      id: 'g2',
      name: 'Personal',
      tabs: [makeSavedTab({ id: 't2', createdAt: 2000 })],
      createdAt: 200,
    });

    const result = flattenTabsForSearch([g1, g2]);
    expect(result).toHaveLength(2);
    // Most recent tab (createdAt 2000) first
    expect(result[0].tab.id).toBe('t2');
    expect(result[0].groupName).toBe('Personal');
    expect(result[1].tab.id).toBe('t1');
    expect(result[1].groupName).toBe('Work');
  });

  it('caps results at maxTabs', () => {
    const tabs = Array.from({ length: 10 }, (_, i) =>
      makeSavedTab({ id: `t${i}`, position: i, createdAt: i }),
    );
    const group = makeGroup({ tabs });

    const result = flattenTabsForSearch([group], 5);
    expect(result).toHaveLength(5);
  });

  it('attaches formatted groupDate to each tab', () => {
    const createdAt = new Date('2024-03-15').getTime();
    const group = makeGroup({ name: 'Test', createdAt });
    const result = flattenTabsForSearch([group]);
    expect(result[0].groupDate).toMatch(/Mar 15/);
  });
});

// ─── buildTabsPayload ───────────────────────────────────────────────────────

describe('buildTabsPayload', () => {
  it('formats tabs as numbered list with title and domain', () => {
    const ctx = [
      {
        tab: makeSavedTab({ title: 'GitHub', url: 'https://github.com/user/repo' }),
        groupName: 'Work',
        groupDate: 'Jan 1',
      },
      {
        tab: makeSavedTab({ id: 't2', title: 'Google', url: 'https://google.com' }),
        groupName: 'Personal',
        groupDate: 'Jan 2',
      },
    ];

    const payload = buildTabsPayload(ctx);
    expect(payload).toContain('1. GitHub | github.com');
    expect(payload).toContain('2. Google | google.com');
  });

  it('truncates long titles', () => {
    const longTitle = 'A'.repeat(100);
    const ctx = [
      {
        tab: makeSavedTab({ title: longTitle }),
        groupName: 'g',
        groupDate: 'd',
      },
    ];
    const payload = buildTabsPayload(ctx);
    // Should end with '...' for truncated title
    expect(payload).toContain('...');
  });

  it('falls back to full URL when URL is malformed', () => {
    const ctx = [
      {
        tab: makeSavedTab({ url: 'not-a-valid-url' }),
        groupName: 'g',
        groupDate: 'd',
      },
    ];
    const payload = buildTabsPayload(ctx);
    expect(payload).toContain('not-a-valid-url');
  });

  it('returns empty string for empty tabs array', () => {
    expect(buildTabsPayload([])).toBe('');
  });
});

// ─── parseSmartSearchResponse ───────────────────────────────────────────────

describe('parseSmartSearchResponse', () => {
  const tabs = [
    { tab: makeSavedTab({ id: 't1', title: 'React Hooks', url: 'https://react.dev' }), groupName: 'Dev', groupDate: 'Jan 1' },
    { tab: makeSavedTab({ id: 't2', title: 'Vitest Docs', url: 'https://vitest.dev' }), groupName: 'Dev', groupDate: 'Jan 2' },
    { tab: makeSavedTab({ id: 't3', title: 'Random Blog', url: 'https://blog.com' }), groupName: 'Other', groupDate: 'Jan 3' },
  ];

  it('parses valid AI response into SmartSearchResult[]', () => {
    const text = JSON.stringify({
      results: [
        { index: 1, reason: 'Matches React hooks query', score: 0.95 },
        { index: 2, reason: 'Testing library', score: 0.7 },
      ],
    });

    const results = parseSmartSearchResponse(text, tabs);
    expect(results).toHaveLength(2);
    expect(results[0].tab.id).toBe('t1');
    expect(results[0].reason).toBe('Matches React hooks query');
    expect(results[0].score).toBe(0.95);
    expect(results[0].groupName).toBe('Dev');
  });

  it('sorts results by score descending', () => {
    const text = JSON.stringify({
      results: [
        { index: 1, reason: 'Lower score', score: 0.5 },
        { index: 2, reason: 'Higher score', score: 0.9 },
      ],
    });

    const results = parseSmartSearchResponse(text, tabs);
    expect(results[0].score).toBe(0.9);
    expect(results[1].score).toBe(0.5);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseSmartSearchResponse('not json at all', tabs)).toEqual([]);
  });

  it('returns empty array when results key is missing', () => {
    const text = JSON.stringify({ data: [] });
    expect(parseSmartSearchResponse(text, tabs)).toEqual([]);
  });

  it('skips results with out-of-range index', () => {
    const text = JSON.stringify({
      results: [
        { index: 0, reason: 'bad', score: 0.9 },   // index must be >= 1
        { index: 99, reason: 'bad', score: 0.9 },   // index out of range
        { index: 2, reason: 'good', score: 0.8 },
      ],
    });

    const results = parseSmartSearchResponse(text, tabs);
    expect(results).toHaveLength(1);
    expect(results[0].tab.id).toBe('t2');
  });

  it('skips results with negative score', () => {
    const text = JSON.stringify({
      results: [
        { index: 1, reason: 'ok', score: -0.1 },
      ],
    });
    expect(parseSmartSearchResponse(text, tabs)).toEqual([]);
  });

  it('extracts JSON from text that has extra content before/after', () => {
    const text = 'Here are the results:\n' + JSON.stringify({ results: [{ index: 1, reason: 'match', score: 0.8 }] }) + '\nDone.';
    const results = parseSmartSearchResponse(text, tabs);
    expect(results).toHaveLength(1);
  });

  it('caps results at MAX_RESULTS', () => {
    // Create tabs array large enough
    const manyTabs = Array.from({ length: 20 }, (_, i) =>
      ({ tab: makeSavedTab({ id: `t${i}` }), groupName: 'g', groupDate: 'd' }),
    );
    const resultItems = Array.from({ length: 15 }, (_, i) => ({
      index: i + 1,
      reason: `match ${i}`,
      score: 1 - i * 0.05,
    }));
    const text = JSON.stringify({ results: resultItems });

    const results = parseSmartSearchResponse(text, manyTabs);
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

// ─── runSmartSearch ─────────────────────────────────────────────────────────

describe('runSmartSearch', () => {
  const group = makeGroup({
    tabs: [
      makeSavedTab({ id: 't1', title: 'React Hooks Guide', url: 'https://react.dev' }),
    ],
  });

  it('returns null when no session exists', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    const result = await runSmartSearch('react hooks', [group]);
    expect(result).toBeNull();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('returns empty array when groups have no tabs', async () => {
    const emptyGroup = makeGroup({ tabs: [] });
    const result = await runSmartSearch('anything', [emptyGroup]);
    expect(result).toEqual([]);
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('calls Edge Function and returns parsed results', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: {
        content: [{ text: JSON.stringify({ results: [{ index: 1, reason: 'Matches', score: 0.9 }] }) }],
      },
      error: null,
    });

    const result = await runSmartSearch('react hooks', [group]);
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'categorize-tabs',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-token' },
        body: expect.objectContaining({ messages: expect.any(Array) }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result![0].tab.id).toBe('t1');
    expect(result![0].reason).toBe('Matches');
  });

  it('returns null when Edge Function returns an error', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error('Function error'),
    });

    const result = await runSmartSearch('query', [group]);
    expect(result).toBeNull();
  });

  it('returns null when Edge Function returns no content', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { content: [] },
      error: null,
    });

    const result = await runSmartSearch('query', [group]);
    expect(result).toBeNull();
  });

  it('returns null on unexpected thrown error', async () => {
    mockFunctionsInvoke.mockRejectedValueOnce(new Error('Network error'));
    const result = await runSmartSearch('query', [group]);
    expect(result).toBeNull();
  });

  it('includes the user query in the prompt sent to the Edge Function', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { content: [{ text: '{"results":[]}' }] },
      error: null,
    });

    await runSmartSearch('productivity tips', [group]);

    const body = mockFunctionsInvoke.mock.calls[0][1].body;
    const prompt = body.messages[0].content;
    expect(prompt).toContain('productivity tips');
  });
});
