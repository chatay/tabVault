import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TabVault',
    description: 'Save tabs with one click. Sync to cloud. Never lose them.',
    version: '0.1.0',
    permissions: ['tabs', 'storage', 'alarms'],
    host_permissions: [],
  },
});
