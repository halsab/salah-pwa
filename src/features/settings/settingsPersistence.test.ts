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
it.each(['committed', 'failed'] as const)('keeps only uncommitted selections when an in-flight write is %s', async result => {
  const first = deferred<ReturnType<typeof success<void>> | ReturnType<typeof failure<unknown>>>()
  const second = deferred<ReturnType<typeof success<void>>>()
  const selectedA = createGpsPlace({ latitude: 40, longitude: -73, accuracy: 20, timestamp: 123 }, 'America/New_York', null, 'gps:operation:a')
  const selectedB = createGpsPlace({ latitude: 41, longitude: -74, accuracy: 20, timestamp: 456 }, 'America/New_York', null, 'gps:operation:b')
  const save = vi.fn<SaveSettings>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const writer = createSettingsPersistence(save)

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
  expect(save.mock.calls[0]?.[1]?.()).toBe(false)

  stale.resolve(success(undefined))
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1]?.[0]).toEqual({ ...localCalendar, themeFamily: 'seasonal' })
  reconciled.resolve(success(undefined))
  await writer.drain()

  writer.save({ languagePreference: 'ru' })
  await writer.drain()
  expect(save.mock.calls[2]?.[0]).toEqual({ languagePreference: 'ru' })
})
