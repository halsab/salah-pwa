import { useCallback, useEffect, useRef, useState } from 'react'

import { pulseHaptic } from '../../platform/browser'

interface ScheduleDateServices {
  now: () => Date
}

export function useScheduleDate(services: ScheduleDateServices) {
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(() => services.now())
  const minuteTimer = useRef<number | undefined>(undefined)
  const scheduleNextMinute = useRef<() => void>(() => undefined)

  const syncCurrentTime = useCallback(() => {
    const now = services.now()
    setCurrentTime((current) => current.getTime() === now.getTime() ? current : now)
    scheduleNextMinute.current()
  }, [services])

  useEffect(() => {
    let active = true
    const scheduleMinuteSync = () => {
      if (minuteTimer.current !== undefined) window.clearTimeout(minuteTimer.current)
      const now = services.now().getTime()
      const remainder = ((now % 60_000) + 60_000) % 60_000
      const delay = remainder === 0 ? 60_000 : 60_000 - remainder
      minuteTimer.current = window.setTimeout(syncCurrentTime, delay)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncCurrentTime()
    }
    scheduleNextMinute.current = scheduleMinuteSync
    queueMicrotask(() => {
      if (active) syncCurrentTime()
    })
    scheduleMinuteSync()
    window.addEventListener('pageshow', syncCurrentTime)
    window.addEventListener('focus', syncCurrentTime)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      active = false
      if (minuteTimer.current !== undefined) window.clearTimeout(minuteTimer.current)
      minuteTimer.current = undefined
      scheduleNextMinute.current = () => undefined
      window.removeEventListener('pageshow', syncCurrentTime)
      window.removeEventListener('focus', syncCurrentTime)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [services, syncCurrentTime])

  const changeDate = useCallback((date: string | null) => {
    setSelectedDateOverride(date)
    pulseHaptic()
  }, [])

  return {
    selectedDateOverride,
    currentTime,
    changeDate,
    syncCurrentTime,
  }
}
