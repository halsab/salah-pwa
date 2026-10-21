import type { Result } from '../../domain/result'
import type { PlacePersistenceEvent, SettingsPatch } from '../../storage/database'

export type PersistenceStatus = 'idle' | 'saving' | 'saved' | 'failed'
export type SaveSettings = (
  patch: SettingsPatch,
  isGenerationCurrent: () => boolean,
  isLatest: () => boolean,
  isLocationCurrent: () => boolean,
) => Promise<Result<void, unknown>>

export function createSettingsPersistence(write: SaveSettings, reserveSelectionOrder?: () => Promise<number>,
  readCommittedSelectionOrder?: () => Promise<number | undefined>) {
  let latest: SettingsPatch = {}
  let revision = 0
  let locationRevision = 0
  let epoch = 0
  let queue = Promise.resolve()
  let reservationQueue = Promise.resolve()
  let reservationFailed = false
  let fallbackSelectionOrder = 0
  const scheduledEvents = new Set<PlacePersistenceEvent>()
  let status: PersistenceStatus = 'idle'
  const listeners = new Set<() => void>()
  const notify = (next: PersistenceStatus) => { status = next; for (const listener of listeners) listener() }
  const discardPending = () => { epoch += 1; revision += 1; latest = {} }
  const reservePendingEvents = () => {
    if (reservationFailed) {
      reservationQueue = Promise.resolve()
      reservationFailed = false
    }
    for (const event of latest.placeEvents ?? []) {
      if (event.change !== 'selection' || event.selectionOrder !== undefined || scheduledEvents.has(event)) continue
      scheduledEvents.add(event)
      reservationQueue = reservationQueue.then(async () => {
        let reservingEvent = event
        try {
          if (!latest.placeEvents?.includes(reservingEvent)) return
          if (reservingEvent.selectionReservationRetried && reservingEvent.selectionReservationBaseline === 'unavailable') {
            if (!readCommittedSelectionOrder) throw new Error('Committed selection order is unavailable')
            const baseline = (await readCommittedSelectionOrder()) ?? null
            const rebasedEvent = { ...reservingEvent, selectionReservationBaseline: baseline }
            latest = { ...latest, placeEvents: (latest.placeEvents ?? []).map(current => current === reservingEvent ? rebasedEvent : current) }
            reservingEvent = rebasedEvent
          }
          if (!latest.placeEvents?.includes(reservingEvent)) return
          const order = reserveSelectionOrder ? await reserveSelectionOrder() : ++fallbackSelectionOrder
          const ordered = { ...reservingEvent, selectionOrder: order }
          latest = { ...latest, placeEvents: (latest.placeEvents ?? []).map(current => current === reservingEvent ? ordered : current) }
        } catch (error) {
          reservationFailed = true
          let baseline: number | null | 'unavailable' | undefined
          if (readCommittedSelectionOrder) {
            try { baseline = (await readCommittedSelectionOrder()) ?? null }
            catch { baseline = 'unavailable' }
          }
          scheduledEvents.clear()
          if (latest.placeEvents?.includes(reservingEvent)) {
            latest = { ...latest, placeEvents: (latest.placeEvents ?? []).map(current =>
              current.change === 'selection' && current.selectionOrder === undefined
                ? { ...current, selectionReservationRetried: true,
                  ...(baseline !== undefined ? { selectionReservationBaseline: baseline } : {}) }
                : current) }
          }
          throw error
        } finally {
          scheduledEvents.delete(event)
        }
      })
    }
  }
  const save = (patch: SettingsPatch) => {
    const previousEvents = latest.placeEvents ?? []
    latest = { ...latest, ...patch }
    if (patch.placeEvents?.length) {
      latest.placeEvents = [...previousEvents, ...patch.placeEvents]
    }
    reservePendingEvents()
    const operation = ++revision
    const generation = epoch
    if (patch.locationChoice || patch.sourcePreferences || patch.placeEvents?.length) locationRevision += 1
    const locationOperation = locationRevision
    const isGenerationCurrent = () => generation === epoch
    const isLatest = () => isGenerationCurrent() && operation === revision
    const isLocationCurrent = () => isGenerationCurrent() && locationOperation === locationRevision
    notify('saving')
    // Каждый снимок включает все изменённые поля: новая настройка не теряет ранее несохранённое место.
    queue = queue.then(async () => {
      await reservationQueue.catch(() => undefined)
      if (!isLatest()) return
      if (reservationFailed || latest.placeEvents?.some(event => event.change === 'selection' && event.selectionOrder === undefined)) {
        notify('failed')
        return
      }
      const snapshot = latest
      try {
        const result = await write(snapshot, isGenerationCurrent, isLatest, isLocationCurrent)
        if (result.ok && generation === epoch) {
          // Успешная транзакция могла завершиться до нового save, а её Promise — позже.
          // Не воспроизводим уже сохранённые события поверх новой вкладки или refinement.
          const remaining: SettingsPatch = Object.fromEntries(Object.entries(latest)
            .filter(([key, value]) => snapshot[key as keyof SettingsPatch] !== value))
          if (remaining.placeEvents && snapshot.placeEvents) {
            remaining.placeEvents = remaining.placeEvents.filter(event => !snapshot.placeEvents?.includes(event))
          }
          latest = remaining
        }
        if (isLatest()) {
          notify(result.ok ? 'saved' : 'failed')
        }
      } catch {
        if (isLatest()) notify('failed')
      }
    })
  }
  return {
    save,
    retry: () => save({}),
    rebase: () => { discardPending(); notify('idle') },
    getStatus: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    drain: async () => { let current; do { current = queue; await current } while (current !== queue) },
    invalidateAndDrain: async () => { discardPending(); await queue; notify('idle') },
  }
}
