import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'

import { getSystemDate } from '../../domain/date'
import { pulseHaptic } from '../../platform/browser'

interface ScheduleDateServices {
  now: () => Date
}

export function useScheduleDate(services: ScheduleDateServices, timeZone: string) {
  const [selectedDate, setSelectedDate] = useState(() => getSystemDate(services.now(), timeZone))
  const [currentTime, setCurrentTime] = useState(() => services.now())
  const followingToday = useRef(true)

  const syncCurrentTime = useCallback(() => {
    const now = services.now()
    setCurrentTime((current) => current.getTime() === now.getTime() ? current : now)
    if (followingToday.current) {
      const currentDate = getSystemDate(now, timeZone)
      setSelectedDate((date) => date === currentDate ? date : currentDate)
    }
  }, [services, timeZone])

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

  const today = getSystemDate(currentTime, timeZone)
  const changeDate = (date: string) => {
    followingToday.current = date === today
    setSelectedDate(date)
    pulseHaptic()
  }
  const onDateInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value) changeDate(event.target.value)
  }
  const showDatePicker = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker()
    } catch {
      // Нативный клик остаётся резервным вариантом в браузерах без showPicker.
    }
  }

  return {
    selectedDate,
    currentTime,
    today,
    changeDate,
    onDateInput,
    showDatePicker,
  }
}
