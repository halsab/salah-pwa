import {
  buildScheduleEvents,
  selectEventPair,
  type PrayerSchedule,
  type ResolvedScheduleEvent,
} from './scheduleEvents'

export interface NextPrayer extends ResolvedScheduleEvent {
  remainingSeconds: number
}

export type CurrentPrayer = ResolvedScheduleEvent

export function findNextPrayer(
  now: Date,
  ...schedules: (PrayerSchedule | undefined)[]
): NextPrayer | null {
  const { next } = selectEventPair(now, schedules.flatMap((day) => day ? buildScheduleEvents(day) : []))
  return next ? { ...next, remainingSeconds: Math.max(0, Math.ceil((next.instant - now.getTime()) / 1_000)) } : null
}

export function findCurrentPrayer(
  now: Date,
  ...schedules: (PrayerSchedule | undefined)[]
): CurrentPrayer | null {
  return selectEventPair(now, schedules.flatMap((day) => day ? buildScheduleEvents(day) : [])).current
}
