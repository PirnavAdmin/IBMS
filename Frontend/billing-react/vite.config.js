import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = (env.VITE_API_BASE_URL || 'https://pediatric-astrology-outrank.ngrok-free.dev').replace(/\/+$/, '');

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['axios'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        axios: path.resolve(__dirname, './node_modules/axios/index.js'),
        'billing-contracts': path.resolve(__dirname, '../billing-contracts'),
        'billing-api-client': path.resolve(__dirname, '../billing-api-client'),
        'billing-react': path.resolve(__dirname, './src/components'),
        '@components': path.resolve(__dirname, './src/components'),
        '@pages': path.resolve(__dirname, './src/pages'),
        '@routes': path.resolve(__dirname, './src/routes'),
        '@styles': path.resolve(__dirname, './src/styles'),
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api/pincode': {
          target: 'https://api.postalpincode.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/pincode/, '/pincode'),
          secure: false,
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
        },
      },
    },
  };
});
