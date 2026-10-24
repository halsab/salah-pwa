import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { addDays } from '../../domain/date'
import { createLocalityPlace, type Place } from '../../domain/place'
import { buildScheduleEvents, selectEventPair } from '../../domain/scheduleEvents'
import * as calculation from '../../domain/prayerCalculation'
import { scheduleContextKey, type ScheduleContext } from '../../domain/scheduleContext'
import { automaticPreferences } from '../../domain/sourcePreferences'
import { zonedDateTimeToInstant } from '../../domain/locationTime'
import { usePrayerSchedules } from './usePrayerSchedules'
import type { FastScheduleStartup } from './fastScheduleSnapshot'

const settings: calculation.CalculationSettings = {
  profile: 'tatarstan', asrMethod: 'hanafi', highLatitudeRule: 'tatarstan',
}

function makePlace(id: string, latitude = 55.79, longitude = 49.12, timeZone = 'Europe/Moscow'): Place {
  return { ...createLocalityPlace({ id: 'kazan', name: 'Казань', latitude, longitude, timeZone }, 0), id, timeZone,
    automaticTimeZone: { id: timeZone, source: 'city' } }
}

interface Options {
  place: Place
  settings: calculation.CalculationSettings
  selectedDate: string
  mode?: 'automatic' | 'manual'
  status?: 'ready' | 'unsupported'
  initialSnapshot?: FastScheduleStartup | null
}

function observe(initialProps: Options) {
  const renders: ReturnType<typeof usePrayerSchedules>[] = []
  const hook = renderHook((props: Options) => {
    const value = usePrayerSchedules({ location: props.place, selectedDate: props.selectedDate, mode: props.mode ?? 'manual',
      ...(props.initialSnapshot === undefined ? {} : { initialSnapshot: props.initialSnapshot }), resolution: {
        kind: 'calculated', status: props.status ?? 'ready', settings: props.settings,
        timeZone: props.place.timeZone, strategy: props.mode === 'automatic' ? 'regional' : 'manual',
      } })
    renders.push(value)
    return value
  }, { initialProps })
  return { ...hook, renders }
}

function expectCurrentContext(result: ReturnType<typeof usePrayerSchedules> | undefined) {
  expect(result?.schedule).toMatchObject({ date: result?.context?.date })
  expect(result).toMatchObject({ previousSchedule: undefined, tomorrow: undefined,
    scheduleLoading: false, scheduleError: null, contextReady: false })
}

describe('usePrayerSchedules', () => {
  it('passes a verified Tatarstan locality identity into the independent calculation context', async () => {
    const hook = renderHook(() => usePrayerSchedules({ location: makePlace('locality:kazan'), selectedDate: '2026-09-01', mode: 'automatic',
      resolution: { kind: 'calculated', status: 'ready', settings, timeZone: 'Europe/Moscow', strategy: 'regional' } }))
    await waitFor(() => expect(hook.result.current.contextReady).toBe(true))
    expect(hook.result.current.context?.location.localityId).toBe('kazan')
    expect(hook.result.current.schedules.map(({ date }) => date)).toEqual(Array.from({ length: 9 }, (_, index) => addDays('2026-09-01', index - 4)))
  })

  const transitions: [string, (o: Options) => Options][] = [
    ['место', (o: Options) => ({ ...o, place: makePlace('another', 56.2, 50.1) })],
    ['дату', (o: Options) => ({ ...o, selectedDate: '2026-09-02' })],
    ['часовой пояс', (o: Options) => ({ ...o, place: makePlace('locality:kazan', 55.79, 49.12, 'Asia/Tokyo') })],
    ['профиль', (o: Options) => ({ ...o, settings: { ...o.settings, profile: 'turkey' as const } })],
    ['поправки', (o: Options) => ({ ...o, settings: { ...o.settings, adjustments: { isha: 30 } } })],
  ]
  it.each(transitions)('при смене %s сразу показывает расчёт нового контекста', async (_, change) => {
    const initial = { place: makePlace('A'), settings, selectedDate: '2026-09-01' }
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.contextReady).toBe(true))
    const firstChangedRender = hook.renders.length
    hook.rerender(change(initial))
    expectCurrentContext(hook.renders[firstChangedRender])
    await waitFor(() => expect(hook.result.current.contextReady).toBe(true))
  })

  it('retains a verified cached selected day while calculated neighbors restore live context', async () => {
    const place = makePlace('locality:kazan')
    const context: ScheduleContext = { location: { id: place.id, latitude: place.latitude, longitude: place.longitude, localityId: 'kazan' },
      date: '2026-09-01', timeZone: 'Europe/Moscow', mode: 'automatic', source: 'calculated', settings }
    const snapshot: FastScheduleStartup = { generation: 'generation', context,
      schedule: calculation.calculatePrayerSchedule(context.location, context.date, context.timeZone, context.settings),
      place, selectionSource: 'default', preferences: automaticPreferences() }
    const hook = observe({ place, settings, selectedDate: context.date, mode: 'automatic', initialSnapshot: snapshot })
    expect(hook.result.current.schedule).toMatchObject({ date: context.date, profile: 'tatarstan' })
    expect(hook.result.current.contextReady).toBe(false)
    await waitFor(() => expect(hook.result.current.contextReady).toBe(true))
    expect(hook.result.current.schedules).toHaveLength(9)
  })

  it('hides an unsupported profile without falling back to another profile', () => {
    const hook = renderHook(() => usePrayerSchedules({ location: makePlace('A'), selectedDate: '2026-09-01', mode: 'manual',
      resolution: { kind: 'calculated', status: 'unsupported', settings: { ...settings, profile: 'turkey' }, timeZone: 'Europe/Moscow', strategy: 'manual' } }))
    expect(hook.result.current.scheduleLoading).toBe(false)
    expect(hook.result.current.scheduleError).toEqual({ code: 'unsupported-profile', profile: 'turkey' })
    expect(hook.result.current.schedule).toBeNull()
  })

  it('retries a failed calculation against the same current context', async () => {
    const hook = observe({ place: makePlace('A'), settings: { ...settings, profile: 'bad-profile' as never }, selectedDate: '2026-09-01' })
    await waitFor(() => expect(hook.result.current.scheduleError).toEqual({ code: 'load-failed' }))
    act(() => hook.result.current.retrySchedule())
    await waitFor(() => expect(hook.result.current.scheduleError).toEqual({ code: 'load-failed' }))
    expect(hook.result.current.contextKey).toBe(scheduleContextKey({ location: { id: 'A', latitude: 55.79, longitude: 49.12 },
      date: '2026-09-01', timeZone: 'Europe/Moscow', mode: 'manual', source: 'calculated', settings: { ...settings, profile: 'bad-profile' as never } }))
  })
})

describe('calculated event window', () => {
  it.each([
    { latitude: 69.65, longitude: 18.96, timeZone: 'Europe/Oslo' },
    { latitude: 64.5, longitude: 180, timeZone: 'Etc/GMT+12' },
  ])('covers events near midnight for $timeZone', async location => {
    const place = makePlace('polar', location.latitude, location.longitude, location.timeZone)
    const initial = { place, settings: { ...settings, profile: 'muslimWorldLeague' as const, highLatitudeRule: 'nearestDay' as const }, selectedDate: '2026-06-21' }
    const hook = observe(initial)
    await waitFor(() => expect(hook.result.current.contextReady).toBe(true))
    expect(hook.result.current.scheduleError).toBeNull()
    expect(hook.result.current.schedules.map(({ date }) => date)).toEqual(Array.from({ length: 9 }, (_, index) => addDays(initial.selectedDate, index - 4)))
    const loaded = hook.result.current.schedules.flatMap(buildScheduleEvents)
    const wider = Array.from({ length: 11 }, (_, index) => calculation.calculatePrayerSchedule(location,
      addDays(initial.selectedDate, index - 5), location.timeZone, initial.settings)).flatMap(buildScheduleEvents)
    for (const time of ['00:00', '12:00', '23:59'] as const) {
      const now = zonedDateTimeToInstant(initial.selectedDate, time, location.timeZone)
      expect(selectEventPair(now, loaded)).toEqual(selectEventPair(now, wider))
    }
  })
})
