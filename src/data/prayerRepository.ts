import { isLocationSelectionSource } from '../domain/locationSelection'
import { isCalendarPreferences, restoreCalendarPreferences, type CalendarPreferences } from '../domain/calendar'
import { findRecentPlace, migrateRecentPlaces, rememberPlace, restoreRecentPlaces, updateRecentPlace } from '../domain/recentPlaces'
import type { Place } from '../domain/place'
import { migratePlaceChoice, placeFromChoice } from '../domain/placeMigration'
import { restoreSourcePreferences, isSourcePreferences, type SourcePreferences } from '../domain/sourcePreferences'
import type { DataFailure, StorageFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import {
  clearAppData, getDataGeneration, getStartupData, getSettings, saveSettings,
  type LocationChoice, type SettingsPatch, type Appearance, type PlacePersistenceEvent,
} from '../storage/database'
import { TATARSTAN_LOCALITIES } from './tatarstanLocalities'
import { restoreThemeFamily, type ThemeFamily } from '../domain/theme'
import { restoreLanguagePreference, type LanguagePreference } from '../localization/locale'
import { isFastingModePreferences, restoreFastingModePreferences, type FastingModePreferences } from '../domain/fasting'

export interface PrayerRepositoryState {
  calendarPreferences?: CalendarPreferences
  recentPlaces?: Place[]
  recentPlacesMigrated?: boolean
  locationChoice: LocationChoice | null
  appearance?: Appearance
  themeFamily?: ThemeFamily
  preferences: SourcePreferences
  languagePreference?: LanguagePreference
  fastingMode?: FastingModePreferences
}

export interface PrayerRepositoryOptionalSettings {
  recentPlaces: Place[]
  recentPlacesMigrated: boolean
  calendarPreferences: CalendarPreferences
  themeFamily: ThemeFamily
  languagePreference: LanguagePreference
  fastingMode: FastingModePreferences
}

function reconcilePlaceHistory(stored: { locationChoice: unknown; recentPlaces: unknown; recentPlacesMigrated: unknown }, patch: SettingsPatch) {
  const activeChoice = stored.locationChoice && typeof stored.locationChoice === 'object'
    ? stored.locationChoice as LocationChoice
    : null
  const originalActive = activeChoice ? placeFromChoice(activeChoice, TATARSTAN_LOCALITIES) : null
  const migrated = stored.recentPlacesMigrated === true
    ? restoreRecentPlaces(stored.recentPlaces)
    : migrateRecentPlaces(stored.recentPlaces, originalActive)
  let recentPlaces = migrated
  let locationChoice = patch.placeEvents?.length ? undefined : patch.locationChoice
  let active = originalActive
  if (patch.placeEvents?.length) {
    for (const event of patch.placeEvents) {
      const next = placeFromChoice(event.choice, TATARSTAN_LOCALITIES)
      if (!next) continue
      if (event.change === 'selection') {
        recentPlaces = rememberPlace(recentPlaces, next)
      } else {
        if ((active?.id ?? null) !== event.expectedPlaceId) continue
        if (event.change === 'refinement') {
          if (active?.selection !== 'gps' || next.selection !== 'gps' || active.id !== next.id) continue
          const target = findRecentPlace(recentPlaces, active)
          if (!target) continue
          recentPlaces = updateRecentPlace(recentPlaces, next, target.id)
        }
      }
      active = next
      locationChoice = event.choice
    }
  } else if (patch.recentPlaces && !patch.normalizeRecentPlaces) {
    const incoming = restoreRecentPlaces(patch.recentPlaces)
    recentPlaces = stored.recentPlacesMigrated === true ? incoming : restoreRecentPlaces([...incoming, ...migrated])
  }
  return { recentPlaces, recentPlacesMigrated: true as const, locationChoice }
}

interface StoredOptionalSettings {
  recentPlaces: unknown
  recentPlacesMigrated: unknown
  calendarPreferences: unknown
  themeFamily: unknown
  languagePreference: unknown
  fastingMode: unknown
}

function restoreOptionalSettings(values: StoredOptionalSettings): PrayerRepositoryOptionalSettings {
  return {
    recentPlaces: restoreRecentPlaces(values.recentPlaces),
    recentPlacesMigrated: values.recentPlacesMigrated === true,
    calendarPreferences: restoreCalendarPreferences(values.calendarPreferences),
    themeFamily: restoreThemeFamily(values.themeFamily),
    languagePreference: restoreLanguagePreference(values.languagePreference),
    fastingMode: restoreFastingModePreferences(values.fastingMode),
  }
}

async function loadOptionalSettingsResult(): Promise<Result<PrayerRepositoryOptionalSettings, StorageFailure>> {
  const stored = await getSettings(['recentPlaces', 'recentPlacesMigrated', 'calendarPreferences', 'themeFamily', 'languagePreference', 'fastingMode'])
  return stored.ok ? success(restoreOptionalSettings(stored.value)) : stored
}

async function restoreRepositoryState(): Promise<Result<{ state: PrayerRepositoryState; generation: number }, StorageFailure>> {
  const startup = await getStartupData()
  if (!startup.ok) return startup
  const optional = await loadOptionalSettingsResult()
  if (!optional.ok) return optional
  const choice = startup.value.choice
  const locationChoice = choice === undefined ? null : restoreLocationChoice(choice)
  const state: PrayerRepositoryState = {
    ...optional.value,
    locationChoice,
    appearance: startup.value.appearance === 'light' || startup.value.appearance === 'dark' ? startup.value.appearance : 'system',
    preferences: restoreSourcePreferences(startup.value.preferences),
  }
  return success({ state, generation: startup.value.generation })
}

function restoreLocationChoice(value: unknown): LocationChoice | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { mode?: unknown; source?: unknown }
  const choice = value as LocationChoice
  if (!isLocationSelectionSource(raw.source) || (raw.mode !== 'official' && raw.mode !== 'calculated')
    || !placeFromChoice(choice, TATARSTAN_LOCALITIES)) return null
  return migratePlaceChoice(choice, TATARSTAN_LOCALITIES)
}

export async function loadPrayerRepositoryOptionalSettings(): Promise<Result<PrayerRepositoryOptionalSettings, StorageFailure>> {
  return loadOptionalSettingsResult()
}

export async function initializePrayerRepository(): Promise<Result<PrayerRepositoryState, StorageFailure>> {
  const result = await restoreRepositoryState()
  return result.ok ? success(result.value.state) : result
}

export function createPrayerRepository() {
  let epoch = 0
  let generation = 0
  return {
    initialize: async () => {
      const operation = epoch
      const result = await restoreRepositoryState()
      if (operation === epoch && result.ok) generation = result.value.generation
      return result.ok ? success(result.value.state) : result
    },
    initializeStartup: async () => {
      const operation = epoch
      const result = await restoreRepositoryState()
      if (!result.ok) return result
      if (operation === epoch) generation = result.value.generation
      return success(result.value.state)
    },
    loadOptionalSettings: loadPrayerRepositoryOptionalSettings,
    clearAppData,
    getDataGeneration,
    invalidateAndDrain: () => { epoch += 1; return Promise.resolve() },
    saveSettings: (patch: SettingsPatch, isCurrent?: () => boolean): Promise<Result<void, StorageFailure | DataFailure>> => {
      if (patch.calendarPreferences && !isCalendarPreferences(patch.calendarPreferences)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.sourcePreferences && !isSourcePreferences(patch.sourcePreferences)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.locationChoice && (patch.locationChoice.mode !== 'calculated'
        || !placeFromChoice(patch.locationChoice, TATARSTAN_LOCALITIES))) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.placeEvents && (!Array.isArray(patch.placeEvents) || patch.placeEvents.some((raw: unknown) => {
        if (!raw || typeof raw !== 'object') return true
        const event = raw as Partial<PlacePersistenceEvent>
        return !event.change || !['selection', 'refinement', 'automatic'].includes(event.change)
          || !event.choice || event.choice.mode !== 'calculated' || !placeFromChoice(event.choice, TATARSTAN_LOCALITIES)
          || event.change !== 'selection' && !(typeof event.expectedPlaceId === 'string' || event.expectedPlaceId === null)
      }))) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.appearance && !['system', 'light', 'dark'].includes(patch.appearance)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.themeFamily && restoreThemeFamily(patch.themeFamily) !== patch.themeFamily) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.recentPlaces && (!Array.isArray(patch.recentPlaces) || restoreRecentPlaces(patch.recentPlaces).length !== patch.recentPlaces.length)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.languagePreference && restoreLanguagePreference(patch.languagePreference) !== patch.languagePreference) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.fastingMode && !isFastingModePreferences(patch.fastingMode)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      return saveSettings(patch, isCurrent, generation, reconcilePlaceHistory)
    },
  }
}

export const prayerRepository = createPrayerRepository()
