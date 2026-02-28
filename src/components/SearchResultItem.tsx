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
        className="search-highlight font-semibold rounded-[3px] px-[2px]"
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
      className="search-result-card group/result relative flex items-center gap-[13px] rounded-[14px] min-h-[64px] cursor-pointer overflow-hidden"
      onClick={() => onOpen(tab.url)}
    >
      {/* Left accent bar */}
      <div className="search-result-accent-bar absolute left-0 top-0 bottom-0 w-[3px]" />

      {/* Favicon */}
      <div className="search-result-favicon w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 overflow-hidden">
        <FaviconImg url={tab.url} faviconUrl={tab.faviconUrl} size={34} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="search-result-title text-[13px] font-medium truncate">
          {highlightMatch(tab.title, query)}
        </div>
        <div className="search-result-url text-[11px] truncate mt-[3px]">
          {highlightMatch(tab.url, query)}
        </div>
      </div>

      {/* Meta — group pill + date */}
      <div className="flex flex-col items-end gap-[5px] shrink-0 ml-[10px]">
        <span className="search-result-pill text-[10px] font-medium rounded-full truncate max-w-[150px]">
          {groupName}
        </span>
        <span className="search-result-date text-[10px]">
          {groupDate}
        </span>
      </div>

      {/* Open arrow */}
      <span className="search-result-arrow text-[13px] shrink-0 opacity-0 group-hover/result:opacity-100 transition-opacity duration-150">
        ↗
      </span>
    </div>
  );
}
