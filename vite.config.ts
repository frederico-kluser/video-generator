import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';

  return {
    plugins: [react(), tsconfigPaths()],
    server: {
      host: true,
      port: Number(env.VITE_PORT) || 5173,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    build: {
      target: 'esnext',
      sourcemap: !isProd,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            ai: ['@google/genai'],
          },
        },
      },
    },
    define: {
      __APP_TITLE__: JSON.stringify(env.VITE_APP_TITLE ?? 'EduScript AI'),
    },
  };
});
