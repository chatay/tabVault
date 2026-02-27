import type { SavedTab } from '../lib/types';
import { FaviconImg } from './FaviconImg';

interface TabItemProps {
  tab: SavedTab;
  onOpen: (url: string) => void;
  onDelete?: (tabId: string) => void;
}

export function TabItem({ tab, onOpen, onDelete }: TabItemProps) {
  return (
    <div
      className="group flex items-center gap-2.5 px-4 py-2.5 min-h-[44px] cursor-pointer border-b border-[var(--border)] last:border-b-0 transition-colors"
      style={{ background: 'var(--tab-item-bg)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--tab-item-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--tab-item-bg)'; }}
      onClick={() => onOpen(tab.url)}
    >
      <div
        className="w-5 h-5 rounded-[5px] border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: 'var(--surface-3)' }}
      >
        <FaviconImg url={tab.url} faviconUrl={tab.faviconUrl} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--text-primary)] truncate leading-[1.4]">
          {tab.title}
        </div>
        <div className="text-[11px] text-[var(--text-muted)] truncate leading-[1.4] mt-px" style={{ fontFamily: "'DM Mono', monospace" }}>
          {tab.url}
        </div>
      </div>
      <span className="text-[12px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        ↗
      </span>
      {onDelete && (
        <button
          className="w-[22px] h-[22px] rounded-[5px] border-none bg-transparent text-[var(--red)] text-[14px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer hover:bg-[var(--red-soft)]"
          onClick={(e) => { e.stopPropagation(); onDelete(tab.id); }}
          title="Remove tab"
        >
          ✕
        </button>
      )}
    </div>
  );
}
