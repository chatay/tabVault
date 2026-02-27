import { useState } from 'react';
import type { SubGroup } from '../lib/types';
import { TabItem } from './TabItem';

interface SubGroupSectionProps {
  subGroup: SubGroup;
  onOpenTab: (url: string) => void;
}

export function SubGroupSection({
  subGroup,
  onOpenTab,
}: SubGroupSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        marginBottom: '6px',
      }}
    >
      {/* Sub-group header */}
      <button
        className="w-full flex items-center gap-[8px] cursor-pointer"
        style={{
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          fontFamily: "'DM Sans', sans-serif",
        }}
        onClick={() => setIsOpen(prev => !prev)}
      >
        <span className="text-[14px]">&#128194;</span>

        <span
          className="flex-1 text-left text-[13px] font-medium truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {subGroup.name}
        </span>

        <span
          className="text-[11px] shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {subGroup.tabs.length} {subGroup.tabs.length === 1 ? 'tab' : 'tabs'}
        </span>

        <span
          className="text-[13px] shrink-0"
          style={{
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
          }}
        >
          &#8250;
        </span>
      </button>

      {/* Tabs inside sub-group */}
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {subGroup.tabs.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              onOpen={onOpenTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}
