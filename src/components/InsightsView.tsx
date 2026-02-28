import { useMemo, useState } from 'react';
import type { TabGroup } from '../lib/types';
import {
  computeInsightsDuplicates,
  computeForgottenTabs,
  type InsightsDuplicateEntry,
} from '../lib/insights';
import { INSIGHTS } from '../lib/constants';
import { FaviconImg } from './FaviconImg';

export interface CleanupProgress {
  done: number;
  total: number;
}

interface InsightsViewProps {
  groups: TabGroup[];
  onDeleteTab: (groupId: string, tabId: string) => Promise<void>;
  onOpenTab: (url: string) => void;
  cleanupProgress?: CleanupProgress;
  onCleanupAll?: (items: Array<{ groupId: string; tabId: string }>) => Promise<void>;
}

export function InsightsView({ groups, onDeleteTab, onOpenTab, cleanupProgress, onCleanupAll }: InsightsViewProps) {
  const duplicates = useMemo(() => computeInsightsDuplicates(groups), [groups]);
  const forgottenTabs = useMemo(() => computeForgottenTabs(groups), [groups]);

  const totalExtras = duplicates.reduce(
    (sum, entry) => sum + entry.occurrences.filter((o) => !o.isKeep).length,
    0,
  );
  const affectedGroups = new Set(
    duplicates.flatMap((e) => e.occurrences.map((o) => o.groupId)),
  ).size;

  return (
    <div className="flex flex-col gap-[20px]">
      <DuplicatesSection
        duplicates={duplicates}
        totalExtras={totalExtras}
        affectedGroups={affectedGroups}
        onDeleteTab={onDeleteTab}
        cleanupProgress={cleanupProgress}
        onCleanupAll={onCleanupAll}
      />
      <ForgottenSection
        forgottenTabs={forgottenTabs}
        onOpenTab={onOpenTab}
        onDeleteTab={onDeleteTab}
      />
    </div>
  );
}

// ─── Duplicates Section ──────────────────────────────────────────────────────

interface DuplicatesSectionProps {
  duplicates: InsightsDuplicateEntry[];
  totalExtras: number;
  affectedGroups: number;
  onDeleteTab: (groupId: string, tabId: string) => Promise<void>;
  cleanupProgress?: CleanupProgress;
  onCleanupAll?: (items: Array<{ groupId: string; tabId: string }>) => Promise<void>;
}

function DuplicatesSection({
  duplicates,
  totalExtras,
  affectedGroups,
  onDeleteTab,
  cleanupProgress,
  onCleanupAll,
}: DuplicatesSectionProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const isCleaning = cleanupProgress !== undefined;

  async function handleCleanupAll() {
    const items = duplicates.flatMap((entry) =>
      entry.occurrences
        .filter((occ) => !occ.isKeep)
        .map((occ) => ({ groupId: occ.groupId, tabId: occ.tab.id })),
    );
    setShowConfirm(false);
    await onCleanupAll?.(items);
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {/* Section header */}
      <div className="flex items-center gap-[10px] px-[2px]">
        <span className="section-label text-[10px] font-bold uppercase whitespace-nowrap">
          Duplicates
        </span>
        <div className="section-divider flex-1 h-px" />
      </div>

      {duplicates.length === 0 ? (
        <div className="insights-empty-state">
          <span>✅</span>
          <span>No duplicates found — your tabs are all unique</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="insights-summary">
              ⚠️ You have {totalExtras} duplicate {totalExtras === 1 ? 'tab' : 'tabs'} across {affectedGroups} {affectedGroups === 1 ? 'group' : 'groups'} — here&apos;s what we found:
            </p>

            {isCleaning ? (
              <div className="insights-confirm-row">
                <span className="insights-cleanup-progress">
                  Deleting {cleanupProgress.done} of {cleanupProgress.total}…
                </span>
              </div>
            ) : !showConfirm ? (
              <button
                className="insights-cleanup-btn"
                onClick={() => setShowConfirm(true)}
              >
                Clean up all
              </button>
            ) : (
              <div className="insights-confirm-row">
                <span>Delete {totalExtras} {totalExtras === 1 ? 'duplicate' : 'duplicates'}?</span>
                <button className="insights-confirm-yes" onClick={handleCleanupAll}>
                  Yes, delete
                </button>
                <button className="insights-confirm-cancel" onClick={() => setShowConfirm(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[8px]">
            {duplicates.map((entry) => (
              <DuplicateCard key={entry.url} entry={entry} onDeleteTab={onDeleteTab} disabled={isCleaning} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DuplicateCard({
  entry,
  onDeleteTab,
  disabled = false,
}: {
  entry: InsightsDuplicateEntry;
  onDeleteTab: (groupId: string, tabId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(groupId: string, tabId: string) {
    setDeletingId(tabId);
    try {
      await onDeleteTab(groupId, tabId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="insights-duplicate-card">
      <div className="insights-duplicate-url">
        <span className="text-[14px] shrink-0">🌐</span>
        <span className="flex-1 min-w-0 truncate" title={entry.url}>{entry.url}</span>
        <span className="text-[11px] font-normal text-[var(--text-muted)] shrink-0">
          Saved in {entry.occurrences.length} groups
        </span>
      </div>

      {entry.occurrences.map((occ) => {
        const isThis = deletingId === occ.tab.id;
        return (
          <div key={occ.tab.id} className="insights-occurrence">
            <div className="w-[18px] h-[18px] rounded-[4px] shrink-0 overflow-hidden">
              <FaviconImg url={occ.tab.url} faviconUrl={occ.tab.faviconUrl} size={18} />
            </div>
            <span className="flex-1 min-w-0 truncate">
              {occ.groupName}
              <span className="text-[var(--text-muted)] ml-1">· {occ.groupDate}</span>
            </span>
            {occ.isKeep ? (
              <span className="insights-keep-badge">keep (oldest)</span>
            ) : (
              <button
                className={`insights-delete-btn${isThis ? ' insights-delete-btn--loading' : ''}`}
                onClick={() => handleDelete(occ.groupId, occ.tab.id)}
                disabled={disabled || deletingId !== null}
              >
                {isThis ? 'deleting…' : 'delete'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Forgotten Tabs Section ──────────────────────────────────────────────────

interface ForgottenSectionProps {
  forgottenTabs: ReturnType<typeof computeForgottenTabs>;
  onOpenTab: (url: string) => void;
  onDeleteTab: (groupId: string, tabId: string) => Promise<void>;
}

function ForgottenSection({ forgottenTabs, onOpenTab, onDeleteTab }: ForgottenSectionProps) {
  return (
    <div className="flex flex-col gap-[10px]">
      {/* Section header */}
      <div className="flex items-center gap-[10px] px-[2px]">
        <span className="section-label text-[10px] font-bold uppercase whitespace-nowrap">
          Forgotten Tabs
        </span>
        <div className="section-divider flex-1 h-px" />
      </div>

      {forgottenTabs.length === 0 ? (
        <div className="insights-empty-state">
          <span>✅</span>
          <span>No forgotten tabs — you&apos;re on top of everything</span>
        </div>
      ) : (
        <>
          <p className="insights-summary">
            🕰️ {forgottenTabs.length} {forgottenTabs.length === 1 ? 'tab' : 'tabs'} saved more than {INSIGHTS.FORGOTTEN_TAB_THRESHOLD_DAYS} days ago — have you forgotten about {forgottenTabs.length === 1 ? 'this' : 'these'}?
          </p>

          <div className="flex flex-col gap-[8px]">
            {forgottenTabs.map(({ tab, groupId, groupName, daysAgo }) => (
              <ForgottenCard
                key={tab.id}
                tab={tab}
                groupId={groupId}
                groupName={groupName}
                daysAgo={daysAgo}
                onOpenTab={onOpenTab}
                onDeleteTab={onDeleteTab}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ForgottenCard({
  tab,
  groupId,
  groupName,
  daysAgo,
  onOpenTab,
  onDeleteTab,
}: {
  tab: ReturnType<typeof computeForgottenTabs>[number]['tab'];
  groupId: string;
  groupName: string;
  daysAgo: number;
  onOpenTab: (url: string) => void;
  onDeleteTab: (groupId: string, tabId: string) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDeleteTab(groupId, tab.id);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="insights-forgotten-card">
      <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
        <FaviconImg url={tab.url} faviconUrl={tab.faviconUrl} size={34} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="insights-forgotten-title truncate">{tab.title}</div>
        <div className="insights-forgotten-meta truncate">
          Saved {daysAgo} days ago in {groupName}
        </div>
      </div>

      <div className="flex items-center gap-[6px] shrink-0">
        <button
          className="insights-open-btn"
          onClick={() => onOpenTab(tab.url)}
          disabled={isDeleting}
        >
          Open
        </button>
        <button
          className={`insights-delete-btn${isDeleting ? ' insights-delete-btn--loading' : ''}`}
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
