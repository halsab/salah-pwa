import { vi } from 'vitest'
import type { AppServices } from '../App'
import type { Place } from '../domain/place'
import type { SavedCoordinates } from '../domain/types'
import type { LocationSelectionSource } from '../domain/locationSelection'
import type { CalculationSettings } from '../domain/prayerCalculation'
import { effectiveCalculationSettings } from '../domain/calculationSettings'
import { success } from '../domain/result'

export interface TestSettingsServices extends Pick<AppServices, 'saveSettings'> {
  saveOfficialLocation: (id: string, source: LocationSelectionSource, place?: Place, isCurrent?: () => boolean) => ReturnType<AppServices['saveSettings']>
  saveCalculatedLocation: (place: SavedCoordinates, source: LocationSelectionSource, isCurrent?: () => boolean) => ReturnType<AppServices['saveSettings']>
  saveCalculationSettings: (settings: CalculationSettings) => ReturnType<AppServices['saveSettings']>
}
export function settingsServices(overrides: Partial<TestSettingsServices> = {}): TestSettingsServices {
  const spies: Omit<TestSettingsServices, 'saveSettings'> = {
    saveOfficialLocation: vi.fn().mockResolvedValue(success(undefined)),
    saveCalculatedLocation: vi.fn().mockResolvedValue(success(undefined)),
    saveCalculationSettings: vi.fn().mockResolvedValue(success(undefined)),
    ...overrides,
  }
  return { ...spies, saveSettings: overrides.saveSettings ?? vi.fn<AppServices['saveSettings']>(async (patch, isCurrent) => {
    if (patch.locationChoice) {
      const choice = patch.locationChoice
      const result = choice.mode === 'official'
        ? await spies.saveOfficialLocation(choice.locationId, choice.source, choice.place, isCurrent)
        : await spies.saveCalculatedLocation(choice.coordinates, choice.source, isCurrent)
      if (!result.ok) return result
    }
    if (patch.sourcePreferences?.mode === 'manual' && patch.sourcePreferences.source.kind === 'calculated') {
      return spies.saveCalculationSettings(effectiveCalculationSettings(patch.sourcePreferences.source.calculation))
    }
    return success(undefined)
  }) }
}
