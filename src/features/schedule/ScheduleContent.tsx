import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { formatCompactDateLabel } from '../../domain/date'
import { buildScheduleEvents, selectEventPair, type ResolvedScheduleEvent } from '../../domain/scheduleEvents'
import type { CalculatedPrayerKey, SchedulePrayerKey } from '../../domain/types'
import { BackButton, Screen } from '../../ui/Screen'
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
  view?: 'home' | 'schedule'
  placeLabel?: string
  top?: ReactNode
  homeActions?: ReactNode
  notice?: ReactNode
  onBack?: () => void
}

export function ScheduleContent({ schedule, schedules, scheduleLoading, scheduleError, selectedDate, today,
  currentTime, now, officialMode, onChangeDate, onRetrySchedule, view = 'home', placeLabel = '', top,
  homeActions, notice, onBack,
}: ScheduleContentProps) {
  const [boundary, setBoundary] = useState<Date | null>(null)
  const effectiveNow = boundary && boundary > currentTime ? boundary : currentTime
  const onElapsed = useCallback(() => { setBoundary(now()) }, [now])
  const events = useMemo(() => schedules.flatMap(buildScheduleEvents).filter(event => event.kind !== 'marker'), [schedules])
  const ready = !scheduleLoading && !scheduleError && schedule !== null
  const live = selectedDate === today && ready
  const { current, next } = live ? selectEventPair(effectiveNow, events) : { current: null, next: null }
  const previous = current ? selectEventPair(new Date(current.instant - 1), events).current : null
  const countdown = next ? <ScheduleCountdown key={`${next.scheduleDate}:${next.key}:${next.instant}`} countdownLabel={COUNTDOWN[next.key]}
    targetInstant={next.instant} now={now} onElapsed={onElapsed} compact={view === 'schedule'} /> : null
  const footer = view === 'home' ? homeActions : <>
    {selectedDate !== today ? <button className="pill" type="button" onClick={() => onChangeDate(today)}>Сегодня</button> : countdown}
    <p className="schedule-place"><span>{placeLabel}</span><span>{formatCompactDateLabel(selectedDate)}</span></p>
  </>
  return <Screen label={view === 'home' ? 'Главная' : 'Расписание'} top={view === 'home' ? top : onBack ? <BackButton onClick={onBack} /> : undefined}
    bottom={footer} busy={scheduleLoading} contentClassName={ready && view === 'home' ? 'home-content' : !ready ? 'screen-center' : ''}>
    {scheduleError ? <div className="screen-stack"><p className="screen-copy" role="alert">{scheduleError}</p><button type="button" className="pill" onClick={onRetrySchedule}>Повторить</button></div>
      : scheduleLoading ? <p className="note" role="status">Загружаем расписание…</p>
        : !schedule ? <p className="screen-copy">Нет расписания на эту дату</p>
          : view === 'schedule' ? <>
            <PrayerSchedule schedule={schedule} current={current} now={effectiveNow} live={live} />
            {'entries' in schedule && schedule.estimatedPrayers.length > 0 ? <p className="note screen-space">≈ По северному правилу</p> : null}
          </> : <>
            {previous ? <p className="home-previous muted">{LABELS[previous.key]} {previous.time}</p> : null}
            {current ? <section className="home-current" aria-label="Текущее событие"><p className="home-label">Сейчас</p><h1>{LABELS[current.key]}</h1><p className="home-time">с {current.time}{estimated(current, schedules) ? ' ≈' : ''}</p>
              {current.date !== today ? <p className="note">{formatCompactDateLabel(current.date)}</p> : null}
            </section> : null}
            <section className="home-next" aria-label="Следующее событие">
              {countdown ?? <p className="note">{officialMode ? 'Следующее расписание ещё не опубликовано' : 'Следующее событие не найдено'}</p>}
              {next ? <><p className="home-time">в {next.time}{estimated(next, schedules) ? ' ≈' : ''}</p>{next.date !== today ? <p className="note">{formatCompactDateLabel(next.date)}</p> : null}</> : null}
            </section>
          </>}
    {notice}
  </Screen>
}
