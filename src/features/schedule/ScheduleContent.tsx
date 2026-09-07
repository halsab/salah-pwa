import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { formatDateLabel } from '../../domain/date'
import { buildScheduleEvents, selectEventPair } from '../../domain/scheduleEvents'
import type {
  CalculatedPrayerKey,
  SchedulePrayerKey,
} from '../../domain/types'
import {
  ClockIcon,
  MoonIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from '../../ui/Icons'
import { ScheduleCountdown } from './ScheduleCountdown'
import type { DisplaySchedule } from './usePrayerSchedules'

type ScheduleIconKind = 'moon' | 'sunrise' | 'sun' | 'sunset'

const EVENT_ICONS: Record<SchedulePrayerKey, ScheduleIconKind> = {
  suhurEnd: 'moon', fajrJamaat: 'sunrise', fajr: 'moon', sunrise: 'sunrise',
  zenith: 'sun', dhuhr: 'sun', asr: 'sunset', maghrib: 'sunset', isha: 'moon',
}

function ScheduleIcon({ kind }: { kind: ScheduleIconKind }) {
  const props = { className: 'schedule-icon' }
  if (kind === 'moon') return <MoonIcon {...props} />
  if (kind === 'sun') return <SunIcon {...props} />
  if (kind === 'sunset') return <SunsetIcon {...props} />
  return <SunriseIcon {...props} />
}

function PrayerSchedule({
  schedule,
  activePrayer,
}: {
  schedule: DisplaySchedule
  activePrayer: SchedulePrayerKey | undefined
}) {
  const calculated = 'entries' in schedule
  const events = buildScheduleEvents(schedule)

  return (
    <ol className="prayer-list" aria-label="Расписание дня">
      {events.map(event => {
        const { key, label, time } = event
        const entry = calculated
          ? schedule.entries[key as CalculatedPrayerKey]
          : null
        const dateTime = event.status === 'resolved' ? new Date(event.instant).toISOString() : undefined
        const estimated = entry?.estimated ?? false

        return (
          <li
            className="prayer-row"
            data-active={key === activePrayer || undefined}
            data-estimated={estimated || undefined}
            key={key}
          >
            <ScheduleIcon kind={EVENT_ICONS[key]} />
            <span className="prayer-name">{label}{event.dayOffset ? <small> · {formatDateLabel(event.date)}</small> : null}</span>
            <span className="prayer-dots" aria-hidden="true" />
            <time className="prayer-time" dateTime={dateTime}>
              {time}
            </time>
            {estimated ? (
              <span className="estimated-mark" aria-label="Время определено по северному правилу">
                ≈
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

interface ScheduleContentProps {
  schedule: DisplaySchedule | null
  schedules: DisplaySchedule[]
  scheduleLoading: boolean
  scheduleError: string | null
  selectedDate: string
  today: string
  currentTime: Date
  now: () => Date
  officialMode: boolean
  sourceBadge?: ReactNode
  onChangeDate: (date: string) => void
  onRetrySchedule: () => void
}

export function ScheduleContent({
  schedule,
  schedules,
  scheduleLoading,
  scheduleError,
  selectedDate,
  today,
  currentTime,
  now,
  officialMode,
  sourceBadge,
  onChangeDate,
  onRetrySchedule,
}: ScheduleContentProps) {
  const [eventBoundaryTime, setEventBoundaryTime] = useState<Date | null>(null)
  const effectiveCurrentTime = eventBoundaryTime
    && eventBoundaryTime.getTime() > currentTime.getTime()
    ? eventBoundaryTime
    : currentTime
  const handleEventBoundary = useCallback(() => {
    const nextTime = now()
    setEventBoundaryTime((current) =>
      current?.getTime() === nextTime.getTime() ? current : nextTime)
  }, [now])
  const activeSchedule = scheduleLoading || scheduleError ? null : schedule
  const events = useMemo(() => schedules.flatMap(buildScheduleEvents), [schedules])
  const { next: nextPrayer } = selectedDate === today && activeSchedule
    ? selectEventPair(effectiveCurrentTime, events.filter(event => event.kind !== 'marker'))
    : { next: null }
  const nextEstimated = nextPrayer && schedules.some(day => day.date === nextPrayer.scheduleDate && 'entries' in day && day.estimatedPrayers.includes(nextPrayer.key as CalculatedPrayerKey))
  const calculatedSchedule = activeSchedule && 'entries' in activeSchedule ? activeSchedule : null

  return (
    <div className="content-grid" data-loading={scheduleLoading || undefined}>
      <section className="next-prayer-panel" aria-label="Следующий намаз">
        {scheduleError ? (
          <div className="no-next-prayer"><ClockIcon /><p>Расписание временно недоступно</p></div>
        ) : scheduleLoading ? (
          <div className="no-next-prayer" aria-live="polite"><ClockIcon /><p>Загружаем расписание…</p></div>
        ) : selectedDate === today ? (
          nextPrayer ? (
            <>
              <div className="current-prayer">
                <p className="current-label">
                  {nextPrayer.kind === 'jamaat' ? 'Ближайший джамаат' : 'Следующий намаз'}
                </p>
                <p className="next-name">{nextPrayer.label}</p>
                <time className="next-time" dateTime={new Date(nextPrayer.instant).toISOString()}>{nextEstimated ? <span aria-label="Приблизительное время">≈ </span> : null}{nextPrayer.time}</time>
                {nextPrayer.date !== today ? <span>{formatDateLabel(nextPrayer.date)}</span> : null}
              </div>
              <ScheduleCountdown
                key={`${nextPrayer.date}:${nextPrayer.key}:${nextPrayer.instant}`}
                countdownLabel={nextPrayer.countdownLabel}
                targetInstant={nextPrayer.instant}
                now={now}
                onElapsed={handleEventBoundary}
              />
            </>
          ) : (
            <div className="no-next-prayer">
              <MoonIcon />
              <p>{officialMode ? 'Следующее расписание ещё не опубликовано' : 'Следующее событие не найдено'}</p>
            </div>
          )
        ) : (
          <div className="selected-date-summary">
            <SunIcon /><p>Расписание на</p><strong>{formatDateLabel(selectedDate)}</strong>
          </div>
        )}
      </section>

      <section className="schedule-panel" aria-busy={scheduleLoading}>
        {scheduleError ? (
          <div className="missing-schedule schedule-error">
            <p role="alert">{scheduleError}</p>
            <button className="primary-button" type="button" onClick={onRetrySchedule}>Повторить</button>
          </div>
        ) : activeSchedule ? (
          <PrayerSchedule schedule={activeSchedule} activePrayer={nextPrayer?.scheduleDate === activeSchedule.date ? nextPrayer.key : undefined} />
        ) : scheduleLoading ? (
          <div className="schedule-skeleton" aria-label="Загружаем расписание" />
        ) : (
          <div className="missing-schedule">
            <p>Расписание на эту дату ещё не опубликовано.</p>
            {selectedDate !== today ? (
              <button className="primary-button" type="button" onClick={() => onChangeDate(today)}>Сегодня</button>
            ) : null}
          </div>
        )}

        <div>
          {calculatedSchedule?.estimatedPrayers.length ? <p className="calculation-note">≈ Есть приблизительные значения</p> : null}
          {sourceBadge}
        </div>
      </section>
    </div>
  )
}
