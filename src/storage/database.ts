import { restoreSourcePreferences, type SourcePreferences } from '../domain/sourcePreferences'
import type { Place } from '../domain/place'
import { migratePlaceChoice } from '../domain/placeMigration'
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { getDatasetRevision } from '../domain/scheduleContext'
import type { DataFailure, StorageFailure } from '../domain/errors'
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
const DATABASE_VERSION = 9

export type LocationMode = 'official' | 'calculated'

export type LocationChoice = { place?: Place } & (
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

)

export type Appearance = 'system' | 'light' | 'dark'

interface SettingValueMap {
  appearance: Appearance
  locationChoice: LocationChoice
  sourcePreferences: SourcePreferences
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
  'version' | 'url' | 'sha256' | 'sequence'
>

export interface DatasetMeta {
  provider?: string
  schemaVersion: number
  source: PrayerDataset['source']
  locations: PrayerLocation[]
  identity?: DatasetIdentity
}

interface SalahDatabase extends DBSchema {
  control: { key: 'generation'; value: number }
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
    blocking() { void databasePromise?.then(database => database.close()); databasePromise = undefined },
    terminated() { databasePromise = undefined },
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
      let previousMigration: Promise<unknown> = Promise.resolve()
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

        previousMigration = migration
        void migration.catch(() => transaction.abort())
      }
      if (oldVersion < 6) {
        // Идентичность артефакта появится при следующей атомарной замене набора.
      }
      if (oldVersion < 7) {
        const store = transaction.objectStore('settings')
        const migration = previousMigration.then(async () => {
          const [record, meta] = await Promise.all([store.get('locationChoice'), transaction.objectStore('meta').get('current')])
          if (record?.key !== 'locationChoice') return
          await store.put({ key: 'locationChoice', value: migratePlaceChoice(record.value, meta?.locations ?? []) })
        })
        previousMigration = migration
        void migration.catch(() => transaction.abort())
      }
      if (oldVersion < 8) {
        const store = transaction.objectStore('settings')
        void previousMigration.then(async () => {
          const [preferences, settings, choice] = await Promise.all([store.get('sourcePreferences'), store.get('calculationSettings'), store.get('locationChoice')])
          if (preferences) return
          await store.put({ key: 'sourcePreferences', value: restoreSourcePreferences(undefined, storedValue(settings), choice?.key === 'locationChoice' ? choice.value : undefined) })
        }).catch(() => transaction.abort())
      }
      if (oldVersion < 9) {
        // Поколение не содержит пользовательских данных; оно запрещает запись из старых сессий.
        database.createObjectStore('control')
        void transaction.objectStore('control').put(0, 'generation')
        void transaction.objectStore('settings').put({ key: 'appearance', value: 'system' })
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
  guard?: { revision: string | null; isCurrent: () => boolean; provider?: string; generation?: number },
): Promise<Result<void, StorageFailure | DataFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    const transaction = database.transaction(['days', 'meta', 'control'], 'readwrite')
    const dayStore = transaction.objectStore('days')

    try {
      if (guard?.generation !== undefined && await transaction.objectStore('control').get('generation') !== guard.generation) {
        await transaction.done
        return false
      }
      if (guard) {
        const installed = await transaction.objectStore('meta').get('current')
        if (!guard.isCurrent() || (installed ? getDatasetRevision(installed) : null) !== guard.revision
          || (installed?.identity?.sequence !== undefined && (identity.sequence === undefined || identity.sequence < installed.identity.sequence || (identity.sequence === installed.identity.sequence && identity.sha256 !== installed.identity.sha256)))
          || (installed && Date.parse(dataset.source.updatedAt) < Date.parse(installed.source.updatedAt))) {
          await transaction.done
          return false
        }
      }
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
          ...(guard?.provider ? { provider: guard.provider } : {}),
          schemaVersion: dataset.schemaVersion,
          source: dataset.source,
          locations: dataset.locations,
          identity,
        },
        'current',
      )
      await transaction.done
      return true
    } catch (error) {
      try {
        transaction.abort()
      } catch {
        // Транзакция уже могла автоматически откатиться после ошибки запроса.
      }
      await transaction.done.catch(() => undefined)
      throw error
    }
  }).then(result => !result.ok ? result : result.value ? success(undefined) : failure({ kind: 'data', reason: 'superseded' }))
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

export async function getPrayerDays(
  locationId: string,
  dates: readonly string[],
  expectedRevision: string,
): Promise<Result<(PrayerDay | undefined)[], StorageFailure | DataFailure>> {
  const result = await storageResult(async () => {
    const database = await getDatabase()
    // Метаданные и дни читаются в одном снимке, в том числе при обновлении из другой вкладки.
    const transaction = database.transaction(['days', 'meta'], 'readonly')
    const [meta, records] = await Promise.all([
      transaction.objectStore('meta').get('current'),
      Promise.all(dates.map((date) => transaction.objectStore('days').get(dayKey(locationId, date)))),
    ])
    await transaction.done
    return { meta, records }
  })
  if (!result.ok) return result
  const { meta, records } = result.value
  if (!meta || getDatasetRevision(meta) !== expectedRevision) {
    return failure({ kind: 'data', reason: 'invalid' })
  }
  return success(records.map((record) => {
    if (!record) return undefined
    const { key: _key, ...day } = record
    return day
  }))
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
    const transaction = database.transaction('settings', 'readwrite')
    await transaction.store.put({ key, value } as StoredSettingRecord)
    await transaction.done
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
  isCurrent: () => boolean = () => true,
): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    if (!isCurrent()) return
    const transaction = database.transaction('settings', 'readwrite')
    await transaction.store.put({ key: 'locationChoice', value: choice })
    await transaction.done
  })
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

export type SettingsPatch = Partial<Pick<SettingValueMap, 'locationChoice' | 'sourcePreferences' | 'appearance'>>

export function saveSettings(patch: SettingsPatch, isCurrent: () => boolean = () => true, generation?: number): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    if (!isCurrent()) return
    const transaction = database.transaction(['settings', 'control'], 'readwrite')
    try {
      if (generation !== undefined && await transaction.objectStore('control').get('generation') !== generation) throw new Error('Сессия завершена')
      if (!isCurrent()) { await transaction.done; return }
      if (patch.appearance) await transaction.objectStore('settings').put({ key: 'appearance', value: patch.appearance })
      if (patch.locationChoice) await transaction.objectStore('settings').put({ key: 'locationChoice', value: patch.locationChoice })
      if (patch.sourcePreferences) await transaction.objectStore('settings').put({ key: 'sourcePreferences', value: patch.sourcePreferences })
      await transaction.done
    } catch (error) {
      try { transaction.abort() } catch { /* Транзакция уже завершилась. */ }
      await transaction.done.catch(() => undefined)
      throw error
    }
  })
}

export function getStoredDataset(): Promise<Result<{ dataset: PrayerDataset; meta: DatasetMeta } | null, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    const transaction = database.transaction(['days', 'meta'], 'readonly')
    const [meta, records] = await Promise.all([transaction.objectStore('meta').get('current'), transaction.objectStore('days').getAll()])
    await transaction.done
    return meta ? { meta, dataset: { ...meta, days: records.map(({ key: _key, ...day }) => day) } } : null
  })
}

export async function getDataGeneration(): Promise<number> {
  return (await (await getDatabase()).get('control', 'generation')) ?? 0
}

export function clearAppData(): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    // Очистка вместо deleteDB не блокируется открытыми соединениями других вкладок.
    // Все записи salah персональны или зависят от пользовательской сессии; публичный каталог живёт отдельно.
    const transaction = database.transaction(['settings', 'days', 'meta', 'control'], 'readwrite')
    try {
      const generation = (await transaction.objectStore('control').get('generation')) ?? 0
      // Ждём каждый запрос: синхронный сбой следующего не оставит Promise без обработчика при откате.
      await transaction.objectStore('settings').clear()
      await transaction.objectStore('days').clear()
      await transaction.objectStore('meta').clear()
      await transaction.objectStore('control').put(generation + 1, 'generation')
      await transaction.done
    } catch (error) {
      try { transaction.abort() } catch { /* Транзакция уже завершилась. */ }
      await transaction.done.catch(() => undefined)
      throw error
    }
  })
}
