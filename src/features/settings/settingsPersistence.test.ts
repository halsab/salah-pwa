import { expect, it, vi } from 'vitest'
import { failure, success } from '../../domain/result'
import { automaticPreferences } from '../../domain/sourcePreferences'
import { createGpsPlace } from '../../domain/place'
import type { SettingsPatch } from '../../storage/database'
import { createSettingsPersistence, type SaveSettings } from './settingsPersistence'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
const a = { locationChoice: { mode: 'official' as const, locationId: 'kazan', source: 'manual' as const } }
const b = { locationChoice: { mode: 'official' as const, locationId: 'naberezhnye-chelny', source: 'manual' as const } }
it.each(['result', 'rejection'])('handles %s failure, retrying latest complete state', async kind => {
  const save = vi.fn().mockImplementationOnce(() => kind === 'result' ? Promise.resolve(failure({ kind: 'storage', reason: 'unavailable' })) : Promise.reject(new Error('denied'))).mockResolvedValue(success(undefined))
  const writer = createSettingsPersistence(save)
  writer.save(a)
  await writer.drain()
  expect(writer.getStatus()).toBe('failed')
  writer.retry()
  await writer.drain()
  expect(save.mock.lastCall?.[0]).toEqual(a)
  expect(writer.getStatus()).toBe('saved')
})
it('retries the accepted location and its recent history as one settings snapshot', async () => {
  const selected = {
    locationChoice: { mode: 'calculated' as const, source: 'manual' as const, coordinates: { latitude: 40, longitude: -73, accuracy: 20, timestamp: 123, timeZone: 'America/New_York' } },
    recentPlaces: [createGpsPlace({ latitude: 40, longitude: -73, accuracy: 20, timestamp: 123 }, 'America/New_York', null, 'gps:history:40.000000:-73.000000')],
    recentPlacesMigrated: true,
  }
  const save = vi.fn().mockResolvedValueOnce(failure({ kind: 'storage', reason: 'unavailable' })).mockResolvedValue(success(undefined))
  const writer = createSettingsPersistence(save)
  writer.save(selected)
  await writer.drain()
  expect(writer.getStatus()).toBe('failed')
  writer.retry()
  await writer.drain()
  expect(save.mock.calls[1]?.[0]).toEqual(selected)
  expect(writer.getStatus()).toBe('saved')
})
it('keeps later same-tab reservations behind an earlier reservation failure and retries in intent order', async () => {
  const save = vi.fn<SaveSettings>().mockResolvedValue(success(undefined))
  let nextOrder = 0
  let failFirst = true
  const reserved: number[] = []
  const writer = createSettingsPersistence(save, () => {
    if (failFirst) { failFirst = false; return Promise.reject(new Error('temporary reservation failure')) }
    const order = ++nextOrder
    reserved.push(order)
    return Promise.resolve(order)
  }, () => Promise.resolve(undefined))
  const firstPlace = createGpsPlace({ latitude: 40, longitude: -73, accuracy: 5, timestamp: 1 }, 'UTC', null, 'gps:one')
  const secondPlace = createGpsPlace({ latitude: 41, longitude: -74, accuracy: 5, timestamp: 2 }, 'UTC', null, 'gps:two')
  const first = { mode: 'calculated' as const, source: 'manual' as const, coordinates: firstPlace, place: firstPlace }
  const second = { mode: 'calculated' as const, source: 'manual' as const, coordinates: secondPlace, place: secondPlace }
  writer.save({ locationChoice: first, placeEvents: [{ change: 'selection', choice: first }] })
  writer.save({ locationChoice: second, placeEvents: [{ change: 'selection', choice: second }] })
  await writer.drain()
  expect(writer.getStatus()).toBe('failed')
  expect(reserved).toEqual([])
  expect(save).not.toHaveBeenCalled()

  writer.retry()
  await writer.drain()
  expect(reserved).toEqual([1, 2])
  expect(save.mock.lastCall?.[0].placeEvents?.map(event => event.selectionOrder)).toEqual([1, 2])
})
it('keeps a rejected reservation chain stopped when another save starts its retry', async () => {
  let reject!: (error: Error) => void
  const reservation = new Promise<number>((_, no) => { reject = no })
  const started = deferred<undefined>()
  const retry = deferred<number>()
  const save = vi.fn<SaveSettings>().mockResolvedValue(success(undefined))
  let calls = 0
  const reserve = () => {
    if (++calls === 1) { started.resolve(undefined); return reservation }
    return calls === 2 ? retry.promise : Promise.resolve(2)
  }
  const writer = createSettingsPersistence(save, reserve, () => Promise.resolve(undefined))
  writer.save({ placeEvents: [{ change: 'selection', choice: a.locationChoice }] })
  writer.save({ placeEvents: [{ change: 'selection', choice: b.locationChoice }] })
  await started.promise
  void reservation.catch(() => writer.save({ themeFamily: 'classic' }))
  reject(new Error('temporary reservation failure'))
  // Освобождаем готовые microtasks, удерживая только новую первую резервацию.
  for (let turn = 0; turn < 25; turn += 1) await Promise.resolve()
  expect(calls).toBe(2)
  expect(save).not.toHaveBeenCalled()
  retry.resolve(1)
  await writer.drain()
  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.lastCall?.[0].placeEvents?.map(event => event.selectionOrder)).toEqual([1, 2])
  expect(writer.getStatus()).toBe('saved')
})
it.each(['committed', 'failed'] as const)('keeps only uncommitted selections when an in-flight write is %s', async result => {
  const first = deferred<ReturnType<typeof success<void>> | ReturnType<typeof failure<unknown>>>()
  const second = deferred<ReturnType<typeof success<void>>>()
  const selectedA = createGpsPlace({ latitude: 40, longitude: -73, accuracy: 20, timestamp: 123 }, 'America/New_York', null, 'gps:operation:a')
  const selectedB = createGpsPlace({ latitude: 41, longitude: -74, accuracy: 20, timestamp: 456 }, 'America/New_York', null, 'gps:operation:b')
  const save = vi.fn<SaveSettings>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const writer = createSettingsPersistence(save, undefined, () => Promise.resolve(undefined))

  writer.save({ locationChoice: a.locationChoice, placeEvents: [{ change: 'selection', choice: { mode: 'calculated', source: 'automatic', coordinates: selectedA, place: selectedA } }] })
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  writer.save({ locationChoice: b.locationChoice, placeEvents: [{ change: 'selection', choice: { mode: 'calculated', source: 'automatic', coordinates: selectedB, place: selectedB } }] })
  first.resolve(result === 'committed' ? success(undefined) : failure({ kind: 'storage' }))
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))

  expect(save.mock.calls[1]?.[0]).toMatchObject({
    locationChoice: b.locationChoice,
  })
  expect(save.mock.calls[1]?.[0].placeEvents?.map(event => event.choice.place)).toEqual(result === 'committed' ? [selectedB] : [selectedA, selectedB])
  second.resolve(success(undefined))
  await writer.drain()
})
it('serializes rapid changes and ignores stale failure without losing earlier unsaved fields', async () => {
  const first = deferred<ReturnType<typeof success<void>> | ReturnType<typeof failure<{ kind: 'storage'; reason: 'unavailable' }>>>()
  const last = deferred<ReturnType<typeof success<void>>>()
  const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise)
  const writer = createSettingsPersistence(save)
  writer.save(a)
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  writer.save(b)
  writer.save({ sourcePreferences: automaticPreferences() })
  first.resolve(failure({ kind: 'storage', reason: 'unavailable' }))
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(writer.getStatus()).toBe('saving')
  expect(save.mock.lastCall?.[0]).toEqual({ ...b, sourcePreferences: automaticPreferences() })
  last.resolve(success(undefined))
  await writer.drain()
  expect(writer.getStatus()).toBe('saved')
})
it('invalidates queued writes and waits for in-flight completion before reset', async () => {
  const pending = deferred<ReturnType<typeof success<void>>>()
  const save = vi.fn<SaveSettings>().mockReturnValue(pending.promise)
  const writer = createSettingsPersistence(save)
  writer.save(a)
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  writer.save(b)
  const drain = writer.invalidateAndDrain()
  expect(save.mock.lastCall?.[1]()).toBe(false)
  pending.resolve(success(undefined))
  await drain
  expect(save).toHaveBeenCalledTimes(1)
  expect(writer.getStatus()).toBe('idle')
})

it.each(['rebase', 'reset'] as const)('does not attach a failed reservation baseline after %s cancels its generation', async boundary => {
  const baseline = deferred<number | undefined>()
  const save = vi.fn<SaveSettings>().mockResolvedValue(success(undefined))
  const readBaseline = vi.fn(() => baseline.promise)
  let fail = true
  const writer = createSettingsPersistence(save, () => {
    if (fail) { fail = false; return Promise.reject(new Error('reservation failed')) }
    return Promise.resolve(1)
  }, readBaseline)
  const selected = createGpsPlace({ latitude: 40, longitude: -73, accuracy: 20, timestamp: 123 }, 'UTC', null, 'gps:retry-boundary')
  writer.save({ locationChoice: { mode: 'calculated', source: 'manual', coordinates: selected },
    placeEvents: [{ change: 'selection', choice: { mode: 'calculated', source: 'manual', coordinates: selected } }] })
  await vi.waitFor(() => expect(readBaseline).toHaveBeenCalledOnce())

  let boundaryPromise: Promise<void>
  if (boundary === 'rebase') {
    writer.rebase()
    boundaryPromise = Promise.resolve()
  } else boundaryPromise = writer.invalidateAndDrain()
  baseline.resolve(undefined)
  await boundaryPromise
  await writer.drain()
  expect(save).not.toHaveBeenCalled()

  writer.save({ themeFamily: 'classic' })
  await writer.drain()
  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0]?.[0]).toEqual({ themeFamily: 'classic' })
})

it('rebases accumulated writes after accepting an external settings state', async () => {
  const save = vi.fn().mockResolvedValue(success(undefined))
  const writer = createSettingsPersistence(save)
  writer.save(a)
  await writer.drain()

  writer.rebase()
  writer.save({ themeFamily: 'classic' })
  await writer.drain()

  expect(save.mock.lastCall?.[0]).toEqual({ themeFamily: 'classic' })
})

it('reconciles an external theme over queued local writes without losing unrelated changes', async () => {
  const stale = deferred<ReturnType<typeof success<void>>>()
  const reconciled = deferred<ReturnType<typeof success<void>>>()
  const save = vi.fn<SaveSettings>()
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(reconciled.promise)
    .mockResolvedValue(success(undefined))
  const writer = createSettingsPersistence(save)
  const localCalendar: SettingsPatch = { calendarPreferences: { calendar: 'gregorian', correction: 1 } }

  writer.save({ themeFamily: 'classic' })
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  writer.save(localCalendar)
  writer.save({ themeFamily: 'seasonal' })
  expect(save.mock.calls[0]?.[1]).toBeDefined()
  expect(save.mock.calls[0]?.[1]?.()).toBe(true)
  expect(save.mock.calls[0]?.[2]?.()).toBe(false)

  stale.resolve(success(undefined))
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1]?.[0]).toEqual({ ...localCalendar, themeFamily: 'seasonal' })
  reconciled.resolve(success(undefined))
  await writer.drain()

  writer.save({ languagePreference: 'ru' })
  await writer.drain()
  expect(save.mock.calls[2]?.[0]).toEqual({ languagePreference: 'ru' })
})
