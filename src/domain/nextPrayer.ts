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

export function formatRemainingTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3_600)
  const minutes = Math.floor((safeSeconds % 3_600) / 60)
  const seconds = safeSeconds % 60

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}
