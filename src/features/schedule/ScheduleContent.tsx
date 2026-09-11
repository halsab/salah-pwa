import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { formatCompactDateLabel } from '../../domain/date'
import { buildScheduleEvents, selectEventPair, type ResolvedScheduleEvent } from '../../domain/scheduleEvents'
import type { CalculatedPrayerKey, SchedulePrayerKey } from '../../domain/types'
import { Screen } from '../../ui/Screen'
import { ScheduleCountdown } from './ScheduleCountdown'
import type { DisplaySchedule } from './usePrayerSchedules'

const LABELS: Record<SchedulePrayerKey, string> = {
  suhurEnd: 'Сухур до', fajrJamaat: 'Фаджр в мечети', fajr: 'Фаджр', sunrise: 'Восход',
  zenith: 'Зенит', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша',
}
const COUNTDOWN: Record<SchedulePrayerKey, string> = {
  suhurEnd: 'До конца сухура', fajrJamaat: 'До Фаджра в мечети', fajr: 'До Фаджра', sunrise: 'До восхода',
  zenith: 'До зенита', dhuhr: 'До Зухра', asr: 'До Асра', maghrib: 'До Магриба', isha: 'До Иши',
}

function estimated(event: ResolvedScheduleEvent, schedules: DisplaySchedule[]): boolean {
  return schedules.some(day => day.date === event.scheduleDate && 'entries' in day && day.estimatedPrayers.includes(event.key as CalculatedPrayerKey))
}

function PrayerSchedule({ schedule, current, now, live }: {
  schedule: DisplaySchedule; current: ResolvedScheduleEvent | null; now: Date; live: boolean
}) {
  const events = buildScheduleEvents(schedule).sort((left, right) => left.instant - right.instant)
  return <ol className="event-list" aria-label="Расписание дня">
    {events.map(event => {
      const active = live && event.key === current?.key && event.scheduleDate === current.scheduleDate
      const past = live && !active && event.instant <= now.getTime()
      return <li key={event.key} className={`event-row${past ? ' event-past' : ''}`} aria-current={active || undefined}>
        <div className="event-name"><span>{LABELS[event.key]}</span>{active ? <small className="event-current-label">сейчас</small> : null}
          {event.dayOffset ? <small className="event-day">{formatCompactDateLabel(event.date)}</small> : null}
        </div>
        <time dateTime={new Date(event.instant).toISOString()}>{estimated(event, [schedule]) ? <span aria-label="Приблизительное время">≈ </span> : null}{event.time}</time>
      </li>
    })}
  </ol>
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
  onChangeDate: (date: string) => void
  onRetrySchedule: () => void
  top?: ReactNode
  actions?: ReactNode
  notice?: ReactNode
}

export function ScheduleContent({ schedule, schedules, scheduleLoading, scheduleError, selectedDate, today,
  currentTime, now, officialMode, onChangeDate, onRetrySchedule, top, actions, notice,
}: ScheduleContentProps) {
  const [boundary, setBoundary] = useState<{ time: Date; parentTime: number; schedules: DisplaySchedule[] } | null>(null)
  // Граница относится к загруженному набору: смена даты не должна перемонтировать календарь и терять фокус.
  const effectiveNow = boundary?.schedules === schedules && boundary.parentTime === currentTime.getTime() ? boundary.time : currentTime
  const onElapsed = useCallback(() => { setBoundary({ time: now(), parentTime: currentTime.getTime(), schedules }) }, [now, currentTime, schedules])
  const events = useMemo(() => schedules.flatMap(buildScheduleEvents), [schedules])
  const ready = !scheduleLoading && !scheduleError && schedule !== null
  const live = selectedDate === today && ready
  const { current, next } = live ? selectEventPair(effectiveNow, events) : { current: null, next: null }
  const countdown = next ? <ScheduleCountdown key={`${next.scheduleDate}:${next.key}:${next.instant}`} countdownLabel={COUNTDOWN[next.key]}
    targetInstant={next.instant} now={now} onElapsed={onElapsed} /> : null
  const footer = <>
    {selectedDate !== today ? <button className="pill" type="button" onClick={() => onChangeDate(today)}>Сегодня</button> : countdown}
    {actions}
  </>
  return <Screen label="Главная" top={top} bottom={footer} busy={scheduleLoading} contentClassName={ready ? 'home-content' : 'screen-center'}>
    {scheduleError ? <div className="screen-stack"><p className="screen-copy" role="alert">{scheduleError}</p><button type="button" className="pill" onClick={onRetrySchedule}>Повторить</button></div>
      : scheduleLoading ? <p className="note" role="status">Загружаем расписание…</p>
        : !schedule ? <p className="screen-copy">Нет расписания на эту дату</p>
          : <>
            <PrayerSchedule schedule={schedule} current={current} now={effectiveNow} live={live} />
            {'entries' in schedule && schedule.estimatedPrayers.length > 0 ? <p className="note screen-space">≈ По северному правилу</p> : null}
            {live && !next ? <p className="note screen-space">{officialMode ? 'Следующее расписание ещё не опубликовано' : 'Следующее событие не найдено'}</p> : null}
          </>}
    {notice}
  </Screen>
}
