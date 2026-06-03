import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_PROXY_API || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
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
