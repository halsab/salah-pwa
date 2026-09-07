import coverage from './dumRtCoverage.json'
import { DUM_RT_TIME_ZONE } from '../domain/locationTime'
import { getDatasetRevision } from '../domain/scheduleContext'
import type { OfficialDatasetAvailability } from '../domain/prayerSource'
import type { DatasetMeta } from '../storage/database'

export interface PrayerProvider {
  id: string
  label: string
  priority: number
  timeZone: string
  coverage: string
  manifestUrl: string
  bundled: DatasetMeta
}
export const dumRtProvider: PrayerProvider = {
  id: 'dumRt', label: 'ДУМ РТ', priority: 10, timeZone: DUM_RT_TIME_ZONE, coverage: 'RU-TA',
  manifestUrl: `${import.meta.env.BASE_URL}data/prayer-times-manifest.json`,
  bundled: { ...coverage, identity: { ...coverage.identity, url: 'prayer-times-current.json' } },
}
export const PRAYER_PROVIDERS: readonly PrayerProvider[] = [dumRtProvider]

export function officialDatasets(meta: DatasetMeta | null, dataState: 'ready' | 'not-loaded' | 'invalid'): OfficialDatasetAvailability[] {
  return PRAYER_PROVIDERS.flatMap(provider => {
    const descriptor = (data: DatasetMeta, state: OfficialDatasetAvailability['state']): OfficialDatasetAvailability => ({
      provider: provider.id, priority: provider.priority, timeZone: provider.timeZone, coverage: provider.coverage,
      years: data.source.years, locations: data.locations, state,
      version: data.identity?.version ?? data.source.updatedAt, revision: getDatasetRevision(data),
    })
    const installed = meta && (meta.provider ?? 'dumRt') === provider.id && dataState === 'ready' ? descriptor(meta, 'ready') : null
    const expected = descriptor(provider.bundled, dataState === 'invalid' ? 'invalid' : 'not-loaded')
    return installed ? [installed, expected] : [expected]
  })
}
export const DEFAULT_OFFICIAL_LOCATIONS = PRAYER_PROVIDERS.flatMap(provider => provider.bundled.locations)
