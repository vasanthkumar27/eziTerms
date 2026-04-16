import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  // Load .env from extension project root so VITE_* vars are available at build time
  loadEnv(mode, process.cwd(), '');

  // Priority:
  //   1. VITE_API_BASE_URL   — explicit override (full URL, including /api)
  //   2. VITE_USE_AWS=true   — production  (https://api.haptix.in/api)
  //   3. VITE_USE_AWS=false  — local dev   (http://localhost:8000/api)
  const override = (process.env.VITE_API_BASE_URL || '').trim();
  const useAws = ['true', '1', 'yes'].includes(String(process.env.VITE_USE_AWS ?? 'true').toLowerCase());
  const apiBaseUrl = override
    ? override.replace(/\/+$/, '')
    : (useAws ? 'https://api.haptix.in/api' : 'http://localhost:8000/api');

  return {
  define: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/rules.json', dest: '.' },
        { src: 'public/models/*', dest: 'models' },
        { src: 'public/popup.html', dest: '.' },
        { src: 'public/popup.js', dest: '.' },
        { src: 'src/assets/Eziterms-Logo-icon-dark theme.png', dest: 'assets' },
        { src: 'src/assets/eziterms-Logo-icon-light theme.png', dest: 'assets' },
        { src: 'src/assets/eziterms-Logo-icon-dark-theme.png', dest: 'assets' },
        { src: 'src/assets/eziterms-Logo-icon-light-theme.png', dest: 'assets' },
      ],
    }),
  ],
   esbuild: {
    jsx: 'automatic', // Ensures JSX is transformed using the new JSX transform (React 17+)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: 'index.html',
        background: 'src/background.js',
        // content script is built separately as IIFE (see vite.config.content.ts) to avoid "Cannot use import statement outside a module" on the page
      },
      output: {
        entryFileNames: 'src/[name].js',
        format: 'es',
      }
    }
  }
  };
});
