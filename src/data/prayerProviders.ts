import coverage from './dumRtCoverage.json'
import { DUM_RT_TIME_ZONE } from '../domain/locationTime'
import { getDatasetRevision } from '../domain/scheduleContext'
import type { OfficialDatasetAvailability } from '../domain/prayerSource'
import type { DatasetMeta } from '../storage/database'

export interface PrayerProvider {
  id: string
  priority: number
  timeZone: string
  coverage: string
  manifestUrl: string
  bundled: DatasetMeta
}
export const dumRtProvider: PrayerProvider = {
  id: 'dumRt', priority: 10, timeZone: DUM_RT_TIME_ZONE, coverage: 'RU-TA',
  manifestUrl: `${import.meta.env.BASE_URL}data/prayer-times-manifest.json`,
  bundled: { ...coverage, identity: { ...coverage.identity, url: 'prayer-times-current.json' } },
}
export const PRAYER_PROVIDERS: readonly PrayerProvider[] = [dumRtProvider]

export function officialDatasets(
  installed: ReadonlyMap<string, { meta: DatasetMeta | null; state: 'ready' | 'not-loaded' | 'invalid' }> | DatasetMeta | null,
  dataState: 'ready' | 'not-loaded' | 'invalid' = 'not-loaded',
): OfficialDatasetAvailability[] {
  return PRAYER_PROVIDERS.flatMap(provider => {
    const state = installed && 'get' in installed
      ? installed.get(provider.id) ?? { meta: null, state: 'not-loaded' as const }
      : { meta: installed && (installed.provider === provider.id || (!('provider' in installed) && provider.id === 'dumRt')) ? installed : null, state: dataState }
    const meta = state.meta
    const descriptor = (data: DatasetMeta, state: OfficialDatasetAvailability['state']): OfficialDatasetAvailability => ({
      provider: provider.id, priority: provider.priority,
      timeZone: data.providerInfo?.timeZone ?? provider.timeZone,
      coverage: data.providerInfo?.coverage.geographic ?? provider.coverage,
      years: data.source.years, locations: data.locations, state,
      version: data.identity?.version ?? data.source.updatedAt, revision: getDatasetRevision(data),
    })
    const ready = meta && state.state === 'ready' ? descriptor(meta, 'ready') : null
    const expected = descriptor(provider.bundled, state.state === 'invalid' ? 'invalid' : 'not-loaded')
    return ready ? [ready, expected] : [expected]
  })
}
export const DEFAULT_OFFICIAL_LOCATIONS = PRAYER_PROVIDERS.flatMap(provider => provider.bundled.locations)
