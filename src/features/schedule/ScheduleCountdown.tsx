import { useCallback, useEffect, useRef } from 'react'

import { useLocalization } from '../../localization'
import { formatRemainingDuration } from '../../localization/countdown'
import { useLiveClock } from '../../ui/useLiveClock'

interface ScheduleCountdownProps {
  countdownLabel: string
  targetInstant: number
  now: () => Date
  onElapsed: () => void
}

export function ScheduleCountdown({
  countdownLabel,
  targetInstant,
  now,
  onElapsed,
}: ScheduleCountdownProps) {
  const { t } = useLocalization()
  const elapsedTarget = useRef<number | null>(null)
  const targetTimer = useRef<number | undefined>(undefined)
  const currentTime = now()
  const currentInstant = currentTime.getTime()
  const hasValidNow = Number.isFinite(currentInstant)
  const remainingMs = targetInstant - currentInstant
  const formattedRemaining = Number.isFinite(remainingMs) && remainingMs > 0
    ? formatRemainingDuration(remainingMs, t)
    : null
  useLiveClock(Number.isFinite(targetInstant) && hasValidNow && remainingMs > 0)

  const reportElapsed = useCallback(() => {
    if (!Number.isFinite(targetInstant) || elapsedTarget.current === targetInstant) return
    elapsedTarget.current = targetInstant
    if (targetTimer.current !== undefined) window.clearTimeout(targetTimer.current)
    targetTimer.current = undefined
    onElapsed()
  }, [onElapsed, targetInstant])

  useEffect(() => {
    if (!Number.isFinite(targetInstant)) return
    const checkTarget = () => {
      const currentInstant = now().getTime()
      if (!Number.isFinite(currentInstant)) return
      const delay = targetInstant - currentInstant
      if (delay <= 0) {
        reportElapsed()
        return
      }
      targetTimer.current = window.setTimeout(checkTarget, delay)
    }
    checkTarget()
    return () => {
      if (targetTimer.current !== undefined) window.clearTimeout(targetTimer.current)
      targetTimer.current = undefined
    }
  }, [now, reportElapsed, targetInstant])

  useEffect(() => {
    if (Number.isFinite(targetInstant) && Number.isFinite(currentInstant) && targetInstant <= currentInstant) reportElapsed()
  }, [currentInstant, reportElapsed, targetInstant])

  if (!formattedRemaining) return null
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
