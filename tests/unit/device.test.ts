import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEY_DEVICE_ID } from '@/lib/constants';

// Mock chrome.runtime before importing device module
beforeEach(() => {
  // @ts-expect-error -- extending the existing chrome mock
  globalThis.chrome.runtime = {
    getPlatformInfo: vi.fn(async () => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })),
  };
});

describe('device', () => {
  describe('getOrCreateDeviceId', () => {
    it('creates a new device ID when none exists', async () => {
      const mockUUID = 'test-uuid-1234';
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`);

      const { getOrCreateDeviceId } = await import('@/lib/device');
      const deviceId = await getOrCreateDeviceId();

      expect(deviceId).toBe(mockUUID);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEY_DEVICE_ID]: mockUUID,
      });
    });

    it('returns existing device ID when one exists', async () => {
      await chrome.storage.local.set({ [STORAGE_KEY_DEVICE_ID]: 'existing-id' });

      const { getOrCreateDeviceId } = await import('@/lib/device');
      const deviceId = await getOrCreateDeviceId();

      expect(deviceId).toBe('existing-id');
    });
  });

  describe('getDeviceName', () => {
    it('returns device name for Windows', async () => {
      const { getDeviceName } = await import('@/lib/device');
      const name = await getDeviceName();

      expect(name).toBe('Chrome on Windows');
    });

    it('returns device name for Mac', async () => {
      // @ts-expect-error -- extending the existing chrome mock
      globalThis.chrome.runtime.getPlatformInfo = vi.fn(async () => ({
        os: 'mac',
        arch: 'arm',
        nacl_arch: 'arm',
      }));

      const { getDeviceName } = await import('@/lib/device');
      const name = await getDeviceName();

      expect(name).toBe('Chrome on Mac');
    });

    it('returns raw os value for unknown platforms', async () => {
      // @ts-expect-error -- extending the existing chrome mock
      globalThis.chrome.runtime.getPlatformInfo = vi.fn(async () => ({
        os: 'fuchsia',
        arch: 'arm',
        nacl_arch: 'arm',
      }));

      const { getDeviceName } = await import('@/lib/device');
      const name = await getDeviceName();

      expect(name).toBe('Chrome on fuchsia');
    });
  });
});
