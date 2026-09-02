import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/salah-pwa/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['app-icon.svg', 'apple-touch-icon.png', 'paper-texture.svg'],
      manifest: {
        name: 'Salah — времена намаза',
        short_name: 'Salah',
        description: 'Официальные времена ДУМ РТ и автономный расчёт намаза по GPS — без интернета.',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#f6eedf',
        theme_color: '#184c3b',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
        globIgnores: ['**/data/cities-current.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/data\/cities-current\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'city-data',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 1 },
            },
          },
        ],
      },
      devOptions: { enabled: false }
    })
  ]
})
