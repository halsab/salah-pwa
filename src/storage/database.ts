import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { StorageFailure } from '../domain/errors'
import type { LocationSelectionSource } from '../domain/locationSelection'
import type { CalculationSettings } from '../domain/prayerCalculation'
import { failure, success, type Result } from '../domain/result'
import type {
  PrayerDataset,
  PrayerDatasetManifest,
  PrayerDay,
  PrayerLocation,
  SavedCoordinates,
} from '../domain/types'

const DATABASE_NAME = 'salah'
const DATABASE_VERSION = 6

export type LocationMode = 'official' | 'calculated'

export type LocationChoice =
  | {
      mode: 'official'
      locationId: string
      source: LocationSelectionSource
    }
  | {
      mode: 'calculated'
      coordinates: SavedCoordinates
      source: LocationSelectionSource
    }

interface SettingValueMap {
  locationChoice: LocationChoice
  calculationSettings: CalculationSettings
}

interface LegacySettingValueMap {
  locationId: string
  locationMode: LocationMode
  calculatedLocation: SavedCoordinates
}

type StoredSettingValueMap = SettingValueMap & LegacySettingValueMap
export type SettingKey = keyof SettingValueMap
type StoredSettingKey = keyof StoredSettingValueMap

type StoredSettingRecord = {
  [Key in StoredSettingKey]: {
    key: Key
    value: StoredSettingValueMap[Key]
  }
}[StoredSettingKey]

interface PrayerDayRecord extends PrayerDay {
  key: string
}

export type DatasetIdentity = Pick<
  PrayerDatasetManifest,
  'version' | 'url' | 'sha256'
>

export interface DatasetMeta {
  schemaVersion: number
  source: PrayerDataset['source']
  locations: PrayerLocation[]
  identity?: DatasetIdentity
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
    key: StoredSettingKey
    value: StoredSettingRecord
  }
}

let databasePromise: Promise<IDBPDatabase<SalahDatabase>> | undefined

function storedValue(record: StoredSettingRecord | undefined): unknown {
  return record?.value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function migrateLegacyLocationChoice(
  locationId: unknown,
  locationMode: unknown,
  calculatedLocation: unknown,
): LocationChoice | undefined {
  if (locationMode === 'calculated' && isRecord(calculatedLocation)) {
    return {
      mode: 'calculated',
      // Запись v4 может не содержать timeZone; её по-прежнему дополняет репозиторий при чтении.
      coordinates: calculatedLocation as unknown as SavedCoordinates,
      source: calculatedLocation.source === 'gps' ? 'automatic' : 'manual',
    }
  }

  if (
    typeof locationId === 'string'
    && locationId
    && (locationMode === 'official' || locationMode === undefined)
  ) {
    return { mode: 'official', locationId, source: 'manual' }
  }

  return undefined
}

function getDatabase(): Promise<IDBPDatabase<SalahDatabase>> {
  if (databasePromise) return databasePromise

  const opening = openDB<SalahDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
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
      if (oldVersion < 5) {
        const store = transaction.objectStore('settings')
        const migration = Promise.all([
          store.get('locationChoice'),
          store.get('locationId'),
          store.get('locationMode'),
          store.get('calculatedLocation'),
        ]).then(([current, locationId, locationMode, calculatedLocation]) => {
          const writes: Promise<unknown>[] = [
            store.delete('locationId'),
            store.delete('locationMode'),
            store.delete('calculatedLocation'),
          ]

          if (!current) {
            const choice = migrateLegacyLocationChoice(
              storedValue(locationId),
              storedValue(locationMode),
              storedValue(calculatedLocation),
            )
            if (choice) {
              writes.push(store.put({ key: 'locationChoice', value: choice }))
            }
          }

          return Promise.all(writes)
        })

        void migration.catch(() => transaction.abort())
      }
      if (oldVersion < 6) {
        // Идентичность артефакта появится при следующей атомарной замене набора.
      }
    },
  })
  databasePromise = opening
  void opening.catch(() => {
    if (databasePromise === opening) databasePromise = undefined
  })
  return opening
}

function dayKey(locationId: string, date: string): string {
  return `${locationId}:${date}`
}

function storageFailure(): StorageFailure {
  return { kind: 'storage', reason: 'unavailable' }
}

async function storageResult<Value>(
  operation: () => Promise<Value>,
): Promise<Result<Value, StorageFailure>> {
  try {
    return success(await operation())
  } catch {
    return failure(storageFailure())
  }
}

export function replaceDataset(
  dataset: PrayerDataset,
  identity: DatasetIdentity,
): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    const transaction = database.transaction(['days', 'meta'], 'readwrite')
    const dayStore = transaction.objectStore('days')

    try {
      await dayStore.clear()
      const dayWrites: Promise<IDBValidKey>[] = []
      for (const day of dataset.days) {
        const write = dayStore.put({
          ...day,
          key: dayKey(day.locationId, day.date),
        })
        // Обработчик нужен сразу: следующий put может синхронно прервать транзакцию.
        void write.catch(() => undefined)
        dayWrites.push(write)
      }
      await Promise.all(dayWrites)

      await transaction.objectStore('meta').put(
        {
          schemaVersion: dataset.schemaVersion,
          source: dataset.source,
          locations: dataset.locations,
          identity,
        },
        'current',
      )
      await transaction.done
    } catch (error) {
      try {
        transaction.abort()
      } catch {
        // Транзакция уже могла автоматически откатиться после ошибки запроса.
      }
      await transaction.done.catch(() => undefined)
      throw error
    }
  })
}

export function getPrayerDay(
  locationId: string,
  date: string,
): Promise<Result<PrayerDay | undefined, StorageFailure>> {
  return storageResult(async () => {
    const record = await (await getDatabase()).get(
      'days',
      dayKey(locationId, date),
    )
    if (!record) return undefined

    const { key: _key, ...day } = record
    return day
  })
}

export function getDatasetMeta(): Promise<
  Result<DatasetMeta | undefined, StorageFailure>
> {
  return storageResult(() => getDatabase().then((database) =>
    database.get('meta', 'current')))
}

export function setSetting<Key extends SettingKey>(
  key: Key,
  value: SettingValueMap[Key],
): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    await database.put('settings', { key, value } as StoredSettingRecord)
  })
}

export function getSetting<Key extends SettingKey>(
  key: Key,
): Promise<Result<SettingValueMap[Key] | undefined, StorageFailure>> {
  return storageResult(async () => {
    const record = await (await getDatabase()).get('settings', key)
    return record?.value as SettingValueMap[Key] | undefined
  })
}

export function saveLocationChoice(
  choice: LocationChoice,
): Promise<Result<void, StorageFailure>> {
  return setSetting('locationChoice', choice)
}

export function getLocationChoice(): Promise<
  Result<LocationChoice | undefined, StorageFailure>
> {
  return getSetting('locationChoice')
}

export async function deleteSalahDatabase(): Promise<void> {
  const activePromise = databasePromise
  databasePromise = undefined
  if (activePromise) {
    const database = await activePromise.catch(() => undefined)
    database?.close()
  }
  await deleteDB(DATABASE_NAME)
}
