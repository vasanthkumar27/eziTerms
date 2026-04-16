import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/** Builds the content script as IIFE so it runs on the page without "type": "module". Run after main build. */
export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');
  return {
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/contentScripts/sidebarContent.tsx'),
      },
      output: {
        entryFileNames: 'content.js',
        format: 'iife',
        name: 'EziTermsContent',
      },
    },
  },
};
});
