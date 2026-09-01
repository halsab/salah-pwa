import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { PrayerDataset, PrayerDay, PrayerLocation } from '../domain/types'

const DATABASE_NAME = 'salah'
const DATABASE_VERSION = 1

type SettingKey = 'locationId'

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
    value: { key: SettingKey; value: string }
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

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await (await getDatabase()).put('settings', { key, value })
}

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  return (await (await getDatabase()).get('settings', key))?.value
}

export async function deleteSalahDatabase(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise
    database.close()
    databasePromise = undefined
  }
  await deleteDB(DATABASE_NAME)
}
