import { isLocationSelectionSource } from '../domain/locationSelection'
import { isCalendarPreferences, restoreCalendarPreferences, type CalendarPreferences } from '../domain/calendar'
import { findRecentPlace, migrateRecentPlaces, rememberPlace, restoreRecentPlaces, updateRecentPlace } from '../domain/recentPlaces'
import type { Place } from '../domain/place'
import { migratePlaceChoice, placeFromChoice } from '../domain/placeMigration'
import { getDatasetRevision } from '../domain/scheduleContext'
import { isValidTimeZone, DUM_RT_TIME_ZONE } from '../domain/locationTime'
import { restoreSourcePreferences, isSourcePreferences, type SourcePreferences } from '../domain/sourcePreferences'
import type { DataFailure, StorageFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import {
  clearAppData, getDataGeneration, getDatasetMeta, getLocationChoice, getPrayerDays, getSetting, getSettings, getStartupData, getStoredDataset,
  reservePlaceSelectionOrder as reserveStoredPlaceSelectionOrder,
  replaceDataset, saveSettings, type DatasetMeta, type LocationChoice, type SettingsPatch, type Appearance, type PlacePersistenceEvent,
} from '../storage/database'
import { DEFAULT_OFFICIAL_LOCATIONS, PRAYER_PROVIDERS, dumRtProvider, type PrayerProvider } from './prayerProviders'
import { resolvePrayerDatasetUrl, validatePrayerDatasetManifest, verifyPrayerDatasetBytes, type PrayerDatasetByteOperations } from './prayerDatasetManifest'
import { restoreThemeFamily, type ThemeFamily } from '../domain/theme'
import { restoreLanguagePreference, type LanguagePreference } from '../localization/locale'
import { isFastingModePreferences, restoreFastingModePreferences, type FastingModePreferences } from '../domain/fasting'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type DatasetUpdate = { status: 'idle' | 'refreshing' } | { status: 'failed'; reason: 'network' | 'timeout' | 'invalid' | 'storage' | 'superseded' }
export interface PrayerRepositorySnapshot {
  meta: DatasetMeta | null
  dataState: 'ready' | 'not-loaded' | 'invalid'
  update: DatasetUpdate
  checkedAt: number | null
}
export interface PrayerRepositoryState extends PrayerRepositorySnapshot {
  calendarPreferences?: CalendarPreferences
  recentPlaces?: Place[]
  recentPlacesMigrated?: boolean
  locationChoice: LocationChoice | null
  appearance?: Appearance
  themeFamily?: ThemeFamily
  preferences: SourcePreferences
  languagePreference?: LanguagePreference
  fastingMode?: FastingModePreferences
}
export interface PrayerRepositoryOptionalSettings {
  recentPlaces: Place[]
  recentPlacesMigrated: boolean
  calendarPreferences: CalendarPreferences
  themeFamily: ThemeFamily
  languagePreference: LanguagePreference
  fastingMode: FastingModePreferences
}

function reconcilePlaceHistory(stored: { locationChoice: unknown; recentPlaces: unknown; recentPlacesMigrated: unknown; committedPlaceSelectionOrder?: unknown },
  patch: SettingsPatch) {
  const activeChoice = stored.locationChoice && typeof stored.locationChoice === 'object'
    ? stored.locationChoice as LocationChoice
    : null
  const originalActive = activeChoice ? placeFromChoice(activeChoice, DEFAULT_OFFICIAL_LOCATIONS) : null
  const migrated = stored.recentPlacesMigrated === true
    ? restoreRecentPlaces(stored.recentPlaces)
    : migrateRecentPlaces(stored.recentPlaces, originalActive)
  let recentPlaces = migrated
  let locationChoice = patch.placeEvents?.length ? undefined : patch.locationChoice
  let selectionAccepted = true
  let committedPlaceSelectionOrder = typeof stored.committedPlaceSelectionOrder === 'number' && Number.isSafeInteger(stored.committedPlaceSelectionOrder)
    ? stored.committedPlaceSelectionOrder : undefined
  const initialCommittedPlaceSelectionOrder = committedPlaceSelectionOrder
  let active = originalActive
  let authoritativeChoice = activeChoice
  if (patch.placeEvents?.length) {
    for (const event of patch.placeEvents) {
      const next = placeFromChoice(event.choice, DEFAULT_OFFICIAL_LOCATIONS)
      if (!next) continue
      if (event.change === 'selection') {
        selectionAccepted = false
        const retryBaseline = event.selectionReservationBaseline
        if (event.selectionReservationRetried && (
          retryBaseline === 'unavailable'
          || retryBaseline !== undefined && retryBaseline !== (initialCommittedPlaceSelectionOrder ?? null)
          || retryBaseline === undefined && event.expectedPlaceId !== undefined && (active?.id ?? null) !== event.expectedPlaceId
        )) continue
        // Повтор уже зафиксированного выбора не должен менять recency или GPS snapshot.
        const alreadyApplied = active?.id === next.id && JSON.stringify(active) === JSON.stringify(next)
        if (alreadyApplied && event.selectionOrder !== undefined && committedPlaceSelectionOrder !== undefined
          && event.selectionOrder <= committedPlaceSelectionOrder) {
          selectionAccepted = true
          continue
        }
        // Резервирование задаёт порядок намерений, но защищает от старых записей только committed-маркер.
        if (event.selectionOrder !== undefined && committedPlaceSelectionOrder !== undefined
          && event.selectionOrder <= committedPlaceSelectionOrder) {
          selectionAccepted = false
          continue
        }
        recentPlaces = rememberPlace(recentPlaces, next)
        if (event.selectionOrder !== undefined) committedPlaceSelectionOrder = Math.max(committedPlaceSelectionOrder ?? 0, event.selectionOrder)
        selectionAccepted = true
      } else {
        if ((active?.id ?? null) !== event.expectedPlaceId) continue
        if (event.change === 'refinement') {
          if (active?.selection !== 'gps' || next.selection !== 'gps' || active.id !== next.id) continue
          const target = findRecentPlace(recentPlaces, active)
          if (!target) continue
          recentPlaces = updateRecentPlace(recentPlaces, next, target.id)
        }
      }
      active = next
      authoritativeChoice = event.choice
      locationChoice = event.choice
    }
  } else if (patch.recentPlaces && !patch.normalizeRecentPlaces) {
    const incoming = restoreRecentPlaces(patch.recentPlaces)
    recentPlaces = stored.recentPlacesMigrated === true ? incoming : restoreRecentPlaces([...incoming, ...migrated])
  }
  return { recentPlaces, recentPlacesMigrated: true as const, locationChoice, selectionAccepted,
    committedPlaceSelectionOrder: patch.placeEvents?.some(event => event.change === 'selection') ? committedPlaceSelectionOrder : undefined,
    activeLocationChoice: patch.placeEvents?.length ? authoritativeChoice : null }
}

interface StoredOptionalSettings {
  recentPlaces: unknown
  recentPlacesMigrated: unknown
  calendarPreferences: unknown
  themeFamily: unknown
  languagePreference: unknown
  fastingMode: unknown
}
export type PrayerRepositoryOperations = Partial<PrayerDatasetByteOperations> & {
  fetch?: Fetcher
  timeoutMs?: number
  replace?: typeof replaceDataset
}

async function readLocalSnapshot(provider: PrayerProvider): Promise<Result<PrayerRepositorySnapshot, StorageFailure>> {
  const stored = await getStoredDataset(provider.id)
  if (!stored.ok) {
    if (stored.error.kind === 'data') return success({ meta: null, dataState: 'invalid', update: { status: 'idle' }, checkedAt: null })
    return failure(stored.error)
  }
  return success({ meta: stored.value?.meta ?? null, dataState: stored.value ? 'ready' : 'not-loaded', update: { status: 'idle' }, checkedAt: null })
}

function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isStoredMeta(value: unknown, provider: PrayerProvider): value is DatasetMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const meta = value as Record<string, unknown>
  const source = meta.source && typeof meta.source === 'object' && !Array.isArray(meta.source)
    ? meta.source as Record<string, unknown> : null
  const years = source?.years
  const locations = meta.locations
  if ((meta.schemaVersion !== 2 && meta.schemaVersion !== 3)
    || meta.provider !== undefined && meta.provider !== provider.id
    || !source || typeof source.name !== 'string' || !source.name.trim()
    || typeof source.url !== 'string' || !source.url.startsWith('https://')
    || typeof source.updatedAt !== 'string' || !Number.isFinite(Date.parse(source.updatedAt))
    || !Array.isArray(years) || !years.length
    || !years.every(year => typeof year === 'number' && Number.isInteger(year) && year >= 1000 && year <= 9999)
    || new Set(years).size !== years.length
    || !Array.isArray(locations) || !locations.length) return false
  const ids = new Set<string>()
  for (const rawLocation of locations as unknown[]) {
    if (!rawLocation || typeof rawLocation !== 'object' || Array.isArray(rawLocation)) return false
    const location = rawLocation as Record<string, unknown>
    const latitude = location.latitude
    const longitude = location.longitude
    if (typeof location.id !== 'string' || !location.id || ids.has(location.id)
      || typeof location.name !== 'string' || !location.name
      || typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || location.timeZone !== undefined && (typeof location.timeZone !== 'string' || !isValidTimeZone(location.timeZone))) return false
    ids.add(location.id)
  }
  if (meta.schemaVersion === 2) {
    if (source.name !== 'ДУМ Республики Татарстан' || source.url !== 'https://dumrt.ru/ru/help-info/prayertime/') return false
  } else {
    const info = meta.providerInfo && typeof meta.providerInfo === 'object' && !Array.isArray(meta.providerInfo)
      ? meta.providerInfo as Record<string, unknown> : null
    const coverage = info?.coverage && typeof info.coverage === 'object' && !Array.isArray(info.coverage)
      ? info.coverage as Record<string, unknown> : null
    const startDate = coverage?.startDate
    const endDate = coverage?.endDate
    if (!info || !coverage
      || info.id !== provider.id || typeof info.revision !== 'string' || !info.revision.trim()
      || info.timeZone !== provider.timeZone || typeof info.timeZone !== 'string' || !isValidTimeZone(info.timeZone)
      || coverage.geographic !== provider.coverage
      || !isCivilDate(startDate) || !isCivilDate(endDate)
      || startDate > endDate
      || !(years as unknown[]).every(year => typeof year === 'number' && year >= Number(startDate.slice(0, 4))
        && year <= Number(endDate.slice(0, 4)))) return false
    if (provider.id === 'dumRt' && (source.name !== 'ДУМ Республики Татарстан'
      || source.url !== 'https://dumrt.ru/ru/help-info/prayertime/' || info.timeZone !== DUM_RT_TIME_ZONE)) return false
  }
  const identity = meta.identity
  if (identity !== undefined) {
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false
    const storedIdentity = identity as Record<string, unknown>
    if (typeof storedIdentity.version !== 'string' || !storedIdentity.version
      || typeof storedIdentity.url !== 'string' || !storedIdentity.url
      || typeof storedIdentity.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(storedIdentity.sha256)
      || storedIdentity.sequence !== undefined && (typeof storedIdentity.sequence !== 'number'
        || !Number.isInteger(storedIdentity.sequence) || storedIdentity.sequence < 0)) return false
  }
  return true
}

function storedMetadataState(value: DatasetMeta | undefined, provider: PrayerProvider, invalidRevision: string | null = null): Pick<PrayerRepositorySnapshot, 'meta' | 'dataState'> {
  const meta = value && isStoredMeta(value, provider) ? value : null
  return { meta, dataState: !value ? 'not-loaded' : meta && getDatasetRevision(meta) !== invalidRevision ? 'ready' : 'invalid' }
}

async function readStartup(provider: PrayerProvider) {
  const stored = await getStartupData(provider.id)
  if (!stored.ok) return stored
  const { meta, choice, preferences, legacy, generation, recentPlacesMigrated } = stored.value
  const validMeta = meta && isStoredMeta(meta, provider) ? meta : null
  const state: PrayerRepositoryState = {
    meta: validMeta,
    dataState: meta ? validMeta ? 'ready' : 'invalid' : 'not-loaded',
    update: { status: 'idle' }, checkedAt: null,
    locationChoice: choice === undefined ? null : restoreLocationChoice(choice, validMeta ?? provider.bundled),
    recentPlacesMigrated: recentPlacesMigrated === true,
    preferences: restoreSourcePreferences(preferences, legacy, choice),
  }
  return success({ state, generation })
}

export async function initializePrayerRepositoryStartup(provider: PrayerProvider = dumRtProvider): Promise<Result<PrayerRepositoryState, StorageFailure>> {
  const result = await readStartup(provider)
  return result.ok ? success(result.value.state) : result
}

function restoreOptionalSettings(values: StoredOptionalSettings): PrayerRepositoryOptionalSettings {
  return {
    recentPlaces: restoreRecentPlaces(values.recentPlaces),
    recentPlacesMigrated: values.recentPlacesMigrated === true,
    calendarPreferences: restoreCalendarPreferences(values.calendarPreferences),
    themeFamily: restoreThemeFamily(values.themeFamily),
    languagePreference: restoreLanguagePreference(values.languagePreference),
    fastingMode: restoreFastingModePreferences(values.fastingMode),
  }
}

export async function loadPrayerRepositoryOptionalSettings(): Promise<Result<PrayerRepositoryOptionalSettings, StorageFailure>> {
  const stored = await getSettings(['recentPlaces', 'recentPlacesMigrated', 'calendarPreferences', 'themeFamily', 'languagePreference', 'fastingMode'])
  return stored.ok ? success(restoreOptionalSettings(stored.value)) : stored
}
function restoreLocationChoice(value: unknown, meta: DatasetMeta | null): LocationChoice {
  const locations = meta?.locations ?? DEFAULT_OFFICIAL_LOCATIONS
  if (value && typeof value === 'object') {
    const raw = value as { mode?: unknown; source?: unknown }
    const choice = value as LocationChoice
    if (isLocationSelectionSource(raw.source) && (raw.mode === 'official' || raw.mode === 'calculated')
      && placeFromChoice(choice, locations)) return migratePlaceChoice(choice, locations)
  }
  const location = locations.find(item => item.id === 'kazan') ?? DEFAULT_OFFICIAL_LOCATIONS[0]
  if (!location) throw new Error('Не задано начальное место')
  return migratePlaceChoice({ mode: 'official', locationId: location.id, source: 'default' }, locations)
}
export async function initializePrayerRepository(provider: PrayerProvider = dumRtProvider): Promise<Result<PrayerRepositoryState, StorageFailure>> {
  const [snapshot, choice, preferences, legacy, appearance, themeFamily, recentPlaces, recentPlacesMigrated, calendarPreferences, languagePreference, fastingMode] = await Promise.all([
    readLocalSnapshot(provider), getLocationChoice(), getSetting('sourcePreferences'), getSetting('calculationSettings'), getSetting('appearance'), getSetting('themeFamily'),
    getSetting('recentPlaces'), getSetting('recentPlacesMigrated'), getSetting('calendarPreferences'), getSetting('languagePreference'), getSetting('fastingMode'),
  ])
  if (!snapshot.ok) return snapshot
  if (!choice.ok) return choice
  if (!preferences.ok) return preferences
  if (!legacy.ok) return legacy
  if (!appearance.ok) return appearance
  if (!themeFamily.ok) return themeFamily
  if (!recentPlaces.ok) return recentPlaces
  if (!recentPlacesMigrated.ok) return recentPlacesMigrated
  if (!calendarPreferences.ok) return calendarPreferences
  if (!languagePreference.ok) return languagePreference
  if (!fastingMode.ok) return fastingMode
  const locationChoice = choice.value === undefined ? null : restoreLocationChoice(choice.value, snapshot.value.meta ?? provider.bundled)
  const optionalSettings = restoreOptionalSettings({
    recentPlaces: recentPlaces.value, recentPlacesMigrated: recentPlacesMigrated.value,
    calendarPreferences: calendarPreferences.value,
    themeFamily: themeFamily.value, languagePreference: languagePreference.value, fastingMode: fastingMode.value,
  })
  return success({ ...snapshot.value, locationChoice,
    ...optionalSettings,
    appearance: appearance.value === 'light' || appearance.value === 'dark' ? appearance.value : 'system',
    preferences: restoreSourcePreferences(preferences.value, legacy.value, choice.value) })
}

export function createPrayerRepository(operations: PrayerRepositoryOperations = {}, provider: PrayerProvider = dumRtProvider) {
  const listeners = new Set<(snapshot: PrayerRepositorySnapshot) => void>()
  let pending: Promise<PrayerRepositorySnapshot> | null = null
  let controller: AbortController | null = null
  let installation: ReturnType<typeof replaceDataset> | null = null
  let epoch = 0
  let generation = 0
  let generationInitialized = false
  const hasInitializedGeneration = () => generationInitialized
  let invalidRevision: string | null = null
  let latest: PrayerRepositorySnapshot = { meta: null, dataState: 'not-loaded', update: { status: 'idle' }, checkedAt: null }
  const emit = (snapshot: PrayerRepositorySnapshot) => {
    latest = snapshot
    for (const listener of listeners) listener(snapshot)
  }
  const refresh = (): Promise<PrayerRepositorySnapshot> => {
    if (pending) return pending
    const operation = epoch
    const dataGeneration = generation
    controller = new AbortController()
    const signal = controller.signal
    const isCurrent = () => operation === epoch && !signal.aborted
    let timedOut = false
    const task = async (): Promise<PrayerRepositorySnapshot> => {
      const initialMeta = await getDatasetMeta(provider.id)
      if (!isCurrent()) return latest
      if (!initialMeta.ok) throw new Error('storage-unavailable')
      const revision = initialMeta.value ? getDatasetRevision(initialMeta.value) : null
      latest = { ...latest, ...storedMetadataState(initialMeta.value, provider, invalidRevision) }
      emit({ ...latest, update: { status: 'refreshing' } })
      let reason: Extract<DatasetUpdate, { status: 'failed' }>['reason'] | null = null
      let timeout: ReturnType<typeof setTimeout> | undefined
      const fetcher = operations.fetch ?? globalThis.fetch
      const aborted = new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Прервана загрузка')), { once: true })
        timeout = setTimeout(() => { timedOut = true; controller?.abort() }, operations.timeoutMs ?? 8_000)
      })
      // Таймаут охватывает тело ответа и digest; даже fetch, игнорирующий signal, не держит refresh открытым.
      const download = async () => {
        const manifestResponse = await fetcher(provider.manifestUrl, { cache: 'no-store', signal })
        if (!manifestResponse.ok) return 'network' as const
        const manifest = validatePrayerDatasetManifest(await manifestResponse.json() as unknown)
        if (!manifest.ok) return 'invalid' as const
        if ((provider.id !== 'dumRt' && manifest.value.provider !== provider.id)
          || (manifest.value.provider !== undefined && manifest.value.provider !== provider.id)) return 'invalid' as const
        if (!isCurrent()) return 'superseded' as const
        if (latest.dataState === 'ready' && latest.meta?.identity?.sha256 === manifest.value.sha256 && latest.meta.identity.sequence === manifest.value.sequence) return null
        const response = await fetcher(resolvePrayerDatasetUrl(provider.manifestUrl, manifest.value), { cache: 'no-store', signal })
        if (!response.ok) return 'network' as const
        const verified = await verifyPrayerDatasetBytes(new Uint8Array(await response.arrayBuffer()), manifest.value, operations)
        if (!verified.ok) return verified.error.reason === 'invalid' ? 'invalid' as const : 'network' as const
        if (!isCurrent()) return 'superseded' as const
        const { schemaVersion: _schema, ...identity } = manifest.value
        // Внутри транзакции повторно проверяется revision: другая вкладка могла уже установить новый набор.
        installation = (operations.replace ?? replaceDataset)(verified.value, identity, { revision, isCurrent, provider: provider.id, generation: dataGeneration })
        const replacement = await installation
        if (!replacement.ok) return replacement.error.kind === 'data' ? 'superseded' as const : 'storage' as const
        invalidRevision = null
        return null
      }
      try { reason = await Promise.race([download(), aborted]) }
      catch { reason = timedOut ? 'timeout' : 'network' }
      finally { clearTimeout(timeout) }
      if (operation !== epoch) return latest
      const installedMeta = await getDatasetMeta(provider.id)
      const installed = installedMeta.ok ? success(storedMetadataState(installedMeta.value, provider, invalidRevision)) : installedMeta
      if (!installed.ok) reason = 'storage'
      if (operation !== epoch) return latest
      const snapshot: PrayerRepositorySnapshot = { ...(installed.ok ? installed.value : latest),
        checkedAt: reason ? latest.checkedAt : Date.now(), update: reason ? { status: 'failed', reason } : { status: 'idle' } }
      emit(snapshot)
      return snapshot
    }
    const running = task().catch(() => {
      const snapshot: PrayerRepositorySnapshot = { ...latest, update: { status: 'failed', reason: 'storage' } }
      if (operation === epoch) emit(snapshot)
      return snapshot
    }).finally(() => { if (pending === running) { pending = null; controller = null } })
    pending = running
    return running
  }
  return {
    initialize: async () => {
      const operation = epoch
      const dataGeneration = await getDataGeneration()
      const result = await initializePrayerRepository(provider)
      const meta = result.ok && result.value.dataState === 'invalid' ? await getDatasetMeta(provider.id) : null
      if (operation === epoch && result.ok) {
        generation = dataGeneration
        generationInitialized = true
        latest = result.value
        if (meta?.ok && meta.value) invalidRevision = getDatasetRevision(meta.value)
      }
      return result
    },
    initializeStartup: async () => {
      const operation = epoch
      const result = await readStartup(provider)
      if (!result.ok) return result
      if (operation === epoch) {
        generation = result.value.generation
        generationInitialized = true
        latest = result.value.state
      }
      return success(result.value.state)
    },
    loadOptionalSettings: loadPrayerRepositoryOptionalSettings,
    clearAppData,
    getDataGeneration,
    refresh,
    subscribe: (listener: (snapshot: PrayerRepositorySnapshot) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    invalidateAndDrain: async () => { epoch += 1; controller?.abort(); await pending; await installation; latest = { meta: null, dataState: 'not-loaded', update: { status: 'idle' }, checkedAt: null } },
    getDays: async (locationId: string, dates: readonly string[], revision: string) => {
      const operation = epoch
      const result = await getPrayerDays(locationId, dates, revision, provider.id)
      if (operation === epoch && (!result.ok && result.error.kind === 'data' || result.ok && result.value.some(day => !day))) invalidRevision = revision
      return result
    },
    reservePlaceSelectionOrder: async () => {
      if (!generationInitialized) {
        const currentGeneration = await getDataGeneration()
        if (!hasInitializedGeneration()) generation = currentGeneration
      }
      return reserveStoredPlaceSelectionOrder(generation)
    },
    getCommittedPlaceSelectionOrder: async () => {
      const result = await getSetting('committedPlaceSelectionOrder')
      if (!result.ok) throw new Error('Не удалось прочитать committed-order выбора места')
      return typeof result.value === 'number' && Number.isSafeInteger(result.value) ? result.value : undefined
    },
    saveSettings: (patch: SettingsPatch, isCurrent?: () => boolean,
      onPlaceEventsOutcome?: Parameters<typeof saveSettings>[4]): Promise<Result<void, StorageFailure | DataFailure>> => {
      if (patch.calendarPreferences && !isCalendarPreferences(patch.calendarPreferences)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.sourcePreferences && !isSourcePreferences(patch.sourcePreferences)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.locationChoice && !placeFromChoice(patch.locationChoice, DEFAULT_OFFICIAL_LOCATIONS)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.placeEvents && (!Array.isArray(patch.placeEvents) || patch.placeEvents.some((raw: unknown) => {
        if (!raw || typeof raw !== 'object') return true
        const event = raw as Partial<PlacePersistenceEvent>
        return !event.change || !['selection', 'refinement', 'automatic'].includes(event.change)
          || !event.choice || !placeFromChoice(event.choice, DEFAULT_OFFICIAL_LOCATIONS)
          || event.selectionOrder !== undefined && !Number.isFinite(event.selectionOrder)
          || event.selectionReservationRetried !== undefined && typeof event.selectionReservationRetried !== 'boolean'
          || event.selectionReservationBaseline !== undefined && event.selectionReservationBaseline !== null
            && event.selectionReservationBaseline !== 'unavailable'
            && (typeof event.selectionReservationBaseline !== 'number' || !Number.isSafeInteger(event.selectionReservationBaseline))
          || event.change === 'selection' && event.selectionOrder === undefined
          || event.change !== 'selection' && !(typeof event.expectedPlaceId === 'string' || event.expectedPlaceId === null)
      }))) {
        return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      }
      if (patch.appearance && !['system', 'light', 'dark'].includes(patch.appearance)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.themeFamily && restoreThemeFamily(patch.themeFamily) !== patch.themeFamily) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.recentPlaces && (!Array.isArray(patch.recentPlaces) || restoreRecentPlaces(patch.recentPlaces).length !== patch.recentPlaces.length)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.languagePreference && restoreLanguagePreference(patch.languagePreference) !== patch.languagePreference) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.fastingMode && !isFastingModePreferences(patch.fastingMode)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      return saveSettings(patch, isCurrent, generation, reconcilePlaceHistory, outcome => {
        if (patch.placeEvents?.length) onPlaceEventsOutcome?.(outcome)
      })
    },
  }
}
export function createPrayerRepositories(
  providers: readonly PrayerProvider[],
  operationsForProvider: (provider: PrayerProvider) => PrayerRepositoryOperations = () => ({}),
): ReadonlyMap<string, ReturnType<typeof createPrayerRepository>> {
  if (new Set(providers.map(provider => provider.id)).size !== providers.length) throw new Error('Повторяется идентификатор источника расписания')
  return new Map(providers.map(provider => [provider.id, createPrayerRepository(operationsForProvider(provider), provider)]))
}

export const prayerRepositories = createPrayerRepositories(PRAYER_PROVIDERS)
export const prayerRepository = prayerRepositories.get(dumRtProvider.id) ?? createPrayerRepository()
