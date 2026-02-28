import { useState } from 'react';
import type { SubGroup } from '../lib/types';
import { TabItem } from './TabItem';

interface SubGroupSectionProps {
  subGroup: SubGroup;
  onOpenTab: (url: string) => void;
  onDeleteTab: (tabId: string) => void;
}

export function SubGroupSection({
  subGroup,
  onOpenTab,
  onDeleteTab,
}: SubGroupSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sub-group-container rounded-[10px] overflow-hidden">
      {/* Sub-group header */}
      <button
        className="sub-group-header w-full flex items-center gap-[8px] cursor-pointer"
        onClick={() => setIsOpen(prev => !prev)}
      >
        <span className="text-[14px]">&#128194;</span>

        <span className="sub-group-name flex-1 text-left text-[13px] font-medium truncate">
          {subGroup.name}
        </span>

        <span className="sub-group-count text-[11px] shrink-0">
          {subGroup.tabs.length} {subGroup.tabs.length === 1 ? 'tab' : 'tabs'}
        </span>

        <span className={`sub-group-chevron text-[13px] shrink-0 ${isOpen ? 'open' : ''}`}>
          &#8250;
        </span>
      </button>

      {/* Tabs inside sub-group */}
      {isOpen && (
        <div className="sub-group-tabs">
          {subGroup.tabs.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              onOpen={onOpenTab}
              onDelete={onDeleteTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}
