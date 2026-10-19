import { getCivilDate, isValidTimeZone } from './locationTime'
import { buildScheduleEvents, type OfficialEventHorizon, type PrayerSchedule, type ResolvedScheduleEvent } from './scheduleEvents'
import type { DateCorrection } from './calendar'
import { ramadanOccurrenceIdForDate, type RamadanOccurrenceId } from './religiousEvents'
import { addDays } from './date'

export interface FastingModePreferences {
  manualEnabled: boolean
  suppressedRamadanOccurrence?: RamadanOccurrenceId
}

export const DEFAULT_FASTING_MODE_PREFERENCES: Readonly<FastingModePreferences> = Object.freeze({ manualEnabled: false })

export interface FastingScheduleEvents {
  fajr: ResolvedScheduleEvent[]
  maghrib: ResolvedScheduleEvent[]
}

export type FastingTimeline =
  | { kind: 'day'; start: ResolvedScheduleEvent; end: ResolvedScheduleEvent }
  | { kind: 'night'; start: ResolvedScheduleEvent; end: ResolvedScheduleEvent }

export function isFastingModePreferences(value: unknown): value is FastingModePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.manualEnabled === 'boolean'
    && (record.suppressedRamadanOccurrence === undefined
      || (typeof record.suppressedRamadanOccurrence === 'string'
        && /^ramadan-\d{3,4}$/u.test(record.suppressedRamadanOccurrence)))
}

export function restoreFastingModePreferences(value: unknown): FastingModePreferences {
  if (!isFastingModePreferences(value)) return { ...DEFAULT_FASTING_MODE_PREFERENCES }
  return value.suppressedRamadanOccurrence
    ? { manualEnabled: value.manualEnabled, suppressedRamadanOccurrence: value.suppressedRamadanOccurrence }
    : { manualEnabled: value.manualEnabled }
}

export function isFastingModeActive(
  preferences: FastingModePreferences,
  activeRamadanOccurrence: RamadanOccurrenceId | null,
): boolean {
  return preferences.manualEnabled
    || (activeRamadanOccurrence !== null && preferences.suppressedRamadanOccurrence !== activeRamadanOccurrence)
}

export function updateFastingModePreferences(
  preferences: FastingModePreferences,
  enabled: boolean,
  activeRamadanOccurrence: RamadanOccurrenceId | null,
): FastingModePreferences {
  if (enabled) return { manualEnabled: true }
  return activeRamadanOccurrence
    ? { manualEnabled: false, suppressedRamadanOccurrence: activeRamadanOccurrence }
    : { manualEnabled: false }
}

export function buildFastingScheduleEvents(
  schedules: readonly PrayerSchedule[],
  timeZone: string | null | undefined,
): FastingScheduleEvents {
  const events: FastingScheduleEvents = { fajr: [], maghrib: [] }
  if (!timeZone || !isValidTimeZone(timeZone)) return events

  for (const schedule of schedules) {
    try {
      const fajrKey = 'entries' in schedule ? 'fajr' : 'fajrStart'
      for (const event of buildScheduleEvents(schedule)) {
        if (event.status !== 'resolved' || event.timeZone !== timeZone) continue
        if (event.key === fajrKey) events.fajr.push(event)
        else if (event.key === 'maghrib') events.maghrib.push(event)
      }
    } catch {
      // Не строим fasting interval из расписания с некорректным контекстом.
    }
  }

  events.fajr.sort((left, right) => left.instant - right.instant)
  events.maghrib.sort((left, right) => left.instant - right.instant)
  return events
}

function validInterval(start: ResolvedScheduleEvent, end: ResolvedScheduleEvent): boolean {
  return Number.isFinite(start.instant) && Number.isFinite(end.instant)
    && start.timeZone === end.timeZone && end.instant > start.instant
    && (end.date === start.date || end.date === addDays(start.date, 1))
}

function occurrenceForFastDate(
  scheduleDate: string,
  correction: DateCorrection,
  hijriSupported: boolean,
): RamadanOccurrenceId | null {
  return ramadanOccurrenceIdForDate(scheduleDate, correction, hijriSupported)
}

function isAutomaticFastDate(
  scheduleDate: string,
  preferences: FastingModePreferences,
  correction: DateCorrection,
  hijriSupported: boolean,
): boolean {
  if (preferences.manualEnabled) return true
  const occurrence = occurrenceForFastDate(scheduleDate, correction, hijriSupported)
  return occurrence !== null && occurrence !== preferences.suppressedRamadanOccurrence
}

export function resolveActiveRamadanOccurrence(input: {
  today: string
  correction: DateCorrection
  hijriSupported: boolean
  now?: Date
  timeZone?: string | null | undefined
  events?: FastingScheduleEvents
  officialHorizon?: OfficialEventHorizon | undefined
}): RamadanOccurrenceId | null {
  if (!input.hijriSupported) return null
  const currentOccurrence = occurrenceForFastDate(input.today, input.correction, true)
  if (currentOccurrence) return currentOccurrence
  if (!input.now || !input.timeZone || !input.events || !isValidTimeZone(input.timeZone)
    || getCivilDate(input.now, input.timeZone) !== input.today) return null

  const now = input.now.getTime()
  for (const fajr of input.events.fajr) {
    if (input.officialHorizon?.next === false && fajr.scheduleDate > input.today) continue
    const occurrence = occurrenceForFastDate(fajr.scheduleDate, input.correction, true)
    const maghrib = input.events.maghrib.find(event => event.scheduleDate === fajr.scheduleDate)
    if (occurrence && maghrib && validInterval(fajr, maghrib) && now >= fajr.instant && now < maghrib.instant) return occurrence
  }

  for (const fajr of input.events.fajr) {
    if (input.officialHorizon?.next === false && fajr.scheduleDate > input.today) continue
    const occurrence = occurrenceForFastDate(fajr.scheduleDate, input.correction, true)
    if (!occurrence || fajr.instant <= now) continue
    const precedingMaghrib = input.events.maghrib.reduce<ResolvedScheduleEvent | null>((closest, maghrib) => {
      if (maghrib.instant >= fajr.instant || maghrib.instant > now || !validInterval(maghrib, fajr)) return closest
      return !closest || maghrib.instant > closest.instant ? maghrib : closest
    }, null)
    if (precedingMaghrib) return occurrence
  }
  return null
}

export function resolveFastingTimeline(input: {
  now: Date
  today: string
  selectedDate: string
  timeZone: string
  correction: DateCorrection
  hijriSupported: boolean
  preferences: FastingModePreferences
  events: FastingScheduleEvents
  officialHorizon?: OfficialEventHorizon | undefined
}): FastingTimeline | null {
  if (input.selectedDate !== input.today || !isValidTimeZone(input.timeZone)
    || getCivilDate(input.now, input.timeZone) !== input.today) return null

  const occurrence = resolveActiveRamadanOccurrence({
    ...input, now: input.now, timeZone: input.timeZone, events: input.events,
  })
  if (!isFastingModeActive(input.preferences, occurrence)) return null
  const now = input.now.getTime()

  const daytime = input.events.fajr.flatMap(fajr => {
    if (!isAutomaticFastDate(fajr.scheduleDate, input.preferences, input.correction, input.hijriSupported)) return []
    const maghrib = input.events.maghrib.find(event => event.scheduleDate === fajr.scheduleDate)
    // A same-row Fajr→Maghrib interval is complete without D+1.
    if (!maghrib || !validInterval(fajr, maghrib) || now < fajr.instant || now >= maghrib.instant) return []
    return [{ start: fajr, end: maghrib }]
  }).sort((left, right) => right.start.instant - left.start.instant)[0]
  if (daytime) return { kind: 'day', ...daytime }

  for (const fajr of input.events.fajr) {
    if (fajr.instant <= now || !isAutomaticFastDate(fajr.scheduleDate, input.preferences, input.correction, input.hijriSupported)) continue
    if (input.officialHorizon?.next === false && fajr.scheduleDate > input.today) continue
    const precedingMaghrib = input.events.maghrib.reduce<ResolvedScheduleEvent | null>((closest, maghrib) => {
      if (maghrib.instant >= fajr.instant || maghrib.instant > now || !validInterval(maghrib, fajr)
        || (input.officialHorizon?.previous === false && maghrib.scheduleDate < input.today)) return closest
      return !closest || maghrib.instant > closest.instant ? maghrib : closest
    }, null)
    if (precedingMaghrib) return { kind: 'night', start: precedingMaghrib, end: fajr }
  }
  return null
}

export function fastingProgress(timeline: FastingTimeline, now: number): number {
  const duration = timeline.end.instant - timeline.start.instant
  if (duration <= 0) return 0
  return Math.max(0, Math.min(1, (now - timeline.start.instant) / duration))
}
