import type { Translator } from './messages'

export function formatRemainingDuration(durationMs: number, t: Translator): string | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null

  if (durationMs >= 3_600_000) {
    const totalMinutes = Math.floor(durationMs / 60_000)
    return t('countdownHoursMinutes', {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    })
  }

  if (durationMs >= 60_000) {
    return t('countdownMinutes', { minutes: Math.floor(durationMs / 60_000) })
  }

  return t('countdownSeconds', { seconds: Math.floor(durationMs / 1_000) })
}
