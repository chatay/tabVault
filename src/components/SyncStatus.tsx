import { useEffect, useMemo, useState } from 'react';
import { SyncEngine } from '../lib/sync';
import { SyncQueue } from '../lib/sync-queue';
import { StorageService } from '../lib/storage';
import type { SyncStatus as SyncStatusType } from '../lib/types';

const statusConfig: Record<SyncStatusType, { label: string; cssColor: string }> = {
  synced: { label: 'Synced', cssColor: 'var(--green)' },
  syncing: { label: 'Syncing...', cssColor: 'var(--accent)' },
  pending: { label: 'Sync pending', cssColor: 'var(--warning)' },
  failed: { label: 'Sync failed', cssColor: 'var(--red)' },
};

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatusType>('synced');

  // Single stable engine instance per mount — avoids allocating new
  // StorageService/SyncQueue/SyncEngine on every poll interval tick.
  const engine = useMemo(() => new SyncEngine(new StorageService(), new SyncQueue()), []);

  useEffect(() => {
    engine.getSyncStatus().then(setStatus);

    const interval = setInterval(() => {
      engine.getSyncStatus().then(setStatus);
    }, 10_000);

    return () => clearInterval(interval);
  }, [engine]);

  const config = statusConfig[status];

  return (
    <span className="text-xs" style={{ color: config.cssColor }}>
      {config.label}
    </span>
  );
}
