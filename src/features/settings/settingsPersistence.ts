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
  const newReservations = () => ({
    queue: Promise.resolve(),
    failed: false,
    previousOrder: undefined as number | undefined,
    scheduled: new Set<PlacePersistenceEvent>(),
    baselines: new Map<PlacePersistenceEvent, Promise<number | null | 'unavailable'>>(),
  })
  let reservations = newReservations()
  let fallbackSelectionOrder = 0
  let status: PersistenceStatus = 'idle'
  const listeners = new Set<() => void>()
  const notify = (next: PersistenceStatus) => { status = next; for (const listener of listeners) listener() }
  const discardPending = () => {
    epoch += 1
    revision += 1
    latest = {}
    reservations = newReservations()
  }
  const reservePendingEvents = () => {
    const state = reservations
    const isCurrent = () => state === reservations
    if (state.failed) {
      state.queue = Promise.resolve()
      state.failed = false
      state.scheduled.clear()
    }
    for (const event of latest.placeEvents ?? []) {
      if (event.change !== 'selection' || event.selectionOrder !== undefined || state.scheduled.has(event)) continue
      state.scheduled.add(event)
      state.queue = state.queue.then(async () => {
        let pending = event
        const stillPending = () => isCurrent() && Boolean(latest.placeEvents?.includes(pending))
        const replace = (updated: PlacePersistenceEvent) => {
          latest = { ...latest, placeEvents: (latest.placeEvents ?? []).map(current => current === pending ? updated : current) }
          pending = updated
        }
        try {
          if (!stillPending()) return
          if (pending.selectionReservationBaseline === undefined) {
            const baseline = await (state.baselines.get(event) ?? Promise.resolve('unavailable' as const))
            if (!stillPending()) return
            state.baselines.delete(event)
            replace({ ...pending, selectionReservationBaseline: baseline })
            if (baseline === 'unavailable') throw new Error('The original selection baseline is unavailable')
          } else if (pending.selectionReservationBaseline === 'unavailable') {
            if (!readCommittedSelectionOrder) throw new Error('Committed selection order is unavailable')
            const baseline = (await readCommittedSelectionOrder()) ?? null
            if (!stillPending()) return
            // Неизвестное исходное намерение восстанавливается только до первого committed-выбора.
            if (baseline !== null) throw new Error('The original selection baseline is unknown')
            replace({ ...pending, selectionReservationBaseline: baseline })
          }
          const order = reserveSelectionOrder ? await reserveSelectionOrder() : ++fallbackSelectionOrder
          if (!stillPending()) return
          replace({ ...pending, selectionOrder: order,
            ...(state.previousOrder !== undefined ? { selectionPredecessorOrder: state.previousOrder } : {}) })
          state.previousOrder = order
        } catch (error) {
          if (!stillPending()) return
          state.failed = true
          // Отклонённая цепочка не возобновляется, даже если новый save уже начал retry.
          throw error
        } finally {
          state.scheduled.delete(event)
        }
      })
      void state.queue.catch(() => undefined)
    }
  }
  const save = (patch: SettingsPatch) => {
    let previousEvents = latest.placeEvents ?? []
    if (reservations.failed && patch.placeEvents?.some(event => event.change === 'selection')) {
      for (const event of previousEvents) {
        if (event.change === 'selection' && event.selectionOrder === undefined) reservations.baselines.delete(event)
      }
      previousEvents = previousEvents.filter(event => event.change !== 'selection' || event.selectionOrder !== undefined)
    }
    latest = { ...latest, ...patch }
    if (patch.placeEvents?.length) {
      latest.placeEvents = [...previousEvents, ...patch.placeEvents]
      for (const event of patch.placeEvents) {
        if (event.change !== 'selection' || event.selectionOrder !== undefined || event.selectionReservationBaseline !== undefined) continue
        try {
          const baseline = readCommittedSelectionOrder?.()
          reservations.baselines.set(event, baseline
            ? baseline.then(value => value ?? null).catch(() => 'unavailable')
            : Promise.resolve('unavailable'))
        } catch {
          reservations.baselines.set(event, Promise.resolve('unavailable'))
        }
      }
    }
    reservePendingEvents()
    const reservationState = reservations
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
      await reservationState.queue.catch(() => undefined)
      if (!isLatest()) return
      if (reservationState.failed || latest.placeEvents?.some(event => event.change === 'selection' && event.selectionOrder === undefined)) {
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
    invalidateAndDrain: async () => {
      discardPending()
      const generation = epoch
      await queue
      if (generation === epoch && !Object.keys(latest).length) notify('idle')
    },
  }
}
