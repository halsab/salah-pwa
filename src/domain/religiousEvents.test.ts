import { describe, expect, it } from 'vitest'

import { parseDumRtCsv } from '../data/parseDumRtCsv'
import { required } from '../test/required'
import { addDays } from './date'
import { calculatePrayerSchedule } from './prayerCalculation'
import {
  RELIGIOUS_EVENT_IDS,
  RELIGIOUS_EVENTS,
  isReligiousEventId,
  listReligiousEventOccurrences,
  resolveReligiousBanner,
} from './religiousEvents'
import type { PrayerSchedule } from './scheduleEvents'

function official(date: string, fajrStart = '05:00', maghrib = '18:00') {
  const [year, month, day] = date.split('-')
  return required(parseDumRtCsv(`${day}.${month}.${year};${fajrStart};05:30;07:00;11:45;12:00;16:00;${maghrib};20:00`, 'kazan')[0])
}

function nightSchedules(anchor: string, fajrStart = '05:00'): PrayerSchedule[] {
  return [official(anchor), official(addDays(anchor, 1), fajrStart)]
}

function resolve(date: string, options: Partial<Parameters<typeof resolveReligiousBanner>[0]> = {}) {
  return resolveReligiousBanner({
    now: new Date(`${date}T12:00:00+03:00`),
    today: date,
    selectedDate: date,
    correction: 0,
    hijriSupported: true,
    scheduleReady: true,
    schedules: [],
    ...options,
  })
}

describe('реестр религиозных событий', () => {
  it('фиксирует стабильные id, kinds и локальный contentId без display-текста', () => {
    expect(RELIGIOUS_EVENT_IDS).toEqual([
      'hijri-new-year', 'ashura', 'mawlid', 'raghaib', 'isra-miraj', 'baraat',
      'ramadan', 'eid-al-fitr', 'dhul-hijjah-first-ten', 'arafa', 'eid-al-adha', 'tashriq',
    ])
    expect(RELIGIOUS_EVENTS.map(({ id, kind, contentId }) => ({ id, kind, contentId }))).toEqual([
      { id: 'hijri-new-year', kind: 'day', contentId: 'hijri-new-year' },
      { id: 'ashura', kind: 'day', contentId: 'ashura' },
      { id: 'mawlid', kind: 'day', contentId: 'mawlid' },
      { id: 'raghaib', kind: 'night', contentId: 'raghaib' },
      { id: 'isra-miraj', kind: 'night', contentId: 'isra-miraj' },
      { id: 'baraat', kind: 'night', contentId: 'baraat' },
      { id: 'ramadan', kind: 'period', contentId: 'ramadan' },
      { id: 'eid-al-fitr', kind: 'day', contentId: 'eid-al-fitr' },
      { id: 'dhul-hijjah-first-ten', kind: 'period', contentId: 'dhul-hijjah-first-ten' },
      { id: 'arafa', kind: 'day', contentId: 'arafa' },
      { id: 'eid-al-adha', kind: 'day', contentId: 'eid-al-adha' },
      { id: 'tashriq', kind: 'period', contentId: 'tashriq' },
    ])
    expect(RELIGIOUS_EVENTS.every(event => !('title' in event) && !('listTitle' in event))).toBe(true)
    expect(isReligiousEventId('arafa')).toBe(true)
    expect(isReligiousEventId('laylat-al-qadr')).toBe(false)
  })

  it('скрывает в списке только дни ташрика', () => {
    expect(RELIGIOUS_EVENTS.find(event => event.id === 'tashriq')).toMatchObject({ showInEventsList: false })
  })
})

describe('listReligiousEventOccurrences', () => {
  const list = (fromDate: string, toDateExclusive: string, correction: -1 | 0 | 1 = 0) => listReligiousEventOccurrences({
    fromDate,
    toDateExclusive,
    correction,
    hijriSupported: true,
  })

  it('перечисляет reference dates, начала периодов и target dates ночей', () => {
    const occurrences = list('2025-12-25', '2026-06-17')
    expect(occurrences.map(({ eventId, civilDate }) => ({ eventId, civilDate }))).toEqual([
      { eventId: 'raghaib', civilDate: '2025-12-26' },
      { eventId: 'isra-miraj', civilDate: '2026-01-16' },
      { eventId: 'baraat', civilDate: '2026-02-03' },
      { eventId: 'ramadan', civilDate: '2026-02-18' },
      { eventId: 'eid-al-fitr', civilDate: '2026-03-20' },
      { eventId: 'dhul-hijjah-first-ten', civilDate: '2026-05-18' },
      { eventId: 'arafa', civilDate: '2026-05-26' },
      { eventId: 'eid-al-adha', civilDate: '2026-05-27' },
      { eventId: 'hijri-new-year', civilDate: '2026-06-16' },
    ])
    expect(occurrences.find(event => event.eventId === 'baraat')?.hijriDate).toEqual({ year: 1447, month: 8, day: 15 })
    expect(occurrences.some(event => event.eventId === 'tashriq')).toBe(false)
  })

  it('добавляет period только в первый день и не подхватывает уже начавшийся период', () => {
    expect(list('2026-02-18', '2026-03-01').filter(event => event.eventId === 'ramadan')).toHaveLength(1)
    expect(list('2026-02-19', '2026-03-01').some(event => event.eventId === 'ramadan')).toBe(false)
    expect(list('2026-05-18', '2026-05-28').filter(event => event.eventId === 'dhul-hijjah-first-ten')).toHaveLength(1)
  })

  it('применяет correction и соблюдает inclusive/exclusive границы', () => {
    expect(list('2026-06-15', '2026-06-16', 1).map(event => event.eventId)).toEqual(['hijri-new-year'])
    expect(list('2026-06-16', '2026-06-17', 0).map(event => event.eventId)).toEqual(['hijri-new-year'])
    expect(list('2026-06-17', '2026-06-18', -1).map(event => event.eventId)).toEqual(['hijri-new-year'])
    expect(list('2026-06-15', '2026-06-16', 0)).toEqual([])
    expect(list('2026-06-15', '2026-06-16', -1)).toEqual([])
  })

  it('сохраняет обе annual occurrences в длинном Gregorian окне и сортирует результат', () => {
    const occurrences = list('2025-12-26', '2026-12-27')
    expect(occurrences.filter(event => event.eventId === 'raghaib').map(event => event.civilDate)).toEqual(['2025-12-26', '2026-12-11'])
    expect(occurrences).toEqual([...occurrences].sort((left, right) => left.civilDate.localeCompare(right.civilDate) || left.eventId.localeCompare(right.eventId)))
  })

  it('возвращает пустой список без Umm al-Qura', () => {
    expect(listReligiousEventOccurrences({
      fromDate: '2026-01-01',
      toDateExclusive: '2027-01-01',
      correction: 0,
      hijriSupported: false,
    })).toEqual([])
  })
})

describe('resolveReligiousBanner', () => {
  it.each([
    ['2026-06-16', 'hijri-new-year'],
    ['2026-06-25', 'ashura'],
    ['2026-08-25', 'mawlid'],
    ['2026-02-18', 'ramadan'],
    ['2026-03-20', 'eid-al-fitr'],
    ['2026-05-18', 'dhul-hijjah-first-ten'],
    ['2026-05-26', 'arafa'],
    ['2026-05-27', 'eid-al-adha'],
    ['2026-05-28', 'tashriq'],
    ['2026-05-30', 'tashriq'],
  ])('разрешает reference date %s как %s', (date, eventId) => {
    expect(resolve(date)).toMatchObject({ eventId, secondary: null })
  })

  it('применяет correction -1/0/+1 к дате события', () => {
    expect(resolve('2026-06-15', { correction: 1 })?.eventId).toBe('hijri-new-year')
    expect(resolve('2026-06-16', { correction: 0 })?.eventId).toBe('hijri-new-year')
    expect(resolve('2026-06-17', { correction: -1 })?.eventId).toBe('hijri-new-year')
  })

  it('удерживает Рамадан до фактического конца месяца и показывает приближение Ураза-байрама', () => {
    expect(resolve('2026-03-16')).toMatchObject({ eventId: 'ramadan', secondary: null })
    expect(resolve('2026-03-17')).toMatchObject({ eventId: 'ramadan', secondary: { type: 'event-days', eventId: 'eid-al-fitr', count: 3 } })
    expect(resolve('2026-03-18')).toMatchObject({ eventId: 'ramadan', secondary: { type: 'event-days', eventId: 'eid-al-fitr', count: 2 } })
    expect(resolve('2026-03-19')).toMatchObject({ eventId: 'ramadan', secondary: { type: 'event-days', eventId: 'eid-al-fitr', count: 1 } })
    expect(resolve('2026-03-20')).toMatchObject({ eventId: 'eid-al-fitr', secondary: null })
  })

  it('сохраняет period, а concrete day заменяет его только в день события', () => {
    expect(resolve('2026-05-23')).toMatchObject({ eventId: 'dhul-hijjah-first-ten', secondary: { type: 'event-days', eventId: 'arafa', count: 3 } })
    expect(resolve('2026-05-25')).toMatchObject({ eventId: 'dhul-hijjah-first-ten', secondary: { type: 'event-days', eventId: 'arafa', count: 1 } })
    expect(resolve('2026-05-26')).toMatchObject({ eventId: 'arafa', secondary: null })
    expect(resolve('2026-05-27')).toMatchObject({ eventId: 'eid-al-adha', secondary: null })
    expect(resolve('2026-05-28')).toMatchObject({ eventId: 'tashriq', secondary: null })
  })

  it('показывает ближайшее событие только в пределах трёх civil days', () => {
    expect(resolve('2026-06-12')).toBeNull()
    expect(resolve('2026-06-13')).toMatchObject({ eventId: 'hijri-new-year', secondary: { type: 'days', count: 3 } })
    expect(resolve('2026-06-14')).toMatchObject({ eventId: 'hijri-new-year', secondary: { type: 'days', count: 2 } })
    expect(resolve('2026-06-15')).toMatchObject({ eventId: 'hijri-new-year', secondary: { type: 'days', count: 1 } })
  })

  it('вычисляет Рагаиб как ночь перед первой пятницей Раджаба', () => {
    expect(resolve('2025-12-25', { schedules: nightSchedules('2025-12-25') })).toMatchObject({ eventId: 'raghaib', secondary: null })
    expect(resolve('2025-12-22', { schedules: nightSchedules('2025-12-25') })).toMatchObject({ eventId: 'raghaib', secondary: { type: 'days', count: 3 } })
  })

  it.each([
    ['2026-01-15', 'isra-miraj'],
    ['2026-02-02', 'baraat'],
  ])('разрешает fixed night anchor %s как %s', (anchor, eventId) => {
    expect(resolve(anchor, { schedules: nightSchedules(anchor) })).toMatchObject({ eventId, secondary: null })
  })

  it('держит ночь от anchor day до точного Фаджра и использует official fajrStart', () => {
    const schedules = nightSchedules('2026-01-15')
    expect(resolve('2026-01-15', { now: new Date('2026-01-15T17:00:00+03:00'), schedules })?.eventId).toBe('isra-miraj')
    expect(resolve('2026-01-15', { now: new Date('2026-01-15T19:00:00+03:00'), schedules })?.eventId).toBe('isra-miraj')
    expect(resolve('2026-01-16', { now: new Date('2026-01-16T01:00:00+03:00'), schedules })?.eventId).toBe('isra-miraj')
    expect(resolve('2026-01-16', { now: new Date('2026-01-16T05:00:00+03:00'), schedules })).toBeNull()
    expect(resolve('2026-01-16', { now: new Date('2026-01-16T05:01:00+03:00'), schedules })).toBeNull()
  })

  it('принимает поздний official fajrStart на anchor evening', () => {
    const schedules = nightSchedules('2026-01-15', '23:54')
    expect(resolve('2026-01-15', { now: new Date('2026-01-15T23:53:00+03:00'), schedules })?.eventId).toBe('isra-miraj')
    expect(resolve('2026-01-15', { now: new Date('2026-01-15T23:54:00+03:00'), schedules })).toBeNull()
  })

  it('использует calculated fajr и реальные instants', () => {
    const anchor = calculatePrayerSchedule({ latitude: 55.79, longitude: 49.11 }, '2026-01-15', 'Europe/Moscow')
    const target = calculatePrayerSchedule({ latitude: 55.79, longitude: 49.11 }, '2026-01-16', 'Europe/Moscow')
    const schedules = [anchor, target]
    expect(resolve('2026-01-15', { now: new Date(anchor.entries.maghrib.instant - 60_000), schedules })?.eventId).toBe('isra-miraj')
    expect(resolve('2026-01-16', { now: new Date(target.entries.fajr.instant), schedules })).toBeNull()
  })

  it('скрывает night при отсутствующей или неверной границе', () => {
    expect(resolve('2026-01-15')).toBeNull()
    const schedules = nightSchedules('2026-01-15')
    schedules[1] = official('2026-01-16', '17:00')
    expect(resolve('2026-01-15', { schedules })).toBeNull()
  })

  it('скрывается вне today, без Umm al-Qura и без ready schedule', () => {
    expect(resolve('2026-06-16', { selectedDate: '2026-06-15' })).toBeNull()
    expect(resolve('2026-06-16', { hijriSupported: false })).toBeNull()
    expect(resolve('2026-06-16', { scheduleReady: false })).toBeNull()
  })
})
