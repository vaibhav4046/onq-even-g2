import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1100, // three-vendor (~1 MB) is lazy and never blocks first paint
    rollupOptions: {
      output: {
        // Stable vendor chunks. three-vendor is only reached through lazy imports (G2Hardware3D, Memory3DGalaxy).
        manualChunks(id) {
          // The dynamic-import helper must stay in an eager chunk, or the entry would pull three-vendor in.
          if (id.includes('vite/preload-helper')) return 'react-vendor';
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](three|three-stdlib|@react-three|maath|meshline|troika[^\\/]*)[\\/]/.test(id)) return 'three-vendor';
          if (/[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'motion-vendor';
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/voice/stream': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api/voice/stream': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
