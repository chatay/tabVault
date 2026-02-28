import { useEffect, useState } from 'react';
import type { TabGroup } from '../lib/types';
import type { GroupDuplicateDetails } from '../lib/duplicates';
import { TabItem } from './TabItem';
import { SubGroupSection } from './SubGroupSection';
import {
  TAB_LIST_MAX_HEIGHT_PX,
  TAB_GROUP_INITIAL_VISIBLE,
  TAB_GROUP_LOAD_MORE_BATCH,
  CATEGORIZATION_STATUS,
  CATEGORIZATION_LIMITS,
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
  duplicateInfo?: GroupDuplicateDetails;
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
  duplicateInfo,
}: TabGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);

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

  const cardClasses = [
    'group/card tab-group-card rounded-[14px]',
    isExpanded ? 'expanded' : '',
    group.isAutoSave ? 'auto-save' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {/* Header */}
      <div
        className="tab-group-header flex items-center gap-[10px] cursor-pointer select-none min-h-[56px]"
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
              className="tab-group-checkbox w-4 h-4 rounded cursor-pointer"
            />
          </label>
        )}

        {/* Chevron */}
        <span
          className={`tab-group-chevron w-[22px] h-[22px] flex items-center justify-center shrink-0 text-[13px] ${isExpanded ? 'expanded' : ''}`}
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
              className="tab-group-rename-input w-full text-[14px] font-semibold rounded-lg px-2 py-0.5 outline-none"
              autoFocus
            />
          ) : (
            <>
              <div
                className={`text-[14px] truncate ${
                  group.isAutoSave
                    ? 'tab-group-name auto-save font-medium'
                    : 'tab-group-name font-semibold'
                }`}
              >
                {group.name}
              </div>
              {group.summary && (
                <div className="tab-group-summary text-[12px] truncate mt-[2px]">
                  {group.summary}
                </div>
              )}
              <div className="tab-group-meta text-[11px] mt-[2px]">
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
        {duplicateInfo && duplicateInfo.total > 0 && (
          <span className="tooltip-wrap shrink-0">
            <span className="duplicate-badge text-[11px] font-medium rounded-full whitespace-nowrap cursor-help inline-block">
              ⚠️ {duplicateInfo.total} {duplicateInfo.total === 1 ? 'dupe' : 'dupes'}
            </span>
            <span className="tooltip">
              {duplicateInfo.sameGroup > 0 && duplicateInfo.crossGroup > 0
                ? `${duplicateInfo.sameGroup} repeated in this group · ${duplicateInfo.crossGroup} shared with other groups`
                : duplicateInfo.sameGroup > 0
                  ? `${duplicateInfo.sameGroup} ${duplicateInfo.sameGroup === 1 ? 'tab appears' : 'tabs appear'} more than once in this group`
                  : `${duplicateInfo.crossGroup} ${duplicateInfo.crossGroup === 1 ? 'tab' : 'tabs'} also ${duplicateInfo.crossGroup === 1 ? 'exists' : 'exist'} in another group`
              }
            </span>
          </span>
        )}

        {/* Auto badge */}
        {group.isAutoSave && (
          <span className="auto-badge text-[10px] font-semibold shrink-0 rounded-full">
            AUTO
          </span>
        )}

        {/* Action buttons — visible on card hover */}
        <div className="flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
          {!group.isAutoSave && (
            <>
              <button
                className="action-btn w-8 h-8 rounded-[7px] flex items-center justify-center text-[13px] cursor-pointer shrink-0"
                onClick={(e) => { e.stopPropagation(); onOpenGroup(group.id); }}
                title="Restore all"
              >
                ↩
              </button>
              <button
                className="action-btn w-8 h-8 rounded-[7px] flex items-center justify-center text-[13px] cursor-pointer shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(group.name);
                  setIsEditing(true);
                }}
                title="Rename"
              >
                ✏
              </button>
            </>
          )}
          <button
            className="tab-group-delete-btn w-8 h-8 rounded-[7px] flex items-center justify-center text-[13px] cursor-pointer shrink-0"
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
        <div className="categorization-loading flex items-center gap-[6px] px-[16px] py-[8px]">
          <span className="categorization-spinner">&#10227;</span>
          <span>Organizing your tabs...</span>
        </div>
      )}

      {/* Tags */}
      {group.tags && group.tags.length > 0 && (
        <div className="flex flex-wrap gap-[4px] px-[16px] py-[8px]">
          {group.tags.map(tag => (
            <span key={tag} className="tag-pill text-[10px] font-medium rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* AI categorization info note */}
      {isExpanded &&
        !group.subGroups?.length &&
        group.tabs.length < CATEGORIZATION_LIMITS.MIN_TABS && (
        <div className="categorization-info-note flex items-center gap-[8px] rounded-[10px] mx-[12px] mb-[12px]">
          <span className="text-[14px]">💡</span>
          <span className="categorization-info-text text-[12px]">
            AI categorization works on groups with {CATEGORIZATION_LIMITS.MIN_TABS} or more tabs
          </span>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && group.tabs.length > 0 && (
        <>
          {/* Sub-group view (when AI categorization is done) */}
          {group.subGroups &&
           group.subGroups.length > 0 &&
           group.categorizationStatus === CATEGORIZATION_STATUS.DONE ? (
            <div className="tab-group-subgroups">
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
                    onDeleteTab={(tabId) => onDeleteTab(group.id, tabId)}
                  />
                ))}
            </div>
          ) : (
            /* Flat tab list fallback */
            <>
              <div
                className="tab-list-border overflow-y-auto"
                style={{ maxHeight: `${TAB_LIST_MAX_HEIGHT_PX}px` }}
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
                  className="load-more-btn w-full text-[12px] font-medium cursor-pointer"
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
