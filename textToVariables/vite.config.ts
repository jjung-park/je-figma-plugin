import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  base: './', // 👈 매우 중요: 절대 경로(/) 대신 상대 경로(./) 사용
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000, // 모든 자산을 인라인화
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: undefined, // 청크 분리 방지
      },
    },
  },
})