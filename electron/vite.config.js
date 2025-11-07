import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        settings: path.resolve(__dirname, 'settings.html'),
        selector: path.resolve(__dirname, 'selector.html'),
        floating: path.resolve(__dirname, 'floating.html'),
        logs: path.resolve(__dirname, 'logs.html'),
      },
    },
  },
  server: {
    port: 3000,
  },
});
