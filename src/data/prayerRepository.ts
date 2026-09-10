import { isLocationSelectionSource } from '../domain/locationSelection'
import { restoreRecentPlaces } from '../domain/recentPlaces'
import type { Place } from '../domain/place'
import { migratePlaceChoice, placeFromChoice } from '../domain/placeMigration'
import { isPrayerDataset } from '../domain/prayerDatasetValidation'
import { getDatasetRevision } from '../domain/scheduleContext'
import { restoreSourcePreferences, isSourcePreferences, type SourcePreferences } from '../domain/sourcePreferences'
import type { DataFailure, StorageFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import {
  clearAppData, getDataGeneration, getDatasetMeta, getLocationChoice, getPrayerDays, getSetting, getStoredDataset,
  replaceDataset, saveSettings, type DatasetMeta, type LocationChoice, type SettingsPatch, type Appearance,
} from '../storage/database'
import { DEFAULT_OFFICIAL_LOCATIONS, dumRtProvider } from './prayerProviders'
import { resolvePrayerDatasetUrl, validatePrayerDatasetManifest, verifyPrayerDatasetBytes, type PrayerDatasetByteOperations } from './prayerDatasetManifest'

const MANIFEST_URL = dumRtProvider.manifestUrl
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type DatasetUpdate = { status: 'idle' | 'refreshing' } | { status: 'failed'; reason: 'network' | 'timeout' | 'invalid' | 'storage' | 'superseded' }
export interface PrayerRepositorySnapshot {
  meta: DatasetMeta | null
  dataState: 'ready' | 'not-loaded' | 'invalid'
  update: DatasetUpdate
  checkedAt: number | null
}
export interface PrayerRepositoryState extends PrayerRepositorySnapshot {
  recentPlaces?: Place[]
  locationChoice: LocationChoice | null
  appearance?: Appearance
  preferences: SourcePreferences
}
export type PrayerRepositoryOperations = Partial<PrayerDatasetByteOperations> & {
  fetch?: Fetcher
  timeoutMs?: number
  replace?: typeof replaceDataset
}

async function readLocalSnapshot(): Promise<Result<PrayerRepositorySnapshot, StorageFailure>> {
  const stored = await getStoredDataset()
  if (!stored.ok) return stored
  const valid = stored.value && isPrayerDataset(stored.value.dataset)
  return success({ meta: valid ? stored.value.meta : null, dataState: valid ? 'ready' : stored.value ? 'invalid' : 'not-loaded', update: { status: 'idle' }, checkedAt: null })
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
export async function initializePrayerRepository(): Promise<Result<PrayerRepositoryState, StorageFailure>> {
  const [snapshot, choice, preferences, legacy, appearance, recentPlaces] = await Promise.all([
    readLocalSnapshot(), getLocationChoice(), getSetting('sourcePreferences'), getSetting('calculationSettings'), getSetting('appearance'), getSetting('recentPlaces'),
  ])
  if (!snapshot.ok) return snapshot
  if (!choice.ok) return choice
  if (!preferences.ok) return preferences
  if (!legacy.ok) return legacy
  if (!appearance.ok) return appearance
  if (!recentPlaces.ok) return recentPlaces
  const locationChoice = choice.value === undefined ? null : restoreLocationChoice(choice.value, snapshot.value.meta)
  return success({ ...snapshot.value, locationChoice,
    recentPlaces: restoreRecentPlaces(recentPlaces.value, locationChoice?.place?.id),
    appearance: appearance.value === 'light' || appearance.value === 'dark' ? appearance.value : 'system',
    preferences: restoreSourcePreferences(preferences.value, legacy.value, choice.value) })
}

export function createPrayerRepository(operations: PrayerRepositoryOperations = {}) {
  const listeners = new Set<(snapshot: PrayerRepositorySnapshot) => void>()
  let pending: Promise<PrayerRepositorySnapshot> | null = null
  let controller: AbortController | null = null
  let installation: ReturnType<typeof replaceDataset> | null = null
  let epoch = 0
  let generation = 0
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
      const local = await readLocalSnapshot()
      if (!isCurrent()) return latest
      if (local.ok) latest = { ...local.value, checkedAt: latest.checkedAt }
      const initialMeta = await getDatasetMeta()
      if (!isCurrent()) return latest
      const revision = initialMeta.ok && initialMeta.value ? getDatasetRevision(initialMeta.value) : null
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
        const manifestResponse = await fetcher(MANIFEST_URL, { cache: 'no-store', signal })
        if (!manifestResponse.ok) return 'network' as const
        const manifest = validatePrayerDatasetManifest(await manifestResponse.json() as unknown)
        if (!manifest.ok) return 'invalid' as const
        if (!isCurrent()) return 'superseded' as const
        if (latest.meta?.identity?.sha256 === manifest.value.sha256 && latest.meta.identity.sequence === manifest.value.sequence) return null
        const response = await fetcher(resolvePrayerDatasetUrl(MANIFEST_URL, manifest.value), { cache: 'no-store', signal })
        if (!response.ok) return 'network' as const
        const verified = await verifyPrayerDatasetBytes(new Uint8Array(await response.arrayBuffer()), manifest.value, operations)
        if (!verified.ok) return verified.error.reason === 'invalid' ? 'invalid' as const : 'network' as const
        if (!isCurrent()) return 'superseded' as const
        const { schemaVersion: _schema, ...identity } = manifest.value
        // Внутри транзакции повторно проверяется revision: другая вкладка могла уже установить новый набор.
        installation = (operations.replace ?? replaceDataset)(verified.value, identity, { revision, isCurrent, provider: dumRtProvider.id, generation: dataGeneration })
        const replacement = await installation
        if (!replacement.ok) return replacement.error.kind === 'data' ? 'superseded' as const : 'storage' as const
        return null
      }
      try { reason = await Promise.race([download(), aborted]) }
      catch { reason = timedOut ? 'timeout' : 'network' }
      finally { clearTimeout(timeout) }
      if (operation !== epoch) return latest
      const installed = await readLocalSnapshot()
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
    initialize: async () => { generation = await getDataGeneration(); return initializePrayerRepository() },
    clearAppData,
    getDataGeneration,
    refresh,
    subscribe: (listener: (snapshot: PrayerRepositorySnapshot) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    invalidateAndDrain: async () => { epoch += 1; controller?.abort(); await pending; await installation; latest = { meta: null, dataState: 'not-loaded', update: { status: 'idle' }, checkedAt: null } },
    getDays: getPrayerDays,
    saveSettings: (patch: SettingsPatch, isCurrent?: () => boolean): Promise<Result<void, StorageFailure | DataFailure>> => {
      if (patch.sourcePreferences && !isSourcePreferences(patch.sourcePreferences)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.locationChoice && !placeFromChoice(patch.locationChoice, DEFAULT_OFFICIAL_LOCATIONS)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.appearance && !['system', 'light', 'dark'].includes(patch.appearance)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      if (patch.recentPlaces && (!Array.isArray(patch.recentPlaces) || restoreRecentPlaces(patch.recentPlaces).length !== patch.recentPlaces.length)) return Promise.resolve(failure({ kind: 'data', reason: 'invalid' }))
      return saveSettings(patch, isCurrent, generation)
    },
  }
}
export const prayerRepository = createPrayerRepository()
