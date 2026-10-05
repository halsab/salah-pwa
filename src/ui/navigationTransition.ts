import { flushSync } from 'react-dom'

export function canUseNavigationTransitions(): boolean {
  return typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === 'function'
    && !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

interface NavigationViewTransition {
  finished: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition: () => void
}

let activeTransition: NavigationViewTransition | null = null
let generation = 0

export function runNavigationTransition(update: () => void): void {
  const startViewTransition = (document as unknown as { startViewTransition?: (callback: () => void) => NavigationViewTransition }).startViewTransition
  if (activeTransition) {
    const previous = activeTransition
    activeTransition = null
    generation += 1
    previous.skipTransition()
    update()
    return
  }

  if (!canUseNavigationTransitions() || !startViewTransition) {
    update()
    return
  }

  const ownGeneration = ++generation
  const callbackState = { ran: false }
  try {
    const transition = startViewTransition.call(document, () => {
      if (generation !== ownGeneration) return
      callbackState.ran = true
      flushSync(update)
    })
    activeTransition = transition
    const clean = () => {
      if (generation === ownGeneration && activeTransition === transition) activeTransition = null
    }
    void transition.finished.then(clean, clean)
    void transition.updateCallbackDone.catch(clean)
  } catch {
    if (!callbackState.ran) update()
  }
}

export function resetNavigationTransitionForTests() {
  activeTransition?.skipTransition()
  activeTransition = null
  generation += 1
}
