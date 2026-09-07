import { required } from '../../test/required'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { addDays } from '../../domain/date'
import { zonedDateTimeToInstant } from '../../domain/locationTime'
import { buildScheduleEvents, selectEventPair } from '../../domain/scheduleEvents'
import * as calculation from '../../domain/prayerCalculation'
import type { PrayerDay } from '../../domain/types'
import type { DatasetMeta } from '../../storage/database'
import { usePrayerSchedules } from './usePrayerSchedules'

type Options = Parameters<typeof usePrayerSchedules>[0]
const meta: DatasetMeta = {
  schemaVersion: 2,
  identity: { version: 'v1', sha256: 'hash1', url: 'prayer-times-current.json' },
  source: { name: 'ДУМ РТ', url: 'https://dumrt.ru/ru/help-info/prayertime/', updatedAt: '2026-01-01', years: [2026] },
  locations: ['A', 'B', 'C'].map((id, index) => ({ id, name: id, latitude: 55 + index, longitude: 49 + index })),
}
function day(locationId: string, date: string): PrayerDay {
  return { locationId, date, suhurEnd: '02:00', fajrJamaat: '03:00', sunrise: '04:30', zenith: '11:45', dhuhr: '12:00', asr: '16:00', maghrib: '18:00', isha: '20:00' }
}
function options(): Options {
  return {
    services: { getDays: vi.fn((id: string, dates: readonly string[]) => Promise.resolve(dates.map((date) => day(id, date)))) },
    meta, locationId: 'A', locationMode: 'official', calculatedLocation: null,
    calculationSettings: calculation.DEFAULT_CALCULATION_SETTINGS,
    selectedDate: '2026-09-01', timeZone: 'Europe/Moscow',
  }
}
function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function observe(initialProps: Options) {
  const renders: ReturnType<typeof usePrayerSchedules>[] = []
  const hook = renderHook((props: Options) => {
    const value = usePrayerSchedules(props)
    renders.push(value)
    return value
  }, { initialProps })
  return { ...hook, renders }
}
function expectHidden(result: ReturnType<typeof usePrayerSchedules> | undefined) {
  expect(result).toMatchObject({ schedule: null, previousSchedule: undefined, tomorrow: undefined, scheduleLoading: true, scheduleError: null })
}

describe('usePrayerSchedules', () => {
  it.each([
    ['место', (o: Options) => ({ ...o, locationId: 'B' })],
    ['дата', (o: Options) => ({ ...o, selectedDate: '2026-09-02' })],
    ['timezone', (o: Options) => ({ ...o, timeZone: 'Asia/Tokyo' })],
    ['dataset version', (o: Options) => ({ ...o, meta: { ...meta, identity: { ...required(meta.identity), version: 'v2' } } })],
    ['координаты места', (o: Options) => ({ ...o, meta: { ...meta, locations: meta.locations.map((location) => ({ ...location, latitude: location.latitude + 0.1 })) } })],
  ])('на первом render скрывает все прежние дни при смене: %s', async (_, change) => {
    const initial = options()
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.schedule).not.toBeNull())
    const firstChangedRender = hook.renders.length
    hook.rerender(change(initial))
    expectHidden(hook.renders[firstChangedRender])
    await waitFor(() => expect(hook.result.current.scheduleLoading).toBe(false))
  })

  it('игнорирует новые ссылки, названия и неэффективные настройки официального расписания', async () => {
    const initial = options()
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.scheduleLoading).toBe(false))
    const calls = vi.mocked(initial.services.getDays).mock.calls.length
    hook.rerender({ ...initial, meta: { ...meta, source: { ...meta.source, name: 'Новое имя' }, locations: meta.locations.map((location) => ({ ...location, name: `${location.name}!` })) }, calculationSettings: { ...initial.calculationSettings, asrMethod: 'standard' } })
    await act(async () => {})
    expect(initial.services.getDays).toHaveBeenCalledTimes(calls)
    expect(hook.result.current.schedule).not.toBeNull()
  })

  it('при A → B → C не принимает прежние ответы и ошибки даже после готовности C', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<(PrayerDay | undefined)[]>>>()
    const initial = options()
    initial.services.getDays = vi.fn((id: string) => {
      const request = deferred<(PrayerDay | undefined)[]>()
      pending.set(id, request)
      return request.promise
    })
    const hook = observe(initial)
    hook.rerender({ ...initial, locationId: 'B' })
    hook.rerender({ ...initial, locationId: 'C' })
    await act(async () => {
      for (const [key, request] of pending) if (key === 'A') request.resolve(['2026-08-31', '2026-09-01', '2026-09-02'].map((date) => day('A', date)))
      await Promise.resolve()
    })
    expectHidden(hook.result.current)
    await act(async () => {
      for (const [key, request] of pending) if (key === 'C') request.resolve(['2026-08-31', '2026-09-01', '2026-09-02'].map((date) => day('C', date)))
      await Promise.resolve()
    })
    expect(hook.result.current.schedule).toMatchObject({ locationId: 'C' })
    await act(async () => {
      for (const [key, request] of pending) if (key === 'B') request.reject(new Error('old error'))
      await Promise.resolve()
    })
    expect(hook.result.current.scheduleError).toBeNull()
    expect(hook.result.current.previousSchedule).toMatchObject({ locationId: 'C' })
    expect(hook.result.current.tomorrow).toMatchObject({ locationId: 'C' })
  })

  it('смена расчётных координат, timezone, даты и каждой эффективной настройки сразу скрывает старые значения', async () => {
    let current: Options = { ...options(), locationMode: 'calculated', calculatedLocation: { latitude: 55.75, longitude: 37.62, timeZone: 'Europe/Moscow', accuracy: null, timestamp: 0, name: 'Москва', cityId: 524901 } }
    const hook = observe(current)
    await waitFor(() => expect(hook.result.current.schedule).not.toBeNull())
    const changes: ((o: Options) => Options)[] = [
      (o) => ({ ...o, calculatedLocation: { ...required(o.calculatedLocation), latitude: 56 } }),
      (o) => ({ ...o, calculatedLocation: { ...required(o.calculatedLocation), longitude: 38 } }),
      (o) => ({ ...o, calculatedLocation: { ...required(o.calculatedLocation), cityId: 1 } }),
      (o) => ({ ...o, timeZone: 'Europe/Berlin' }),
      (o) => ({ ...o, selectedDate: '2026-09-02' }),
      (o) => ({ ...o, calculationSettings: { ...o.calculationSettings, profile: 'turkey' } }),
      (o) => ({ ...o, calculationSettings: { ...o.calculationSettings, asrMethod: 'standard' } }),
      (o) => ({ ...o, calculationSettings: { ...o.calculationSettings, highLatitudeRule: 'seventhOfNight' } }),
    ]
    for (const change of changes) {
      current = change(current)
      const first = hook.renders.length
      hook.rerender(current)
      expectHidden(hook.renders[first])
      await waitFor(() => expect(hook.result.current.scheduleLoading).toBe(false))
    }
  })

  it('уточнение названия расчётного места не пересчитывает времена', async () => {
    const calculate = vi.spyOn(calculation, 'calculatePrayerSchedule')
    const initial: Options = { ...options(), locationMode: 'calculated', calculatedLocation: { latitude: 55.75, longitude: 37.62, timeZone: 'Europe/Moscow', accuracy: null, timestamp: 0 } }
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.schedule).not.toBeNull())
    const calls = calculate.mock.calls.length
    hook.rerender({ ...initial, calculatedLocation: { ...required(initial.calculatedLocation), name: 'Москва', nameSource: 'nominatim', timestamp: 1 }, calculationSettings: { ...initial.calculationSettings } })
    await act(async () => {})
    expect(calculate).toHaveBeenCalledTimes(calls)
    calculate.mockRestore()
  })

  it('повторная загрузка маскирует старое состояние и использует актуальный контекст', async () => {
    const initial = options()
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.schedule).not.toBeNull())
    hook.rerender({ ...initial, locationId: 'C' })
    await waitFor(() => expect(hook.result.current.schedule).toMatchObject({ locationId: 'C' }))
    const first = hook.renders.length
    act(() => hook.result.current.retrySchedule())
    expectHidden(hook.renders[first])
    await waitFor(() => expect(hook.result.current.scheduleLoading).toBe(false))
    expect(vi.mocked(initial.services.getDays).mock.lastCall?.[0]).toBe('C')
  })
})

describe('окно событий и гонки источников', () => {
  it.each([
    { latitude: 69.65, longitude: 18.96, timeZone: 'Europe/Oslo' },
    { latitude: 64.5, longitude: 180, timeZone: 'Etc/GMT+12' },
  ])('покрывает календарные сутки даже при смещениях рассчитанных событий: $timeZone', async (place) => {
    const initial: Options = { ...options(), locationMode: 'calculated', timeZone: place.timeZone, selectedDate: '2026-06-21', calculatedLocation: { ...place, accuracy: null, timestamp: 0 } }
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.scheduleLoading).toBe(false))
    expect(hook.result.current.scheduleError).toBeNull()
    expect(hook.result.current.schedules.map(({ date }) => date)).toEqual(['2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24'])
    const loaded = hook.result.current.schedules.flatMap(buildScheduleEvents)
    const wider = Array.from({ length: 11 }, (_, index) => calculation.calculatePrayerSchedule(place, addDays(initial.selectedDate, index - 5), place.timeZone)).flatMap(buildScheduleEvents)
    expect(loaded.some((event) => event.dayOffset === (place.timeZone === 'Europe/Oslo' ? 1 : -2))).toBe(true)
    for (const time of ['00:00', '12:00', '23:59'] as const) {
      const now = zonedDateTimeToInstant(initial.selectedDate, time, place.timeZone)
      expect(selectEventPair(now, loaded)).toEqual(selectEventPair(now, wider))
    }
  })

  it.each(['дата', 'версия', 'timezone', 'источник'] as const)('поздний ответ прежнего запроса не заменяет новый: %s', async (change) => {
    const old = deferred<(PrayerDay | undefined)[]>()
    const initial = options()
    vi.mocked(initial.services.getDays).mockReturnValueOnce(old.promise)
    const hook = observe(initial)
    const updated: Options = change === 'дата' ? { ...initial, selectedDate: '2026-09-02' }
      : change === 'версия' ? { ...initial, meta: { ...meta, identity: { ...required(meta.identity), version: 'v2' } } }
        : change === 'timezone' ? { ...initial, timeZone: 'Asia/Tokyo' }
          : { ...initial, locationMode: 'calculated', calculatedLocation: { latitude: 55.75, longitude: 37.62, timeZone: 'Europe/Moscow', accuracy: null, timestamp: 0 } }
    hook.rerender(updated)
    await waitFor(() => expect(hook.result.current.scheduleLoading).toBe(false))
    const current = hook.result.current.schedule
    await act(async () => { old.resolve([undefined, { ...day('A', '2026-09-01'), asr: '23:59' }, undefined]); await old.promise })
    expect(hook.result.current.schedule).toBe(current)
  })

  it('не отдаёт UI смесь дат или мест из неверного ответа и восстанавливается после повторения', async () => {
    const initial = options()
    vi.mocked(initial.services.getDays).mockResolvedValueOnce([day('A', '2026-08-31'), day('B', '2026-09-01'), day('A', '2026-09-02')])
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.scheduleError).not.toBeNull())
    expect(hook.result.current.schedules).toEqual([])
    act(() => hook.result.current.retrySchedule())
    await waitFor(() => expect(hook.result.current.schedule).toMatchObject({ locationId: 'A' }))
  })
})
