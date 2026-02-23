import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      // Replace import.meta.env with actual values at build time for service workers
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || 'https://devgw.revgain.ai'),
      'import.meta.env.VITE_RGDEV_URL': JSON.stringify(env.VITE_RGDEV_URL || 'https://rgdev.revgain.ai'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [
      react(),
      {
        name: 'copy-manifest',
        writeBundle() {
          // Copy manifest.json to dist
          copyFileSync('src/manifest.json', 'dist/manifest.json');

          // Move sidepanel HTML to root of dist
          if (existsSync('dist/src/sidepanel/index.html')) {
            copyFileSync('dist/src/sidepanel/index.html', 'dist/sidepanel.html');
            // Clean up the nested directory
            try {
              rmSync('dist/src', { recursive: true, force: true });
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          // Copy icons if they exist
          if (!existsSync('dist/icons')) {
            mkdirSync('dist/icons', { recursive: true });
          }
          try {
            if (existsSync('src/icons/icon16.png')) {
              copyFileSync('src/icons/icon16.png', 'dist/icons/icon16.png');
            }
            if (existsSync('src/icons/icon48.png')) {
              copyFileSync('src/icons/icon48.png', 'dist/icons/icon48.png');
            }
            if (existsSync('src/icons/icon128.png')) {
              copyFileSync('src/icons/icon128.png', 'dist/icons/icon128.png');
            }
            if (existsSync('src/icons/rg_blue_logo.png')) {
              copyFileSync('src/icons/rg_blue_logo.png', 'dist/icons/rg_blue_logo.png');
            }
          } catch (e) {
            console.warn('Icons not found, skipping copy');
          }
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
          background: resolve(__dirname, 'src/background/background.ts'),
          loginMonitor: resolve(__dirname, 'src/content/loginMonitor.ts'),
        },
        output: {
          entryFileNames: (chunkInfo: any) => {
            if (chunkInfo.name === 'background') return 'background.js';
            if (chunkInfo.name === 'loginMonitor') return 'loginMonitor.js';
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo: any) => {
            if (assetInfo.name && assetInfo.name.endsWith('index.html')) {
              return 'sidepanel.html';
            }
            return 'assets/[name]-[hash].[ext]';
          },
          // Prevent code splitting for background and loginMonitor to ensure they're self-contained
          manualChunks: (id: string) => {
            // Inline all dependencies for background and loginMonitor
            if (id.includes('background') || id.includes('loginMonitor') || id.includes('constants/env')) {
              return undefined;
            }
            // Consolidate vendor chunks to avoid circular dependencies and runtime hook issues
            if (id.includes('node_modules')) {
              // Only extract echarts as it's the single largest dependency
              if (id.includes('echarts')) {
                return 'charts';
              }
              // Keep everything else in a single vendor chunk to ensure proper module linking
              return 'vendor';
            }
          },
        },
        external: [],
      },
    },
  };
});
