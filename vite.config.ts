import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    // Live Supabase tests run only via `npm run test:integration`.
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.INTEGRATION ? [] : ['**/*.integration.test.ts']),
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
