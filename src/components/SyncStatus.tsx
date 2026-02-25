import { useEffect, useState } from 'react';
import { SyncEngine } from '../lib/sync';
import { SyncQueue } from '../lib/sync-queue';
import { StorageService } from '../lib/storage';
import type { SyncStatus as SyncStatusType } from '../lib/types';

const statusConfig: Record<SyncStatusType, { label: string; color: string }> = {
  synced: { label: 'Synced', color: 'text-green-600' },
  syncing: { label: 'Syncing...', color: 'text-blue-600' },
  pending: { label: 'Sync pending', color: 'text-orange-500' },
  failed: { label: 'Sync failed', color: 'text-red-600' },
};

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatusType>('synced');

  useEffect(() => {
    const engine = new SyncEngine(new StorageService(), new SyncQueue());
    engine.getSyncStatus().then(setStatus);

    const interval = setInterval(() => {
      engine.getSyncStatus().then(setStatus);
    }, 10_000);

    return () => clearInterval(interval);
  }, []);

  const config = statusConfig[status];

  return (
    <span className={`text-xs ${config.color}`}>
      {config.label}
    </span>
  );
}
