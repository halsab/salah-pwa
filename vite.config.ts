import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const packageMetadata = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }
const LOCAL_APP_VERSION = `v${packageMetadata.version}`

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-elem 'self'",
  // inline style нужен dialogHooks для блокировки scroll и CSS-переменных visual viewport.
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "media-src 'none'",
  "form-action 'none'",
].join('; ')

export default defineConfig({
  base: '/salah-pwa/',
  define: {
    'import.meta.env.VITE_APP_PACKAGE_VERSION': JSON.stringify(LOCAL_APP_VERSION),
  },
  build: {
    // Плотная минификация сохраняет прежний бюджет расширенного интерфейса.
    minify: 'terser',
    terserOptions: { compress: { passes: 2 }, maxWorkers: 2 },
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)),
      },
    },
  },
  // Worker минифицируется отдельно от основного пакета Terser.
  worker: { rolldownOptions: { output: { minify: true } } },
  plugins: [
    {
      name: 'production-content-security-policy',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: 'head-prepend',
        }],
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['app-icon.svg', 'apple-touch-icon.png', 'old-timey-mono-license.txt', 'data/ODbL-1.0.txt', 'data/tatarstan-boundary.NOTICE.txt'],
      manifest: {
        name: 'Salah — времена намаза',
        short_name: 'Salah',
        description: 'Время намаза для выбранного места: официальные таблицы и расчёт на устройстве. Сохранённые данные доступны офлайн.',
        lang: 'ru',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
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
        importScripts: ['city-cache-cleanup.js'],
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}'],
        globIgnores: [
          '**/data/cities-current.json',
          '**/data/cities/*/*.json',
          'city-cache-cleanup.js',
          '**/data/prayer-times-current.json',
          '**/data/prayer-times-manifest.json',
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/salah-pwa\/data\/prayer-times-(?:current|manifest)\.json$/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/salah-pwa\/data\/cities\/[a-f0-9]{20}\/[A-Z]{2}-[0-9]+\.json$/,
            // Проверенные пакеты сохраняет Worker в IndexedDB; сырой ответ не кешируем.
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false }
    })
  ]
})
