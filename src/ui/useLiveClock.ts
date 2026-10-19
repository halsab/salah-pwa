import { useEffect, useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()
const clockCorrectionListeners = new Map<Listener, number>()
const CLOCK_CORRECTION_THRESHOLD_MS = 100
let revision = 0
let timer: number | undefined
let clockStarted = false
let lastClockSample: { wall: number; monotonic: number } | null = null

function readClockSample() {
  return { wall: Date.now(), monotonic: performance.now() }
}

function notifyClockCorrectionIfNeeded() {
  if (!clockCorrectionListeners.size) return

  const sample = readClockSample()
  const previous = lastClockSample
  lastClockSample = sample
  if (!previous) return

  const wallElapsed = sample.wall - previous.wall
  const monotonicElapsed = sample.monotonic - previous.monotonic
  if (Math.abs(wallElapsed - monotonicElapsed) < CLOCK_CORRECTION_THRESHOLD_MS) return

  for (const listener of [...clockCorrectionListeners.keys()]) listener()
}

function subscribeToClockCorrections(listener: Listener) {
  const wasEmpty = clockCorrectionListeners.size === 0
  clockCorrectionListeners.set(listener, (clockCorrectionListeners.get(listener) ?? 0) + 1)
  if (wasEmpty) lastClockSample = document.visibilityState === 'hidden' ? null : readClockSample()
  startClock()
  return () => {
    const count = clockCorrectionListeners.get(listener)
    if (!count || count === 1) clockCorrectionListeners.delete(listener)
    else clockCorrectionListeners.set(listener, count - 1)
    if (!clockCorrectionListeners.size) lastClockSample = null
    stopClockIfUnused()
  }
}

function hasSubscribers() {
  return listeners.size > 0 || clockCorrectionListeners.size > 0
}

function startClock() {
  if (!hasSubscribers() || clockStarted) return
  clockStarted = true
  document.addEventListener('visibilitychange', syncVisibility)
  window.addEventListener('pageshow', syncVisibility)
  window.addEventListener('focus', syncVisibility)
  if (timer === undefined) scheduleTick()
}

function clearTimer() {
  if (timer === undefined) return
  window.clearTimeout(timer)
  timer = undefined
}

function scheduleTick() {
  if (!hasSubscribers() || document.visibilityState === 'hidden') return
  const now = Date.now()
  const remainder = ((now % 1_000) + 1_000) % 1_000
  timer = window.setTimeout(publish, remainder === 0 ? 1_000 : 1_000 - remainder)
}

function publish() {
  timer = undefined
  if (!hasSubscribers() || document.visibilityState === 'hidden') {
    lastClockSample = null
    return
  }
  notifyClockCorrectionIfNeeded()
  if (listeners.size) {
    revision += 1
    for (const listener of [...listeners]) listener()
  }
  scheduleTick()
}

function syncVisibility() {
  clearTimer()
  if (!hasSubscribers() || document.visibilityState === 'hidden') {
    lastClockSample = null
    return
  }
  // В браузере нет события коррекции часов; при возврате сначала обновляем монотонную базу.
  lastClockSample = clockCorrectionListeners.size ? readClockSample() : null
  publish()
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  startClock()

  return () => {
    listeners.delete(listener)
    stopClockIfUnused()
  }
}

function stopClockIfUnused() {
  if (hasSubscribers() || !clockStarted) return
  clockStarted = false
  clearTimer()
  lastClockSample = null
  document.removeEventListener('visibilitychange', syncVisibility)
  window.removeEventListener('pageshow', syncVisibility)
  window.removeEventListener('focus', syncVisibility)
}

function getRevision() {
  return revision
}

const noSubscribe = () => () => {}

export function useLiveClock(enabled = true): void {
  useSyncExternalStore(enabled ? subscribe : noSubscribe, getRevision, getRevision)
}

export function useClockCorrection(enabled: boolean, onSystemClockChange?: () => void): void {
  useEffect(() => {
    if (!enabled || !onSystemClockChange) return
    return subscribeToClockCorrections(onSystemClockChange)
  }, [enabled, onSystemClockChange])
}
