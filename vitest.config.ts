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
        'scripts/nextReleaseVersion.ts',
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
        lines: 89,
        'src/domain/**': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 97
        },
        'src/data/cityRepository.ts': {
          statements: 90,
          branches: 90,
          functions: 100,
          lines: 96
        },
        'src/data/reverseGeocoder.ts': {
          statements: 98,
          branches: 92,
          functions: 100,
          lines: 97
        },
        'src/data/prayerDatasetManifest.ts': {
          statements: 86,
          branches: 90,
          functions: 90,
          lines: 91
        },
        'src/data/prayerRepository.ts': {
          statements: 80,
          branches: 69,
          functions: 88,
          lines: 88
        },
        'src/storage/**': {
          statements: 95,
          branches: 86,
          functions: 89,
          lines: 98
        },
        'scripts/checkActionPins.ts': {
          statements: 95,
          branches: 88,
          functions: 100,
          lines: 95
        },
        'scripts/checkBuildBudgets.ts': {
          statements: 98,
          branches: 86,
          functions: 100,
          lines: 98
        },
        'scripts/**': {
          statements: 89,
          branches: 75,
          functions: 96,
          lines: 90
        }
      }
    }
  }
})
