import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Nothing to copy and no base URL to define: MapLibre is one module and the map
// is built from the pipeline's own files, so there are no engine assets to ship
// alongside the bundle.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // MapLibre reaches for its worker with `new URL('./maplibre-gl-worker',
    // import.meta.url)`. Pre-bundling rewrites that to a path inside
    // .vite/deps that is never written, so the worker 404s, every source stays
    // unloaded and the map paints nothing at all — with no error anywhere.
    exclude: ['maplibre-gl'],
  },
  build: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
