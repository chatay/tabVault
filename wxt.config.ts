import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'TabVault',
    description: 'Save tabs with one click. Sync to cloud. Never lose them.',
    version: '0.1.0',
    permissions: ['tabs', 'storage', 'alarms'],
    host_permissions: [
      'https://*.supabase.co/*',
    ],
  },
});
