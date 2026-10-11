import { defineConfig, devices } from '@playwright/test'

// Captures d'écran de la documentation utilisateur (docs/guides/). Ce n'est PAS
// une suite de tests : on rejoue un parcours sur la stack LOCALE au seed et on
// photographie les écrans. Lancer : `npm run doc:captures`.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.captures\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011',
    // Les coachs utilisent l'application sur téléphone : captures au format mobile.
    ...devices['Pixel 7'],
    locale: 'fr-FR',
  },
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
