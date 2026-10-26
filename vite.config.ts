import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset paths, so the built `dist/` works from any folder or
  // sub-path (e.g. GitHub Pages at /Teaser/).
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // three.js alone is ~730 kB minified (190 kB gzipped); that is expected.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // three.js changes rarely; keep it in its own long-cacheable chunk.
        manualChunks: {
          three: ['three'],
          'react-three': ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});
