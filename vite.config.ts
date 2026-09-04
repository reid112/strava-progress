import { defineConfig, type Plugin } from 'vite';

/**
 * The built folder must open from file:// as well as a static host. Chrome refuses
 * module scripts and `crossorigin` stylesheet links on file:// (opaque origin), so
 * the bundle is a classic IIFE script and the HTML drops those attributes.
 */
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href=');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScript()],
  worker: { format: 'iife' },
  build: {
    target: 'es2020',
    modulePreload: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { format: 'iife' } },
  },
  server: { fs: { allow: ['..'] } },
});
