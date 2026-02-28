import type { DebugEntry } from '../../lib/debug-log';

const STORAGE_KEY = 'tabvault_debug_log';

function renderLog(entries: DebugEntry[]) {
  const container = document.getElementById('log')!;
  container.textContent = '';

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No log entries yet. Save some tabs to trigger categorization.';
    container.appendChild(empty);
    return;
  }

  for (const e of entries.slice().reverse()) {
    const div = document.createElement('div');
    div.className = `entry ${e.level}`;

    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = e.ts.slice(11, 23);

    div.appendChild(ts);
    div.appendChild(document.createTextNode(`[${e.level.toUpperCase()}] ${e.msg}`));
    container.appendChild(div);
  }
}

async function loadLog() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  renderLog(result[STORAGE_KEY] ?? []);
}

document.getElementById('refresh')!.addEventListener('click', loadLog);
document.getElementById('clear')!.addEventListener('click', async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  loadLog();
});
document.getElementById('copy')!.addEventListener('click', async () => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const entries: DebugEntry[] = result[STORAGE_KEY] ?? [];
  const text = entries.map((e) => `${e.ts} [${e.level}] ${e.msg}`).join('\n');
  await navigator.clipboard.writeText(text);
  const btn = document.getElementById('copy')!;
  btn.textContent = 'Copied!';
  setTimeout(() => { btn.textContent = 'Copy to clipboard'; }, 1500);
});

loadLog();
setInterval(loadLog, 2000);
