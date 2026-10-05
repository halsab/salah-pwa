import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  findVisibleOrigin,
  resetNavigationTransitionForTests,
  runNavigationTransition,
  selectTransitionKind,
  sharedTransitionName,
} from './navigationTransition'

afterEach(() => {
  resetNavigationTransitionForTests()
  vi.restoreAllMocks()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
  Object.defineProperty(window, 'CSS', { configurable: true, value: undefined })
  document.body.innerHTML = ''
})

describe('navigation transition policy', () => {
  it('uses no animation when View Transitions are unsupported or motion is reduced', () => {
    expect(selectTransitionKind('fade', { supported: false, reducedMotion: false })).toBe('none')
    expect(selectTransitionKind('expand', { supported: true, reducedMotion: true })).toBe('none')
  })

  it('falls back from expand/collapse to fade when no visible origin is available', () => {
    expect(selectTransitionKind('expand', { supported: true, reducedMotion: false, originAvailable: false })).toBe('fade')
    expect(selectTransitionKind('collapse', { supported: true, reducedMotion: false, originAvailable: false })).toBe('fade')
  })

  it('makes stable CSS custom-ident names from entity type and id', () => {
    expect(sharedTransitionName('religious event', 'eid al-fitr')).toBe('salah-religious-event-eid-al-fitr')
    expect(sharedTransitionName('religious-event', 'eid-al-fitr')).not.toBe(sharedTransitionName('religious-event', 'ramadan'))
  })

  it('returns no candidate for missing or offscreen origin cards', () => {
    expect(findVisibleOrigin('missing')).toBeNull()
    document.body.innerHTML = '<div class="screen-content"><button id="origin">Event</button></div>'
    const content = document.querySelector<HTMLElement>('.screen-content')
    const origin = document.getElementById('origin')
    expect(content).not.toBeNull()
    expect(origin).not.toBeNull()
    if (!content || !origin) throw new Error('Test elements were not created')
    vi.spyOn(origin, 'getClientRects').mockReturnValue([{} as DOMRect] as unknown as DOMRectList)
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ top: 0, right: 100, bottom: 100, left: 0 } as DOMRect)
    vi.spyOn(origin, 'getBoundingClientRect').mockReturnValue({ top: 110, right: 90, bottom: 130, left: 10 } as DOMRect)
    expect(findVisibleOrigin('origin')).toBeNull()
  })

  it('runs navigation immediately if the API is unavailable', () => {
    const update = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
    expect(runNavigationTransition('fade', update)).toBe(true)
    expect(update).toHaveBeenCalledOnce()
  })

  it('runs navigation immediately and skips View Transitions for reduced motion', () => {
    const update = vi.fn()
    const startViewTransition = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
    expect(runNavigationTransition('fade', update)).toBe(true)
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledOnce()
  })

  it('names only the selected source and destination shared surfaces', async () => {
    document.body.innerHTML = '<button id="selected">A</button><button id="other">B</button><div id="detail"></div>'
    Object.defineProperty(window, 'CSS', { configurable: true, value: { supports: () => true } })
    let resolveFinished: (() => void) | undefined
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        callback()
        return {
          finished: new Promise<void>(resolve => { resolveFinished = resolve }),
          updateCallbackDone: Promise.resolve(),
          skipTransition: vi.fn(),
        }
      },
    })
    runNavigationTransition('expand', vi.fn(), {
      sharedName: 'salah-religious-event-arafa',
      origin: document.getElementById('selected') as HTMLElement,
      destination: () => document.getElementById('detail'),
    })
    expect(document.getElementById('selected')?.style.getPropertyValue('view-transition-name')).toBe('salah-religious-event-arafa')
    expect(document.getElementById('detail')?.style.getPropertyValue('view-transition-name')).toBe('salah-religious-event-arafa')
    expect(document.getElementById('other')?.style.getPropertyValue('view-transition-name')).toBe('')
    resolveFinished?.()
    await Promise.resolve()
    expect(document.getElementById('selected')?.style.getPropertyValue('view-transition-name')).toBe('')
  })

  it('skips an active transition before applying a later history update', () => {
    let resolveFinished: (() => void) | undefined
    let firstUpdate: (() => void) | undefined
    const skipTransition = vi.fn()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (callback: () => void) => {
        firstUpdate = callback
        return {
          finished: new Promise<void>(resolve => { resolveFinished = resolve }),
          updateCallbackDone: Promise.resolve(),
          skipTransition,
        }
      },
    })
    const first = vi.fn()
    const second = vi.fn()
    runNavigationTransition('fade', first)
    firstUpdate?.()
    runNavigationTransition('fade', second)
    expect(skipTransition).toHaveBeenCalledOnce()
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    resolveFinished?.()
  })
})
