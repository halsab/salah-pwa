import { vi } from 'vitest'
import type { AppServices } from '../App'
import type { SavedCoordinates } from '../domain/types'
import type { LocationSelectionSource } from '../domain/locationSelection'
import type { CalculationSettings } from '../domain/prayerCalculation'
import { effectiveCalculationSettings } from '../domain/calculationSettings'
import { failure, success } from '../domain/result'

export interface TestSettingsServices extends Pick<AppServices, 'saveSettings'> {
  saveCalculatedLocation: (place: SavedCoordinates, source: LocationSelectionSource, isCurrent?: () => boolean) => ReturnType<AppServices['saveSettings']>
  saveCalculationSettings: (settings: CalculationSettings) => ReturnType<AppServices['saveSettings']>
}

export function settingsServices(overrides: Partial<TestSettingsServices> = {}): TestSettingsServices {
  const spies: Omit<TestSettingsServices, 'saveSettings'> = {
    saveCalculatedLocation: vi.fn<TestSettingsServices['saveCalculatedLocation']>().mockResolvedValue(success(undefined)),
    saveCalculationSettings: vi.fn<TestSettingsServices['saveCalculationSettings']>().mockResolvedValue(success(undefined)),
    ...overrides,
  }
  return { ...spies, saveSettings: overrides.saveSettings ?? vi.fn<AppServices['saveSettings']>(async (patch, isCurrent) => {
    if (patch.locationChoice) {
      if (patch.locationChoice.mode !== 'calculated') return failure({ kind: 'data', reason: 'invalid' })
      const result = await spies.saveCalculatedLocation(patch.locationChoice.coordinates, patch.locationChoice.source, isCurrent)
      if (!result.ok) return result
    }
    if (patch.sourcePreferences?.mode === 'manual') {
      return spies.saveCalculationSettings(effectiveCalculationSettings(patch.sourcePreferences.source.calculation))
    }
    return success(undefined)
  }) }
}
