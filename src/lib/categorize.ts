import type { SavedTab, SubGroup } from './types';
import { getSupabase } from './supabase';
import { CATEGORIZATION_LIMITS } from './constants';
import { dlog } from './debug-log';

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
  subGroups: { name: string; tabIndexes: number[] }[];
  summary?: string;
  tags?: string[];
} | null> {
  const titlesPayload = tabs
    .map((t, i) => `${i + 1}. ${trimTitle(t.title)}`)
    .join('\n');

  const prompt = `
You are a tab organizer. Group the following browser tabs into categories.

Rules:
- Create between 1 and 6 category names maximum
- Category names must be short (2-3 words max) e.g. "AI Tools", "Restaurant", "Programming"
- Every tab number must appear in exactly one category
- Also write a one-line summary of what this session is about (max 15 words)
- Also suggest 1-4 short tags for the whole session

Tabs:
${titlesPayload}

Reply ONLY with this JSON structure, no extra text:
{
  "subGroups": [
    { "name": "Category Name", "tabIndexes": [1, 2] }
  ],
  "summary": "Short description of what this session is about",
  "tags": ["tag1", "tag2"]
}
`.trim();

  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      await dlog.warn('categorize: no session, skipping');
      return null;
    }

    await dlog.info('categorize: calling Edge Function with', tabs.length, 'tabs');

    const { data, error } = await supabase.functions.invoke('categorize-tabs', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        model: 'gpt-4.1-nano',
        max_tokens: CATEGORIZATION_LIMITS.MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      },
    });

    if (error) {
      await dlog.error('categorize: Edge Function error',
        typeof error === 'object' ? JSON.stringify(error) : String(error));
      return null;
    }

    if (data?.stop_reason === 'max_tokens') {
      await dlog.warn('categorize: response truncated (hit max_tokens limit)');
    }

    const text = data?.content
      ?.find((b: { type: string }) => b.type === 'text')?.text || '';

    if (!text) {
      await dlog.error('categorize: no text in response. data:', JSON.stringify(data)?.slice(0, 500));
      return null;
    }

    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    await dlog.info('categorize: parsed', parsed.subGroups?.length, 'sub-groups');
    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.slice(0, 200) : '';
    await dlog.error('categorize: failed —', msg, stack);
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
  if (tabs.length < CATEGORIZATION_LIMITS.MIN_TABS) {
    await dlog.info('categorize: skipped — only', tabs.length, 'tabs (min:', CATEGORIZATION_LIMITS.MIN_TABS + ')');
    return null;
  }

  const batches = splitIntoBatches(tabs, CATEGORIZATION_LIMITS.BATCH_SIZE);

  const results = await Promise.all(
    batches.map(batch => categorizeBatch(batch))
  );

  if (results.every(r => r === null)) {
    await dlog.warn('categorize: all batches failed');
    return null;
  }

  const mergedMap: Record<string, SavedTab[]> = {};

  for (let i = 0; i < batches.length; i++) {
    const result = results[i];
    if (!result) continue;

    const batch = batches[i];

    for (const sg of result.subGroups) {
      if (!mergedMap[sg.name]) mergedMap[sg.name] = [];
      for (const idx of sg.tabIndexes) {
        // Prompt uses 1-based numbering, array is 0-based
        const tab = batch[idx - 1];
        if (tab) mergedMap[sg.name].push(tab);
      }
    }
  }


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
