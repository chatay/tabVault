const STORAGE_KEY = 'tabvault_debug_log';
const MAX_ENTRIES = 200;

export interface DebugEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export async function debugLog(level: DebugEntry['level'], ...args: unknown[]): Promise<void> {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const entry: DebugEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
  };

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const entries: DebugEntry[] = result[STORAGE_KEY] ?? [];
    entries.push(entry);
    // Keep only the last N entries
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    await chrome.storage.local.set({ [STORAGE_KEY]: entries });
  } catch {
    // Storage unavailable — fall back to console
    console.log('[TabVault debug]', msg);
  }
}

export const dlog = {
  info: (...args: unknown[]) => debugLog('info', ...args),
  warn: (...args: unknown[]) => debugLog('warn', ...args),
  error: (...args: unknown[]) => debugLog('error', ...args),
};

export async function getDebugLog(): Promise<DebugEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? [];
}

export async function clearDebugLog(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}
