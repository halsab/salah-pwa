import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { success, type Result } from '../../domain/result'
import { useDataReset } from './useDataReset'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('useDataReset', () => {
  it('waits for an in-flight reset to finish before quiescence completes', async () => {
    const clearResult = deferred<Result<void, unknown>>()
    const clear = vi.fn(() => clearResult.promise)
    const { result } = renderHook(() => useDataReset({
      invalidateLocation: vi.fn(),
      invalidateSaves: () => Promise.resolve(),
      invalidateRepository: () => Promise.resolve(),
      clear,
      getGeneration: () => Promise.resolve(0),
    }))

    let reset!: Promise<boolean>
    let settledCallback = false
    act(() => { reset = result.current.reset(cleared => { settledCallback = cleared }) })
    await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce())
    let quiesced = false
    const quiescence = result.current.drain().then(() => { quiesced = true })
    await Promise.resolve()
    expect(quiesced).toBe(false)
    clearResult.resolve(success(undefined))
    await act(async () => { await Promise.all([reset, quiescence]) })

    expect(await reset).toBe(true)
    expect(quiesced).toBe(true)
    expect(settledCallback).toBe(true)
  })
})
