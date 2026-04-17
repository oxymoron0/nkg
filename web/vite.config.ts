import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.NKG_API_URL ?? 'http://localhost:18080';

export default defineConfig(({ mode }) => {
  // Tests don't exercise the Vite build pipeline, so they set the slug via
  // `vi.stubEnv` instead of through .env / --build-arg.
  if (mode !== 'test') {
    const env: Record<string, string> = loadEnv(mode, process.cwd(), 'VITE_');
    const workspace = env.VITE_NKG_NOTION_WORKSPACE;
    if (!workspace || workspace.trim() === '') {
      throw new Error(
        'VITE_NKG_NOTION_WORKSPACE is required but unset or empty. ' +
          "Copy 'web/.env.example' to 'web/.env' for local dev, or pass " +
          "'--build-arg VITE_NKG_NOTION_WORKSPACE=<slug>' to `docker build`.",
      );
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@/app': fileURLToPath(new URL('./src/app', import.meta.url)),
        '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
        '@/shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@/stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
        '/healthz': { target: API_TARGET, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.d.ts', 'src/test/**', 'src/main.tsx'],
      },
    },
  };
});
