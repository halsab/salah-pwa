import { flushSync } from 'react-dom'

export type TransitionKind = 'fade' | 'expand' | 'collapse' | 'none'

export interface SharedTransitionOrigin {
  entityType: string
  entityId: string
  elementId: string
}

export function sharedTransitionName(entityType: string, entityId: string): string {
  const identity = `${entityType}-${entityId}`
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `salah-${identity || 'content'}`
}

export function selectTransitionKind(
  requested: TransitionKind,
  { reducedMotion, supported, originAvailable = true }: {
    reducedMotion: boolean
    supported: boolean
    originAvailable?: boolean
  },
): TransitionKind {
  if (requested === 'none' || reducedMotion || !supported) return 'none'
  if ((requested === 'expand' || requested === 'collapse') && !originAvailable) return 'fade'
  return requested
}

export function findVisibleOrigin(elementId: string): HTMLElement | null {
  const element = document.getElementById(elementId)
  const container = element?.closest<HTMLElement>('.screen-content')
  if (!element || !container || element.getClientRects().length === 0) return null

  const elementRect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const visible = elementRect.bottom > containerRect.top
    && elementRect.top < containerRect.bottom
    && elementRect.right > containerRect.left
    && elementRect.left < containerRect.right
  return visible ? element : null
}

interface TransitionOptions {
  sharedName?: string
  origin?: HTMLElement | null
  destination?: () => HTMLElement | null
}

let transitionActive = false
interface NavigationViewTransition {
  finished: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition: () => void
}
let activeTransition: NavigationViewTransition | null = null

export function canUseNavigationTransitions(): boolean {
  return typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === 'function'
    && !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

export function canUseSharedSurfaceTransitions(): boolean {
  return canUseNavigationTransitions()
    && typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('view-transition-class', 'salah-shared-surface')
}

export function runNavigationTransition(
  requested: TransitionKind,
  update: () => void,
  options: TransitionOptions = {},
): boolean {
  if (transitionActive) {
    activeTransition?.skipTransition()
    activeTransition = null
    transitionActive = false
    update()
    return true
  }

  const startViewTransition = (document as unknown as { startViewTransition?: (callback: () => void) => NavigationViewTransition }).startViewTransition
  const supported = typeof startViewTransition === 'function'
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const hasSharedSurface = canUseSharedSurfaceTransitions()
  const originAvailable = hasSharedSurface && (requested === 'collapse' ? Boolean(options.destination) : Boolean(options.origin))
  const kind = selectTransitionKind(requested, { reducedMotion, supported, originAvailable })
  if (kind === 'none') {
    update()
    return true
  }

  transitionActive = true
  const namedElements: Array<{ element: HTMLElement; previousName: string; hadClass: boolean }> = []
  const assignName = (element: HTMLElement | null | undefined) => {
    if (!element || !options.sharedName) return
    namedElements.push({ element, previousName: element.style.getPropertyValue('view-transition-name'), hadClass: element.classList.contains('salah-shared-surface') })
    element.style.setProperty('view-transition-name', options.sharedName)
    element.classList.add('salah-shared-surface')
  }
  if (kind === 'expand') assignName(options.origin)
  const restoreNames = () => {
    for (const { element, previousName, hadClass } of namedElements) {
      if (element.style.getPropertyValue('view-transition-name') === options.sharedName) {
        if (previousName) element.style.setProperty('view-transition-name', previousName)
        else element.style.removeProperty('view-transition-name')
      }
      if (!hadClass) element.classList.remove('salah-shared-surface')
    }
  }

  let transition: NavigationViewTransition
  try {
    if (!startViewTransition) {
      update()
      transitionActive = false
      return true
    }
    transition = startViewTransition.call(document, () => {
      flushSync(update)

    if ((kind === 'expand' || kind === 'collapse') && options.sharedName) {
      const destination = options.destination?.() ?? null
      if (destination && (kind === 'expand' || findVisibleOrigin(destination.id))) assignName(destination)
    }
    })
  } catch {
    restoreNames()
    transitionActive = false
    update()
    return true
  }
  activeTransition = transition

  const clean = () => {
    restoreNames()
    if (activeTransition === transition) activeTransition = null
    transitionActive = false
  }
  void transition.finished.then(clean, clean)
  void transition.updateCallbackDone.catch(clean)
  return true
}

export function resetNavigationTransitionForTests() {
  activeTransition?.skipTransition()
  activeTransition = null
  transitionActive = false
}
