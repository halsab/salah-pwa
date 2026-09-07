import { expect, it, vi } from 'vitest'
import { failure, success } from '../../domain/result'
import { automaticPreferences } from '../../domain/sourcePreferences'
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
