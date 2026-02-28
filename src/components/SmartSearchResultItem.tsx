import type { SmartSearchResult } from '../lib/types';
import { FaviconImg } from './FaviconImg';

interface SmartSearchResultItemProps {
  result: SmartSearchResult;
  onOpen: (url: string) => void;
}

export function SmartSearchResultItem({ result, onOpen }: SmartSearchResultItemProps) {
  const { tab, groupName, groupDate, reason } = result;

  return (
    <div
      className="smart-result-card group/result relative flex items-center gap-[13px] rounded-[14px] min-h-[64px] cursor-pointer overflow-hidden"
      onClick={() => onOpen(tab.url)}
    >
      {/* Left accent bar */}
      <div className="smart-result-accent-bar absolute left-0 top-0 bottom-0 w-[3px]" />

      {/* Favicon */}
      <div className="search-result-favicon w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 overflow-hidden">
        <FaviconImg url={tab.url} faviconUrl={tab.faviconUrl} size={34} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="search-result-title text-[13px] font-medium truncate">
          {tab.title}
        </div>
        <div className="smart-result-reason text-[12px] truncate mt-[2px]">
          {reason}
        </div>
        <div className="search-result-url text-[11px] truncate mt-[1px]">
          {tab.url}
        </div>
      </div>

      {/* Meta — group + date */}
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
