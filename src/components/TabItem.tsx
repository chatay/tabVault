import type { SavedTab } from '../lib/types';
import { FaviconImg } from './FaviconImg';

interface TabItemProps {
  tab: SavedTab;
  onOpen: (url: string) => void;
  onDelete: (tabId: string) => void;
}

export function TabItem({ tab, onOpen, onDelete }: TabItemProps) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded group">
      <FaviconImg url={tab.url} faviconUrl={tab.faviconUrl} />
      <button
        className="flex-1 text-left text-sm text-blue-600 hover:underline truncate"
        title={tab.url}
        onClick={() => onOpen(tab.url)}
      >
        {tab.title}
      </button>
      <button
        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs"
        onClick={() => onDelete(tab.id)}
        title="Delete tab"
      >
        x
      </button>
    </div>
  );
}
