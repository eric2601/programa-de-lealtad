import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/v1': 'http://localhost:8787' },
  },
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true, passes: 2 },
      mangle: { toplevel: true },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        // Nombres genéricos: no delatan librerías ni features en las rutas de red.
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/mod-[hash].js',
        assetFileNames: 'assets/res-[hash][extname]',
      },
    },
  },
});
