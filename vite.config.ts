import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * Emits sw.js at build time with every built file precached, so the installed
 * home-screen app works fully offline after the first visit.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', ...Object.keys(bundle).map((f) => `./${f}`)]
      const publicFiles = ['./manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './icon-192.png', './icon-512.png']
      const version = Date.now().toString(36)
      const source = `
const CACHE = 'chess-puzzles-${version}'
const PRECACHE = ${JSON.stringify([...files, ...publicFiles])}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // Network first for the page so updates arrive; cached shell when offline.
    event.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })))
    return
  }
  // ignoreVary: crossorigin module/style requests carry an Origin header the precache lacked.
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)))
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative paths so the build works from any sub-folder (e.g. GitHub Pages).
  base: './',
  plugins: [react(), offlineServiceWorker()],
})
