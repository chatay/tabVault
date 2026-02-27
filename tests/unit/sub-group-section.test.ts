// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import type { SavedTab, SubGroup, TabGroup } from '@/lib/types';
import { CATEGORIZATION_STATUS } from '@/lib/constants';

// --- Mocks needed by TabGroupCard's import chain ---
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock('@/lib/sync', () => ({
  SyncEngine: vi.fn().mockImplementation(() => ({
    pushGroup: vi.fn().mockResolvedValue(undefined),
    ensureDevice: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@/lib/sync-queue', () => ({
  SyncQueue: vi.fn(),
}));

// Import components after mocks
import { SubGroupSection } from '@/components/SubGroupSection';
import { TabGroupCard } from '@/components/TabGroupCard';

// --- Helpers ---

function makeSavedTab(overrides: Partial<SavedTab> = {}): SavedTab {
  return {
    id: `tab-${Math.random().toString(36).slice(2, 8)}`,
    url: 'https://example.com',
    title: 'Example Tab',
    faviconUrl: null,
    position: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeSubGroup(overrides: Partial<SubGroup> & { tabCount?: number } = {}): SubGroup {
  const { tabCount = 3, ...rest } = overrides;
  return {
    id: `sg-${Math.random().toString(36).slice(2, 8)}`,
    name: 'AI Tools',
    tabs: Array.from({ length: tabCount }, (_, i) =>
      makeSavedTab({ id: `tab-${i}`, title: `Tab ${i}`, url: `https://site-${i}.com`, position: i }),
    ),
    ...rest,
  };
}

function makeTabGroup(overrides: Partial<TabGroup> = {}): TabGroup {
  return {
    id: 'group-1',
    name: 'Session Feb 25',
    tabs: Array.from({ length: 6 }, (_, i) =>
      makeSavedTab({ id: `tab-${i}`, title: `Tab ${i}`, url: `https://site-${i}.com`, position: i }),
    ),
    isAutoSave: false,
    deviceId: 'device-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
  // Ensure chrome.tabs.create exists
  (globalThis as Record<string, unknown>).chrome = {
    ...(globalThis as Record<string, Record<string, unknown>>).chrome,
    tabs: { create: vi.fn() },
  };
});

// ─── Test Group 1 — SubGroupSection component ───

describe('SubGroupSection component', () => {
  it('renders sub-group name correctly', () => {
    const sg = makeSubGroup({ name: 'AI Tools' });
    render(createElement(SubGroupSection, { subGroup: sg, onOpenTab: vi.fn() }));
    expect(screen.getByText('AI Tools')).toBeTruthy();
  });

  it('renders correct tab count — "4 tabs" not "4 tab"', () => {
    const sg = makeSubGroup({ tabCount: 4 });
    render(createElement(SubGroupSection, { subGroup: sg, onOpenTab: vi.fn() }));
    expect(screen.getByText('4 tabs')).toBeTruthy();
  });

  it('renders "1 tab" not "1 tabs" for singular', () => {
    const sg = makeSubGroup({ tabCount: 1 });
    render(createElement(SubGroupSection, { subGroup: sg, onOpenTab: vi.fn() }));
    expect(screen.getByText('1 tab')).toBeTruthy();
  });

  it('tabs are hidden when collapsed (default state)', () => {
    const sg = makeSubGroup({ tabCount: 2, tabs: [
      makeSavedTab({ id: 't1', title: 'Hidden Tab' }),
      makeSavedTab({ id: 't2', title: 'Also Hidden' }),
    ] });
    render(createElement(SubGroupSection, { subGroup: sg, onOpenTab: vi.fn() }));
    expect(screen.queryByText('Hidden Tab')).toBeNull();
  });

  it('tabs are visible after clicking header to expand', () => {
    const sg = makeSubGroup({ tabs: [
      makeSavedTab({ id: 't1', title: 'Visible Tab', url: 'https://visible.com' }),
    ] });
    render(createElement(SubGroupSection, { subGroup: sg, onOpenTab: vi.fn() }));

    // Click the header button
    const header = screen.getByText(sg.name).closest('button')!;
    fireEvent.click(header);

    expect(screen.getByText('Visible Tab')).toBeTruthy();
  });

  it('clicking again collapses the tabs', () => {
    const sg = makeSubGroup({ tabs: [
      makeSavedTab({ id: 't1', title: 'Toggle Tab', url: 'https://toggle.com' }),
    ] });
    render(createElement(SubGroupSection, { subGroup: sg, onOpenTab: vi.fn() }));

    const header = screen.getByText(sg.name).closest('button')!;

    // Expand
    fireEvent.click(header);
    expect(screen.getByText('Toggle Tab')).toBeTruthy();

    // Collapse
    fireEvent.click(header);
    expect(screen.queryByText('Toggle Tab')).toBeNull();
  });
});

// ─── Test Group 2 — TabGroupCard with sub-groups ───

describe('TabGroupCard with sub-groups', () => {
  const noopHandlers = {
    onOpenTab: vi.fn(),
    onOpenGroup: vi.fn(),
    onDeleteTab: vi.fn(),
    onDeleteGroup: vi.fn(),
    onRenameGroup: vi.fn(),
  };

  it('shows loading spinner when status is PENDING', () => {
    const group = makeTabGroup({ categorizationStatus: CATEGORIZATION_STATUS.PENDING });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    expect(screen.getByText('Organizing your tabs...')).toBeTruthy();
  });

  it('shows loading spinner when status is PROCESSING', () => {
    const group = makeTabGroup({ categorizationStatus: CATEGORIZATION_STATUS.PROCESSING });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    expect(screen.getByText('Organizing your tabs...')).toBeTruthy();
  });

  it('shows sub-groups when status is DONE and subGroups exist', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [
        makeSubGroup({ name: 'AI Tools', tabCount: 3 }),
        makeSubGroup({ name: 'Shopping', tabCount: 2 }),
      ],
    });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));

    // Expand the card
    const header = screen.getByText('Session Feb 25');
    fireEvent.click(header);

    expect(screen.getByText('AI Tools')).toBeTruthy();
    expect(screen.getByText('Shopping')).toBeTruthy();
  });

  it('shows flat tab list when status is FAILED', () => {
    const group = makeTabGroup({ categorizationStatus: CATEGORIZATION_STATUS.FAILED });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));

    // Expand
    fireEvent.click(screen.getByText('Session Feb 25'));

    // Should show individual tabs, not sub-groups
    expect(screen.getByText('Tab 0')).toBeTruthy();
  });

  it('shows flat tab list when subGroups is undefined', () => {
    const group = makeTabGroup({ subGroups: undefined });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));

    fireEvent.click(screen.getByText('Session Feb 25'));
    expect(screen.getByText('Tab 0')).toBeTruthy();
  });

  it('shows flat tab list when subGroups is empty array', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [],
    });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));

    fireEvent.click(screen.getByText('Session Feb 25'));
    expect(screen.getByText('Tab 0')).toBeTruthy();
  });

  it('summary shows below group name when it exists', () => {
    const group = makeTabGroup({ summary: 'Research on AI tools and restaurants' });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    expect(screen.getByText('Research on AI tools and restaurants')).toBeTruthy();
  });

  it('summary does not render when group.summary is empty', () => {
    const group = makeTabGroup({ summary: '' });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    // No italic summary element
    const container = screen.getByText('Session Feb 25').closest('div')!;
    const italics = container.querySelectorAll('[style*="italic"]');
    expect(italics.length).toBe(0);
  });

  it('tags render as pills when tags exist', () => {
    const group = makeTabGroup({ tags: ['AI', 'Food'] });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    expect(screen.getByText('AI')).toBeTruthy();
    expect(screen.getByText('Food')).toBeTruthy();
  });

  it('tags do not render when tags array is empty', () => {
    const group = makeTabGroup({ tags: [] });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    // No pill elements
    expect(screen.queryByText('AI')).toBeNull();
  });

  it('tab count line shows sub-group count when subGroups exist', () => {
    const group = makeTabGroup({
      subGroups: [
        makeSubGroup({ name: 'A', tabCount: 3 }),
        makeSubGroup({ name: 'B', tabCount: 3 }),
      ],
    });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    expect(screen.getByText(/2 sub-groups/)).toBeTruthy();
  });

  it('"Other" sub-group always renders last', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [
        makeSubGroup({ id: 'sg-other', name: 'Other', tabCount: 2 }),
        makeSubGroup({ id: 'sg-ai', name: 'AI Tools', tabCount: 3 }),
        makeSubGroup({ id: 'sg-dev', name: 'Development', tabCount: 2 }),
      ],
    });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));

    // Expand the card
    fireEvent.click(screen.getByText('Session Feb 25'));

    // Get all sub-group name elements in rendered order
    const names = screen.getAllByText(/AI Tools|Development|Other/).map(el => el.textContent);
    expect(names[names.length - 1]).toBe('Other');
  });

  it('tab count line shows no sub-group count when subGroups is undefined', () => {
    const group = makeTabGroup({ subGroups: undefined });
    render(createElement(TabGroupCard, { group, ...noopHandlers }));
    // Should NOT contain "sub-groups"
    const metaLine = screen.getByText(/6 tabs/);
    expect(metaLine.textContent).not.toContain('sub-groups');
  });
});

// ─── Test Group 3 — Existing functionality unchanged ───

describe('Existing functionality unchanged', () => {
  const mockHandlers = {
    onOpenTab: vi.fn(),
    onOpenGroup: vi.fn(),
    onDeleteTab: vi.fn(),
    onDeleteGroup: vi.fn(),
    onRenameGroup: vi.fn(),
  };

  beforeEach(() => {
    Object.values(mockHandlers).forEach(fn => fn.mockClear());
  });

  it('rename still works with sub-groups present', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [makeSubGroup()],
    });
    render(createElement(TabGroupCard, { group, ...mockHandlers }));

    // The card should render — rename logic is tested elsewhere,
    // just verify the card doesn't crash with subGroups present
    expect(screen.getByText('Session Feb 25')).toBeTruthy();
  });

  it('delete still works with sub-groups present', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [makeSubGroup()],
    });
    render(createElement(TabGroupCard, { group, ...mockHandlers }));
    expect(screen.getByTitle('Delete group')).toBeTruthy();
  });

  it('restore all tabs still works with sub-groups present', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [makeSubGroup()],
    });
    render(createElement(TabGroupCard, { group, ...mockHandlers }));
    expect(screen.getByTitle('Restore all')).toBeTruthy();
  });

  it('select mode still works with sub-groups present', () => {
    const group = makeTabGroup({
      categorizationStatus: CATEGORIZATION_STATUS.DONE,
      subGroups: [makeSubGroup()],
    });
    const mockToggle = vi.fn();
    render(createElement(TabGroupCard, {
      group,
      ...mockHandlers,
      onToggleSelect: mockToggle,
    }));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(mockToggle).toHaveBeenCalledWith('group-1');
  });
});
