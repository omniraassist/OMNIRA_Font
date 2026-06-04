import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_PROXY_API || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  build: {
    // Split the heavy file-parsing libs out of the main bundle. They only
    // run inside the customer panel's knowledge-upload flow, so loading
    // them eagerly used to ship ~1.2 MB of code to every landing-page
    // visitor — enough to OOM-crash low-end phones after the page
    // flashed. Each entry below becomes its own JS chunk that's fetched
    // on demand.
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          xlsx: ['xlsx'],
          mammoth: ['mammoth'],
          stripe: ['@stripe/stripe-js', '@stripe/react-stripe-js'],
        },
      },
    },
    // Raise the warning threshold to match the new (legitimate) chunks.
    chunkSizeWarningLimit: 800,
  },
  server: {
    // host: true binds to 0.0.0.0 so the dev server is reachable from a
    // phone on the same Wi-Fi via the PC's LAN IP (Vite prints it as
    // "Network: http://192.168.x.x:5173"). Without this, mobile devices
    // see a blank/dark screen because localhost only resolves on the PC.
    host: true,
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
