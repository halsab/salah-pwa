import { required } from '../test/required'
import { describe, expect, it } from 'vitest'

import { parseDumRtCsv } from '../data/parseDumRtCsv'
import { calculatePrayerSchedule } from './prayerCalculation'
import { buildScheduleEvents, selectEventPair } from './scheduleEvents'

function official(csv: string) {
  return required(parseDumRtCsv(csv, 'kazan')[0])
}
const disputed = official('05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00')
const apastovo = official('07.02.2026;05:21;05:56;07:27;12:01;12:00;14:43;16:35;18:19')

describe('хронология расписания', () => {
  it('сохраняет поздний сухур без выдуманной даты и исключает только неопределённую отметку', () => {
    const events = buildScheduleEvents(disputed)
    expect(events.find(({ key }) => key === 'suhurEnd')).toMatchObject({
      kind: 'marker', time: '23:54', scheduleDate: '2026-05-05',
      timeZone: 'Europe/Moscow', status: 'ambiguous-date',
      instant: null, date: null, dayOffset: null,
    })
    expect(selectEventPair(new Date('2026-05-05T09:30:00+03:00'), events).next?.key).toBe('zenith')
    expect(disputed.suhurEnd).toBe('23:54')
  })

  it('сравнивает абсолютные моменты при любой перестановке событий и при Зухре раньше зенита', () => {
    const events = buildScheduleEvents(apastovo)
    for (let index = 0; index < events.length; index += 1) {
      const reordered = [...events.slice(index), ...events.slice(0, index)].reverse()
      expect(selectEventPair(new Date('2026-02-07T11:59:59+03:00'), reordered).next?.key).toBe('dhuhr')
      const atDhuhr = selectEventPair(new Date('2026-02-07T12:00:00+03:00'), reordered)
      expect(atDhuhr.current?.key).toBe('dhuhr')
      expect(atDhuhr.next?.key).toBe('zenith')
      expect(selectEventPair(new Date('2026-02-07T12:01:00+03:00'), reordered).current?.key).toBe('zenith')
    }
  })

  it('при совпадении выбирает намаз перед дополнительной отметкой с обеих сторон границы', () => {
    const events = buildScheduleEvents({ ...apastovo, zenith: '12:00' })
    for (const ordered of [events, [...events].reverse()]) {
      expect(selectEventPair(new Date('2026-02-07T11:59:59+03:00'), ordered).next?.key).toBe('dhuhr')
      expect(selectEventPair(new Date('2026-02-07T12:00:00+03:00'), ordered).current?.key).toBe('dhuhr')
    }
  })

  it('разделяет джамаат, начало Фаджра и дополнительные отметки', () => {
    const events = buildScheduleEvents(apastovo)
    expect(events.find(({ key }) => key === 'fajrJamaat')?.kind).toBe('jamaat')
    expect(events.find(({ key }) => key === 'dhuhr')?.kind).toBe('prayer')
    expect(events.filter(({ kind }) => kind === 'marker').map(({ key }) => key).sort()).toEqual(['suhurEnd', 'sunrise', 'zenith'])
    const calculated = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2026-09-01', 'Europe/Moscow')
    expect(buildScheduleEvents(calculated).find(({ key }) => key === 'fajr')?.kind).toBe('prayer')
  })

  it('сохраняет рассчитанный instant и его календарный offset через конец года', () => {
    const schedule = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2026-12-31', 'Europe/Moscow')
    const instant = Date.parse('2027-01-01T00:10:00+03:00')
    schedule.entries.isha = { time: '00:10', instant, estimated: false }
    expect(buildScheduleEvents(schedule).find(({ key }) => key === 'isha')).toMatchObject({
      status: 'resolved', instant, date: '2027-01-01', scheduleDate: '2026-12-31', dayOffset: 1, time: '00:10',
    })
  })

  it('выбирает события соседних дат по моменту, включая прежний Иша и будущий Фаджр до полуночи', () => {
    const before = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2026-12-31', 'Europe/Moscow')
    const after = calculatePrayerSchedule({ latitude: 55.75, longitude: 37.62 }, '2027-01-01', 'Europe/Moscow')
    before.entries.isha = { time: '00:10', instant: Date.parse('2027-01-01T00:10:00+03:00'), estimated: false }
    after.entries.fajr = { time: '23:55', instant: Date.parse('2026-12-31T23:55:00+03:00'), estimated: false }
    const events = [after, before].flatMap(buildScheduleEvents)
    const midnight = selectEventPair(new Date('2027-01-01T00:00:00+03:00'), events)
    expect(midnight.current).toMatchObject({ key: 'fajr', date: '2026-12-31', dayOffset: -1 })
    expect(midnight.next).toMatchObject({ key: 'isha', date: '2027-01-01', dayOffset: 1 })
    const exact = selectEventPair(new Date('2027-01-01T00:10:00+03:00'), events)
    expect(exact.current?.key).toBe('isha')
    expect(exact.next?.key).toBe('sunrise')
  })

  it('без соседнего дня возвращает null, а не придумывает событие', () => {
    const events = buildScheduleEvents(apastovo)
    expect(selectEventPair(new Date('2026-02-07T00:00:00+03:00'), events).current).toBeNull()
    expect(selectEventPair(new Date('2026-02-07T23:59:59+03:00'), events).next).toBeNull()
    expect(selectEventPair(new Date(), [])).toEqual({ next: null, current: null })
  })
})
