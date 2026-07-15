import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    proxy: {
      '/api-icp': {
        target: 'https://icptokens.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-icp/, ''),
      }
    }
  },
  preview: {
    allowedHosts: true,
  },
});
