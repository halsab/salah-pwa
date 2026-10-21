const LOCK_NAME = 'salah-foreground-execution-v1'
const CHANNEL_NAME = 'salah-execution-gate-v1'
let quiescence: Promise<void> = Promise.resolve()

export function setExecutionQuiescence(promise: Promise<unknown>) {
  quiescence = promise.then(() => undefined, () => undefined)
}
export function waitForExecutionQuiescence() { return quiescence }

type Message = { version: 1; type: 'takeover'; requestId: string }

export type ExecutionGate = {
  supported: boolean
  start: () => Promise<boolean>
  requestOwnership: () => Promise<boolean>
  close: () => void
  relinquish: () => Promise<void>
  onTakeover: (callback: () => Promise<void>) => void
}

export function createExecutionGate(): ExecutionGate {
  const locks = (navigator as Omit<Navigator, 'locks'> & { locks?: LockManager }).locks
  let channel: BroadcastChannel | null = null
  try {
    if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    // Ошибка создания канала переводит вкладку в безопасный режим блокировки.
  }
  let held = false
  let stopped = false
  let pending: Promise<boolean> | null = null
  let releaseLock: (() => void) | null = null
  let deactivate: () => Promise<void> = async () => { await quiescence }
  let takeover: Promise<void> | null = null
  const contextId = crypto.randomUUID()

  const acquire = () => {
    if (stopped || !locks || !channel) return Promise.resolve(false)
    if (pending) return pending
    pending = new Promise<boolean>(resolve => {
      let settled = false
      const settle = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
      void Promise.resolve().then(() => locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) { settle(false); return }
        held = true
        settle(true)
        await new Promise<void>(done => { releaseLock = done })
        held = false
        releaseLock = null
      })).catch(() => settle(false)).finally(() => { pending = null })
    })
    return pending
  }

  if (channel) channel.onmessage = event => {
    const message = event.data as Partial<Message>
    if (!held || message.version !== 1 || message.type !== 'takeover' || takeover) return
    const release = releaseLock
    takeover = (async () => {
      await deactivate()
      release?.()
    })().finally(() => { takeover = null })
  }

  return {
    supported: Boolean(locks && channel),
    start: () => acquire(),
    requestOwnership: async () => {
      if (held) return true
      if (!locks || !channel) return false
      const acquired = await acquire()
      if (acquired) return true
      channel.postMessage({ version: 1, type: 'takeover', requestId: `${contextId}:${crypto.randomUUID()}` } satisfies Message)
      return new Promise(resolve => {
        let finished = false
        const attempt = async () => {
          if (finished || stopped) return
          if (await acquire()) { finished = true; clearInterval(timer); resolve(true) }
        }
        const timer = window.setInterval(() => { void attempt() }, 200)
        window.setTimeout(() => { if (!finished) { finished = true; clearInterval(timer); resolve(false) } }, 15000)
      })
    },
    close: () => { stopped = true; releaseLock?.(); channel?.close() },
    relinquish: async () => { await deactivate(); if (held) releaseLock?.() },
    onTakeover: callback => { deactivate = callback },
  }
}
