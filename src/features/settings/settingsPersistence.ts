import type { Result } from '../../domain/result'
import type { SettingsPatch } from '../../storage/database'

export type PersistenceStatus = 'idle' | 'saving' | 'saved' | 'failed'
export type SaveSettings = (patch: SettingsPatch, isCurrent: () => boolean) => Promise<Result<void, unknown>>

export function createSettingsPersistence(write: SaveSettings) {
  let latest: SettingsPatch = {}
  let revision = 0
  let epoch = 0
  let queue = Promise.resolve()
  let status: PersistenceStatus = 'idle'
  const listeners = new Set<() => void>()
  const notify = (next: PersistenceStatus) => { status = next; for (const listener of listeners) listener() }
  const save = (patch: SettingsPatch) => {
    latest = { ...latest, ...patch }
    const snapshot = latest
    const operation = ++revision
    const generation = epoch
    const isCurrent = () => generation === epoch && operation === revision
    notify('saving')
    // Каждый снимок включает все изменённые поля: новая настройка не теряет ранее несохранённое место.
    queue = queue.then(async () => {
      if (!isCurrent()) return
      try {
        const result = await write(snapshot, isCurrent)
        if (isCurrent()) notify(result.ok ? 'saved' : 'failed')
      } catch {
        if (isCurrent()) notify('failed')
      }
    })
  }
  return {
    save,
    retry: () => save({}),
    getStatus: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    drain: async () => { let current; do { current = queue; await current } while (current !== queue) },
    invalidateAndDrain: async () => { epoch += 1; latest = {}; await queue; notify('idle') },
  }
}
