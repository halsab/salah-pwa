import { useCallback, useEffect, useState } from 'react'

import { pulseHaptic } from '../../platform/browser'

interface ScheduleDateServices {
  now: () => Date
}

export function useScheduleDate(services: ScheduleDateServices) {
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(() => services.now())

  const syncCurrentTime = useCallback(() => {
    const now = services.now()
    setCurrentTime((current) => current.getTime() === now.getTime() ? current : now)
  }, [services])

  useEffect(() => {
    let active = true
    let timer: number | undefined
    const scheduleNextMinute = () => {
      const now = services.now().getTime()
      const remainder = ((now % 60_000) + 60_000) % 60_000
      const delay = remainder === 0 ? 60_000 : 60_000 - remainder
      timer = window.setTimeout(() => {
        syncCurrentTime()
        scheduleNextMinute()
      }, delay)
    }
    const syncAndReschedule = () => {
      syncCurrentTime()
      if (timer !== undefined) window.clearTimeout(timer)
      scheduleNextMinute()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncAndReschedule()
    }
    queueMicrotask(() => {
      if (active) syncCurrentTime()
    })
    scheduleNextMinute()
    window.addEventListener('pageshow', syncAndReschedule)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('pageshow', syncAndReschedule)
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
  }
}
