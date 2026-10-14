import { useEffect, useMemo, useState } from 'react'
import { addDays } from '../../domain/date'
import { fastingProgress, resolveFastingTimeline, type FastingModePreferences, type FastingScheduleEvents } from '../../domain/fasting'
import { getCivilDate } from '../../domain/locationTime'
import { formatLocalizedGregorianDate } from '../../localization/calendar'
import { formatClockTime } from '../../localization/formatters'
import { useLocalization } from '../../localization'

function formatCountdown(target: number, now: number): string {
  const totalSeconds = Math.max(0, Math.ceil((target - now) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDuration(start: number, end: number, t: ReturnType<typeof useLocalization>['t']): string {
  const totalMinutes = Math.max(0, Math.round((end - start) / 60_000))
  return t('fastingDuration', { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 })
}

function relativeDate(date: string, today: string, locale: string, t: ReturnType<typeof useLocalization>['t']): string {
  if (date === today) return t('relativeToday')
  if (date === addDays(today, -1)) return t('relativeYesterday')
  if (date === addDays(today, 1)) return t('relativeTomorrow')
  return formatLocalizedGregorianDate(date, locale)
}

interface FastingEndpointData {
  prefix: string
  dateLabel?: string | undefined
  time: string
  compact: string
}

function FastingEndpoint({ prefix, dateLabel, time, compact }: FastingEndpointData) {
  const full = `${prefix}${dateLabel ? ` ${dateLabel}` : ''} ${time}`
  return <span className="fasting-endpoint">
    <span className="fasting-endpoint-long" aria-hidden="true">{full}</span>
    <span className="fasting-endpoint-compact" aria-hidden="true">{compact} {time}</span>
    <span className="sr-only">{full}</span>
  </span>
}

export function FastingCard({ events, preferences, selectedDate, today, timeZone, correction, hijriSupported, now }: {
  events: FastingScheduleEvents
  preferences: FastingModePreferences
  selectedDate: string
  today: string
  timeZone: string
  correction: -1 | 0 | 1
  hijriSupported: boolean
  now: () => Date
}) {
  const { locale, t } = useLocalization()
  const [currentTime, setCurrentTime] = useState(now)
  const timeline = useMemo(() => resolveFastingTimeline({
    now: currentTime,
    today,
    selectedDate,
    timeZone,
    correction,
    hijriSupported,
    preferences,
    events,
  }), [currentTime, today, selectedDate, timeZone, correction, hijriSupported, preferences, events])

  useEffect(() => {
    const sync = () => setCurrentTime(now())
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') sync() }
    const timer = window.setInterval(sync, 1000)
    window.addEventListener('pageshow', sync)
    document.addEventListener('visibilitychange', onVisibilityChange)
    sync()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pageshow', sync)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [now])

  if (!timeline) return null

  const nowInstant = currentTime.getTime()
  const progress = fastingProgress(timeline, nowInstant)
  const progressPercent = Math.round(progress * 100)
  const todayInSourceZone = getCivilDate(currentTime, timeZone)
  const endTime = formatClockTime(timeline.end.instant, timeZone, locale)
  const startTime = formatClockTime(timeline.start.instant, timeZone, locale)
  const daytime = timeline.kind === 'day'
  const countdownLabel = t(daytime ? 'fastingUntilEnd' : 'fastingUntilStart')
  const countdown = formatCountdown(timeline.end.instant, nowInstant)
  const endRelative = daytime ? undefined : relativeDate(timeline.start.date, todayInSourceZone, locale, t)
  const startRelative = daytime ? undefined : relativeDate(timeline.end.date, todayInSourceZone, locale, t)
  const endPrefix = t('fastingEnd')
  const startPrefix = t('fastingStart')
  const duration = daytime ? formatDuration(timeline.start.instant, timeline.end.instant, t) : null
  const progressLabel = t(daytime ? 'fastingDayProgress' : 'fastingNightProgress')
  const endpoints: [FastingEndpointData, FastingEndpointData] = daytime
    ? [
      { prefix: startPrefix, dateLabel: undefined, time: startTime, compact: startPrefix },
      { prefix: endPrefix, dateLabel: undefined, time: endTime, compact: endPrefix },
    ]
    : [
      { prefix: endPrefix, dateLabel: endRelative, time: startTime, compact: endRelative ?? endPrefix },
      { prefix: startPrefix, dateLabel: startRelative, time: endTime, compact: startRelative ?? startPrefix },
    ]
  const describe = (endpoint: FastingEndpointData) => `${endpoint.prefix}${endpoint.dateLabel ? ` ${endpoint.dateLabel}` : ''} ${endpoint.time}`
  const [firstEndpoint, secondEndpoint] = endpoints
  const endpointsDescription = t('fastingEndpointsDescription', { first: describe(firstEndpoint), second: describe(secondEndpoint) })

  return <div className="fasting-card">
    <div className="fasting-card-heading">
      <span>{t('fastingTitle')}</span>
      {duration ? <span className="fasting-duration">{duration}</span> : null}
    </div>
    <div className="fasting-card-countdown">
      <span className="fasting-card-label">{countdownLabel}</span>
      <time className="fasting-card-timer" role="timer" aria-label={t('countdownAria', { label: countdownLabel, remaining: countdown })}>
        {countdown}
      </time>
    </div>
    <div className="fasting-progress" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={progressPercent} aria-valuetext={t('fastingProgressPercent', { percent: progressPercent })}>
      <span className="fasting-progress-fill" style={{ width: `${progress * 100}%` }} />
    </div>
    <div className="fasting-endpoints" role="group" aria-label={endpointsDescription}>
      {endpoints.map(endpoint => <FastingEndpoint key={`${endpoint.prefix}:${endpoint.time}`} {...endpoint} />)}
    </div>
  </div>
}
