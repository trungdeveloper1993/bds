import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative asset paths so the build works when served from a
  // GitHub Pages project subpath (e.g. https://<user>.github.io/bds/).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Cố ý giữ một gói JS duy nhất: service worker lưu trọn ứng dụng để mọi
    // trang đều mở được khi offline (chia nhỏ theo trang sẽ thiếu trang chưa mở).
    chunkSizeWarningLimit: 900,
  },
});
