import { useEffect, useState } from 'react'

import { useLocalization } from '../../localization'
import type { Translator } from '../../localization/messages'

interface ScheduleCountdownProps {
  countdownLabel: string
  targetInstant: number
  now: () => Date
  onElapsed: () => void
}

function remainingSeconds(targetInstant: number, now: Date): number {
  return Math.max(0, Math.ceil((targetInstant - now.getTime()) / 1_000))
}

export function ScheduleCountdown({
  countdownLabel,
  targetInstant,
  now,
  onElapsed,
}: ScheduleCountdownProps) {
  const { t } = useLocalization()
  const [remaining, setRemaining] = useState(() =>
    remainingSeconds(targetInstant, now()))

  useEffect(() => {
    let timer: number | undefined
    let elapsed = false
    const clearTimer = () => {
      if (timer === undefined) return
      window.clearTimeout(timer)
      timer = undefined
    }
    const refresh = () => {
      clearTimer()
      const currentTime = now()
      const nextRemaining = remainingSeconds(targetInstant, currentTime)
      setRemaining((current) => current === nextRemaining ? current : nextRemaining)

      if (nextRemaining === 0) {
        if (!elapsed) {
          elapsed = true
          onElapsed()
        }
        return
      }

      timer = window.setTimeout(
        () => {
          timer = undefined
          refresh()
        },
        Math.min(1_000, targetInstant - currentTime.getTime()),
      )
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const handlePageShow = () => refresh()

    refresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [now, onElapsed, targetInstant])

  const formattedRemaining = formatRemainingTime(remaining, t)
  return (
    <div
      className="event-countdown"
      role="timer"
      aria-live="off"
      aria-label={t('countdownAria', { label: countdownLabel, remaining: formattedRemaining })}
    >
      <span className="countdown-label">{countdownLabel}</span>
      <span className="countdown-value">{formattedRemaining}</span>
    </div>
  )
}

function formatRemainingTime(totalSeconds: number, t: Translator): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3_600)
  const minutes = Math.floor((safeSeconds % 3_600) / 60)
  if (safeSeconds === 0) return t('minutesZero')
  if (safeSeconds < 60) return t('minutesLessThanOne')
  return hours ? t('hoursMinutes', { hours, minutes }) : t('minutes', { count: minutes })
}
