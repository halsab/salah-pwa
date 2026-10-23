import { restoreSourcePreferences, type SourcePreferences } from '../domain/sourcePreferences'
import { effectiveCalculationSettings } from '../domain/calculationSettings'
import { DEFAULT_CALENDAR_PREFERENCES, type CalendarPreferences } from '../domain/calendar'
import { createLocalityPlace, type Place } from '../domain/place'
import { migratePlaceChoice, placeFromChoice } from '../domain/placeMigration'
import { TATARSTAN_LOCALITIES } from '../data/tatarstanLocalities'
import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { DataFailure, StorageFailure } from '../domain/errors'
import type { LocationSelectionSource } from '../domain/locationSelection'
import type { CalculationSettings } from '../domain/prayerCalculation'
import type { ThemeFamily } from '../domain/theme'
import type { LanguagePreference } from '../localization/locale'
import type { FastingModePreferences } from '../domain/fasting'
import { failure, success, type Result } from '../domain/result'
import type { SavedCoordinates } from '../domain/types'

const DATABASE_NAME = 'salah'
const DATABASE_VERSION = 14

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
  calendarPreferences: CalendarPreferences
  recentPlaces: Place[]
  recentPlacesMigrated: boolean
  appearance: Appearance
  themeFamily: ThemeFamily
  locationChoice: LocationChoice
  sourcePreferences: SourcePreferences
  calculationSettings: CalculationSettings
  languagePreference: LanguagePreference
  fastingMode: FastingModePreferences
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

interface VaqtProDatabase extends DBSchema {
  control: { key: 'generation'; value: number }
  settings: {
    key: StoredSettingKey
    value: StoredSettingRecord
  }
}

let databasePromise: Promise<IDBPDatabase<VaqtProDatabase>> | undefined

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

function calculatedChoiceFromLegacyOfficial(value: unknown): LocationChoice | undefined {
  if (!isRecord(value) || value.mode !== 'official' || typeof value.locationId !== 'string') return undefined
  const locality = TATARSTAN_LOCALITIES.find(item => item.id === value.locationId)
  if (!locality) return undefined
  const place = createLocalityPlace(locality, 0)
  return {
    mode: 'calculated',
    coordinates: { ...place, source: 'preset' },
    place,
    source: value.source === 'manual' ? 'manual' : 'automatic',
  }
}

function normalizeStoredLocationChoice(value: unknown): LocationChoice | undefined {
  const migratedOfficial = calculatedChoiceFromLegacyOfficial(value)
  if (migratedOfficial) return migratedOfficial
  if (!isRecord(value) || value.mode !== 'calculated') return undefined
  const choice = value as unknown as LocationChoice
  return placeFromChoice(choice, TATARSTAN_LOCALITIES)
    ? migratePlaceChoice(choice, TATARSTAN_LOCALITIES)
    : undefined
}

function getDatabase(): Promise<IDBPDatabase<VaqtProDatabase>> {
  if (databasePromise) return databasePromise

  const opening = openDB<VaqtProDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    blocking() { void databasePromise?.then(database => database.close()); databasePromise = undefined },
    terminated() { databasePromise = undefined },
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
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
          const record = await store.get('locationChoice')
          if (record?.key !== 'locationChoice') return
          await store.put({ key: 'locationChoice', value: migratePlaceChoice(record.value, TATARSTAN_LOCALITIES) })
        })
        previousMigration = migration
        void migration.catch(() => transaction.abort())
      }
      if (oldVersion < 8) {
        const store = transaction.objectStore('settings')
        const migration = previousMigration.then(async () => {
          const [preferences, settings, choice] = await Promise.all([store.get('sourcePreferences'), store.get('calculationSettings'), store.get('locationChoice')])
          if (preferences) return
          await store.put({ key: 'sourcePreferences', value: restoreSourcePreferences(undefined, storedValue(settings), choice?.key === 'locationChoice' ? choice.value : undefined) })
        })
        previousMigration = migration
        void migration.catch(() => transaction.abort())
      }
      if (oldVersion < 9) {
        // Поколение не содержит пользовательских данных; оно запрещает запись из старых сессий.
        database.createObjectStore('control')
        void transaction.objectStore('control').put(0, 'generation')
        void transaction.objectStore('settings').put({ key: 'appearance', value: 'system' })
      }
      if (oldVersion < 10) {
        // Истории координат раньше не было; миграция не создаёт её из сохранённой GPS-позиции.
        void transaction.objectStore('settings').put({ key: 'recentPlaces', value: [] })
        if (oldVersion > 0) {
          const migration = previousMigration.then(async () => {
            const store = transaction.objectStore('settings')
            const [choice, generation] = await Promise.all([store.get('locationChoice'), transaction.objectStore('control').get('generation')])
            // Прежняя версия показывала Казань без записи выбора. После сброса это правило не действует.
            if (!choice && generation === 0) {
              const locality = TATARSTAN_LOCALITIES.find(item => item.id === 'kazan') ?? TATARSTAN_LOCALITIES[0]
              if (locality) {
                const place = createLocalityPlace(locality, 0)
                await store.put({ key: 'locationChoice', value: {
                  mode: 'calculated', coordinates: place, place, source: 'default',
                } satisfies LocationChoice })
              }
            }
          })
          previousMigration = migration
          void migration.catch(() => transaction.abort())
        }
      }
      if (oldVersion < 11) {
        void transaction.objectStore('settings').put({ key: 'calendarPreferences', value: DEFAULT_CALENDAR_PREFERENCES })
      }
      if (oldVersion < 13) {
        const migration = previousMigration.then(async () => {
          const settings = transaction.objectStore('settings')
          const [preferences, calculation, choice] = await Promise.all([
            settings.get('sourcePreferences'), settings.get('calculationSettings'), settings.get('locationChoice'),
          ])
          const rawPreferences = preferences?.value
          const legacyChoice = choice?.key === 'locationChoice' ? choice.value : undefined
          const restored = restoreSourcePreferences(rawPreferences, calculation?.value, legacyChoice)
          await settings.put({ key: 'sourcePreferences', value: restored })
          const migratedLegacyPreferences = restoreSourcePreferences(undefined, calculation?.value, legacyChoice)
          if (migratedLegacyPreferences.mode === 'manual') {
            await settings.put({ key: 'calculationSettings', value: effectiveCalculationSettings(migratedLegacyPreferences.source.calculation) })
          }
          const normalizedChoice = normalizeStoredLocationChoice(legacyChoice)
          if (normalizedChoice) await settings.put({ key: 'locationChoice', value: normalizedChoice })
        })
        previousMigration = migration
        void migration.catch(() => transaction.abort())
      }
      if (oldVersion < 14) {
        const migration = previousMigration.then(async () => {
          const settings = transaction.objectStore('settings')
          const [preferences, calculation, choice] = await Promise.all([
            settings.get('sourcePreferences'), settings.get('calculationSettings'), settings.get('locationChoice'),
          ])
          const legacyChoice = choice?.key === 'locationChoice' ? choice.value : undefined
          const restored = restoreSourcePreferences(preferences?.value, calculation?.value, legacyChoice)
          await settings.put({ key: 'sourcePreferences', value: restored })
          const legacyPreferences = restoreSourcePreferences(undefined, calculation?.value, legacyChoice)
          if (legacyPreferences.mode === 'manual') {
            await settings.put({ key: 'calculationSettings', value: effectiveCalculationSettings(legacyPreferences.source.calculation) })
          }
          const normalizedChoice = normalizeStoredLocationChoice(legacyChoice)
          if (normalizedChoice) await settings.put({ key: 'locationChoice', value: normalizedChoice })
        })
        previousMigration = migration
        void migration.catch(() => transaction.abort())
        const legacyDatabase = database as unknown as IDBDatabase
        if (legacyDatabase.objectStoreNames.contains('days')) legacyDatabase.deleteObjectStore('days')
        if (legacyDatabase.objectStoreNames.contains('meta')) legacyDatabase.deleteObjectStore('meta')
      }
    },
  })
  databasePromise = opening
  void opening.catch(() => {
    if (databasePromise === opening) databasePromise = undefined
  })
  return opening
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

export function getStartupData() {
  return storageResult(async () => {
    const database = await getDatabase()
    const transaction = database.transaction(['control', 'settings'], 'readonly')
    const settings = transaction.objectStore('settings')
    const [generation, choice, preferences, legacy, recentPlacesMigrated, appearance] = await Promise.all([
      transaction.objectStore('control').get('generation'),
      settings.get('locationChoice'), settings.get('sourcePreferences'), settings.get('calculationSettings'),
      settings.get('recentPlacesMigrated'),
      settings.get('appearance'),
    ])
    await transaction.done
    return { generation: generation ?? 0, choice: choice?.value as SettingValueMap['locationChoice'] | undefined,
      preferences: preferences?.value as SettingValueMap['sourcePreferences'] | undefined, legacy: legacy?.value as SettingValueMap['calculationSettings'] | undefined,
      recentPlacesMigrated: recentPlacesMigrated?.value as boolean | undefined, appearance: appearance?.value as SettingValueMap['appearance'] | undefined }
  })
}

export function getSettings<const Keys extends readonly SettingKey[]>(keys: Keys) {
  return storageResult(async () => {
    const database = await getDatabase()
    const transaction = database.transaction('settings', 'readonly')
    const records = await Promise.all(keys.map(key => transaction.store.get(key)))
    await transaction.done
    return Object.fromEntries(keys.map((key, index) => [key, records[index]?.value])) as { [Key in Keys[number]]: SettingValueMap[Key] | undefined }
  })
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
): Promise<Result<void, StorageFailure | DataFailure>> {
  if (choice.mode !== 'calculated') return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
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

export async function deleteVaqtProDatabase(): Promise<void> {
  const activePromise = databasePromise
  databasePromise = undefined
  if (activePromise) {
    const database = await activePromise.catch(() => undefined)
    database?.close()
  }
  await deleteDB(DATABASE_NAME)
}

export interface PlacePersistenceEvent {
  change: 'selection' | 'refinement' | 'automatic'
  choice: LocationChoice
  // Асинхронное уточнение не должно перезаписывать место, выбранное после его запуска.
  expectedPlaceId?: string | null
}

export type SettingsPatch = Partial<Pick<SettingValueMap, 'locationChoice' | 'sourcePreferences' | 'appearance' | 'themeFamily' | 'recentPlaces' | 'recentPlacesMigrated' | 'calendarPreferences' | 'languagePreference' | 'fastingMode'>>
  // События — упорядоченные команды очереди; они не хранятся в IndexedDB.
  & { placeEvents?: PlacePersistenceEvent[]; normalizeRecentPlaces?: boolean }

export interface StoredPlaceHistorySnapshot {
  locationChoice: unknown
  recentPlaces: unknown
  recentPlacesMigrated: unknown
}

export type ReconcilePlaceHistory = (stored: StoredPlaceHistorySnapshot, patch: SettingsPatch) => {
  recentPlaces: Place[]
  recentPlacesMigrated: true
  locationChoice: LocationChoice | undefined
}

export function saveSettings(patch: SettingsPatch, isCurrent: () => boolean = () => true, generation?: number,
  reconcilePlaceHistory?: ReconcilePlaceHistory): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    if (!isCurrent()) throw new Error('Запись отменена')
    const transaction = database.transaction(['settings', 'control'], 'readwrite')
    try {
      if (generation !== undefined && await transaction.objectStore('control').get('generation') !== generation) throw new Error('Сессия завершена')
      if (!isCurrent()) throw new Error('Запись отменена')
      let reconciledHistory: ReturnType<ReconcilePlaceHistory> | undefined
      if (reconcilePlaceHistory && (patch.locationChoice || patch.placeEvents?.length || patch.normalizeRecentPlaces)) {
        const settings = transaction.objectStore('settings')
        const [locationChoice, recentPlaces, recentPlacesMigrated] = await Promise.all([
          settings.get('locationChoice'), settings.get('recentPlaces'), settings.get('recentPlacesMigrated'),
        ])
        if (!isCurrent()) throw new Error('Запись отменена')
        reconciledHistory = reconcilePlaceHistory({
          locationChoice: locationChoice?.value,
          recentPlaces: recentPlaces?.value,
          recentPlacesMigrated: recentPlacesMigrated?.value,
        }, patch)
      }
      if (!isCurrent()) throw new Error('Запись отменена')
      if (patch.appearance) await transaction.objectStore('settings').put({ key: 'appearance', value: patch.appearance })
      if (patch.themeFamily) await transaction.objectStore('settings').put({ key: 'themeFamily', value: patch.themeFamily })
      const locationChoice = reconciledHistory ? reconciledHistory.locationChoice : patch.locationChoice
      if (locationChoice) await transaction.objectStore('settings').put({ key: 'locationChoice', value: locationChoice })
      if (reconciledHistory) {
        await transaction.objectStore('settings').put({ key: 'recentPlaces', value: reconciledHistory.recentPlaces })
        await transaction.objectStore('settings').put({ key: 'recentPlacesMigrated', value: true })
      } else {
        if (patch.recentPlaces) await transaction.objectStore('settings').put({ key: 'recentPlaces', value: patch.recentPlaces })
        if (patch.recentPlacesMigrated !== undefined) await transaction.objectStore('settings').put({ key: 'recentPlacesMigrated', value: patch.recentPlacesMigrated })
      }
      if (patch.sourcePreferences) await transaction.objectStore('settings').put({ key: 'sourcePreferences', value: patch.sourcePreferences })
      if (patch.calendarPreferences) await transaction.objectStore('settings').put({ key: 'calendarPreferences', value: patch.calendarPreferences })
      if (patch.languagePreference) await transaction.objectStore('settings').put({ key: 'languagePreference', value: patch.languagePreference })
      if (patch.fastingMode) await transaction.objectStore('settings').put({ key: 'fastingMode', value: patch.fastingMode })
      if (!isCurrent()) throw new Error('Запись отменена')
      await transaction.done
    } catch (error) {
      try { transaction.abort() } catch { /* Транзакция уже завершилась. */ }
      await transaction.done.catch(() => undefined)
      throw error
    }
  })
}

export async function getDataGeneration(): Promise<number> {
  return (await (await getDatabase()).get('control', 'generation')) ?? 0
}

export function clearAppData(): Promise<Result<void, StorageFailure>> {
  return storageResult(async () => {
    const database = await getDatabase()
    // Очистка вместо deleteDB не блокируется открытыми соединениями других вкладок.
    // Записи основной базы персональны или зависят от пользовательской сессии; публичный каталог живёт отдельно.
    const transaction = database.transaction(['settings', 'control'], 'readwrite')
    try {
      const generation = (await transaction.objectStore('control').get('generation')) ?? 0
      // Ждём каждый запрос: синхронный сбой следующего не оставит Promise без обработчика при откате.
      await transaction.objectStore('settings').clear()
      await transaction.objectStore('control').put(generation + 1, 'generation')
      await transaction.done
    } catch (error) {
      try { transaction.abort() } catch { /* Транзакция уже завершилась. */ }
      await transaction.done.catch(() => undefined)
      throw error
    }
  })
}
