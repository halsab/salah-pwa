import { useCallback, useEffect, useRef, useState } from 'react'

const SCREENS = ['home', 'date', 'location', 'search', 'settings', 'source', 'source-choice', 'profiles', 'parameters', 'source-info', 'methodology', 'privacy', 'reset', 'about', 'share'] as const
export type AppScreen = typeof SCREENS[number]
interface Entry { screen: AppScreen; returnFocus: string | null }
const HOME: Entry[] = [{ screen: 'home', returnFocus: null }]

function readEntries(value: unknown, session: string): Entry[] | null {
  if (!value || typeof value !== 'object' || !('salahNavigation' in value)) return null
  const state = value.salahNavigation
  if (!state || typeof state !== 'object' || !('session' in state) || state.session !== session || !('entries' in state) || !Array.isArray(state.entries)) return null
  const entries: unknown[] = state.entries
  const valid = (entry: unknown): entry is Entry => Boolean(entry && typeof entry === 'object'
    && 'screen' in entry && SCREENS.some(screen => screen === entry.screen)
    && 'returnFocus' in entry && (entry.returnFocus === null || typeof entry.returnFocus === 'string'))
  return entries.length > 0 && entries.every(valid) ? entries : null
}

export function useAppNavigation() {
  const [session] = useState(() => String(Math.random()))
  const [entries, setEntries] = useState<Entry[]>(HOME)
  const current = useRef(HOME)
  const returnFocus = useRef<string | null>(null)
  const traversing = useRef(false)

  useEffect(() => {
    window.history.replaceState({ salahNavigation: { session, entries: HOME } }, '')
    const onPop = (event: PopStateEvent) => {
      const next = readEntries(event.state, session) ?? HOME
      if (next.length < current.current.length) returnFocus.current = current.current[next.length]?.returnFocus ?? null
      traversing.current = false
      current.current = next
      setEntries(next)
    }
    window.addEventListener('popstate', onPop)
    return () => { window.removeEventListener('popstate', onPop) }
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

  const open = useCallback((screen: AppScreen) => {
    if (traversing.current || current.current.at(-1)?.screen === screen) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null
    const next = [...current.current, { screen, returnFocus: trigger }]
    window.history.pushState({ salahNavigation: { session, entries: next } }, '')
    current.current = next
    setEntries(next)
  }, [session])
  const back = useCallback(() => {
    if (traversing.current || current.current.length <= 1) return
    returnFocus.current = current.current.at(-1)?.returnFocus ?? null
    const next = current.current.slice(0, -1)
    current.current = next
    traversing.current = true
    setEntries(next)
    window.history.back()
  }, [])
  const home = useCallback(() => {
    const depth = current.current.length - 1
    if (traversing.current || depth <= 0) return
    returnFocus.current = current.current[1]?.returnFocus ?? null
    current.current = HOME
    traversing.current = true
    setEntries(HOME)
    window.history.go(-depth)
  }, [])

  return { screen: entries.at(-1)?.screen ?? 'home', open, back, home }
}
