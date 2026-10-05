import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isReligiousEventId, type ReligiousEventId } from '../domain/religiousEvents'
import { canUseSharedSurfaceTransitions, findVisibleOrigin, runNavigationTransition, sharedTransitionName, type SharedTransitionOrigin, type TransitionKind } from './navigationTransition'

const SCREENS = ['home', 'date', 'location', 'search', 'settings', 'source', 'source-choice', 'profiles', 'parameters', 'source-info', 'methodology', 'privacy', 'reset', 'about', 'share', 'religious-events', 'religious-event'] as const
export type AppScreen = typeof SCREENS[number]
interface Entry { screen: AppScreen; returnFocus: string | null; religiousEventId?: ReligiousEventId; scrollTop?: number; origin?: SharedTransitionOrigin }
type NavigationTarget = AppScreen | { screen: 'religious-event'; religiousEventId: ReligiousEventId }
interface NavigationIntent { kind?: TransitionKind; origin?: SharedTransitionOrigin; originElement?: HTMLElement }
const HOME: Entry[] = [{ screen: 'home', returnFocus: null }]

function isSharedTransitionOrigin(value: unknown): value is SharedTransitionOrigin {
  return Boolean(value && typeof value === 'object'
    && 'entityType' in value && typeof value.entityType === 'string'
    && 'entityId' in value && typeof value.entityId === 'string'
    && 'elementId' in value && typeof value.elementId === 'string')
}

function readEntries(value: unknown, session: string): Entry[] | null {
  if (!value || typeof value !== 'object' || !('salahNavigation' in value)) return null
  const state = value.salahNavigation
  if (!state || typeof state !== 'object' || !('session' in state) || state.session !== session || !('entries' in state) || !Array.isArray(state.entries)) return null
  const entries: unknown[] = state.entries
  const valid = (entry: unknown): entry is Entry => Boolean(entry && typeof entry === 'object'
    && 'screen' in entry && SCREENS.some(screen => screen === entry.screen)
    && 'returnFocus' in entry && (entry.returnFocus === null || typeof entry.returnFocus === 'string')
    && (!('scrollTop' in entry) || typeof entry.scrollTop === 'number')
    && (!('origin' in entry) || isSharedTransitionOrigin(entry.origin))
    && (entry.screen !== 'religious-event' || ('religiousEventId' in entry && isReligiousEventId(entry.religiousEventId))))
  return entries.length > 0 && entries.every(valid) ? entries : null
}

export function useAppNavigation() {
  const [session] = useState(() => String(Math.random()))
  const [entries, setEntries] = useState<Entry[]>(HOME)
  const current = useRef(HOME)
  const returnFocus = useRef<string | null>(null)
  const traversing = useRef(false)

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    window.history.replaceState({ salahNavigation: { session, entries: HOME } }, '')
    const onPop = (event: PopStateEvent) => {
      const next = readEntries(event.state, session) ?? HOME
      if (next.length < current.current.length) returnFocus.current = current.current[next.length]?.returnFocus ?? null
      const active = current.current.at(-1)
      const origin = active?.origin
      const forwardOrigin = next.length > current.current.length ? next.at(-1)?.origin : undefined
      const backward = next.length + 1 === current.current.length && Boolean(origin)
      const kind: TransitionKind = backward ? 'collapse' : forwardOrigin ? 'expand' : 'fade'
      traversing.current = false
      runNavigationTransition(kind, () => {
        current.current = next
        setEntries(next)
      }, backward && origin ? {
        sharedName: sharedTransitionName(origin.entityType, origin.entityId),
        destination: () => findVisibleOrigin(origin.elementId),
      } : forwardOrigin ? {
        sharedName: sharedTransitionName(forwardOrigin.entityType, forwardOrigin.entityId),
        origin: findVisibleOrigin(forwardOrigin.elementId),
        destination: () => document.getElementById('religious-event-transition-surface'),
      } : undefined)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [session])

  useEffect(() => {
    const target = returnFocus.current
    const initialFocus = document.activeElement
    const frame = requestAnimationFrame(() => {
      const element = target ? document.getElementById(target) : document.querySelector<HTMLElement>('input[data-screen-focus]') ?? document.querySelector<HTMLElement>('[data-screen-focus]')
      const active = document.activeElement
      // Старая кнопка может остаться в DOM; фокус, изменённый после перехода, сохраняем.
      if (active === initialFocus || !active || active === document.body || active === document.documentElement) element?.focus({ preventScroll: true })
      returnFocus.current = null
    })
    return () => { cancelAnimationFrame(frame) }
  }, [entries])

  useLayoutEffect(() => {
    const entry = entries.at(-1)
    if (entry?.scrollTop === undefined) return
    const content = document.querySelector<HTMLElement>('.screen-content')
    if (content) content.scrollTop = entry.scrollTop
  }, [entries])

  const open = useCallback((target: NavigationTarget, intent: NavigationIntent = {}) => {
    const screen = typeof target === 'string' ? target : target.screen
    if (traversing.current || current.current.at(-1)?.screen === screen) return
    const trigger = intent.origin?.elementId
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null)
    const origin = intent.kind === 'expand' ? intent.origin : undefined
    const content = document.querySelector<HTMLElement>('.screen-content')
    const parent = current.current.at(-1) ?? HOME[0]
    if (!parent) return
    const currentEntries: Entry[] = [...current.current.slice(0, -1), {
      ...parent,
      ...(content ? { scrollTop: content.scrollTop } : {}),
    }]
    const next: Entry[] = [...currentEntries, {
      screen,
      returnFocus: trigger,
      ...(origin ? { origin } : {}),
      ...(typeof target === 'string' ? {} : { religiousEventId: target.religiousEventId }),
    }]
    const kind = intent.kind ?? 'fade'
    runNavigationTransition(kind, () => {
      window.history.replaceState({ salahNavigation: { session, entries: currentEntries } }, '')
      window.history.pushState({ salahNavigation: { session, entries: next } }, '')
      current.current = next
      setEntries(next)
    }, origin ? {
      sharedName: sharedTransitionName(origin.entityType, origin.entityId),
      origin: intent.originElement ?? null,
      destination: () => document.getElementById('religious-event-transition-surface'),
    } : undefined)
  }, [session])
  const back = useCallback(() => {
    if (traversing.current || current.current.length <= 1) return
    returnFocus.current = current.current.at(-1)?.returnFocus ?? null
    traversing.current = true
    window.history.back()
  }, [])
  const home = useCallback(() => {
    const depth = current.current.length - 1
    if (traversing.current || depth <= 0) return
    returnFocus.current = current.current[1]?.returnFocus ?? null
    traversing.current = true
    window.history.go(-depth)
  }, [])

  const active = entries.at(-1) ?? { screen: 'home', returnFocus: null }
  const origin = active.screen === 'religious-event' && canUseSharedSurfaceTransitions() ? active.origin : undefined
  return { screen: active.screen, religiousEventId: active.screen === 'religious-event' ? active.religiousEventId ?? null : null,
    sharedTransitionName: origin ? sharedTransitionName(origin.entityType, origin.entityId) : null, open, back, home }
}
