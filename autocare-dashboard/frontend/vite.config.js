import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the page runs on http://localhost:5173 and every /api
// request is forwarded to the backend on port 4000. If you change the
// backend PORT in backend/.env, change it here too.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
