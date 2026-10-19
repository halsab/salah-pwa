import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()
let revision = 0
let timer: number | undefined

function clearTimer() {
  if (timer === undefined) return
  window.clearTimeout(timer)
  timer = undefined
}

function scheduleTick() {
  if (!listeners.size || document.visibilityState === 'hidden') return
  const now = Date.now()
  const remainder = ((now % 1_000) + 1_000) % 1_000
  timer = window.setTimeout(publish, remainder === 0 ? 1_000 : 1_000 - remainder)
}

function publish() {
  timer = undefined
  if (!listeners.size || document.visibilityState === 'hidden') return
  revision += 1
  for (const listener of [...listeners]) listener()
  scheduleTick()
}

function syncVisibility() {
  clearTimer()
  if (!listeners.size || document.visibilityState === 'hidden') return
  publish()
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', syncVisibility)
    window.addEventListener('pageshow', syncVisibility)
    window.addEventListener('focus', syncVisibility)
  }
  if (timer === undefined) scheduleTick()

  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    clearTimer()
    document.removeEventListener('visibilitychange', syncVisibility)
    window.removeEventListener('pageshow', syncVisibility)
    window.removeEventListener('focus', syncVisibility)
  }
}

function getRevision() {
  return revision
}

const noSubscribe = () => () => {}

export function useLiveClock(enabled = true): void {
  useSyncExternalStore(enabled ? subscribe : noSubscribe, getRevision, getRevision)
}
