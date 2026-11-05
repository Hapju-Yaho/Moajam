import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/v1/, '/v1'),
      },
      '/api/youtube-oembed': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/youtube-oembed/, '/oembed'),
      },
    },
  },
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../../packages/app/src', import.meta.url)),
      '@component': fileURLToPath(new URL('../../packages/app/src/components', import.meta.url)),
      '@lib': fileURLToPath(new URL('../../packages/app/src/lib', import.meta.url)),
      '@mocks': fileURLToPath(new URL('../../packages/app/src/mocks', import.meta.url)),
      '@screens': fileURLToPath(new URL('../../packages/app/src/screens', import.meta.url)),
      '@state': fileURLToPath(new URL('../../packages/app/src/state', import.meta.url)),
      '@styles': fileURLToPath(new URL('../../packages/app/src/styles', import.meta.url)),
      '@assets': fileURLToPath(new URL('../../packages/app/assets', import.meta.url)),
      'react-native': fileURLToPath(import.meta.resolve('react-native-web')),
    },
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
});
