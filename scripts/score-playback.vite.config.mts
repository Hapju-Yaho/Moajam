import base from '../apps/web/vite.config';
import { mergeConfig } from 'vite';
export default mergeConfig(base, {
  root: process.cwd(),
  server: { watch: { ignored: ['**/.tmp/**'] } },
  build: {
    outDir: '.tmp/score-performance-dist',
    rollupOptions: { input: 'scripts/score-playback-clock.browser.html' },
  },
});
