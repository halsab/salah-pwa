import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGpsPlace, createOfficialPlace, type Place } from '../domain/place'
import { success, failure } from '../domain/result'
import { createSettingsPersistence } from '../features/settings/settingsPersistence'
import { clearAppData, deleteSalahDatabase, getLocationChoice, getSetting, setSetting, type LocationChoice, type SettingsPatch } from '../storage/database'
import { createPrayerRepository, loadPrayerRepositoryOptionalSettings } from './prayerRepository'

const coarse = createGpsPlace({ latitude: 41.01, longitude: 28.95, accuracy: 500, timestamp: 100 }, 'Europe/Moscow', null, 'gps:operation:a')
const precise = { ...coarse, latitude: 41.03, accuracy: 10, timestamp: 200 }
const other = createGpsPlace({ latitude: 48, longitude: 20, accuracy: 20, timestamp: 300 }, 'Europe/Moscow', null, 'gps:operation:b')
const choice = (place: Place): LocationChoice => ({ mode: 'calculated', source: 'automatic', coordinates: place, place })
const event = (change: 'selection' | 'refinement', place: Place): SettingsPatch => ({
  locationChoice: choice(place), placeEvents: [{ change, choice: choice(place), expectedPlaceId: change === 'selection' ? null : place.id }],
})
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => { resolve = yes })
  return { promise, resolve }
}
async function history() {
  const result = await loadPrayerRepositoryOptionalSettings()
  if (!result.ok) throw new Error('History must be readable')
  return result.value.recentPlaces
}
afterEach(async () => { vi.restoreAllMocks(); await deleteSalahDatabase() })

describe('transactional accepted GPS refinements', () => {
  it('refines the accepted entry before hydration without promoting it or replacing newer stored rows', async () => {
    const repo = createPrayerRepository()
    const legacy = Array.from({ length: 9 }, (_, i) => createOfficialPlace({ id: `legacy-${i}`, name: `Legacy ${i}`, latitude: 30 + i, longitude: 10 }, i))
    await setSetting('recentPlaces', legacy)
    await repo.saveSettings(event('selection', coarse))
    const accepted = await history()
    const identity = accepted[0]?.id
    // Другая вкладка может нормализовать/добавить строки до доставки уведомления.
    const remote = createOfficialPlace({ id: 'remote', name: 'Remote', latitude: 50, longitude: 40 }, 50)
    await setSetting('recentPlaces', [remote, ...accepted].slice(0, 10))
    expect(await repo.saveSettings({ ...event('refinement', precise), recentPlaces: accepted })).toEqual(success(undefined))
    const refined = await history()
    expect(refined).toHaveLength(10)
    expect(refined.map(place => place.id)).toEqual([remote.id, ...accepted.slice(0, 9).map(place => place.id)])
    expect(refined[1]).toMatchObject({ id: identity, latitude: precise.latitude, accuracy: 10, timestamp: 200 })
    expect(await getLocationChoice()).toMatchObject({ value: { place: precise } })
    const named = { ...precise, name: 'Istanbul' }
    await repo.saveSettings(event('refinement', named))
    expect((await history())[1]).toMatchObject({ id: identity, name: 'Istanbul', timestamp: 200 })
    expect((await history()).map(place => place.id)).toEqual(refined.map(place => place.id))
  })

  it.each(['queued', 'in-flight'] as const)('keeps coarse selection then refinement ordered when %s', async stage => {
    const repo = createPrayerRepository()
    const gate = deferred()
    let calls = 0
    const writer = createSettingsPersistence(async (patch, isCurrent) => {
      if (++calls === 1 && stage === 'in-flight') await gate.promise
      return repo.saveSettings(patch, isCurrent)
    })
    writer.save(event('selection', coarse))
    if (stage === 'in-flight') await vi.waitFor(() => expect(calls).toBe(1))
    writer.save(event('refinement', precise))
    gate.resolve()
    await writer.drain()
    expect(await getLocationChoice()).toMatchObject({ value: { place: precise } })
    expect(await history()).toEqual([expect.objectContaining({ id: 'gps:history:41.010000:28.950000', latitude: precise.latitude, accuracy: 10, timestamp: 200 })])
  })

  it('does not replay a committed selection when its completion overlaps a refinement and another tab', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const committed = deferred()
    const returnWrite = deferred()
    let calls = 0
    const writer = createSettingsPersistence(async (patch, isCurrent) => {
      const result = await tabA.saveSettings(patch, isCurrent)
      if (++calls === 1) { committed.resolve(); await returnWrite.promise }
      return result
    })
    writer.save(event('selection', coarse))
    await committed.promise
    await tabB.saveSettings(event('selection', other))
    const before = await history()
    writer.save(event('refinement', precise))
    returnWrite.resolve()
    await writer.drain()
    expect(await history()).toEqual(before)
    expect(await getLocationChoice()).toMatchObject({ value: { place: other } })
  })

  it('preserves a later refinement when another command supersedes its completed write', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    const gate = deferred()
    const committed = deferred()
    let calls = 0
    const writer = createSettingsPersistence(async (patch, isCurrent) => {
      const result = await repo.saveSettings(patch, isCurrent)
      if (++calls === 1) { committed.resolve(); await gate.promise }
      return result
    })
    writer.save(event('refinement', precise))
    await committed.promise
    writer.save({ themeFamily: 'classic' })
    gate.resolve()
    await writer.drain()
    expect((await history())[0]).toMatchObject({ latitude: precise.latitude, timestamp: 200 })
  })

  it('ignores obsolete refinements with delayed tab notifications and after reselecting the same coordinates', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    await tabA.saveSettings(event('selection', coarse))
    await tabB.saveSettings(event('selection', { ...coarse, id: other.id }))
    const before = await history()
    await tabA.saveSettings(event('refinement', precise))
    expect(await history()).toEqual(before)
    expect(await getLocationChoice()).toMatchObject({ value: { place: { id: other.id, latitude: coarse.latitude } } })
  })

  it('does not replay an uncommitted coarse selection over a newer tab selection while saving its refinement', async () => {
    const repo = createPrayerRepository()
    const original = createOfficialPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }, 1)
    await setSetting('locationChoice', { mode: 'official', locationId: 'kazan', source: 'manual', place: original })
    await repo.saveSettings(event('selection', other))
    const before = await history()
    const selected = choice(coarse)
    await repo.saveSettings({ locationChoice: choice(precise), placeEvents: [
      { change: 'selection', choice: selected, expectedPlaceId: original.id },
      { change: 'refinement', choice: choice(precise), expectedPlaceId: coarse.id },
    ] })
    expect(await getLocationChoice()).toMatchObject({ value: { place: other } })
    expect(await history()).toEqual(before)
  })

  it('normalizes the latest storage instead of persisting a stale hydration snapshot', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    const stale = await history()
    await repo.saveSettings(event('selection', other))
    const latest = await history()
    await repo.saveSettings({ normalizeRecentPlaces: true, recentPlaces: stale })
    expect(await history()).toEqual(latest)
  })

  it('retains a deduplicated stable identity through refinement and allocates a unique identity at the old point', async () => {
    const repo = createPrayerRepository()
    const saved = { ...coarse, id: 'gps:history:original-snapshot', timestamp: 1 }
    await setSetting('recentPlaces', [saved])
    await repo.saveSettings(event('selection', coarse))
    await repo.saveSettings(event('refinement', precise))
    expect(await history()).toEqual([expect.objectContaining({ id: saved.id, latitude: precise.latitude, accuracy: 10, timestamp: 200 })])
    const returned = { ...coarse, id: 'gps:new-operation', timestamp: 400 }
    await repo.saveSettings(event('selection', returned))
    const after = await history()
    expect(after.map(place => place.id)).toEqual(['gps:history:41.010000:28.950000', saved.id])
    expect(new Set(after.map(place => place.id)).size).toBe(2)
    expect(after.map(place => place.timestamp)).toEqual([400, 200])
  })

  it('does not resurrect the old active point when a failed refinement is retried after another tab wins', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    let fail = true
    const writer = createSettingsPersistence((patch, isCurrent) => fail
      ? Promise.resolve(failure({ kind: 'storage', reason: 'unavailable' })) : repo.saveSettings(patch, isCurrent))
    writer.save(event('refinement', precise))
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    await createPrayerRepository().saveSettings(event('selection', other))
    const latest = await history()
    fail = false
    writer.retry()
    await writer.drain()
    expect(await history()).toEqual(latest)
    expect(await getLocationChoice()).toMatchObject({ value: { place: other } })
  })

  it('retries a failed refinement without reverting the selection or losing concurrent history', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    const before = await history()
    let fail = true
    const writer = createSettingsPersistence((patch, isCurrent) => fail
      ? Promise.resolve(failure({ kind: 'storage', reason: 'unavailable' })) : repo.saveSettings(patch, isCurrent))
    writer.save(event('refinement', precise))
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    expect(await history()).toEqual(before)
    fail = false
    writer.retry()
    await writer.drain()
    expect((await history())[0]).toMatchObject({ id: before[0]?.id, latitude: precise.latitude, timestamp: 200 })
    await repo.saveSettings(event('selection', other))
    await repo.saveSettings(event('refinement', precise))
    expect(await getLocationChoice()).toMatchObject({ value: { place: other } })
  })

  it('rolls back choice and history together when the history put fails, then retries the refinement', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    const before = await history()
    const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')?.value as IDBObjectStore['put'] | undefined
    const quota = vi.spyOn(IDBObjectStore.prototype, 'put')
    if (!put) throw new Error('Expected the real IndexedDB put implementation')
    quota.mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (value && typeof value === 'object' && 'key' in value && value.key === 'recentPlaces') throw new DOMException('quota', 'QuotaExceededError')
      return put.call(this, value, key)
    })
    const writer = createSettingsPersistence(repo.saveSettings)
    writer.save(event('refinement', precise))
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    expect(await history()).toEqual(before)
    expect(await getLocationChoice()).toMatchObject({ value: { place: coarse } })
    quota.mockRestore()
    writer.retry()
    await writer.drain()
    expect(writer.getStatus()).toBe('saved')
    expect((await history())[0]).toMatchObject({ id: before[0]?.id, latitude: precise.latitude, timestamp: 200 })
    expect(await getLocationChoice()).toMatchObject({ value: { place: precise } })
  })

  it('does not acknowledge or partially commit a transaction invalidated during its writes', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    const before = await history()
    let current = true
    const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')?.value as IDBObjectStore['put'] | undefined
    const invalidate = vi.spyOn(IDBObjectStore.prototype, 'put')
    if (!put) throw new Error('Expected the real IndexedDB put implementation')
    invalidate.mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = put.call(this, value, key)
      if (value && typeof value === 'object' && 'key' in value && value.key === 'recentPlaces') current = false
      return request
    })
    expect(await repo.saveSettings(event('refinement', precise), () => current)).toMatchObject({ ok: false })
    invalidate.mockRestore()
    expect(await history()).toEqual(before)
    expect(await getLocationChoice()).toMatchObject({ value: { place: coarse } })
  })

  it('does not write after cancellation or reset and cannot recreate a deleted history entry', async () => {
    const repo = createPrayerRepository()
    await repo.initializeStartup()
    await repo.saveSettings(event('selection', coarse))
    const writer = createSettingsPersistence(repo.saveSettings)
    writer.save(event('refinement', precise))
    writer.rebase()
    await writer.drain()
    expect((await history())[0]).toMatchObject({ latitude: coarse.latitude })
    await clearAppData()
    expect(await repo.saveSettings(event('refinement', precise))).toMatchObject({ ok: false })
    expect(await getSetting('recentPlaces')).toEqual(success(undefined))
    const fresh = createPrayerRepository()
    await fresh.saveSettings(event('refinement', precise))
    expect(await history()).toEqual([])
    expect(await getLocationChoice()).toEqual(success(undefined))
  })
})
