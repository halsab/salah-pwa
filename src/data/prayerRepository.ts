import type { PrayerDataset } from '../domain/types'
import {
  getDatasetMeta,
  getPrayerDay,
  getSetting,
  replaceDataset,
  setSetting,
  type DatasetMeta,
} from '../storage/database'

const DATA_URL = `${import.meta.env.BASE_URL}data/prayer-times-current.json`

function isPrayerDataset(value: unknown): value is PrayerDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<PrayerDataset>

  return (
    dataset.schemaVersion === 1 &&
    typeof dataset.source?.year === 'number' &&
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

export async function initializePrayerRepository(): Promise<{
  meta: DatasetMeta
  locationId: string
}> {
  const cachedMeta = await getDatasetMeta()
  let meta = cachedMeta

  try {
    const bundled = await fetchBundledDataset()
    if (
      !cachedMeta ||
      cachedMeta.schemaVersion !== bundled.schemaVersion ||
      cachedMeta.source.updatedAt !== bundled.source.updatedAt ||
      cachedMeta.source.year !== bundled.source.year
    ) {
      await replaceDataset(bundled)
    }
    meta = toMeta(bundled)
  } catch (error) {
    if (!cachedMeta) throw error
  }

  if (!meta) {
    throw new Error('Расписание ещё не загружено')
  }

  const storedLocationId = await getSetting('locationId')
  const locationId = meta.locations.some(({ id }) => id === storedLocationId)
    ? storedLocationId ?? 'kazan'
    : meta.locations.find(({ id }) => id === 'kazan')?.id ?? meta.locations[0]?.id

  if (!locationId) {
    throw new Error('В расписании нет населённых пунктов')
  }

  return { meta, locationId }
}

export const prayerRepository = {
  initialize: initializePrayerRepository,
  getDay: getPrayerDay,
  saveLocation: (locationId: string) => setSetting('locationId', locationId),
}
