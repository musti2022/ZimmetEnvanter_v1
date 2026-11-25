import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => ({
  plugins: [react()],
  // "vite build --watch" (npm run dev) her derlemede dist'i boşaltmasın: telefondan açılan
  // HTTPS adresi derleme sırasında boş sayfa vermesin. Normal "vite build" yine temizler.
  build: { emptyOutDir: !process.argv.includes('--watch') },
  server: {
    port: 5175,
    host: true, // dev'de ağdaki diğer bilgisayarlardan erişim
    proxy: {
      // Dev API 5177'de çalışır — açılışta otomatik başlayan üretim sunucusu (5176) ile çakışmaz
      '/api': 'http://localhost:5177',
    },
  },
}))
