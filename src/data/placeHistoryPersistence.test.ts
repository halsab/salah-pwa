import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGpsPlace, createOfficialPlace, type Place } from '../domain/place'
import { success, failure } from '../domain/result'
import { createSettingsPersistence } from '../features/settings/settingsPersistence'
import { getDeviceTimeZone } from '../domain/locationTime'
import { clearAppData, deleteSalahDatabase, getLocationChoice, getSetting, setSetting, type LocationChoice, type SettingsPatch } from '../storage/database'
import { createPrayerRepository, loadPrayerRepositoryOptionalSettings } from './prayerRepository'

const coarse = createGpsPlace({ latitude: 41.01, longitude: 28.95, accuracy: 500, timestamp: 100 }, 'Europe/Moscow', null, 'gps:operation:a')
const precise = { ...coarse, latitude: 41.03, accuracy: 10, timestamp: 200 }
const other = createGpsPlace({ latitude: 48, longitude: 20, accuracy: 20, timestamp: 300 }, 'Europe/Moscow', null, 'gps:operation:b')
const choice = (place: Place): LocationChoice => ({ mode: 'calculated', source: 'automatic', coordinates: place, place })
let selectionOrder = 0
const event = (change: 'selection' | 'refinement', place: Place, previousId: string | null = null): SettingsPatch => ({
  locationChoice: choice(place), placeEvents: [{ change, choice: choice(place), expectedPlaceId: change === 'selection' ? previousId : place.id,
    ...(change === 'selection' ? { selectionOrder: ++selectionOrder } : {}) }],
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
    await tabB.saveSettings(event('selection', other, coarse.id))
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

  it('retains a durable acknowledgement when a theme save supersedes the selection response', async () => {
    const repo = createPrayerRepository()
    const committed = deferred()
    const returnResponse = deferred()
    let generationCurrent: (() => boolean) | undefined
    let latest: (() => boolean) | undefined
    let locationCurrent: (() => boolean) | undefined
    let calls = 0
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent, isLatest, isLocationCurrent) => {
      const result = await repo.saveSettings(patch, isGenerationCurrent)
      if (++calls === 1) {
        generationCurrent = isGenerationCurrent
        latest = isLatest
        locationCurrent = isLocationCurrent
        committed.resolve()
        await returnResponse.promise
      }
      return result
    })

    writer.save(event('selection', coarse))
    await committed.promise
    writer.save({ themeFamily: 'classic' })
    returnResponse.resolve()
    await writer.drain()

    expect(generationCurrent?.()).toBe(true)
    expect(latest?.()).toBe(false)
    expect(locationCurrent?.()).toBe(true)
    expect(await getLocationChoice()).toMatchObject({ value: { place: coarse } })
    expect(await history()).toEqual([expect.objectContaining({ id: 'gps:history:41.010000:28.950000' })])
    expect(writer.getStatus()).toBe('saved')
  })

  it('does not acknowledge or replay a committed selection after a newer same-tab selection is queued', async () => {
    const repo = createPrayerRepository()
    const committed = deferred()
    const returnResponse = deferred()
    let firstLocationCurrent: (() => boolean) | undefined
    let calls = 0
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent, _isLatest, isLocationCurrent) => {
      const result = await repo.saveSettings(patch, isGenerationCurrent)
      if (++calls === 1) {
        firstLocationCurrent = isLocationCurrent
        committed.resolve()
        await returnResponse.promise
      }
      return result
    })

    writer.save(event('selection', coarse))
    await committed.promise
    writer.save(event('selection', other, coarse.id))
    expect(firstLocationCurrent?.()).toBe(false)
    returnResponse.resolve()
    await writer.drain()

    expect(await getLocationChoice()).toMatchObject({ value: { place: other } })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000', 'gps:history:41.010000:28.950000'])
    expect(writer.getStatus()).toBe('saved')
  })

  it('ignores obsolete refinements with delayed tab notifications and after reselecting the same coordinates', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    await tabA.saveSettings(event('selection', coarse))
    await tabB.saveSettings(event('selection', { ...coarse, id: other.id }, coarse.id))
    const before = await history()
    await tabA.saveSettings(event('refinement', precise))
    expect(await history()).toEqual(before)
    expect(await getLocationChoice()).toMatchObject({ value: { place: { id: other.id, latitude: coarse.latitude } } })
  })

  it('does not commit a delayed standalone selection after another tab has selected a newer place', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const original = createOfficialPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }, 1)
    const originalChoice: LocationChoice = { mode: 'official', locationId: 'kazan', source: 'manual', place: original }
    await setSetting('locationChoice', originalChoice)
    const started = deferred()
    const allowWrite = deferred()
    const obsolete = choice(coarse)
    const delayed = createSettingsPersistence(async (patch, isCurrent) => {
      started.resolve()
      await allowWrite.promise
      return tabA.saveSettings(patch, isCurrent)
    })

    delayed.save({ locationChoice: obsolete, placeEvents: [{ change: 'selection', choice: obsolete, expectedPlaceId: original.id, selectionOrder: 100 }] })
    await started.promise
    const current = choice(other)
    await tabB.saveSettings({ locationChoice: current, placeEvents: [{ change: 'selection', choice: current, expectedPlaceId: original.id, selectionOrder: 200 }] })
    const currentHistory = await history()
    allowWrite.resolve()
    await delayed.drain()

    expect(await getLocationChoice()).toMatchObject({ value: current })
    expect(await history()).toEqual(currentHistory)
    expect((await history()).map(place => place.id)).not.toContain(coarse.id)
  })

  it('does not replay a coarse selection over a newer refinement with the same runtime identity', async () => {
    const repo = createPrayerRepository()
    await setSetting('locationChoice', choice(precise))
    await setSetting('recentPlacesMigrated', true)
    await setSetting('placeSelectionOrder', 200)
    await setSetting('committedPlaceSelectionOrder', 200)
    const refinedHistory = [{ ...precise, id: 'gps:history:41.010000:28.950000' }]
    await setSetting('recentPlaces', refinedHistory)
    await repo.saveSettings({ locationChoice: choice(coarse), placeEvents: [{ change: 'selection', choice: choice(coarse),
      expectedPlaceId: other.id, selectionOrder: 100 }] })

    expect(await getLocationChoice()).toMatchObject({ value: choice(precise) })
    const restored = await history()
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ id: refinedHistory[0]?.id, latitude: precise.latitude,
      longitude: precise.longitude, accuracy: precise.accuracy, timestamp: precise.timestamp })
    expect(restored[0]?.timeZone).toBe(getDeviceTimeZone())
    expect(restored.map(place => place.id)).toEqual([refinedHistory[0]?.id])
  })

  it('keeps the committed order and history when identical and different older selections arrive late', async () => {
    const repo = createPrayerRepository()
    const committed = choice(other)
    await setSetting('locationChoice', committed)
    await setSetting('recentPlacesMigrated', true)
    await setSetting('placeSelectionOrder', 200)
    await setSetting('committedPlaceSelectionOrder', 200)
    const older = createOfficialPlace({ id: 'older-history', name: 'Older', latitude: 30, longitude: 10 }, 2)
    const committedHistory = [{ ...other, id: 'gps:history:committed' }, older]
    await setSetting('recentPlaces', committedHistory)

    await repo.saveSettings({ locationChoice: committed, placeEvents: [{ change: 'selection', choice: committed,
      expectedPlaceId: other.id, selectionOrder: 100 }] })
    const afterIdempotentReplay = await history()
    await repo.saveSettings({ locationChoice: committed, placeEvents: [{ change: 'selection', choice: committed,
      expectedPlaceId: other.id, selectionOrder: 200 }] })
    await repo.saveSettings({ locationChoice: choice(coarse), placeEvents: [{ change: 'selection', choice: choice(coarse),
      expectedPlaceId: other.id, selectionOrder: 150 }] })

    expect(await getLocationChoice()).toMatchObject({ value: committed })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 200 })
    expect(afterIdempotentReplay.map(place => place.id)).toEqual(committedHistory.map(place => place.id))
    expect(afterIdempotentReplay[0]).toMatchObject({ id: 'gps:history:committed', latitude: other.latitude,
      longitude: other.longitude, accuracy: other.accuracy, timestamp: other.timestamp, timeZone: getDeviceTimeZone(),
      automaticTimeZone: { id: getDeviceTimeZone(), source: 'device' } })
    expect(afterIdempotentReplay[1]).toEqual(older)
    expect(await history()).toEqual(afterIdempotentReplay)
  })

  it('does not let an uncommitted later reservation invalidate an earlier valid selection', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    await setSetting('placeSelectionOrder', 100)
    const earlierOrder = await tabA.reservePlaceSelectionOrder()
    expect(earlierOrder).toBe(101)
    const later = choice(other)
    const failedWriter = createSettingsPersistence(() => Promise.resolve(failure({ kind: 'storage', reason: 'unavailable' })),
      tabB.reservePlaceSelectionOrder, tabB.getCommittedPlaceSelectionOrder)
    failedWriter.save({ locationChoice: later, placeEvents: [{ change: 'selection', choice: later }] })
    await failedWriter.drain()
    expect(failedWriter.getStatus()).toBe('failed')
    expect(await getSetting('placeSelectionOrder')).toMatchObject({ value: 102 })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: undefined })

    const earlier = choice(coarse)
    await tabA.saveSettings({ locationChoice: earlier, placeEvents: [{ change: 'selection', choice: earlier,
      selectionOrder: earlierOrder }] })

    expect(await getLocationChoice()).toMatchObject({ value: earlier })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:41.010000:28.950000'])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 101 })
    expect(await getSetting('placeSelectionOrder')).toMatchObject({ value: 102 })
  })

  it('rejects an older selection after a higher reservation commits, without reducing the commit marker', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    await setSetting('placeSelectionOrder', 100)
    const olderOrder = await tabA.reservePlaceSelectionOrder()
    const newerOrder = await tabB.reservePlaceSelectionOrder()
    const newer = choice(other)
    await tabB.saveSettings({ locationChoice: newer, placeEvents: [{ change: 'selection', choice: newer,
      selectionOrder: newerOrder }] })
    const older = choice(coarse)
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    await tabA.saveSettings({ locationChoice: older, placeEvents: [{ change: 'selection', choice: older,
      selectionOrder: olderOrder }] }, undefined, value => { outcome = value })

    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: newer })
    expect(await getLocationChoice()).toMatchObject({ value: newer })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: newerOrder })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000'])
  })

  it('does not let a retried failed reservation overwrite a newer cross-tab selection', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const original = createOfficialPlace({ id: 'reservation-base', name: 'Base', latitude: 55, longitude: 49 }, 1)
    const originalChoice: LocationChoice = { mode: 'official', locationId: original.id, source: 'manual', place: original }
    await setSetting('locationChoice', originalChoice)
    let failReservation = true
    const reserveA = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return tabA.reservePlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    const writer = createSettingsPersistence((patch, isGenerationCurrent) => tabA.saveSettings(patch, isGenerationCurrent, value => { outcome = value }),
      reserveA, tabA.getCommittedPlaceSelectionOrder)
    const stale = choice(coarse)
    writer.save({ locationChoice: stale, placeEvents: [{ change: 'selection', choice: stale, expectedPlaceId: original.id }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')

    const winner = choice(other)
    const winnerOrder = await tabB.reservePlaceSelectionOrder()
    await tabB.saveSettings({ locationChoice: winner, placeEvents: [{ change: 'selection', choice: winner,
      expectedPlaceId: original.id, selectionOrder: winnerOrder }] })
    writer.retry()
    await writer.drain()

    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: winner })
    expect(await getLocationChoice()).toMatchObject({ value: winner })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000', original.id])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder })
  })

  it('does not promote a pre-startup intention after its reservation fails and another tab commits', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    let failReservation = true
    const reserveA = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return tabA.reservePlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    const writer = createSettingsPersistence((patch, isGenerationCurrent) =>
      tabA.saveSettings(patch, isGenerationCurrent, value => { outcome = value }), reserveA, tabA.getCommittedPlaceSelectionOrder)
    const stale = choice(coarse)
    writer.save({ locationChoice: stale, placeEvents: [{ change: 'selection', choice: stale }] })
    await writer.drain()

    const winner = choice(other)
    const winnerOrder = await tabB.reservePlaceSelectionOrder()
    await tabB.saveSettings({ locationChoice: winner, placeEvents: [{ change: 'selection', choice: winner,
      selectionOrder: winnerOrder }] })
    writer.retry()
    await writer.drain()

    expect(writer.getStatus()).toBe('failed')
    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: winner })
    expect(await getLocationChoice()).toMatchObject({ value: winner })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000'])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder })
  })

  it('rejects a retry when a competing commit follows the captured intent baseline', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const baselineRead = deferred()
    let beginBaselineRead!: () => void
    const baselineStarted = new Promise<void>(resolve => { beginBaselineRead = resolve })
    let failReservation = true
    const reserveA = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return tabA.reservePlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent) => {
      return tabA.saveSettings(patch, isGenerationCurrent, value => { outcome = value })
    }, reserveA, async () => {
      const capturedBaseline = tabA.getCommittedPlaceSelectionOrder()
      beginBaselineRead()
      await baselineRead.promise
      return capturedBaseline
    })
    const stale = choice(coarse)
    writer.save({ locationChoice: stale, placeEvents: [{ change: 'selection', choice: stale }] })
    await baselineStarted

    const winner = choice(other)
    const winnerOrder = await tabB.reservePlaceSelectionOrder()
    await tabB.saveSettings({ locationChoice: winner, placeEvents: [{ change: 'selection', choice: winner,
      selectionOrder: winnerOrder }] })
    baselineRead.resolve()
    await writer.drain()
    writer.retry()
    await writer.drain()

    expect(writer.getStatus()).toBe('failed')
    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: winner })
    expect(await getLocationChoice()).toMatchObject({ value: winner })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000'])
  })

  it('accepts a retried pre-startup selection when an existing committed place is unchanged', async () => {
    const repo = createPrayerRepository()
    const previous = createOfficialPlace({ id: 'retry-previous', name: 'Previous', latitude: 52, longitude: 13 }, 50)
    const previousChoice: LocationChoice = { mode: 'official', locationId: previous.id, source: 'manual', place: previous }
    await setSetting('locationChoice', previousChoice)
    await setSetting('recentPlaces', [previous])
    await setSetting('recentPlacesMigrated', true)
    await setSetting('committedPlaceSelectionOrder', 50)
    await setSetting('placeSelectionOrder', 50)

    let failReservation = true
    const reserve = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return repo.reservePlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent) =>
      repo.saveSettings(patch, isGenerationCurrent, value => { outcome = value }), reserve, repo.getCommittedPlaceSelectionOrder)
    const selected = choice(coarse)
    writer.save({ locationChoice: selected, placeEvents: [{ change: 'selection', choice: selected }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')

    writer.retry()
    await writer.drain()

    expect(writer.getStatus()).toBe('saved')
    expect(outcome).toEqual({ selectionAccepted: true, locationChoice: selected })
    expect(await getLocationChoice()).toMatchObject({ value: selected })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 51 })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:41.010000:28.950000', previous.id])
  })

  it('rejects a retried pre-startup selection if an existing place changes after the intent baseline', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const previous = createOfficialPlace({ id: 'retry-previous-remote', name: 'Previous', latitude: 52, longitude: 13 }, 50)
    const previousChoice: LocationChoice = { mode: 'official', locationId: previous.id, source: 'manual', place: previous }
    await setSetting('locationChoice', previousChoice)
    await setSetting('recentPlaces', [previous])
    await setSetting('recentPlacesMigrated', true)
    await setSetting('committedPlaceSelectionOrder', 50)
    await setSetting('placeSelectionOrder', 50)

    let failReservation = true
    const reserve = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return tabA.reservePlaceSelectionOrder()
    }
    const baselineStarted = deferred()
    const baselineRead = deferred()
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent) =>
      tabA.saveSettings(patch, isGenerationCurrent, value => { outcome = value }), reserve, async () => {
      const capturedBaseline = tabA.getCommittedPlaceSelectionOrder()
      baselineStarted.resolve()
      await baselineRead.promise
      return capturedBaseline
    })
    const stale = choice(coarse)
    writer.save({ locationChoice: stale, placeEvents: [{ change: 'selection', choice: stale }] })
    await baselineStarted.promise

    const winner = choice(other)
    const winnerOrder = await tabB.reservePlaceSelectionOrder()
    await tabB.saveSettings({ locationChoice: winner, placeEvents: [{ change: 'selection', choice: winner, selectionOrder: winnerOrder }] })
    baselineRead.resolve()
    await writer.drain()
    writer.retry()
    await writer.drain()

    expect(writer.getStatus()).toBe('failed')
    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: winner })
    expect(await getLocationChoice()).toMatchObject({ value: winner })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000', previous.id])
  })

  it('keeps distinct baselines for queued intentions that straddle a competing selection', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const previous = createOfficialPlace({ id: 'queued-previous', name: 'Previous', latitude: 52, longitude: 13 }, 50)
    const previousChoice: LocationChoice = { mode: 'official', locationId: previous.id, source: 'manual', place: previous }
    await setSetting('locationChoice', previousChoice)
    await setSetting('recentPlaces', [previous])
    await setSetting('recentPlacesMigrated', true)
    await setSetting('committedPlaceSelectionOrder', 50)
    await setSetting('placeSelectionOrder', 50)

    let resolveFirstBaseline!: (value: number | undefined) => void
    const firstBaseline = new Promise<number | undefined>(resolve => { resolveFirstBaseline = resolve })
    let baselineReads = 0
    let failReservation = true
    const reserve = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return tabA.reservePlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    let persistedPatch: SettingsPatch | undefined
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent) => {
      persistedPatch = patch
      return tabA.saveSettings(patch, isGenerationCurrent, value => { outcome = value })
    }, reserve, () => {
      if (++baselineReads === 1) return firstBaseline
      return tabA.getCommittedPlaceSelectionOrder()
    })

    const stale = choice({ ...coarse, id: 'gps:operation:stale-intention', latitude: 20, longitude: 20, timestamp: 150 })
    writer.save({ locationChoice: stale, placeEvents: [{ change: 'selection', choice: stale }] })
    const winner = choice(other)
    const winnerOrder = await tabB.reservePlaceSelectionOrder()
    expect(winnerOrder).toBe(51)
    await tabB.saveSettings({ locationChoice: winner, placeEvents: [{ change: 'selection', choice: winner, selectionOrder: winnerOrder }] })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder })
    const later = choice({ ...coarse, id: 'gps:operation:later-intention', timestamp: 300 })
    writer.save({ locationChoice: later, placeEvents: [{ change: 'selection', choice: later }] })
    resolveFirstBaseline(50)
    await writer.drain()

    writer.retry()
    await writer.drain()

    expect(outcome).toEqual({ selectionAccepted: true, locationChoice: later })
    expect(await getLocationChoice()).toMatchObject({ value: later })
    expect(persistedPatch?.placeEvents?.map(event => event.selectionReservationRetried)).toEqual([true, true])
    expect(persistedPatch?.placeEvents?.map(event => event.selectionReservationBaseline)).toEqual([50, winnerOrder])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder + 2 })
    expect((await history()).map(place => place.id)).toEqual([
      'gps:history:41.010000:28.950000', 'gps:history:48.000000:20.000000', previous.id,
    ])
  })

  it('keeps a selection failed when its intent baseline cannot be read, then accepts a fresh intent after recovery', async () => {
    const repo = createPrayerRepository()
    let failBaseline = true
    const readBaseline = async () => {
      if (failBaseline) throw new Error('temporary baseline failure')
      return repo.getCommittedPlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    let attemptedPatch: SettingsPatch | undefined
    const writer = createSettingsPersistence(async (patch, isGenerationCurrent) => {
      attemptedPatch = patch
      return repo.saveSettings(patch, isGenerationCurrent, value => { outcome = value })
    }, repo.reservePlaceSelectionOrder, readBaseline)
    const first = choice(coarse)
    writer.save({ locationChoice: first, placeEvents: [{ change: 'selection', choice: first }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    expect(await getLocationChoice()).toMatchObject({ value: undefined })
    expect(await history()).toEqual([])

    writer.retry()
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    expect(outcome).toBeUndefined()
    expect(await getLocationChoice()).toMatchObject({ value: undefined })

    failBaseline = false
    const fresh = choice(other)
    writer.save({ locationChoice: fresh, placeEvents: [{ change: 'selection', choice: fresh }] })
    await writer.drain()
    expect(attemptedPatch?.placeEvents).toEqual(expect.arrayContaining([expect.objectContaining({ choice: fresh,
      selectionReservationBaseline: null })]))
    expect(outcome).toEqual({ selectionAccepted: true, locationChoice: fresh })
    expect(writer.getStatus()).toBe('saved')
    expect(await getLocationChoice()).toMatchObject({ value: fresh })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000'])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 1 })
  })

  it('does not promote any queued intentions after their shared reservation chain fails and another tab commits', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    let failReservation = true
    let reserveCalls = 0
    const reserveA = async () => {
      reserveCalls += 1
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return tabA.reservePlaceSelectionOrder()
    }
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    let writtenPatch: SettingsPatch | undefined
    const writer = createSettingsPersistence((patch, isGenerationCurrent) => {
      writtenPatch = patch
      return tabA.saveSettings(patch, isGenerationCurrent, value => { outcome = value })
    }, reserveA, tabA.getCommittedPlaceSelectionOrder)
    const staleFirst = choice(coarse)
    const staleSecond = choice({ ...other, id: 'gps:operation:queued-stale' })
    writer.save({ locationChoice: staleFirst, placeEvents: [{ change: 'selection', choice: staleFirst }] })
    writer.save({ locationChoice: staleSecond, placeEvents: [{ change: 'selection', choice: staleSecond }] })
    await writer.drain()

    const winner = choice({ ...precise, id: 'gps:operation:remote-winner' })
    const winnerOrder = await tabB.reservePlaceSelectionOrder()
    await tabB.saveSettings({ locationChoice: winner, placeEvents: [{ change: 'selection', choice: winner,
      selectionOrder: winnerOrder }] })
    writer.retry()
    await writer.drain()

    expect(writer.getStatus()).toBe('failed')
    expect(reserveCalls).toBe(3)
    expect(writtenPatch?.placeEvents).toHaveLength(2)
    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: winner })
    expect(await getLocationChoice()).toMatchObject({ value: winner })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:41.030000:28.950000'])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: winnerOrder })
  })

  it('retries after a reservation failure without a competing commit, then accepts a genuinely new intention', async () => {
    const repo = createPrayerRepository()
    let failReservation = true
    const reserve = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return repo.reservePlaceSelectionOrder()
    }
    const writer = createSettingsPersistence(repo.saveSettings, reserve, repo.getCommittedPlaceSelectionOrder)
    const first = choice(coarse)
    writer.save({ locationChoice: first, placeEvents: [{ change: 'selection', choice: first }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    expect(await getLocationChoice()).toMatchObject({ value: undefined })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: undefined })
    expect(await history()).toEqual([])

    writer.retry()
    await writer.drain()
    expect(await getLocationChoice()).toMatchObject({ value: first })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:41.010000:28.950000'])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 1 })

    const next = choice(other)
    writer.save({ locationChoice: next, placeEvents: [{ change: 'selection', choice: next }] })
    await writer.drain()
    expect(await getLocationChoice()).toMatchObject({ value: next })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000', 'gps:history:41.010000:28.950000'])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 2 })
  })

  it('preserves queued same-tab intention order when a failed reservation is retried without competition', async () => {
    const repo = createPrayerRepository()
    let failReservation = true
    const reserve = async () => {
      if (failReservation) { failReservation = false; throw new Error('temporary reservation failure') }
      return repo.reservePlaceSelectionOrder()
    }
    const writer = createSettingsPersistence(repo.saveSettings, reserve, repo.getCommittedPlaceSelectionOrder)
    const first = choice(coarse)
    const second = choice(other)
    writer.save({ locationChoice: first, placeEvents: [{ change: 'selection', choice: first }] })
    writer.save({ locationChoice: second, placeEvents: [{ change: 'selection', choice: second }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')

    writer.retry()
    await writer.drain()

    expect(await getLocationChoice()).toMatchObject({ value: second })
    expect((await history()).map(place => place.id)).toEqual([
      'gps:history:48.000000:20.000000', 'gps:history:41.010000:28.950000',
    ])
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 2 })
  })

  it('allocates wall-clock-independent selection orders across tabs and preserves rapid ordered selections', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    await setSetting('placeSelectionOrder', 900)
    const firstOrder = await tabA.reservePlaceSelectionOrder()
    const secondOrder = await tabA.reservePlaceSelectionOrder()
    const thirdOrder = await tabB.reservePlaceSelectionOrder()
    expect([firstOrder, secondOrder, thirdOrder]).toEqual([901, 902, 903])

    const writer = createSettingsPersistence(tabA.saveSettings, tabA.reservePlaceSelectionOrder, tabA.getCommittedPlaceSelectionOrder)
    const initial = createOfficialPlace({ id: 'order-initial', name: 'Initial', latitude: 53, longitude: 40 }, 1)
    await setSetting('locationChoice', { mode: 'official', locationId: initial.id, source: 'manual', place: initial })
    writer.save({ placeEvents: [{ change: 'selection', choice: choice(coarse), expectedPlaceId: initial.id }] })
    writer.save({ placeEvents: [{ change: 'selection', choice: choice(other), expectedPlaceId: initial.id }] })
    await writer.drain()

    expect(await getLocationChoice()).toMatchObject({ value: choice(other) })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000',
      'gps:history:41.010000:28.950000', initial.id])
    expect(await getSetting('placeSelectionOrder')).toMatchObject({ value: 905 })
  })

  it('keeps logical order increasing across a simulated system-clock rollback and retries the same reserved selection', async () => {
    const repo = createPrayerRepository()
    await setSetting('placeSelectionOrder', 2_000_000_000_000.5)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000)
    const firstOrder = await repo.reservePlaceSelectionOrder()
    clock.mockReturnValue(1)
    const secondOrder = await createPrayerRepository().reservePlaceSelectionOrder()
    expect(firstOrder).toBe(2_000_000_000_001)
    expect(secondOrder).toBe(firstOrder + 1)

    const selected = choice(coarse)
    let fail = true
    const writer = createSettingsPersistence(async (patch, isCurrent) => {
      if (fail) {
        fail = false
        return failure({ kind: 'storage', reason: 'unavailable' })
      }
      return repo.saveSettings(patch, isCurrent)
    }, repo.reservePlaceSelectionOrder, repo.getCommittedPlaceSelectionOrder)
    writer.save({ locationChoice: selected, placeEvents: [{ change: 'selection', choice: selected }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')
    expect(await getLocationChoice()).toMatchObject({ value: undefined })
    const reservedOrder = await getSetting('placeSelectionOrder')
    writer.retry()
    await writer.drain()

    expect(await getLocationChoice()).toMatchObject({ value: selected })
    expect(await getSetting('placeSelectionOrder')).toEqual(reservedOrder)
    expect(await history()).toHaveLength(1)
  })

  it('retries a failed order reservation without blocking later settings writes', async () => {
    const repo = createPrayerRepository()
    let failReservation = true
    const reserve = async () => {
      if (failReservation) {
        failReservation = false
        throw new Error('temporary storage failure')
      }
      return repo.reservePlaceSelectionOrder()
    }
    const writer = createSettingsPersistence(repo.saveSettings, reserve, repo.getCommittedPlaceSelectionOrder)
    const selected = choice(coarse)
    writer.save({ locationChoice: selected, placeEvents: [{ change: 'selection', choice: selected }] })
    await writer.drain()
    expect(writer.getStatus()).toBe('failed')

    writer.retry()
    await writer.drain()
    expect(await getLocationChoice()).toMatchObject({ value: selected })
    expect(writer.getStatus()).toBe('saved')

    const fresh = choice(other)
    writer.save({ locationChoice: fresh, placeEvents: [{ change: 'selection', choice: fresh }] })
    await writer.drain()
    expect(await getLocationChoice()).toMatchObject({ value: fresh })
    expect(writer.getStatus()).toBe('saved')
  })

  it('reserves and persists an early selection after reset before startup initialization resolves', async () => {
    await clearAppData()
    const repo = createPrayerRepository()
    const selected = choice(coarse)
    const writer = createSettingsPersistence(repo.saveSettings, repo.reservePlaceSelectionOrder, repo.getCommittedPlaceSelectionOrder)
    writer.save({ locationChoice: selected, placeEvents: [{ change: 'selection', choice: selected }] })
    await writer.drain()

    expect(await getLocationChoice()).toMatchObject({ value: selected })
    expect(await getSetting('placeSelectionOrder')).toMatchObject({ value: 1 })
    expect(await history()).toHaveLength(1)
  })

  it('rejects an obsolete pre-startup selection after another tab commits, while migrating legacy history once', async () => {
    const tabA = createPrayerRepository()
    const tabB = createPrayerRepository()
    const original = createOfficialPlace({ id: 'legacy-current', name: 'Legacy current', latitude: 55, longitude: 49 }, 10)
    const originalChoice: LocationChoice = { mode: 'official', locationId: 'legacy-current', source: 'manual', place: original }
    const legacy = Array.from({ length: 10 }, (_, index) => index === 3 ? original
      : createOfficialPlace({ id: `legacy-${index}`, name: `Legacy ${index}`, latitude: 30 + index, longitude: 20 + index }, index))
    await setSetting('locationChoice', originalChoice)
    await setSetting('recentPlaces', legacy)
    await setSetting('recentPlacesMigrated', false)

    const obsolete = choice(coarse)
    let outcome: { selectionAccepted: boolean; locationChoice: LocationChoice | null } | undefined
    const allowObsoleteWrite = deferred()
    const obsoleteWrite = allowObsoleteWrite.promise.then(() => tabA.saveSettings({ locationChoice: obsolete,
      placeEvents: [{ change: 'selection', choice: obsolete, selectionOrder: 100 }] }, undefined, value => { outcome = value }))
    const winner = createOfficialPlace({ id: 'newer-tab', name: 'Newer tab', latitude: 60, longitude: 40 }, 20)
    const winnerChoice: LocationChoice = { mode: 'official', locationId: 'newer-tab', source: 'manual', place: winner }
    await tabB.saveSettings({ locationChoice: winnerChoice, placeEvents: [{ change: 'selection', choice: winnerChoice,
      expectedPlaceId: original.id, selectionOrder: 200 }] })
    allowObsoleteWrite.resolve()
    await obsoleteWrite

    expect(outcome).toEqual({ selectionAccepted: false, locationChoice: winnerChoice })
    expect(await getLocationChoice()).toMatchObject({ value: winnerChoice })
    const migrated = await history()
    expect(migrated.map(place => place.id)).toEqual([winner.id, original.id, ...legacy.filter(place => place.id !== original.id).slice(0, 8).map(place => place.id)])
    expect(migrated).toHaveLength(10)
    expect(migrated.filter(place => place.id === original.id)).toHaveLength(1)
    expect(await getSetting('recentPlacesMigrated')).toMatchObject({ value: true })
    expect(await getSetting('committedPlaceSelectionOrder')).toMatchObject({ value: 200 })

    const restarted = createPrayerRepository()
    expect(await restarted.initialize()).toMatchObject({ ok: true, value: { locationChoice: winnerChoice } })
    expect(await getLocationChoice()).toMatchObject({ value: winnerChoice })
    expect(await history()).toEqual(migrated)
  })

  it('applies the newer cross-tab intent when the older transaction happens to commit first', async () => {
    const original = createOfficialPlace({ id: 'original', name: 'Original', latitude: 55, longitude: 49 }, 1)
    const originalChoice: LocationChoice = { mode: 'official', locationId: 'original', source: 'manual', place: original }
    await setSetting('locationChoice', originalChoice)
    const first = choice(coarse)
    const second = choice(other)
    await createPrayerRepository().saveSettings({ locationChoice: first,
      placeEvents: [{ change: 'selection', choice: first, expectedPlaceId: original.id, selectionOrder: 100 }] })
    await createPrayerRepository().saveSettings({ locationChoice: second,
      placeEvents: [{ change: 'selection', choice: second, expectedPlaceId: original.id, selectionOrder: 200 }] })

    expect(await getLocationChoice()).toMatchObject({ value: second })
    expect((await history()).map(place => place.id)).toEqual(['gps:history:48.000000:20.000000',
      'gps:history:41.010000:28.950000', original.id])
  })

  it('does not replay an uncommitted coarse selection over a newer tab selection while saving its refinement', async () => {
    const repo = createPrayerRepository()
    const original = createOfficialPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }, 1)
    await setSetting('locationChoice', { mode: 'official', locationId: 'kazan', source: 'manual', place: original })
    await repo.saveSettings({ ...event('selection', other, original.id), placeEvents: [{ change: 'selection', choice: choice(other),
      expectedPlaceId: original.id, selectionOrder: 200 }] })
    const before = await history()
    const selected = choice(coarse)
    await repo.saveSettings({ locationChoice: choice(precise), placeEvents: [
      { change: 'selection', choice: selected, expectedPlaceId: original.id, selectionOrder: 100 },
      { change: 'refinement', choice: choice(precise), expectedPlaceId: coarse.id },
    ] })
    expect(await getLocationChoice()).toMatchObject({ value: { place: other } })
    expect(await history()).toEqual(before)
  })

  it('normalizes the latest storage instead of persisting a stale hydration snapshot', async () => {
    const repo = createPrayerRepository()
    await repo.saveSettings(event('selection', coarse))
    const stale = await history()
    await repo.saveSettings(event('selection', other, coarse.id))
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
    await repo.saveSettings(event('selection', returned, coarse.id))
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
    await createPrayerRepository().saveSettings(event('selection', other, coarse.id))
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
    await repo.saveSettings(event('selection', other, coarse.id))
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
