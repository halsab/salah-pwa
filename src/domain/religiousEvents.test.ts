import { describe, expect, it } from 'vitest'

import { parseDumRtCsv } from '../data/parseDumRtCsv'
import { required } from '../test/required'
import { addDays } from './date'
import { calculatePrayerSchedule } from './prayerCalculation'
import {
  RELIGIOUS_EVENT_IDS,
  RELIGIOUS_EVENTS,
  isReligiousEventId,
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
  it('фиксирует стабильные id, titles, kinds и локальный contentId', () => {
    expect(RELIGIOUS_EVENT_IDS).toEqual([
      'hijri-new-year', 'ashura', 'mawlid', 'raghaib', 'isra-miraj', 'baraat',
      'ramadan', 'eid-al-fitr', 'dhul-hijjah-first-ten', 'arafa', 'eid-al-adha', 'tashriq',
    ])
    expect(RELIGIOUS_EVENTS.map(({ id, title, kind, contentId }) => ({ id, title, kind, contentId }))).toEqual([
      { id: 'hijri-new-year', title: 'Новый год по хиджре', kind: 'day', contentId: 'hijri-new-year' },
      { id: 'ashura', title: 'День Ашура', kind: 'day', contentId: 'ashura' },
      { id: 'mawlid', title: 'Мавлид ан-Наби ﷺ', kind: 'day', contentId: 'mawlid' },
      { id: 'raghaib', title: 'Ночь Рагаиб', kind: 'night', contentId: 'raghaib' },
      { id: 'isra-miraj', title: 'Исра и Ми‘радж', kind: 'night', contentId: 'isra-miraj' },
      { id: 'baraat', title: 'Ночь Бараат', kind: 'night', contentId: 'baraat' },
      { id: 'ramadan', title: 'Рамадан', kind: 'period', contentId: 'ramadan' },
      { id: 'eid-al-fitr', title: 'Ураза-байрам', kind: 'day', contentId: 'eid-al-fitr' },
      { id: 'dhul-hijjah-first-ten', title: 'Первые 10 дней Зуль-хиджи', kind: 'period', contentId: 'dhul-hijjah-first-ten' },
      { id: 'arafa', title: 'День Арафа', kind: 'day', contentId: 'arafa' },
      { id: 'eid-al-adha', title: 'Курбан-байрам', kind: 'day', contentId: 'eid-al-adha' },
      { id: 'tashriq', title: 'Дни ташрика', kind: 'period', contentId: 'tashriq' },
    ])
    expect(isReligiousEventId('arafa')).toBe(true)
    expect(isReligiousEventId('laylat-al-qadr')).toBe(false)
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
    expect(resolve(date)).toMatchObject({ eventId, secondaryText: null })
  })

  it('применяет correction -1/0/+1 к дате события', () => {
    expect(resolve('2026-06-15', { correction: 1 })?.eventId).toBe('hijri-new-year')
    expect(resolve('2026-06-16', { correction: 0 })?.eventId).toBe('hijri-new-year')
    expect(resolve('2026-06-17', { correction: -1 })?.eventId).toBe('hijri-new-year')
  })

  it('удерживает Рамадан до фактического конца месяца и показывает приближение Ураза-байрама', () => {
    expect(resolve('2026-03-16')).toMatchObject({ eventId: 'ramadan', secondaryText: null })
    expect(resolve('2026-03-17')).toMatchObject({ eventId: 'ramadan', secondaryText: 'Ураза-байрам через 3 дня' })
    expect(resolve('2026-03-18')).toMatchObject({ eventId: 'ramadan', secondaryText: 'Ураза-байрам через 2 дня' })
    expect(resolve('2026-03-19')).toMatchObject({ eventId: 'ramadan', secondaryText: 'Ураза-байрам завтра' })
    expect(resolve('2026-03-20')).toMatchObject({ eventId: 'eid-al-fitr', secondaryText: null })
  })

  it('сохраняет period, а concrete day заменяет его только в день события', () => {
    expect(resolve('2026-05-23')).toMatchObject({ eventId: 'dhul-hijjah-first-ten', secondaryText: 'День Арафа через 3 дня' })
    expect(resolve('2026-05-25')).toMatchObject({ eventId: 'dhul-hijjah-first-ten', secondaryText: 'День Арафа завтра' })
    expect(resolve('2026-05-26')).toMatchObject({ eventId: 'arafa', secondaryText: null })
    expect(resolve('2026-05-27')).toMatchObject({ eventId: 'eid-al-adha', secondaryText: null })
    expect(resolve('2026-05-28')).toMatchObject({ eventId: 'tashriq', secondaryText: null })
  })

  it('показывает ближайшее событие только в пределах трёх civil days', () => {
    expect(resolve('2026-06-12')).toBeNull()
    expect(resolve('2026-06-13')).toMatchObject({ eventId: 'hijri-new-year', secondaryText: 'через 3 дня' })
    expect(resolve('2026-06-14')).toMatchObject({ eventId: 'hijri-new-year', secondaryText: 'через 2 дня' })
    expect(resolve('2026-06-15')).toMatchObject({ eventId: 'hijri-new-year', secondaryText: 'завтра' })
  })

  it('вычисляет Рагаиб как ночь перед первой пятницей Раджаба', () => {
    expect(resolve('2025-12-25', { schedules: nightSchedules('2025-12-25') })).toMatchObject({ eventId: 'raghaib', secondaryText: null })
    expect(resolve('2025-12-22', { schedules: nightSchedules('2025-12-25') })).toMatchObject({ eventId: 'raghaib', secondaryText: 'через 3 дня' })
  })

  it.each([
    ['2026-01-15', 'isra-miraj'],
    ['2026-02-02', 'baraat'],
  ])('разрешает fixed night anchor %s как %s', (anchor, eventId) => {
    expect(resolve(anchor, { schedules: nightSchedules(anchor) })).toMatchObject({ eventId, secondaryText: null })
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
