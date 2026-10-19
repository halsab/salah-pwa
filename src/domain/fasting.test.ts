import { describe, expect, it } from 'vitest'
import { calendarDateFromCivil, civilDateFromCalendar } from './calendar'
import { addDays } from './date'
import {
  buildFastingScheduleEvents,
  fastingProgress,
  isFastingModeActive,
  resolveActiveRamadanOccurrence,
  resolveFastingTimeline,
  restoreFastingModePreferences,
  updateFastingModePreferences,
} from './fasting'
import { calculatePrayerSchedule } from './prayerCalculation'
import { ramadanOccurrenceIdForDate } from './religiousEvents'
import type { PrayerDay, PrayerTime } from './types'

function day(date: string, fajrStart: PrayerTime = '04:00', maghrib: PrayerTime = '19:00', timeZone = 'Europe/Moscow'): PrayerDay {
  return {
    locationId: 'test', date, timeZone, fajrStart, fajrJamaat: '04:30', sunrise: '06:00',
    zenith: '12:00', dhuhr: '12:10', asr: '16:00', maghrib, isha: '21:00',
  }
}

function resolve(input: {
  now: string
  today?: string
  selectedDate?: string
  schedules: PrayerDay[]
  timeZone?: string
  preferences?: { manualEnabled: boolean; suppressedRamadanOccurrence?: `ramadan-${number}` }
  correction?: -1 | 0 | 1
}) {
  const timeZone = input.timeZone ?? 'Europe/Moscow'
  const today = input.today ?? input.schedules[0]?.date ?? ''
  return resolveFastingTimeline({
    now: new Date(input.now), today, selectedDate: input.selectedDate ?? today, timeZone,
    correction: input.correction ?? 0, hijriSupported: true,
    preferences: input.preferences ?? { manualEnabled: true },
    events: buildFastingScheduleEvents(input.schedules, timeZone),
  })
}

describe('режим поста', () => {
  const ramadanStart = civilDateFromCalendar({ year: 1448, month: 9, day: 1 }, 'hijri')
  const ramadanOccurrence = 'ramadan-1448' as const

  it('включается автоматически на период Рамадана и реагирует на поправку календаря', () => {
    expect(resolveActiveRamadanOccurrence({ today: ramadanStart, correction: 0, hijriSupported: true })).toBe(ramadanOccurrence)
    expect(resolveActiveRamadanOccurrence({ today: ramadanStart, correction: 0, hijriSupported: false })).toBeNull()
    const correctedStart = civilDateFromCalendar({ year: 1448, month: 9, day: 1 }, 'hijri', 1)
    expect(ramadanOccurrenceIdForDate(correctedStart, 1, true)).toBe(ramadanOccurrence)
    expect(calendarDateFromCivil(correctedStart, 'hijri', 1).month).toBe(9)
  })

  it('сохраняет ручное включение, а выключение в Рамадан подавляет только текущий период', () => {
    const manual = updateFastingModePreferences({ manualEnabled: false }, true, null)
    expect(manual).toEqual({ manualEnabled: true })
    expect(isFastingModeActive(manual, null)).toBe(true)
    const suppressed = updateFastingModePreferences(manual, false, ramadanOccurrence)
    expect(suppressed).toEqual({ manualEnabled: false, suppressedRamadanOccurrence: ramadanOccurrence })
    expect(isFastingModeActive(suppressed, ramadanOccurrence)).toBe(false)
    expect(isFastingModeActive(suppressed, 'ramadan-1449')).toBe(true)
    expect(updateFastingModePreferences(suppressed, true, ramadanOccurrence)).toEqual({ manualEnabled: true })
  })

  it('восстанавливает ручной выбор и подавление после перезапуска', () => {
    const restoredManual = restoreFastingModePreferences({ manualEnabled: true })
    const restoredSuppression = restoreFastingModePreferences({
      manualEnabled: false,
      suppressedRamadanOccurrence: ramadanOccurrence,
    })

    expect(isFastingModeActive(restoredManual, null)).toBe(true)
    expect(isFastingModeActive(restoredManual, 'ramadan-1449')).toBe(true)
    expect(isFastingModeActive(restoredSuppression, ramadanOccurrence)).toBe(false)
    expect(isFastingModeActive(restoredSuppression, 'ramadan-1449')).toBe(true)
  })

  it('включает первый предрассветный интервал после магриба накануне Рамадана', () => {
    const priorDate = addDays(ramadanStart, -1)
    const schedules = [day(priorDate), day(ramadanStart), day(addDays(ramadanStart, 1))]
    const events = buildFastingScheduleEvents(schedules, 'Europe/Moscow')
    const now = new Date(`${priorDate}T16:30:00Z`)
    const activeOccurrence = resolveActiveRamadanOccurrence({ today: priorDate, correction: 0, hijriSupported: true,
      now, timeZone: 'Europe/Moscow', events })
    expect(activeOccurrence).toBe(ramadanOccurrence)
    expect(resolveFastingTimeline({ now, today: priorDate, selectedDate: priorDate, timeZone: 'Europe/Moscow',
      correction: 0, hijriSupported: true, preferences: { manualEnabled: false }, events }))
      .toMatchObject({ kind: 'night', end: { scheduleDate: ramadanStart } })
    const suppressed = updateFastingModePreferences({ manualEnabled: false }, false, activeOccurrence)
    expect(isFastingModeActive(suppressed, activeOccurrence)).toBe(false)
    expect(resolveFastingTimeline({ now, today: priorDate, selectedDate: priorDate, timeZone: 'Europe/Moscow',
      correction: 0, hijriSupported: true, preferences: suppressed, events })).toBeNull()
  })

  it('не сохраняет подавление Рамадана, если режим выключен вне Рамадана', () => {
    expect(updateFastingModePreferences({ manualEnabled: true, suppressedRamadanOccurrence: ramadanOccurrence }, false, null))
      .toEqual({ manualEnabled: false })
  })

  it('берёт официальное начало Фаджра, а не время джамаата, и включает границы поста точно', () => {
    const yesterday = day('2026-03-09', '04:10')
    const today = day('2026-03-10', '04:00')
    const tomorrow = day('2026-03-11', '04:05')
    const events = buildFastingScheduleEvents([yesterday, today, tomorrow], 'Europe/Moscow')
    expect(events.fajr.find(event => event.scheduleDate === today.date)?.time).toBe('04:00')
    expect(resolve({ now: '2026-03-10T01:00:00Z', today: today.date, schedules: [yesterday, today, tomorrow] }))
      .toMatchObject({ kind: 'day', start: { time: '04:00' } })
    expect(resolve({ now: '2026-03-10T16:00:00Z', today: today.date, schedules: [yesterday, today, tomorrow] }))
      .toMatchObject({ kind: 'night', start: { time: '19:00' } })
  })

  it('показывает ночной интервал до и после полуночи по фактическим датам событий', () => {
    const yesterday = day('2026-03-09')
    const today = day('2026-03-10')
    const tomorrow = day('2026-03-11')
    const beforeMidnight = resolve({ now: '2026-03-10T20:55:00Z', today: today.date, schedules: [yesterday, today, tomorrow] })
    expect(beforeMidnight).toMatchObject({ kind: 'night', start: { date: today.date }, end: { date: tomorrow.date } })
    const afterMidnight = resolve({ now: '2026-03-10T21:01:00Z', today: tomorrow.date, schedules: [today, tomorrow, day('2026-03-12')] })
    expect(afterMidnight).toMatchObject({ kind: 'night', start: { date: today.date }, end: { date: tomorrow.date } })
  })

  it('использует сдвинутый момент позднего официального Фаджра предыдущих суток', () => {
    const targetDate = civilDateFromCalendar({ year: 1448, month: 9, day: 10 }, 'hijri')
    const priorDate = new Date(`${targetDate}T12:00:00Z`)
    priorDate.setUTCDate(priorDate.getUTCDate() - 1)
    const yesterday = priorDate.toISOString().slice(0, 10)
    const schedules = [day(yesterday), day(targetDate, '23:54')]
    const fastingEvents = buildFastingScheduleEvents(schedules, 'Europe/Moscow')
    const lateFajr = fastingEvents.fajr.find(event => event.scheduleDate === targetDate)
    expect(lateFajr).toMatchObject({ date: yesterday, scheduleDate: targetDate, time: '23:54' })
    expect(resolve({ now: `${yesterday}T20:50:00Z`, today: yesterday, schedules, preferences: { manualEnabled: false } }))
      .toMatchObject({ kind: 'night', end: { scheduleDate: targetDate, date: yesterday } })
    expect(resolve({ now: `${yesterday}T20:55:00Z`, today: yesterday, schedules, preferences: { manualEnabled: false } }))
      .toMatchObject({ kind: 'day', start: { scheduleDate: targetDate, date: yesterday }, end: { scheduleDate: targetDate } })
  })

  it('не переносит расписание в новый часовой пояс и проверяет дату источника', () => {
    const tokyoSchedule = day('2026-03-11', '05:00', '18:00', 'Asia/Tokyo')
    expect(buildFastingScheduleEvents([tokyoSchedule], 'America/Los_Angeles')).toEqual({ fajr: [], maghrib: [] })
    expect(resolve({ now: '2026-03-11T04:30:00Z', today: '2026-03-11', schedules: [tokyoSchedule], timeZone: 'America/Los_Angeles' })).toBeNull()
  })

  it('строит расчётные времена и сохраняет локальные даты на переходе DST', () => {
    const location = { latitude: 40.7128, longitude: -74.006 }
    const schedules = ['2026-03-08', '2026-03-09'].map(date => calculatePrayerSchedule(location, date, 'America/New_York'))
    const events = buildFastingScheduleEvents(schedules, 'America/New_York')
    expect(events.fajr).toHaveLength(2)
    expect(events.maghrib).toHaveLength(2)
    expect(events.fajr.every(event => event.provenance === 'calculated' && event.timeZone === 'America/New_York')).toBe(true)
    expect(events.fajr.map(event => event.date)).toEqual(['2026-03-08', '2026-03-09'])
  })

  it('не переносит автоматический пост на утро Ид после последнего ифтара', () => {
    const eidDate = civilDateFromCalendar({ year: 1448, month: 10, day: 1 }, 'hijri')
    const lastFastDate = addDays(eidDate, -1)
    const schedules = [day(addDays(lastFastDate, -1)), day(lastFastDate), day(eidDate), day(addDays(eidDate, 1))]
    const afterLastIftar = new Date(`${lastFastDate}T16:00:00Z`)
    expect(resolve({ now: afterLastIftar.toISOString(), today: lastFastDate, schedules, preferences: { manualEnabled: false } })).toBeNull()
    expect(resolve({ now: afterLastIftar.toISOString(), today: lastFastDate, schedules, preferences: { manualEnabled: true } }))
      .toMatchObject({ kind: 'night', end: { scheduleDate: eidDate } })
  })

  it('считает прогресс поста от 0 до 100 процентов и ограничивает его границами', () => {
    const today = day('2026-03-10')
    const timeline = resolve({ now: '2026-03-10T04:30:00Z', today: today.date, schedules: [today] })
    if (!timeline) throw new Error('Не найден интервал поста')
    const resolvedTimeline = timeline
    const middle = (resolvedTimeline.start.instant + resolvedTimeline.end.instant) / 2
    expect(fastingProgress(resolvedTimeline, resolvedTimeline.start.instant)).toBe(0)
    expect(fastingProgress(resolvedTimeline, middle)).toBe(0.5)
    expect(fastingProgress(resolvedTimeline, resolvedTimeline.end.instant)).toBe(1)
    expect(fastingProgress(resolvedTimeline, resolvedTimeline.start.instant - 1)).toBe(0)
    expect(fastingProgress(resolvedTimeline, resolvedTimeline.end.instant + 1)).toBe(1)
  })

  it('скрывает карточку на исторической дате, при неподдерживаемом календаре и вне текущей даты зоны', () => {
    const today = day('2026-03-10')
    const events = buildFastingScheduleEvents([today], 'Europe/Moscow')
    const base = { now: new Date('2026-03-10T10:00:00Z'), today: today.date, selectedDate: today.date,
      timeZone: 'Europe/Moscow', correction: 0 as const, hijriSupported: true, preferences: { manualEnabled: true }, events }
    expect(resolveFastingTimeline({ ...base, selectedDate: '2026-03-09' })).toBeNull()
    expect(resolveFastingTimeline({ ...base, hijriSupported: false, preferences: { manualEnabled: false } })).toBeNull()
    expect(resolveFastingTimeline({ ...base, hijriSupported: false })).toMatchObject({ kind: 'day' })
    expect(resolveFastingTimeline({ ...base, today: '2026-03-09' })).toBeNull()
  })
})


it('keeps a verified current-day fasting interval when tomorrow is outside official coverage', () => {
  const today = '2026-12-31'
  const events = buildFastingScheduleEvents([day(today, '05:00')], 'Europe/Moscow')
  const input = { today, selectedDate: today, timeZone: 'Europe/Moscow', correction: 0 as const,
    hijriSupported: false, preferences: { manualEnabled: true }, events,
    officialHorizon: { previous: true, next: false } }
  expect(resolveFastingTimeline({ ...input, now: new Date('2026-12-31T08:00:00+03:00') })).toMatchObject({ kind: 'day' })
  expect(resolveFastingTimeline({ ...input, now: new Date('2026-12-31T15:00:00+03:00') }))
    .toMatchObject({ kind: 'day', start: { scheduleDate: today }, end: { scheduleDate: today } })
  expect(resolveFastingTimeline({ ...input, now: new Date('2026-12-31T20:00:00+03:00') })).toBeNull()
})

it('preserves fasting events from the first covered schedule row with a previous-day event date', () => {
  const today = '2025-12-31'
  const coveredScheduleDate = '2026-01-01'
  const row = day(coveredScheduleDate, '23:54', '23:58')
  const events = buildFastingScheduleEvents([row], 'Europe/Moscow')
  const fajr = events.fajr[0]
  expect(fajr).toMatchObject({ scheduleDate: coveredScheduleDate, date: today, dayOffset: -1 })
  const timeline = resolveFastingTimeline({ now: new Date('2025-12-31T20:55:00Z'), today,
    selectedDate: today, timeZone: 'Europe/Moscow', correction: 0, hijriSupported: false,
    preferences: { manualEnabled: true }, events, officialHorizon: { previous: false, next: true } })
  expect(timeline).toMatchObject({ kind: 'day', start: { scheduleDate: coveredScheduleDate, date: today } })
})
