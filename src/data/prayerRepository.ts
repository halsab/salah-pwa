import {
  DEFAULT_CALCULATION_SETTINGS,
  type CalculationSettings,
} from '../domain/prayerCalculation'
import type { PrayerDataset, SavedCoordinates } from '../domain/types'
import {
  getDatasetMeta,
  getPrayerDay,
  getSetting,
  replaceDataset,
  setSetting,
  type DatasetMeta,
  type LocationMode,
} from '../storage/database'

const DATA_URL = `${import.meta.env.BASE_URL}data/prayer-times-current.json`

function isPrayerDataset(value: unknown): value is PrayerDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<PrayerDataset>

  return (
    dataset.schemaVersion === 2 &&
    Array.isArray(dataset.source?.years) &&
    dataset.source.years.length > 0 &&
    dataset.source.years.every((year) => typeof year === 'number') &&
    typeof dataset.source.updatedAt === 'string' &&
    Array.isArray(dataset.locations) &&
    dataset.locations.length > 0 &&
    Array.isArray(dataset.days) &&
    dataset.days.length > 0
  )
}

async function fetchBundledDataset(): Promise<PrayerDataset> {
  const response = await fetch(DATA_URL)
  if (!response.ok) {
    throw new Error(`Расписание недоступно: ${response.status}`)
  }

  const value: unknown = await response.json()
  if (!isPrayerDataset(value)) {
    throw new Error('Файл расписания имеет неизвестный формат')
  }

  return value
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
    !cachedMeta ||
    cachedMeta.schemaVersion !== dataset.schemaVersion ||
    cachedMeta.source.updatedAt !== dataset.source.updatedAt ||
    !Array.isArray(cachedYears) ||
    cachedYears.join(',') !== dataset.source.years.join(',')
  )
}

export async function initializePrayerRepository(): Promise<{
  meta: DatasetMeta
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates | null
  calculationSettings: CalculationSettings
}> {
  const cachedMeta = await getDatasetMeta()
  let meta = cachedMeta

  try {
    const bundled = await fetchBundledDataset()
    if (shouldReplaceDataset(cachedMeta, bundled)) {
      await replaceDataset(bundled)
    }
    meta = toMeta(bundled)
  } catch (error) {
    if (!cachedMeta) throw error
  }

  if (!meta) {
    throw new Error('Расписание ещё не загружено')
  }

  const [storedLocationId, storedMode, storedCoordinates, storedSettings] =
    await Promise.all([
      getSetting('locationId'),
      getSetting('locationMode'),
      getSetting('calculatedLocation'),
      getSetting('calculationSettings'),
    ])
  const locationId = meta.locations.some(({ id }) => id === storedLocationId)
    ? storedLocationId ?? 'kazan'
    : meta.locations.find(({ id }) => id === 'kazan')?.id ?? meta.locations[0]?.id

  if (!locationId) {
    throw new Error('В расписании нет населённых пунктов')
  }

  const calculatedLocation = isSavedCoordinates(storedCoordinates)
    ? storedCoordinates
    : null
  const locationMode =
    storedMode === 'calculated' && calculatedLocation ? 'calculated' : 'official'

  return {
    meta,
    locationId,
    locationMode,
    calculatedLocation,
    calculationSettings: isCalculationSettings(storedSettings)
      ? storedSettings
      : DEFAULT_CALCULATION_SETTINGS,
  }
}

function isSavedCoordinates(value: unknown): value is SavedCoordinates {
  if (!value || typeof value !== 'object') return false
  const coordinates = value as Partial<SavedCoordinates>
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    (coordinates.accuracy === null || Number.isFinite(coordinates.accuracy)) &&
    Number.isFinite(coordinates.timestamp) &&
    (coordinates.name === undefined || typeof coordinates.name === 'string') &&
    (coordinates.cityId === undefined || Number.isInteger(coordinates.cityId)) &&
    (coordinates.nameSource === undefined ||
      ['geonames', 'nominatim'].includes(coordinates.nameSource)) &&
    (coordinates.source === undefined ||
      ['gps', 'preset'].includes(coordinates.source))
  )
}

function isCalculationSettings(value: unknown): value is CalculationSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<CalculationSettings>
  return (
    ['dumRt', 'turkey', 'muslimWorldLeague', 'karachi', 'northAmerica', 'ummAlQura'].includes(
      settings.profile ?? '',
    ) &&
    ['hanafi', 'standard'].includes(settings.asrMethod ?? '') &&
    ['dumRt', 'seventhOfNight', 'twilightAngle', 'nearestDay'].includes(
      settings.highLatitudeRule ?? '',
    )
  )
}

export const prayerRepository = {
  initialize: initializePrayerRepository,
  getDay: getPrayerDay,
  saveOfficialLocation: async (locationId: string) => {
    await Promise.all([
      setSetting('locationId', locationId),
      setSetting('locationMode', 'official'),
    ])
  },
  saveCalculatedLocation: async (coordinates: SavedCoordinates) => {
    await Promise.all([
      setSetting('calculatedLocation', coordinates),
      setSetting('locationMode', 'calculated'),
    ])
  },
  saveCalculationSettings: (settings: CalculationSettings) =>
    setSetting('calculationSettings', settings),
}
