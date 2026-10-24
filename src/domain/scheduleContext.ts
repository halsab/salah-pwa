import { calculationSettingsKey } from './calculationSettings'
import type { CalculationSettings } from './prayerCalculation'

export interface ScheduleContext {
  mode?: 'automatic' | 'manual'
  date: string
  timeZone: string
  location: { id: string | null; latitude: number; longitude: number; localityId?: string }
  source: 'calculated'
  settings: CalculationSettings
}

export function scheduleContextKey(context: ScheduleContext): string {
  return JSON.stringify([
    context.location.id, context.location.latitude, context.location.longitude, context.location.localityId,
    context.date, context.timeZone, context.mode, calculationSettingsKey(context.settings),
  ])
}
