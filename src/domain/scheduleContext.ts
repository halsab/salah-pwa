import { calculationSettingsKey } from './calculationSettings'
import type { CalculationSettings } from './prayerCalculation'
import type { PrayerDataset, PrayerDatasetManifest } from './types'

interface ScheduleContextBase {
  mode?: 'automatic' | 'manual'
  date: string
  timeZone: string
  location: { id: string | null; latitude: number; longitude: number }
}

export type ScheduleContext = ScheduleContextBase & (
  | { source: 'official'; provider: string; datasetRevision: string; datasetVersion: string; coverage: string; localityId: string }
  | { source: 'calculated'; settings: CalculationSettings }
)

type DatasetDescriptor = Pick<PrayerDataset, 'schemaVersion'> & {
  source?: PrayerDataset['source']
  provider?: string
  identity?: Pick<PrayerDatasetManifest, 'version' | 'sha256' | 'url' | 'sequence'>
}

export function getDatasetRevision(meta: DatasetDescriptor): string {
  // Для старого офлайн-кеша без manifest остаётся идентичность опубликованного источника.
  return JSON.stringify([
    meta.provider ?? 'dumRt', meta.schemaVersion, meta.identity?.version, meta.identity?.sha256,
    meta.identity?.url, meta.identity?.sequence, meta.source?.url, meta.source?.updatedAt, meta.source?.years,
  ])
}

export function scheduleContextKey(context: ScheduleContext): string {
  return JSON.stringify([
    context.location.id, context.location.latitude, context.location.longitude,
    context.date, context.timeZone, context.source, context.mode,
    context.source === 'official'
      ? [context.provider, context.datasetRevision, context.datasetVersion, context.coverage, context.localityId]
      : calculationSettingsKey(context.settings),
  ])
}
