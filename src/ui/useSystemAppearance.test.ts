import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSystemAppearance } from './useSystemAppearance'

afterEach(() => vi.unstubAllGlobals())

describe('useSystemAppearance', () => {

  it('defaults to light when matchMedia is unavailable or throws', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useSystemAppearance()).result.current).toBe('light')
    vi.stubGlobal('matchMedia', () => { throw new Error('unsupported') })
    expect(renderHook(() => useSystemAppearance()).result.current).toBe('light')
  })

})
