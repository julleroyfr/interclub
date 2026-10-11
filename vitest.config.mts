import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Tests unitaires / composants (Vitest + Testing Library).
// L'E2E est géré par Playwright (voir playwright.config.ts) et exclu ici.
export default defineConfig({
  plugins: [react()],
  // Résolution native des alias tsconfig (@/* -> src/*).
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // On ne ramasse que les tests unitaires/composants ; l'E2E vit dans e2e/.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e'],
  },
})
