import type {
  DataFailure,
  StorageFailure,
  UpdateFailure,
} from '../domain/errors'
import {
  isLocationSelectionSource,
  type LocationSelectionSource,
} from '../domain/locationSelection'
import {
  CALCULATION_PROFILES,
  DEFAULT_CALCULATION_SETTINGS,
  type CalculationSettings,
} from '../domain/prayerCalculation'
import { failure, success, type Result } from '../domain/result'
import { getDeviceTimeZone, isValidTimeZone } from '../domain/locationTime'
import type { PrayerDataset, SavedCoordinates } from '../domain/types'
import {
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
  getSetting,
  replaceDataset,
  saveLocationChoice,
  setSetting,
  type DatasetMeta,
  type LocationChoice,
} from '../storage/database'

const DATA_URL = `${import.meta.env.BASE_URL}data/prayer-times-current.json`

export interface PrayerRepositoryState {
  meta: DatasetMeta
  locationChoice: LocationChoice
  calculationSettings: CalculationSettings
  warning: UpdateFailure | null
}

function isPrayerDataset(value: unknown): value is PrayerDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<PrayerDataset>

  return (
    dataset.schemaVersion === 2
    && Array.isArray(dataset.source?.years)
    && dataset.source.years.length > 0
    && dataset.source.years.every((year) => typeof year === 'number')
    && typeof dataset.source.updatedAt === 'string'
    && Array.isArray(dataset.locations)
    && dataset.locations.length > 0
    && Array.isArray(dataset.days)
    && dataset.days.length > 0
  )
}

function dataFailure(reason: DataFailure['reason']): DataFailure {
  return { kind: 'data', reason }
}

async function fetchBundledDataset(): Promise<
  Result<PrayerDataset, DataFailure>
> {
  let response: Response
  try {
    response = await fetch(DATA_URL)
  } catch {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return failure(dataFailure(offline ? 'offline' : 'unavailable'))
  }

  if (!response.ok) return failure(dataFailure('unavailable'))

  try {
    const value: unknown = await response.json()
    return isPrayerDataset(value)
      ? success(value)
      : failure(dataFailure('invalid'))
  } catch {
    return failure(dataFailure('invalid'))
  }
}

function toMeta(dataset: PrayerDataset): DatasetMeta {
  return {
    schemaVersion: dataset.schemaVersion,
    source: dataset.source,
    locations: dataset.locations,
  }
}

export function shouldReplaceDataset(
  cachedMeta: DatasetMeta | undefined,
  dataset: PrayerDataset,
): boolean {
  const cachedYears = (cachedMeta?.source as Partial<PrayerDataset['source']> | undefined)
    ?.years

  return (
    !cachedMeta
    || cachedMeta.schemaVersion !== dataset.schemaVersion
    || cachedMeta.source.updatedAt !== dataset.source.updatedAt
    || !Array.isArray(cachedYears)
    || cachedYears.join(',') !== dataset.source.years.join(',')
  )
}

function defaultLocationChoice(meta: DatasetMeta): LocationChoice | undefined {
  const locationId = meta.locations.find(({ id }) => id === 'kazan')?.id
    ?? meta.locations[0]?.id
  return locationId
    ? { mode: 'official', locationId, source: 'default' }
    : undefined
}

function restoreLocationChoice(
  value: unknown,
  meta: DatasetMeta,
): LocationChoice | undefined {
  const fallback = defaultLocationChoice(meta)
  if (!value || typeof value !== 'object') return fallback

  const choice = value as Partial<LocationChoice>
  if (!isLocationSelectionSource(choice.source)) return fallback

  if (
    choice.mode === 'official'
    && 'locationId' in choice
    && typeof choice.locationId === 'string'
    && meta.locations.some(({ id }) => id === choice.locationId)
  ) {
    return {
      mode: 'official',
      locationId: choice.locationId,
      source: choice.source,
    }
  }

  if (choice.mode === 'calculated' && 'coordinates' in choice) {
    const coordinates = restoreSavedCoordinates(choice.coordinates)
    if (coordinates) {
      return {
        mode: 'calculated',
        coordinates,
        source: choice.source,
      }
    }
  }

  return fallback
}

export async function initializePrayerRepository(): Promise<
  Result<PrayerRepositoryState, DataFailure | StorageFailure>
> {
  const cachedMetaResult = await getDatasetMeta()
  if (!cachedMetaResult.ok) return cachedMetaResult

  const cachedMeta = cachedMetaResult.value
  let meta = cachedMeta
  let warning: UpdateFailure | null = null
  const bundledResult = await fetchBundledDataset()

  if (bundledResult.ok) {
    if (shouldReplaceDataset(cachedMeta, bundledResult.value)) {
      const replacement = await replaceDataset(bundledResult.value)
      if (!replacement.ok) return replacement
    }
    meta = toMeta(bundledResult.value)
  } else if (!cachedMeta) {
    return bundledResult
  } else {
    warning = { kind: 'update', reason: 'failed' }
  }

  if (!meta) return failure(dataFailure('unavailable'))

  const [storedChoiceResult, storedSettingsResult] = await Promise.all([
    getLocationChoice(),
    getSetting('calculationSettings'),
  ])
  if (!storedChoiceResult.ok) return storedChoiceResult
  if (!storedSettingsResult.ok) return storedSettingsResult

  const locationChoice = restoreLocationChoice(storedChoiceResult.value, meta)
  if (!locationChoice) return failure(dataFailure('invalid'))

  return success({
    meta,
    locationChoice,
    calculationSettings: isCalculationSettings(storedSettingsResult.value)
      ? storedSettingsResult.value
      : DEFAULT_CALCULATION_SETTINGS,
    warning,
  })
}

function restoreSavedCoordinates(value: unknown): SavedCoordinates | null {
  if (!value || typeof value !== 'object') return null
  const coordinates = value as Partial<SavedCoordinates>
  const fieldsAreValid =
    Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && (coordinates.accuracy === null || Number.isFinite(coordinates.accuracy))
    && Number.isFinite(coordinates.timestamp)
    && (coordinates.name === undefined || typeof coordinates.name === 'string')
    && (coordinates.cityId === undefined || Number.isInteger(coordinates.cityId))
    && (coordinates.nameSource === undefined
      || ['geonames', 'nominatim'].includes(coordinates.nameSource))
    && (coordinates.source === undefined
      || ['gps', 'preset'].includes(coordinates.source))
    && (coordinates.timeZone === undefined
      || (typeof coordinates.timeZone === 'string'
        && isValidTimeZone(coordinates.timeZone)))

  if (!fieldsAreValid) return null

  return {
    ...(coordinates as SavedCoordinates),
    timeZone: coordinates.timeZone ?? getDeviceTimeZone(),
  }
}

function isCalculationSettings(value: unknown): value is CalculationSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<CalculationSettings>
  return (
    CALCULATION_PROFILES.some(({ id }) => id === settings.profile)
    && ['hanafi', 'standard'].includes(settings.asrMethod ?? '')
    && ['dumRt', 'seventhOfNight', 'twilightAngle', 'nearestDay'].includes(
      settings.highLatitudeRule ?? '',
    )
  )
}

export const prayerRepository = {
  initialize: initializePrayerRepository,
  getDay: getPrayerDay,
  saveOfficialLocation: (
    locationId: string,
    source: LocationSelectionSource,
  ) => saveLocationChoice({ mode: 'official', locationId, source }),
  saveCalculatedLocation: (
    coordinates: SavedCoordinates,
    source: LocationSelectionSource,
  ) => {
    if (!isValidTimeZone(coordinates.timeZone)) {
      return Promise.resolve(failure(dataFailure('invalid')))
    }
    return saveLocationChoice({ mode: 'calculated', coordinates, source })
  },
  saveCalculationSettings: (settings: CalculationSettings) =>
    setSetting('calculationSettings', settings),
}
