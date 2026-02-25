import { useState } from 'react';
import type { TabGroup } from '../lib/types';
import { TabItem } from './TabItem';

interface TabGroupCardProps {
  group: TabGroup;
  onOpenTab: (url: string) => void;
  onOpenGroup: (groupId: string) => void;
  onDeleteTab: (groupId: string, tabId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (groupId: string) => void;
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
}: TabGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);

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

  return (
    <div className={`border rounded-lg p-3 mb-2 ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {/* Selection checkbox */}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(group.id)}
            className="rounded shrink-0"
          />
        )}

        {/* Expand/Collapse + Name */}
        <button
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="text-xs text-gray-400">
            {isExpanded ? '\u25BC' : '\u25B6'}
          </span>

          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm font-medium border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          ) : (
            <span className="text-sm font-medium truncate">
              {group.name}
            </span>
          )}

          {group.isAutoSave && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              [auto]
            </span>
          )}
        </button>

        {/* Tab count */}
        <span className="text-xs text-gray-400 shrink-0">
          {group.tabs.length} {group.tabs.length === 1 ? 'tab' : 'tabs'}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2">
        <button
          className="text-xs text-blue-600 hover:text-blue-800"
          onClick={() => onOpenGroup(group.id)}
        >
          Restore all
        </button>
        <button
          className="text-xs text-gray-500 hover:text-gray-700"
          onClick={() => {
            setEditName(group.name);
            setIsEditing(true);
          }}
        >
          Rename
        </button>
        <button
          className="text-xs text-red-400 hover:text-red-600"
          onClick={() => onDeleteGroup(group.id)}
        >
          Delete
        </button>
      </div>

      {/* Expanded tab list */}
      {isExpanded && group.tabs.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          {group.tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              onOpen={onOpenTab}
              onDelete={(tabId) => onDeleteTab(group.id, tabId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
