import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim();

  return {
    plugins: [
      react(),
      tsconfigPaths(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
            dest: 'vad',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
            dest: 'vad',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
            dest: 'vad',
          },
          {
            src: 'node_modules/onnxruntime-web/dist/*.wasm',
            dest: 'vad',
          },
          {
            src: 'node_modules/onnxruntime-web/dist/*.mjs',
            dest: 'vad',
          },
        ],
      }),
    ],
    server: {
      host: true,
      port: Number(env.VITE_PORT) || 5173,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      proxy: apiProxyTarget
        ? {
            '/api': {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path.replace(/^\/api/, ''),
              configure(proxyServer) {
                proxyServer.on('error', (error) => {
                  // Helps debugging backend connectivity during local dev.
                  console.error('Audio cleanup proxy error:', error);
                });
              },
            },
          }
        : undefined,
    },
    preview: {
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
            webav: ['@webav/av-cliper', '@webav/av-canvas', '@webav/av-recorder'],
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        '@webav/av-cliper',
        '@webav/av-canvas',
        '@webav/av-recorder',
        'onnxruntime-web',
      ],
    },
    define: {
      __APP_TITLE__: JSON.stringify(env.VITE_APP_TITLE ?? 'Grava'),
    },
  };
});
