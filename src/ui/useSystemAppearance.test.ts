import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSystemAppearance } from './useSystemAppearance'

afterEach(() => vi.unstubAllGlobals())

describe('useSystemAppearance', () => {
  it.each([[false, 'light'], [true, 'dark']] as const)('uses the OS preference %s', (matches, expected) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const { result } = renderHook(() => useSystemAppearance())
    expect(result.current).toBe(expected)
  })

  it('defaults to light when matchMedia is unavailable or throws', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useSystemAppearance()).result.current).toBe('light')
    vi.stubGlobal('matchMedia', () => { throw new Error('unsupported') })
    expect(renderHook(() => useSystemAppearance()).result.current).toBe('light')
  })

  it('updates when the OS preference changes and removes its listener', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined
    const removeEventListener = vi.fn()
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback }),
      removeEventListener,
    }
    vi.stubGlobal('matchMedia', () => media)
    const { result, unmount } = renderHook(() => useSystemAppearance())

    expect(result.current).toBe('light')
    act(() => listener?.({ matches: true } as MediaQueryListEvent))
    expect(result.current).toBe('dark')
    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('change', listener)
  })
})
