import { useEffect, useState } from 'react';
import type { TabGroup } from '../lib/types';
import { TabItem } from './TabItem';
import { SubGroupSection } from './SubGroupSection';
import {
  TAB_LIST_MAX_HEIGHT_PX,
  TAB_GROUP_INITIAL_VISIBLE,
  TAB_GROUP_LOAD_MORE_BATCH,
  CATEGORIZATION_STATUS,
} from '../lib/constants';

interface TabGroupCardProps {
  group: TabGroup;
  onOpenTab: (url: string) => void;
  onOpenGroup: (groupId: string) => void;
  onDeleteTab: (groupId: string, tabId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (groupId: string) => void;
  duplicateCount?: number;
}

export function TabGroupCard({
  group,
  onOpenTab,
  onOpenGroup,
  onDeleteTab,
  onDeleteGroup,
  onRenameGroup,
  isSelected = false,
  onToggleSelect,
  duplicateCount = 0,
}: TabGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [isHovered, setIsHovered] = useState(false);

  // Keep editName in sync when the group name changes externally (e.g., cloud pull)
  useEffect(() => {
    if (!isEditing) {
      setEditName(group.name);
    }
  }, [group.name, isEditing]);
  const [visibleCount, setVisibleCount] = useState(TAB_GROUP_INITIAL_VISIBLE);

  function handleRenameSubmit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== group.name) {
      onRenameGroup(group.id, trimmed);
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditName(group.name);
      setIsEditing(false);
    }
  }

  const date = new Date(group.updatedAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ', ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div
      className="group/card rounded-[14px] overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isExpanded ? 'var(--border-strong)' : 'var(--border)'}`,
        borderLeft: group.isAutoSave ? '3px solid var(--border-strong)' : undefined,
        boxShadow: isHovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, background 0.25s',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div
        className="flex items-center gap-[10px] cursor-pointer select-none min-h-[56px]"
        style={{ padding: '14px 16px' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => {
          const next = !isExpanded;
          setIsExpanded(next);
          if (!next) setVisibleCount(TAB_GROUP_INITIAL_VISIBLE);
        }}
      >
        {/* Selection checkbox */}
        {onToggleSelect && (
          <label
            className="flex items-center justify-center w-[44px] h-[44px] cursor-pointer shrink-0 -ml-3"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(group.id)}
              className="w-4 h-4 rounded cursor-pointer"
              style={{ accentColor: 'var(--accent)' }}
            />
          </label>
        )}

        {/* Chevron */}
        <span
          className="w-[22px] h-[22px] flex items-center justify-center shrink-0 text-[13px]"
          style={{
            color: isExpanded ? 'var(--accent)' : 'var(--text-muted)',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), color 0.15s',
            fontStyle: 'normal',
          }}
        >
          ›
        </span>

        {/* Group info */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-[14px] font-semibold rounded-lg px-2 py-0.5 outline-none"
              style={{
                border: '1.5px solid var(--accent)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
          ) : (
            <>
              <div
                className={`text-[14px] truncate ${
                  group.isAutoSave
                    ? 'font-medium'
                    : 'font-semibold'
                }`}
                style={{
                  color: group.isAutoSave ? 'var(--text-secondary)' : 'var(--text-primary)',
                }}
              >
                {group.name}
              </div>
              {group.summary && (
                <div
                  className="text-[12px] truncate mt-[2px]"
                  style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
                >
                  {group.summary}
                </div>
              )}
              <div
                className="text-[11px] mt-[2px]"
                style={{ color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}
              >
                {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'}
                {group.subGroups && group.subGroups.length > 0
                  ? ` \u00b7 ${group.subGroups.length} sub-groups`
                  : ''
                } · {formattedDate}
              </div>
            </>
          )}
        </div>

        {/* Duplicate badge */}
        {duplicateCount > 0 && (
          <span
            className="text-[10px] font-semibold shrink-0 rounded-full whitespace-nowrap"
            style={{
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning-border)',
              color: 'var(--warning-text)',
              padding: '2px 7px',
              letterSpacing: '0.3px',
            }}
            title={`${duplicateCount} duplicate ${duplicateCount === 1 ? 'URL' : 'URLs'} found in other groups`}
          >
            ⚠️ {duplicateCount} {duplicateCount === 1 ? 'dupe' : 'dupes'}
          </span>
        )}

        {/* Auto badge */}
        {group.isAutoSave && (
          <span
            className="text-[10px] font-semibold shrink-0 rounded-full"
            style={{
              background: 'var(--surface-3)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '2px 7px',
              letterSpacing: '0.3px',
            }}
          >
            AUTO
          </span>
        )}

        {/* Action buttons — visible on card hover */}
        <div className="flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
          {!group.isAutoSave && (
            <>
              <ActionBtn
                title="Restore all"
                onClick={(e) => { e.stopPropagation(); onOpenGroup(group.id); }}
              >
                ↩
              </ActionBtn>
              <ActionBtn
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(group.name);
                  setIsEditing(true);
                }}
              >
                ✏
              </ActionBtn>
            </>
          )}
          <button
            className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[13px] cursor-pointer shrink-0"
            style={{
              color: 'var(--red)',
              border: '1px solid var(--red-border)',
              background: 'var(--red-soft)',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--red-border)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--red-soft)'; }}
            onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id); }}
            title="Delete group"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Categorization loading indicator */}
      {(group.categorizationStatus === CATEGORIZATION_STATUS.PENDING ||
        group.categorizationStatus === CATEGORIZATION_STATUS.PROCESSING) && (
        <div
          className="flex items-center gap-[6px] px-[16px] py-[8px]"
          style={{ color: 'var(--text-muted)', fontSize: '12px' }}
        >
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#10227;</span>
          <span>Organizing your tabs...</span>
        </div>
      )}

      {/* Tags */}
      {group.tags && group.tags.length > 0 && (
        <div className="flex flex-wrap gap-[4px] px-[16px] py-[8px]">
          {group.tags.map(tag => (
            <span
              key={tag}
              className="text-[10px] font-medium rounded-full"
              style={{
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                padding: '2px 8px',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && group.tabs.length > 0 && (
        <>
          {/* Sub-group view (when AI categorization is done) */}
          {group.subGroups &&
           group.subGroups.length > 0 &&
           group.categorizationStatus === CATEGORIZATION_STATUS.DONE ? (
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px' }}>
              {[...group.subGroups]
                .sort((a, b) => {
                  const aIsOther = /^other$/i.test(a.name.trim());
                  const bIsOther = /^other$/i.test(b.name.trim());
                  if (aIsOther && !bIsOther) return 1;
                  if (!aIsOther && bIsOther) return -1;
                  return 0;
                })
                .map(subGroup => (
                  <SubGroupSection
                    key={subGroup.id}
                    subGroup={subGroup}
                    onOpenTab={onOpenTab}
                  />
                ))}
            </div>
          ) : (
            /* Flat tab list fallback */
            <>
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  maxHeight: `${TAB_LIST_MAX_HEIGHT_PX}px`,
                  overflowY: 'auto',
                }}
              >
                {group.tabs.slice(0, visibleCount).map((tab) => (
                  <TabItem
                    key={tab.id}
                    tab={tab}
                    onOpen={onOpenTab}
                    onDelete={(tabId) => onDeleteTab(group.id, tabId)}
                  />
                ))}
              </div>
              {visibleCount < group.tabs.length && (
                <button
                  className="w-full text-[12px] font-medium cursor-pointer"
                  style={{
                    padding: '10px 16px',
                    color: 'var(--accent)',
                    background: 'var(--surface-2)',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onClick={() => setVisibleCount((c) => c + TAB_GROUP_LOAD_MORE_BATCH)}
                >
                  Show {Math.min(TAB_GROUP_LOAD_MORE_BATCH, group.tabs.length - visibleCount)} more of {group.tabs.length - visibleCount} remaining
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[13px] cursor-pointer shrink-0"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text-secondary)',
        transition: 'all 0.12s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-3)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
