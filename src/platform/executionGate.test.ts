import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExecutionGate, setExecutionQuiescence } from './executionGate'

class FakeLockManager {
  held = false
  requests = 0

  async request(_name: string, _options: LockOptions, callback: (lock: Lock | null) => Promise<void>) {
    this.requests += 1
    if (this.held) return callback(null)
    this.held = true
    const lock = { name: 'test-lock', mode: 'exclusive', pending: false } as Lock
    try { await callback(lock) }
    finally { this.held = false }
  }
}

class FakeBroadcastChannel {
  static channels = new Set<FakeBroadcastChannel>()
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false
  constructor(readonly name: string) { FakeBroadcastChannel.channels.add(this) }
  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this && channel.name === this.name && !channel.closed) {
        queueMicrotask(() => channel.onmessage?.({ data } as MessageEvent))
      }
    }
  }
  close() { this.closed = true; FakeBroadcastChannel.channels.delete(this) }
}

function setup() {
  const locks = new FakeLockManager()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  return locks
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(() => {
  FakeBroadcastChannel.channels.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setExecutionQuiescence(Promise.resolve())
})

describe('execution gate', () => {
  it('distinguishes a lock API failure from another active owner', async () => {
    setup()
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: vi.fn(() => Promise.reject(new Error('lock access denied'))),
    } })
    const gate = createExecutionGate()

    expect(await gate.start()).toBe(false)
    expect(gate.supported).toBe(true)
    expect(gate.hasError()).toBe(true)
    gate.close()
  })

  it('releases a lock granted after the gate was disposed', async () => {
    const locks = setup()
    let grant!: (lock: Lock | null) => Promise<void>
    let first = true
    const request = vi.fn((_name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
      if (first) {
        first = false
        grant = callback
        return Promise.resolve()
      }
      return locks.request('test-lock', options, callback)
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const gate = createExecutionGate()
    const started = gate.start()
    gate.close()

    await grant({ name: 'test-lock', mode: 'exclusive', pending: false } as Lock)

    expect(await started).toBe(false)
    const nextOwner = createExecutionGate()
    expect(await nextOwner.start()).toBe(true)
    nextOwner.close()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(locks.held).toBe(false)
  })

  it('does not accept a late initial acquisition after pagehide', async () => {
    const locks = setup()
    let grant!: (lock: Lock | null) => Promise<void>
    let first = true
    const request = vi.fn((_name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
      if (first) {
        first = false
        grant = callback
        return Promise.resolve()
      }
      return locks.request('test-lock', options, callback)
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const gate = createExecutionGate()
    const started = gate.start()
    await gate.relinquish()
    await grant({ name: 'test-lock', mode: 'exclusive', pending: false } as Lock)

    expect(await started).toBe(false)
    const nextOwner = createExecutionGate()
    expect(await nextOwner.start()).toBe(true)
    nextOwner.close()
  })

  it('does not keep a lock granted after a takeover request times out', async () => {
    const locks = setup()
    let lateGrant!: (lock: Lock | null) => Promise<void>
    let calls = 0
    const request = vi.fn((_name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void>) => {
      calls += 1
      if (calls === 1) return callback(null)
      if (calls === 2) { lateGrant = callback; return Promise.resolve() }
      return locks.request('test-lock', options, callback)
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const gate = createExecutionGate()
    expect(await gate.start()).toBe(false)

    vi.useFakeTimers()
    try {
      const requestPromise = gate.requestOwnership()
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await requestPromise).toBe(false)
      await lateGrant({ name: 'test-lock', mode: 'exclusive', pending: false } as Lock)
      const nextOwner = createExecutionGate()
      expect(await nextOwner.start()).toBe(true)
      nextOwner.close()
    } finally { vi.useRealTimers() }
  })

  it('transfers only after quiescence and keeps the lock when quiescence fails', async () => {
    const locks = setup()
    const owner = createExecutionGate()
    const requester = createExecutionGate()
    owner.onTakeover(() => Promise.reject(new Error('drain failed')))
    expect(await owner.start()).toBe(true)

    expect(await requester.requestOwnership()).toBe(false)
    expect(locks.held).toBe(true)
    expect(await createExecutionGate().start()).toBe(false)
  })

  it('marks quiescence failure as coordination error and allows a safe retry', async () => {
    setup()
    const owner = createExecutionGate()
    const requester = createExecutionGate()
    let fail = true
    owner.onTakeover(() => {
      if (fail) return Promise.reject(new Error('drain failed'))
      return Promise.resolve()
    })
    expect(await owner.start()).toBe(true)

    expect(await requester.requestOwnership()).toBe(false)
    expect(owner.hasError()).toBe(true)
    expect(await createExecutionGate().start()).toBe(false)

    fail = false
    expect(await requester.requestOwnership()).toBe(true)
    requester.close()
  })

  it('does not reject duplicate messages for the same slow takeover request', async () => {
    setup()
    const owner = createExecutionGate()
    const requester = createExecutionGate()
    const drain = deferred()
    owner.onTakeover(() => drain.promise)
    expect(await owner.start()).toBe(true)
    const request = requester.requestOwnership()
    await new Promise(resolve => setTimeout(resolve, 300))
    drain.resolve()
    expect(await request).toBe(true)
  })

  it('ignores a takeover addressed to an owner that no longer holds the lock', async () => {
    setup()
    const oldOwner = createExecutionGate()
    const currentOwner = createExecutionGate()
    const requester = createExecutionGate()
    const deactivation = vi.fn(async () => {})
    const currentDeactivation = vi.fn(async () => {})
    oldOwner.onTakeover(deactivation)
    currentOwner.onTakeover(currentDeactivation)
    expect(await oldOwner.start()).toBe(true)
    await oldOwner.relinquish()
    deactivation.mockClear()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(await currentOwner.start()).toBe(true)

    const stale = new FakeBroadcastChannel('salah-execution-gate-v1')
    stale.postMessage({ version: 1, type: 'takeover', requestId: 'old-request', requesterId: 'old-tab', targetOwnerId: 'obsolete-owner' })
    await Promise.resolve()
    expect(deactivation).not.toHaveBeenCalled()
    expect(await requester.requestOwnership()).toBe(true)
    expect(deactivation).not.toHaveBeenCalled()
    expect(currentDeactivation).toHaveBeenCalledOnce()
    expect(await currentOwner.start()).toBe(false)
  })

  it('keeps a live retry path when disposal cannot quiesce the current owner', async () => {
    setup()
    const owner = createExecutionGate()
    const requester = createExecutionGate()
    owner.onTakeover(() => Promise.reject(new Error('drain failed')))
    expect(await owner.start()).toBe(true)

    owner.close()
    await new Promise(resolve => setTimeout(resolve, 0))
    owner.onTakeover(() => Promise.resolve())
    expect(await requester.requestOwnership()).toBe(true)
    requester.close()
  })

  it('keeps an actively held Web Lock until disposal quiescence completes', async () => {
    const locks = setup()
    const owner = createExecutionGate()
    const requester = createExecutionGate()
    const drain = deferred()
    owner.onTakeover(() => drain.promise)
    expect(await owner.start()).toBe(true)

    owner.close()
    const request = requester.requestOwnership()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(locks.held).toBe(true)
    expect(await createExecutionGate().start()).toBe(false)

    drain.resolve()
    expect(await request).toBe(true)
    expect(locks.held).toBe(true)
    requester.close()
  })
})
