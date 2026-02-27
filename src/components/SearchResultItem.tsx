import type { ReactNode } from 'react';
import type { SavedTab } from '../lib/types';
import { FaviconImg } from './FaviconImg';

interface SearchResultItemProps {
  tab: SavedTab;
  groupName: string;
  groupDate: string;
  query: string;
  onOpen: (url: string) => void;
}

function highlightMatch(text: string, query: string): ReactNode[] {
  const trimmed = query.trim();
  if (!trimmed) return [text];

  const lower = text.toLowerCase();
  const qLower = trimmed.toLowerCase();
  const matchLen = trimmed.length;
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  let index = lower.indexOf(qLower);
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    parts.push(
      <mark
        key={index}
        className="font-semibold rounded-[3px] px-[2px]"
        style={{ background: 'var(--highlight)', color: 'var(--highlight-text)' }}
      >
        {text.slice(index, index + matchLen)}
      </mark>,
    );
    lastIndex = index + matchLen;
    index = lower.indexOf(qLower, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function SearchResultItem({
  tab,
  groupName,
  groupDate,
  query,
  onOpen,
}: SearchResultItemProps) {
  return (
    <div
      className="group/result relative flex items-center gap-[13px] rounded-[14px] min-h-[64px] cursor-pointer overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: '13px 16px',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.15s ease',
        animation: 'slideIn 0.18s ease both',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        const bar = e.currentTarget.querySelector<HTMLElement>('[data-accent-bar]');
        if (bar) bar.style.background = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        e.currentTarget.style.transform = 'translateY(0)';
        const bar = e.currentTarget.querySelector<HTMLElement>('[data-accent-bar]');
        if (bar) bar.style.background = 'transparent';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onClick={() => onOpen(tab.url)}
    >
      {/* Left accent bar */}
      <div
        data-accent-bar
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'transparent', transition: 'background 0.15s ease' }}
      />

      {/* Favicon */}
      <div
        className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 overflow-hidden"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
        }}
      >
        <FaviconImg url={tab.url} faviconUrl={tab.faviconUrl} size={34} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {highlightMatch(tab.title, query)}
        </div>
        <div
          className="text-[11px] truncate mt-[3px]"
          style={{ color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}
        >
          {highlightMatch(tab.url, query)}
        </div>
      </div>

      {/* Meta — group pill + date */}
      <div className="flex flex-col items-end gap-[5px] shrink-0 ml-[10px]">
        <span
          className="text-[10px] font-medium rounded-full truncate max-w-[150px]"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            padding: '3px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {groupName}
        </span>
        <span
          className="text-[10px] whitespace-nowrap"
          style={{ color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}
        >
          {groupDate}
        </span>
      </div>

      {/* Open arrow */}
      <span
        className="text-[13px] shrink-0 opacity-0 group-hover/result:opacity-100 transition-opacity duration-150"
        style={{ color: 'var(--accent)' }}
      >
        ↗
      </span>
    </div>
  );
}
