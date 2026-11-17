import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
const apiPort = Number(process.env.API_PORT) || 3001;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'هابینو حسابداری',
        short_name: 'هابینو',
        description: 'سیستم‌عامل جامع کسب‌وکار همه‌کاره و آچارفرانسه هابینو برای تمامی اصناف',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        dir: 'rtl',
        lang: 'fa',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      },
      '/signatures': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  }
});