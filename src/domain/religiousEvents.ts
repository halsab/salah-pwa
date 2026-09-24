import { calendarDateFromCivil, type CalendarDate, type DateCorrection } from './calendar'
import { addDays } from './date'
import { buildScheduleEvents, type PrayerSchedule } from './scheduleEvents'

export const RELIGIOUS_EVENT_IDS = [
  'hijri-new-year',
  'ashura',
  'mawlid',
  'raghaib',
  'isra-miraj',
  'baraat',
  'ramadan',
  'eid-al-fitr',
  'dhul-hijjah-first-ten',
  'arafa',
  'eid-al-adha',
  'tashriq',
] as const

export type ReligiousEventId = typeof RELIGIOUS_EVENT_IDS[number]
export type ReligiousEventKind = 'day' | 'night' | 'period'

type ReligiousEventRule =
  | { type: 'fixed'; month: number; day: number }
  | { type: 'ragaib' }
  | { type: 'month'; month: number }
  | { type: 'range'; month: number; startDay: number; endDay: number }

export interface ReligiousEventDefinition {
  readonly id: ReligiousEventId
  readonly title: string
  readonly listTitle?: string
  readonly showInEventsList?: boolean
  readonly kind: ReligiousEventKind
  readonly rule: ReligiousEventRule
  readonly contentId?: ReligiousEventId
}

function event(definition: ReligiousEventDefinition): Readonly<ReligiousEventDefinition> {
  return Object.freeze(definition)
}

export const RELIGIOUS_EVENTS: readonly Readonly<ReligiousEventDefinition>[] = Object.freeze([
  event({ id: 'hijri-new-year', title: 'Новый год по хиджре', kind: 'day', rule: { type: 'fixed', month: 1, day: 1 }, contentId: 'hijri-new-year' }),
  event({ id: 'ashura', title: 'День Ашура', kind: 'day', rule: { type: 'fixed', month: 1, day: 10 }, contentId: 'ashura' }),
  event({ id: 'mawlid', title: 'Мавлид ан-Наби ﷺ', kind: 'day', rule: { type: 'fixed', month: 3, day: 12 }, contentId: 'mawlid' }),
  event({ id: 'raghaib', title: 'Ночь Рагаиб', kind: 'night', rule: { type: 'ragaib' }, contentId: 'raghaib' }),
  event({ id: 'isra-miraj', title: 'Исра и Ми‘радж', kind: 'night', rule: { type: 'fixed', month: 7, day: 27 }, contentId: 'isra-miraj' }),
  event({ id: 'baraat', title: 'Ночь Бараат', kind: 'night', rule: { type: 'fixed', month: 8, day: 15 }, contentId: 'baraat' }),
  event({ id: 'ramadan', title: 'Рамадан', listTitle: 'Начало Рамадана', kind: 'period', rule: { type: 'month', month: 9 }, contentId: 'ramadan' }),
  event({ id: 'eid-al-fitr', title: 'Ураза-байрам', kind: 'day', rule: { type: 'fixed', month: 10, day: 1 }, contentId: 'eid-al-fitr' }),
  event({ id: 'dhul-hijjah-first-ten', title: 'Первые 10 дней Зуль-хиджи', listTitle: 'Начало Зуль-хиджи', kind: 'period', rule: { type: 'range', month: 12, startDay: 1, endDay: 10 }, contentId: 'dhul-hijjah-first-ten' }),
  event({ id: 'arafa', title: 'День Арафа', kind: 'day', rule: { type: 'fixed', month: 12, day: 9 }, contentId: 'arafa' }),
  event({ id: 'eid-al-adha', title: 'Курбан-байрам', kind: 'day', rule: { type: 'fixed', month: 12, day: 10 }, contentId: 'eid-al-adha' }),
  event({ id: 'tashriq', title: 'Дни ташрика', showInEventsList: false, kind: 'period', rule: { type: 'range', month: 12, startDay: 11, endDay: 13 }, contentId: 'tashriq' }),
])

const RELIGIOUS_EVENT_ID_SET = new Set<string>(RELIGIOUS_EVENT_IDS)

export function isReligiousEventId(value: unknown): value is ReligiousEventId {
  return typeof value === 'string' && RELIGIOUS_EVENT_ID_SET.has(value)
}

export interface ReligiousBannerState {
  eventId: ReligiousEventId
  title: string
  secondaryText: string | null
  contentId: ReligiousEventId | null
}

export interface ResolveReligiousBannerInput {
  now: Date
  today: string
  selectedDate: string
  correction: DateCorrection
  hijriSupported: boolean
  scheduleReady: boolean
  schedules: readonly PrayerSchedule[]
}

interface UpcomingEvent {
  definition: Readonly<ReligiousEventDefinition>
  offset: number
}

export interface ReligiousEventOccurrence {
  eventId: ReligiousEventId
  kind: ReligiousEventKind
  title: string
  civilDate: string
  hijriDate: CalendarDate
  contentId: ReligiousEventId | null
}

export interface ListReligiousEventOccurrencesInput {
  fromDate: string
  toDateExclusive: string
  correction: DateCorrection
  hijriSupported: boolean
}

function hijriDate(date: string, correction: DateCorrection) {
  return calendarDateFromCivil(date, 'hijri', correction)
}

function isFriday(date: string): boolean {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 5
}

function matchesRule(definition: Readonly<ReligiousEventDefinition>, date: string, correction: DateCorrection): boolean {
  const hijri = hijriDate(date, correction)
  const rule = definition.rule
  if (rule.type === 'fixed') return hijri.month === rule.month && hijri.day === rule.day
  if (rule.type === 'ragaib') return hijri.month === 7 && hijri.day >= 1 && hijri.day <= 7 && isFriday(date)
  if (rule.type === 'month') return hijri.month === rule.month
  return hijri.month === rule.month && hijri.day >= rule.startDay && hijri.day <= rule.endDay
}

function isPeriodStart(definition: Readonly<ReligiousEventDefinition>, date: string, correction: DateCorrection): boolean {
  return matchesRule(definition, date, correction) && !matchesRule(definition, addDays(date, -1), correction)
}

function compareDefinitions(left: Readonly<ReligiousEventDefinition>, right: Readonly<ReligiousEventDefinition>): number {
  return left.id.localeCompare(right.id)
}

export function listReligiousEventOccurrences(input: ListReligiousEventOccurrencesInput): ReligiousEventOccurrence[] {
  if (!input.hijriSupported || input.fromDate >= input.toDateExclusive) return []
  const occurrences: ReligiousEventOccurrence[] = []
  for (let date = input.fromDate; date < input.toDateExclusive; date = addDays(date, 1)) {
    for (const definition of RELIGIOUS_EVENTS) {
      if (definition.showInEventsList === false) continue
      const matches = definition.kind === 'period'
        ? isPeriodStart(definition, date, input.correction)
        : matchesRule(definition, date, input.correction)
      if (!matches) continue
      occurrences.push({
        eventId: definition.id,
        kind: definition.kind,
        title: definition.listTitle ?? definition.title,
        civilDate: date,
        hijriDate: hijriDate(date, input.correction),
        contentId: definition.contentId ?? null,
      })
    }
  }
  return occurrences.sort((left, right) => left.civilDate.localeCompare(right.civilDate) || left.eventId.localeCompare(right.eventId))
}

function countdown(offset: number): string {
  return offset === 1 ? 'завтра' : `через ${offset} дня`
}

function banner(definition: Readonly<ReligiousEventDefinition>, secondaryText: string | null): ReligiousBannerState {
  return {
    eventId: definition.id,
    title: definition.title,
    secondaryText,
    contentId: definition.contentId ?? null,
  }
}

function resolveNightBoundary(
  definition: Readonly<ReligiousEventDefinition>,
  anchor: string,
  correction: DateCorrection,
  schedules: readonly PrayerSchedule[],
): { startInstant: number; endInstant: number } | null {
  const target = addDays(anchor, 1)
  if (!matchesRule(definition, target, correction)) return null
  const anchorSchedule = schedules.find(schedule => schedule.date === anchor)
  const targetSchedule = schedules.find(schedule => schedule.date === target)
  if (!anchorSchedule || !targetSchedule) return null
  const start = buildScheduleEvents(anchorSchedule).find(item => item.key === 'maghrib')
  const endKey = 'entries' in targetSchedule ? 'fajr' : 'fajrStart'
  const end = buildScheduleEvents(targetSchedule).find(item => item.key === endKey)
  if (!start || !end || !Number.isFinite(start.instant) || !Number.isFinite(end.instant) || end.instant <= start.instant) return null
  return { startInstant: start.instant, endInstant: end.instant }
}

function currentNight(
  definition: Readonly<ReligiousEventDefinition>,
  input: ResolveReligiousBannerInput,
): boolean {
  const anchors = [addDays(input.today, -1), input.today]
  for (const anchor of anchors) {
    const boundary = resolveNightBoundary(definition, anchor, input.correction, input.schedules)
    if (!boundary || input.now.getTime() >= boundary.endInstant) continue
    if (anchor === input.today || input.now.getTime() >= boundary.startInstant) return true
  }
  return false
}

function upcomingEvents(input: ResolveReligiousBannerInput, kinds: readonly ReligiousEventKind[]): UpcomingEvent[] {
  const result: UpcomingEvent[] = []
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = addDays(input.today, offset)
    for (const definition of RELIGIOUS_EVENTS) {
      if (!kinds.includes(definition.kind)) continue
      const matches = definition.kind === 'night'
        ? resolveNightBoundary(definition, date, input.correction, input.schedules) !== null
        : definition.kind === 'period'
          ? isPeriodStart(definition, date, input.correction)
          : matchesRule(definition, date, input.correction)
      if (matches) result.push({ definition, offset })
    }
  }
  return result.sort((left, right) => left.offset - right.offset || compareDefinitions(left.definition, right.definition))
}

export function resolveReligiousBanner(input: ResolveReligiousBannerInput): ReligiousBannerState | null {
  if (input.selectedDate !== input.today || !input.hijriSupported || !input.scheduleReady) return null

  const concrete = RELIGIOUS_EVENTS
    .filter(definition => definition.kind === 'day'
      ? matchesRule(definition, input.today, input.correction)
      : definition.kind === 'night' && currentNight(definition, input))
    .sort(compareDefinitions)[0]
  if (concrete) return banner(concrete, null)

  const period = RELIGIOUS_EVENTS
    .filter(definition => definition.kind === 'period' && matchesRule(definition, input.today, input.correction))
    .sort(compareDefinitions)[0]
  if (period) {
    const upcomingConcrete = upcomingEvents(input, ['day', 'night'])[0]
    const secondary = upcomingConcrete
      ? `${upcomingConcrete.definition.title} ${countdown(upcomingConcrete.offset)}`
      : null
    return banner(period, secondary)
  }

  const upcoming = upcomingEvents(input, ['day', 'night', 'period'])[0]
  return upcoming ? banner(upcoming.definition, countdown(upcoming.offset)) : null
}
