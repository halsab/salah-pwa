const RELOAD_TIMESTAMP_KEY = 'salah:service-worker-reload-at'
const DEFAULT_GUARD_WINDOW_MS = 10_000

type ReloadTimestampStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface ServiceWorkerReloadMemory {
  lastReloadAt?: number
}

interface ServiceWorkerReloadGuardOptions {
  reload?: () => void
  now?: () => number
  storage?: ReloadTimestampStorage
  memory?: ServiceWorkerReloadMemory
  guardWindowMs?: number
}

const pageMemory: ServiceWorkerReloadMemory = {}

function defaultStorage(): ReloadTimestampStorage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

function readTimestamp(
  storage: ReloadTimestampStorage | undefined,
): number | undefined {
  try {
    const value = storage?.getItem(RELOAD_TIMESTAMP_KEY)
    if (value === null || value === undefined) return undefined
    const timestamp = Number(value)
    return Number.isFinite(timestamp) ? timestamp : undefined
  } catch {
    return undefined
  }
}

function writeTimestamp(
  storage: ReloadTimestampStorage | undefined,
  timestamp: number,
): void {
  try {
    storage?.setItem(RELOAD_TIMESTAMP_KEY, String(timestamp))
  } catch {
    // In-memory защита остаётся активной, даже если storage запрещён браузером.
  }
}

function isWithinWindow(
  timestamp: number | undefined,
  now: number,
  guardWindowMs: number,
): boolean {
  return timestamp !== undefined
    && timestamp <= now
    && now - timestamp < guardWindowMs
}

export function createServiceWorkerReloadGuard(
  options: ServiceWorkerReloadGuardOptions = {},
): () => void {
  const reload = options.reload ?? (() => globalThis.location.reload())
  const now = options.now ?? Date.now
  const storage = options.storage ?? defaultStorage()
  const memory = options.memory ?? pageMemory
  const guardWindowMs = options.guardWindowMs ?? DEFAULT_GUARD_WINDOW_MS

  return () => {
    const timestamp = now()
    if (isWithinWindow(memory.lastReloadAt, timestamp, guardWindowMs)) return

    const storedTimestamp = readTimestamp(storage)
    if (
      storedTimestamp !== undefined
      && isWithinWindow(storedTimestamp, timestamp, guardWindowMs)
    ) {
      memory.lastReloadAt = storedTimestamp
      return
    }

    memory.lastReloadAt = timestamp
    writeTimestamp(storage, timestamp)
    reload()
  }
}
