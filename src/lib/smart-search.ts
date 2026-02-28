import type { TabGroup, SavedTab, SmartSearchResult } from './types';
import { getSupabase } from './supabase';
import { SMART_SEARCH, CATEGORIZATION_LIMITS } from './constants';
import { dlog } from './debug-log';

export interface TabWithContext {
  tab: SavedTab;
  groupName: string;
  groupDate: string;
}

/**
 * Flatten all groups into a list of tabs with group context,
 * sorted by most recent first, capped at maxTabs.
 */
export function flattenTabsForSearch(
  groups: TabGroup[],
  maxTabs: number = SMART_SEARCH.MAX_TABS,
): TabWithContext[] {
  const all: TabWithContext[] = [];

  for (const group of groups) {
    const date = new Date(group.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    for (const tab of group.tabs) {
      all.push({ tab, groupName: group.name, groupDate: date });
    }
  }

  all.sort((a, b) => b.tab.createdAt - a.tab.createdAt);
  return all.slice(0, maxTabs);
}

/**
 * Build the numbered tab list string sent to the AI.
 * Format: "1. Tab Title | domain.com"
 */
export function buildTabsPayload(tabs: TabWithContext[]): string {
  return tabs
    .map((ctx, i) => {
      const title =
        ctx.tab.title.length > CATEGORIZATION_LIMITS.MAX_TITLE_LENGTH
          ? ctx.tab.title.slice(0, CATEGORIZATION_LIMITS.MAX_TITLE_LENGTH) + '...'
          : ctx.tab.title;

      let domain = ctx.tab.url;
      try {
        domain = new URL(ctx.tab.url).hostname;
      } catch {
        // keep full URL as fallback
      }

      return `${i + 1}. ${title} | ${domain}`;
    })
    .join('\n');
}

/**
 * Parse the AI response JSON into SmartSearchResult[].
 * Returns an empty array on any parse failure — never throws.
 */
export function parseSmartSearchResponse(
  text: string,
  tabs: TabWithContext[],
): SmartSearchResult[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.results)) return [];

    const results: SmartSearchResult[] = [];

    for (const item of parsed.results) {
      const idx = Number(item.index);
      const score = Number(item.score);
      const reason = String(item.reason ?? '').trim();

      if (!Number.isInteger(idx) || idx < 1 || idx > tabs.length) continue;
      if (!Number.isFinite(score) || score < 0) continue;

      const ctx = tabs[idx - 1];
      results.push({ tab: ctx.tab, groupName: ctx.groupName, groupDate: ctx.groupDate, reason, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, SMART_SEARCH.MAX_RESULTS);
  } catch {
    return [];
  }
}

/**
 * Call the Edge Function with a semantic search prompt.
 * Returns null on auth failure or network error — caller shows empty state.
 */
export async function runSmartSearch(
  query: string,
  groups: TabGroup[],
): Promise<SmartSearchResult[] | null> {
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const tabs = flattenTabsForSearch(groups);
    if (tabs.length === 0) return [];

    const tabsPayload = buildTabsPayload(tabs);

    const prompt = `You are a tab search assistant. The user is looking for: "${query}"

Here are saved browser tabs (index. Title | domain):
${tabsPayload}

Find the most relevant tabs for the user's query. Semantic matches count — even if the exact words don't appear in the title or URL.

Reply ONLY with this JSON, no extra text:
{
  "results": [
    { "index": 1, "reason": "One short sentence why this tab matches", "score": 0.95 }
  ]
}

Rules:
- Return up to ${SMART_SEARCH.MAX_RESULTS} results
- score is 0.0 to 1.0 (1.0 = perfect match)
- Only include tabs with score >= 0.4
- If nothing matches, return { "results": [] }`;

    await dlog.info('smart-search: calling Edge Function with', tabs.length, 'tabs');

    const { data, error } = await supabase.functions.invoke('categorize-tabs', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        model: SMART_SEARCH.MODEL,
        max_tokens: SMART_SEARCH.MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      },
    });

    if (error || !data?.content?.[0]?.text) {
      await dlog.warn('smart-search: Edge Function error', error);
      return null;
    }

    return parseSmartSearchResponse(data.content[0].text, tabs);
  } catch (err) {
    await dlog.warn('smart-search: unexpected error', err);
    return null;
  }
}
