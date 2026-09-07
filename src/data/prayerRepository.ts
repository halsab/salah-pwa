import type { Place } from '../domain/place'
import { migratePlaceChoice, restoreSavedCoordinates } from '../domain/placeMigration'
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
import { isValidTimeZone } from '../domain/locationTime'
import type {
  PrayerDataset,
  PrayerDatasetManifest,
  SavedCoordinates,
} from '../domain/types'
import {
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
  getPrayerDays,
  getSetting,
  replaceDataset,
  saveLocationChoice,
  setSetting,
  type DatasetIdentity,
  type DatasetMeta,
  type LocationChoice,
} from '../storage/database'
import {
  resolvePrayerDatasetUrl,
  validatePrayerDatasetManifest,
  verifyPrayerDatasetBytes,
  type PrayerDatasetByteOperations,
} from './prayerDatasetManifest'

const MANIFEST_URL = `${import.meta.env.BASE_URL}data/prayer-times-manifest.json`

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type PrayerRepositoryInitializationOperations = Partial<
  PrayerDatasetByteOperations
> & {
  fetch?: Fetcher
  onCached?: (state: PrayerRepositoryState) => void
}

export interface PrayerRepositoryState {
  meta: DatasetMeta
  locationChoice: LocationChoice
  calculationSettings: CalculationSettings
  warning: UpdateFailure | null
}

function dataFailure(reason: DataFailure['reason']): DataFailure {
  return { kind: 'data', reason }
}

function fetchFailure(): DataFailure {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return dataFailure(offline ? 'offline' : 'unavailable')
}

async function fetchManifest(fetcher: Fetcher): Promise<
  Result<PrayerDatasetManifest, DataFailure>
> {
  let response: Response
  try {
    response = await fetcher(MANIFEST_URL, { cache: 'no-store' })
  } catch {
    return failure(fetchFailure())
  }

  if (!response.ok) return failure(dataFailure('unavailable'))

  try {
    return validatePrayerDatasetManifest(await response.json() as unknown)
  } catch {
    return failure(dataFailure('invalid'))
  }
}

async function fetchVerifiedDataset(
  fetcher: Fetcher,
  manifest: PrayerDatasetManifest,
  operations: Partial<PrayerDatasetByteOperations>,
): Promise<Result<PrayerDataset, DataFailure>> {
  let response: Response
  try {
    response = await fetcher(
      resolvePrayerDatasetUrl(MANIFEST_URL, manifest),
      { cache: 'no-store' },
    )
  } catch {
    return failure(fetchFailure())
  }

  if (!response.ok) return failure(dataFailure('unavailable'))

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch {
    return failure(fetchFailure())
  }
  return verifyPrayerDatasetBytes(bytes, manifest, operations)
}

function manifestIdentity(manifest: PrayerDatasetManifest): DatasetIdentity {
  return {
    version: manifest.version,
    url: manifest.url,
    sha256: manifest.sha256,
  }
}

function toMeta(
  dataset: PrayerDataset,
  identity: DatasetIdentity,
): DatasetMeta {
  return {
    schemaVersion: dataset.schemaVersion,
    source: dataset.source,
    locations: dataset.locations,
    identity,
  }
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
      ...(choice.place ? { place: choice.place } : {}),
    }
  }

  if (choice.mode === 'calculated' && 'coordinates' in choice) {
    const coordinates = restoreSavedCoordinates(choice.coordinates)
    if (coordinates) {
      return {
        mode: 'calculated',
        coordinates,
        source: choice.source,
        ...(choice.place ? { place: choice.place } : {}),
      }
    }
  }

  return fallback
}

export async function initializePrayerRepository(): Promise<
  Result<PrayerRepositoryState, DataFailure | StorageFailure>
>
export async function initializePrayerRepository(
  operations: PrayerRepositoryInitializationOperations,
): Promise<Result<PrayerRepositoryState, DataFailure | StorageFailure>>
export async function initializePrayerRepository(
  operations: PrayerRepositoryInitializationOperations = {},
): Promise<Result<PrayerRepositoryState, DataFailure | StorageFailure>> {
  const cachedMetaResult = await getDatasetMeta()
  if (!cachedMetaResult.ok) return cachedMetaResult

  const cachedMeta = cachedMetaResult.value
  if (cachedMeta && operations.onCached) {
    const [choice, settings] = await Promise.all([getLocationChoice(), getSetting('calculationSettings')])
    if (choice.ok && settings.ok) {
      const restored = restoreLocationChoice(choice.value, cachedMeta)
      if (restored) operations.onCached({ meta: cachedMeta, locationChoice: migratePlaceChoice(restored, cachedMeta.locations),
        calculationSettings: isCalculationSettings(settings.value) ? settings.value : DEFAULT_CALCULATION_SETTINGS, warning: null })
    }
  }
  let meta = cachedMeta
  let warning: UpdateFailure | null = null
  const fetcher = operations.fetch
    ?? ((input, init) => globalThis.fetch(input, init))
  const manifestResult = await fetchManifest(fetcher)

  if (!manifestResult.ok) {
    if (!cachedMeta) return manifestResult
    warning = { kind: 'update', reason: 'failed' }
  } else if (cachedMeta?.identity?.sha256 !== manifestResult.value.sha256) {
    const datasetResult = await fetchVerifiedDataset(
      fetcher,
      manifestResult.value,
      operations,
    )
    if (datasetResult.ok) {
      const identity = manifestIdentity(manifestResult.value)
      const replacement = await replaceDataset(datasetResult.value, identity)
      if (!replacement.ok) return replacement
      meta = toMeta(datasetResult.value, identity)
    } else if (!cachedMeta) {
      return datasetResult
    } else {
      warning = { kind: 'update', reason: 'failed' }
    }
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
    locationChoice: migratePlaceChoice(locationChoice, meta.locations),
    calculationSettings: isCalculationSettings(storedSettingsResult.value)
      ? storedSettingsResult.value
      : DEFAULT_CALCULATION_SETTINGS,
    warning,
  })
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
  initialize: (onCached?: (state: PrayerRepositoryState) => void) => initializePrayerRepository(onCached ? { onCached } : {}),
  getDay: getPrayerDay,
  getDays: getPrayerDays,
  saveOfficialLocation: (
    locationId: string,
    source: LocationSelectionSource,
    place?: Place,
    isCurrent?: () => boolean,
  ) => saveLocationChoice({ mode: 'official', locationId, source, ...(place ? { place } : {}) }, isCurrent),
  saveCalculatedLocation: (
    coordinates: SavedCoordinates,
    source: LocationSelectionSource,
    isCurrent?: () => boolean,
  ) => {
    if (!isValidTimeZone(coordinates.timeZone)) {
      return Promise.resolve(failure(dataFailure('invalid')))
    }
    const place = 'selection' in coordinates ? coordinates as Place : undefined
    return saveLocationChoice({ mode: 'calculated', coordinates, source, ...(place ? { place } : {}) }, isCurrent)
  },
  saveCalculationSettings: (settings: CalculationSettings) =>
    setSetting('calculationSettings', settings),
}
