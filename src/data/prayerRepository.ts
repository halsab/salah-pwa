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
import type {
  PrayerDataset,
  PrayerDatasetManifest,
  SavedCoordinates,
} from '../domain/types'
import {
  getDatasetMeta,
  getLocationChoice,
  getPrayerDay,
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
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
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
