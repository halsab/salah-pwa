import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'src/**/*.{ts,tsx}',
        'scripts/releaseVersion.ts',
        'scripts/parseGeoNamesCities.ts',
        'scripts/prayerDatasetArtifacts.ts',
        'scripts/selectDatasetYear.ts',
        'scripts/checkActionPins.ts',
        'scripts/checkBuildBudgets.ts'
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/domain/errors.ts',
        'src/domain/types.ts'
      ],
      thresholds: {
        statements: 87,
        branches: 81,
        functions: 89,
        lines: 89
      }
    }
  }
})
