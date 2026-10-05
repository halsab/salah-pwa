import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetNavigationTransitionForTests, runNavigationTransition } from './navigationTransition'

afterEach(() => {
  resetNavigationTransitionForTests()
  vi.restoreAllMocks()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
})

describe('navigation transitions', () => {
  it('updates immediately without View Transitions support or when motion is reduced', () => {
    const update = vi.fn()
    runNavigationTransition(update)
    expect(update).toHaveBeenCalledOnce()

    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn() })
    const startViewTransition = (document as unknown as { startViewTransition: ReturnType<typeof vi.fn> }).startViewTransition
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
    runNavigationTransition(update)
    expect(update).toHaveBeenCalledTimes(2)
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('ignores a stale update callback after a newer navigation skips the transition', () => {
    const callbacks: Array<() => void> = []
    const skipTransition = vi.fn()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        callbacks.push(callback)
        return { finished: new Promise<void>(() => {}), updateCallbackDone: new Promise<void>(() => {}), skipTransition }
      },
    })
    const first = vi.fn()
    const second = vi.fn()
    runNavigationTransition(first)
    runNavigationTransition(second)
    callbacks[0]?.()
    expect(skipTransition).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
