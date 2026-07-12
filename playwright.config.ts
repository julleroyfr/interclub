import { defineConfig, devices } from '@playwright/test'

// Tests E2E (parcours IHM). Les specs vivent dans e2e/.
// Rappel projet : tant qu'un environnement de recette reproductible n'est pas
// stabilisé, l'E2E automatisé NE REMPLACE PAS le cahier de test manuel
// (docs/conventions/06-cahier-de-test.md). On démarre petit, sur des parcours
// à faible dépendance données.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Profil mobile pour vérifier le responsive (cf. 08-ihm-responsive.md).
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Démarre l'app en local pour les tests (réutilise un serveur déjà lancé).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
