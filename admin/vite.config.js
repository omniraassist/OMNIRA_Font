import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_PROXY_API || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true → reachable from phones on the same Wi-Fi via PC's LAN IP.
    host: true,
    port: 5174,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
