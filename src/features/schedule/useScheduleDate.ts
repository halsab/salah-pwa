import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'

import { getSystemDate } from '../../domain/date'
import { pulseHaptic } from '../../platform/browser'

interface ScheduleDateServices {
  now: () => Date
}

export function useScheduleDate(services: ScheduleDateServices) {
  const [selectedDate, setSelectedDate] = useState(() => getSystemDate(services.now()))
  const [currentTime, setCurrentTime] = useState(() => services.now())
  const followingToday = useRef(true)

  const syncCurrentTime = useCallback(() => {
    const now = services.now()
    setCurrentTime(now)
    if (followingToday.current) {
      const currentDate = getSystemDate(now)
      setSelectedDate((date) => date === currentDate ? date : currentDate)
    }
  }, [services])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncCurrentTime()
    }
    const timer = window.setInterval(syncCurrentTime, 1_000)
    window.addEventListener('pageshow', syncCurrentTime)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pageshow', syncCurrentTime)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncCurrentTime])

  const today = getSystemDate(currentTime)
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
