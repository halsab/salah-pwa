import { describe, expect, it } from 'vitest'

import type { PrayerDay } from './types'
import { findCurrentPrayer, findNextPrayer, formatRemainingTime } from './nextPrayer'
import { calculatePrayerSchedule } from './prayerCalculation'

const today: PrayerDay = {
  locationId: 'kazan',
  date: '2026-09-01',
  suhurEnd: '02:21',
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
  it('считает только пять намазов, не включая сухур, восход и зенит', () => {
    const next = findNextPrayer(
      new Date('2026-09-01T10:00:00.000Z'),
      today,
      tomorrow,
    )

    expect(next).toMatchObject({ key: 'asr', label: 'Аср', time: '16:24' })
    expect(next?.remainingSeconds).toBe(12_240)
  })

  it('после иша переходит к утреннему намазу следующего дня', () => {
    const next = findNextPrayer(
      new Date('2026-09-01T18:00:00.000Z'),
      today,
      tomorrow,
    )

    expect(next).toMatchObject({
      key: 'fajrJamaat',
      label: 'Утренний намаз',
      date: '2026-09-02',
      time: '03:19',
    })
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
    )
    const next = findNextPrayer(
      new Date(schedule.entries.fajr.instant - 1_000),
      schedule,
    )

    expect(next).toMatchObject({
      key: 'fajr',
      label: 'Фаджр',
      time: schedule.entries.fajr.time,
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
  it('возвращает последний уже наступивший намаз, а не следующий', () => {
    const current = findCurrentPrayer(
      new Date('2026-09-01T10:00:00.000Z'),
      today,
    )

    expect(current).toMatchObject({ key: 'dhuhr', label: 'Зухр', time: '12:00' })
  })

  it('в момент наступления намаза сразу считает его текущим', () => {
    const current = findCurrentPrayer(
      new Date('2026-09-01T13:24:00.000Z'),
      today,
    )

    expect(current).toMatchObject({ key: 'asr', time: '16:24' })
  })

  it('до первого намаза использует последний намаз предыдущего дня', () => {
    const current = findCurrentPrayer(
      new Date('2026-09-01T00:00:00.000Z'),
      today,
      { ...today, date: '2026-08-31' },
    )

    expect(current).toMatchObject({ key: 'isha', date: '2026-08-31', time: '20:33' })
  })
})

describe('formatRemainingTime', () => {
  it('форматирует часы, минуты и секунды без скачков ширины', () => {
    expect(formatRemainingTime(12_240)).toBe('03:24:00')
    expect(formatRemainingTime(5)).toBe('00:00:05')
  })
})
