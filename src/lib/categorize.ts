import type { SavedTab, SubGroup } from './types';
import { getSupabase } from './supabase';
import { CATEGORIZATION_LIMITS } from './constants';

export function trimTitle(title: string): string {
  return title.length > CATEGORIZATION_LIMITS.MAX_TITLE_LENGTH
    ? title.slice(0, CATEGORIZATION_LIMITS.MAX_TITLE_LENGTH) + '...'
    : title;
}

export function splitIntoBatches<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

async function categorizeBatch(tabs: SavedTab[]): Promise<{
  subGroups: { name: string; tabIds: string[] }[];
  summary?: string;
  tags?: string[];
} | null> {
  const titlesPayload = tabs
    .map((t, i) => `${i + 1}. [ID:${t.id}] ${trimTitle(t.title)}`)
    .join('\n');

  const prompt = `
You are a tab organizer. Group the following browser tabs into categories.

Rules:
- Create between 1 and 6 category names maximum
- Category names must be short (2-3 words max) e.g. "AI Tools", "Restaurant", "Programming"
- Every tab ID must appear in exactly one category
- Also write a one-line summary of what this session is about (max 15 words)
- Also suggest 1-4 short tags for the whole session

Tabs:
${titlesPayload}

Reply ONLY with this JSON structure, no extra text:
{
  "subGroups": [
    { "name": "Category Name", "tabIds": ["id1", "id2"] }
  ],
  "summary": "Short description of what this session is about",
  "tags": ["tag1", "tag2"]
}
`.trim();

  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    console.log('[categorize] session exists:', !!session);
    console.log('[categorize] token preview:', session?.access_token?.slice(0, 20) + '...');

    if (!session) {
      console.warn('[categorize] no session, skipping');
      return null;
    }

    const invokeBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    };
    console.log('[categorize] prompt being sent:', prompt.slice(0, 300));
    console.log('[categorize] invoke body keys:', Object.keys(invokeBody));

    const { data, error } = await supabase.functions.invoke('categorize-tabs', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: invokeBody,
    });

    console.log('[categorize] response error:', error);
    console.log('[categorize] response data:', JSON.stringify(data)?.slice(0, 200));

    if (error) {
      console.log('[categorize] invoke error, returning null');
      return null;
    }

    const text = data.content
      ?.find((b: { type: string }) => b.type === 'text')?.text || '';
    console.log('[categorize] raw text:', text.slice(0, 300));
    const clean = text.replace(/```json|```/g, '').trim();
    console.log('[categorize] cleaned:', clean.slice(0, 300));
    const parsed = JSON.parse(clean);
    console.log('[categorize] parsed subGroups:', parsed.subGroups?.length, 'summary:', parsed.summary, 'tags:', parsed.tags);
    console.log('[categorize] tabIds sample:', parsed.subGroups?.[0]?.tabIds?.slice(0, 3));
    return parsed;
  } catch (err) {
    console.error('[categorize] catch error:', err);
    return null;
  }
}

export async function categorizeTabs(
  tabs: SavedTab[]
): Promise<{
  subGroups: SubGroup[];
  summary: string;
  tags: string[];
} | null> {
  if (tabs.length < CATEGORIZATION_LIMITS.MIN_TABS) return null;

  const batches = splitIntoBatches(tabs, CATEGORIZATION_LIMITS.BATCH_SIZE);

  const results = await Promise.all(
    batches.map(batch => categorizeBatch(batch))
  );

  console.log('[categorize] batch results:', results.map(r => r ? 'ok' : 'null'));

  if (results.every(r => r === null)) {
    console.log('[categorize] all batches failed, returning null');
    return null;
  }

  const mergedMap: Record<string, SavedTab[]> = {};

  for (let i = 0; i < batches.length; i++) {
    const result = results[i];
    if (!result) continue;

    const batch = batches[i];
    const tabMap = Object.fromEntries(batch.map(t => [t.id, t]));

    for (const sg of result.subGroups) {
      if (!mergedMap[sg.name]) mergedMap[sg.name] = [];
      for (const tabId of sg.tabIds) {
        if (tabMap[tabId]) mergedMap[sg.name].push(tabMap[tabId]);
      }
    }
  }

  console.log('[categorize] mergedMap keys:', Object.keys(mergedMap));
  console.log('[categorize] mergedMap tab counts:', Object.entries(mergedMap).map(([k, v]) => `${k}: ${v.length}`));

  const subGroups: SubGroup[] = Object.entries(mergedMap).map(
    ([name, groupTabs]) => ({
      id: crypto.randomUUID(),
      name,
      tabs: groupTabs,
    })
  );

  const firstSuccess = results.find(r => r !== null);

  return {
    subGroups,
    summary: firstSuccess?.summary || '',
    tags: firstSuccess?.tags || [],
  };
}
