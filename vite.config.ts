import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,wasm,json}'], maximumFileSizeToCacheInBytes: 8 * 1024 * 1024 },
      manifest: {
        name: 'Formulador de raciones a costo mínimo',
        short_name: 'Formulador',
        lang: 'es',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2f6b3a',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
});
