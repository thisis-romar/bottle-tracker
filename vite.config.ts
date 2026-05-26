import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves from /repo-name/ — VITE_BASE_PATH is set by the deploy workflow.
  // Falls back to '/' for local dev.
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ontario Bottle Return Tracker',
        short_name: 'BottleTrack',
        description: 'Track Ontario ODRP deposit containers for return',
        theme_color: '#15803d',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        // Relative paths so the installed PWA works under a sub-path base
        // (GitHub Pages serves at /bottle-tracker/, not the domain root).
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Keep the ~19 MB Tesseract OCR assets OUT of the install precache — they're
        // runtime-cached on first use instead (offline-capable after the first OCR).
        globIgnores: ['**/tesseract/**'],
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-ocr',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
})
