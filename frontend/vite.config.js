import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/@zxing')) return 'scanner';
          if (id.includes('node_modules/qrcode')) return 'qrcode';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/api': { target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8000', changeOrigin: true } }
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'RaktFlow — Blood Logistics Grid',
        short_name: 'RaktFlow',
        description: 'Verified blood donation and emergency logistics coordination.',
        theme_color: '#e11d48',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
