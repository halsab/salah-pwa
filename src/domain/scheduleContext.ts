import type { CalculationSettings } from './prayerCalculation'
import type { PrayerDataset, PrayerDatasetManifest } from './types'

interface ScheduleContextBase {
  date: string
  timeZone: string
  location: { id: string | null; latitude: number; longitude: number }
}

export type ScheduleContext = ScheduleContextBase & (
  | { source: 'dumRt'; datasetRevision: string }
  | { source: 'adhan'; settings: CalculationSettings }
)

type DatasetDescriptor = Pick<PrayerDataset, 'schemaVersion' | 'source'> & {
  identity?: Pick<PrayerDatasetManifest, 'version' | 'sha256' | 'url'>
}

export function getDatasetRevision(meta: DatasetDescriptor): string {
  // Для старого офлайн-кеша без manifest остаётся идентичность опубликованного источника.
  return JSON.stringify([
    meta.schemaVersion, meta.identity?.version, meta.identity?.sha256,
    meta.identity?.url, meta.source.url, meta.source.updatedAt, meta.source.years,
  ])
}

export function scheduleContextKey(context: ScheduleContext): string {
  return JSON.stringify([
    context.location.id, context.location.latitude, context.location.longitude,
    context.date, context.timeZone, context.source,
    context.source === 'dumRt'
      ? context.datasetRevision
      : [context.settings.profile, context.settings.asrMethod, context.settings.highLatitudeRule],
  ])
}
