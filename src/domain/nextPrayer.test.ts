import { describe, expect, it } from 'vitest'

import type { PrayerDay } from './types'
import { findCurrentPrayer, findNextPrayer } from './nextPrayer'
import { calculatePrayerSchedule } from './prayerCalculation'
import { DUM_RT_TIME_ZONE } from './locationTime'

const today: PrayerDay = {
  locationId: 'kazan',
  date: '2026-09-01',
  fajrStart: '02:21',
  fajrJamaat: '03:17',
  sunrise: '04:48',
  zenith: '11:44',
  dhuhr: '12:00',
  asr: '16:24',
  maghrib: '18:39',
  isha: '20:33',
}

const tomorrow: PrayerDay = {
  ...today,
  date: '2026-09-02',
  fajrJamaat: '03:19',
}

describe('findNextPrayer', () => {
  it('явно использует московскую таймзону для официальных событий ДУМ РТ', () => {
    expect(DUM_RT_TIME_ZONE).toBe('Europe/Moscow')

    const current = findCurrentPrayer(
      new Date('2026-09-01T15:38:59.500Z'),
      today,
    )
    const next = findNextPrayer(
      new Date('2026-09-01T15:38:59.500Z'),
      today,
      tomorrow,
    )

    expect(current).toMatchObject({ key: 'asr', date: '2026-09-01', time: '16:24' })
    expect(next).toMatchObject({
      key: 'maghrib',
      date: '2026-09-01',
      time: '18:39',
      remainingSeconds: 1,
    })
  })

  it('считает до ближайшего события, включая восход и зенит', () => {
    const next = findNextPrayer(
      new Date('2026-09-01T01:00:00.000Z'),
      today,
      tomorrow,
    )

    expect(next).toMatchObject({
      key: 'sunrise',
      time: '04:48',
    })
    expect(next?.remainingSeconds).toBe(2_880)
  })

  it('после иша переходит к завершению сухура следующего дня', () => {
    const next = findNextPrayer(
      new Date('2026-09-01T18:00:00.000Z'),
      today,
      tomorrow,
    )

    expect(next).toMatchObject({
      key: 'fajrStart',
      date: '2026-09-02',
      time: '02:21',
    })
  })

  it('выбирает джамаат по стабильному ключу', () => {
    const next = findNextPrayer(
      new Date('2026-09-01T00:00:00.000Z'),
      today,
    )

    expect(next?.key).toBe('fajrJamaat')
  })

  it('возвращает null, когда следующего дня в официальных данных ещё нет', () => {
    expect(
      findNextPrayer(new Date('2026-09-01T18:00:00.000Z'), today),
    ).toBeNull()
  })

  it('в рассчитанном режиме использует Фаджр, а не время джамаата', () => {
    const schedule = calculatePrayerSchedule(
      { latitude: 55.7558, longitude: 37.6173 },
      '2026-09-01',
      'Europe/Moscow',
    )
    const next = findNextPrayer(
      new Date(schedule.entries.fajr.instant - 1_000),
      schedule,
    )

    expect(next).toMatchObject({
      key: 'fajr',
      time: schedule.entries.fajr.time,
      remainingSeconds: 1,
    })
  })

  it('в рассчитанном режиме учитывает восход и зенит', () => {
    const schedule = calculatePrayerSchedule(
      { latitude: 55.7558, longitude: 37.6173 },
      '2026-09-01',
      'Europe/Moscow',
    )
    const next = findNextPrayer(
      new Date(schedule.entries.sunrise.instant - 1_000),
      schedule,
    )

    expect(next).toMatchObject({
      key: 'sunrise',
      remainingSeconds: 1,
    })
  })

  it('в момент наступления намаза переключает таймер на следующий', () => {
    const next = findNextPrayer(
      new Date('2026-09-01T13:24:00.000Z'),
      today,
      tomorrow,
    )

    expect(next).toMatchObject({ key: 'maghrib', time: '18:39' })
  })
})

describe('findCurrentPrayer', () => {
  it('возвращает последнее уже наступившее событие, включая восход', () => {
    const current = findCurrentPrayer(
      new Date('2026-09-01T08:30:00.000Z'),
      today,
    )

    expect(current).toMatchObject({ key: 'sunrise', time: '04:48' })
  })

  it('после зенита считает текущим зенит до наступления зухра', () => {
    const current = findCurrentPrayer(
      new Date('2026-09-01T08:50:00.000Z'),
      today,
    )

    expect(current).toMatchObject({ key: 'zenith', time: '11:44' })
  })

  it('в момент наступления намаза сразу считает его текущим', () => {
    const current = findCurrentPrayer(
      new Date('2026-09-01T13:24:00.000Z'),
      today,
    )

    expect(current).toMatchObject({ key: 'asr', time: '16:24' })
  })

  it('до первого события использует последнее событие предыдущего дня', () => {
    const current = findCurrentPrayer(
      new Date('2026-08-31T22:00:00.000Z'),
      today,
      { ...today, date: '2026-08-31' },
    )

    expect(current).toMatchObject({ key: 'isha', date: '2026-08-31', time: '20:33' })
  })
})

describe('регрессии порядка полей', () => {
  it('на реальной строке Апастово выбирает Зухр 12:00 перед зенитом 12:01', () => {
    const day: PrayerDay = { ...today, locationId: 'apastovo', date: '2026-02-07', fajrStart: '05:21', fajrJamaat: '05:56', sunrise: '07:27', zenith: '12:01', dhuhr: '12:00', asr: '14:43', maghrib: '16:35', isha: '18:19' }
    expect(findNextPrayer(new Date('2026-02-07T11:59:59+03:00'), day)?.key).toBe('dhuhr')
    expect(findCurrentPrayer(new Date('2026-02-07T12:01:00+03:00'), day)?.key).toBe('zenith')
  })
})
