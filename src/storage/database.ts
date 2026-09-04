import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { CalculationSettings } from '../domain/prayerCalculation'
import type {
  PrayerDataset,
  PrayerDay,
  PrayerLocation,
  SavedCoordinates,
} from '../domain/types'

const DATABASE_NAME = 'salah'
const DATABASE_VERSION = 4

export type LocationMode = 'official' | 'calculated'

interface SettingValueMap {
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates
  calculationSettings: CalculationSettings
}

export type SettingKey = keyof SettingValueMap

type SettingRecord = {
  [Key in SettingKey]: { key: Key; value: SettingValueMap[Key] }
}[SettingKey]

interface PrayerDayRecord extends PrayerDay {
  key: string
}

export interface DatasetMeta {
  schemaVersion: number
  source: PrayerDataset['source']
  locations: PrayerLocation[]
}

interface SalahDatabase extends DBSchema {
  days: {
    key: string
    value: PrayerDayRecord
  }
  meta: {
    key: 'current'
    value: DatasetMeta
  }
  settings: {
    key: SettingKey
    value: SettingRecord
  }
}

let databasePromise: Promise<IDBPDatabase<SalahDatabase>> | undefined

function getDatabase(): Promise<IDBPDatabase<SalahDatabase>> {
  databasePromise ??= openDB<SalahDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('days', { keyPath: 'key' })
        database.createObjectStore('meta')
        database.createObjectStore('settings', { keyPath: 'key' })
      }
      if (oldVersion < 2) {
        // Новые типизированные настройки добавляются в существующее schemaless-хранилище.
      }
      if (oldVersion < 3) {
        // Запись координат расширена названием и источником без изменения структуры хранилища.
      }
      if (oldVersion < 4) {
        // Таймзона добавляется при чтении старой записи, поэтому данные v3 не переписываются.
      }
    },
  })

  return databasePromise
}

function dayKey(locationId: string, date: string): string {
  return `${locationId}:${date}`
}

export async function replaceDataset(dataset: PrayerDataset): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(['days', 'meta'], 'readwrite')
  const dayStore = transaction.objectStore('days')

  await dayStore.clear()
  for (const day of dataset.days) {
    void dayStore.put({ ...day, key: dayKey(day.locationId, day.date) })
  }

  await transaction.objectStore('meta').put(
    {
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: dataset.locations,
    },
    'current',
  )
  await transaction.done
}

export async function getPrayerDay(
  locationId: string,
  date: string,
): Promise<PrayerDay | undefined> {
  const record = await (await getDatabase()).get('days', dayKey(locationId, date))
  if (!record) return undefined

  const { key: _key, ...day } = record
  return day
}

export async function getDatasetMeta(): Promise<DatasetMeta | undefined> {
  return (await getDatabase()).get('meta', 'current')
}

export async function setSetting<Key extends SettingKey>(
  key: Key,
  value: SettingValueMap[Key],
): Promise<void> {
  await (await getDatabase()).put('settings', { key, value } as SettingRecord)
}

export async function getSetting<Key extends SettingKey>(
  key: Key,
): Promise<SettingValueMap[Key] | undefined> {
  return (await (await getDatabase()).get('settings', key))?.value as
    | SettingValueMap[Key]
    | undefined
}

export async function deleteSalahDatabase(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise
    database.close()
    databasePromise = undefined
  }
  await deleteDB(DATABASE_NAME)
}
