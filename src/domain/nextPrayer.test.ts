import { describe, expect, it } from 'vitest'

import type { PrayerDay } from './types'
import { findNextPrayer, formatRemainingTime } from './nextPrayer'
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
})

describe('formatRemainingTime', () => {
  it('форматирует часы, минуты и секунды без скачков ширины', () => {
    expect(formatRemainingTime(12_240)).toBe('03:24:00')
    expect(formatRemainingTime(5)).toBe('00:00:05')
  })
})
