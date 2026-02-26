# TabVault — Future Work

## Multi-Device Sync
- Pull changes from cloud when opening TabVault on a second device
- Merge strategy: cloud groups not found locally get added, local groups not found in cloud get pushed
- Conflict resolution: last-write-wins based on `updatedAt` timestamp
- Device list UI in settings showing connected devices

## Periodic Reconciliation
- Replace retry queue with a reconciliation approach for pushes
- Compare local groups vs cloud groups, push any missing
- Run on a background alarm (e.g. every 5 minutes when authenticated)
- Self-healing: if any push fails, next reconciliation picks it up automatically
- Drop per-item retry tracking — reconciliation handles it

## Cloud Quota Enforcement
- Block saving beyond 75 tabs for free tier (currently only shows warning)
- Server-side enforcement via RLS or database function
- Graceful degradation: save locally but skip cloud push when over limit

## Offline Support
- Queue all changes when offline
- Detect online/offline via `navigator.onLine` + `online`/`offline` events
- Flush queue when connection restored
