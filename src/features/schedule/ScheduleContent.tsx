import { useCallback, useState, type RefObject } from 'react'

import { formatDateLabel } from '../../domain/date'
import { findCurrentPrayer, findNextPrayer } from '../../domain/nextPrayer'
import {
  CALCULATION_PROFILES,
  type CalculationProfileId,
  type CalculationSettings,
} from '../../domain/prayerCalculation'
import type {
  CalculatedPrayerKey,
  PrayerDay,
  PrayerKey,
  SchedulePrayerKey,
} from '../../domain/types'
import {
  CheckIcon,
  ClockIcon,
  MoonIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from '../../ui/Icons'
import { ASR_METHOD_LABELS } from '../../ui/calculationLabels'
import { ScheduleCountdown } from './ScheduleCountdown'
import type { DisplaySchedule } from './usePrayerSchedules'

type ScheduleIconKind = 'moon' | 'sunrise' | 'sun' | 'sunset'
const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy/`

const OFFICIAL_PRAYER_ROWS: ReadonlyArray<{
  key: PrayerKey
  label: string
  icon: ScheduleIconKind
}> = [
  { key: 'suhurEnd', label: 'Завершение сухура', icon: 'moon' },
  { key: 'fajrJamaat', label: 'Утренний намаз в мечетях', icon: 'sunrise' },
  { key: 'sunrise', label: 'Восход', icon: 'sunrise' },
  { key: 'zenith', label: 'Зенит', icon: 'sun' },
  { key: 'dhuhr', label: 'Зухр', icon: 'sun' },
  { key: 'asr', label: 'Аср', icon: 'sunset' },
  { key: 'maghrib', label: 'Магриб', icon: 'sunset' },
  { key: 'isha', label: 'Иша', icon: 'moon' },
]

const CALCULATED_PRAYER_ROWS: ReadonlyArray<{
  key: CalculatedPrayerKey
  label: string
  icon: ScheduleIconKind
}> = [
  { key: 'fajr', label: 'Фаджр', icon: 'moon' },
  { key: 'sunrise', label: 'Восход', icon: 'sunrise' },
  { key: 'zenith', label: 'Зенит', icon: 'sun' },
  { key: 'dhuhr', label: 'Зухр', icon: 'sun' },
  { key: 'asr', label: 'Аср', icon: 'sunset' },
  { key: 'maghrib', label: 'Магриб', icon: 'sunset' },
  { key: 'isha', label: 'Иша', icon: 'moon' },
]

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
  const rows = calculated ? CALCULATED_PRAYER_ROWS : OFFICIAL_PRAYER_ROWS

  return (
    <ol className="prayer-list" aria-label="Времена намаза">
      {rows.map(({ key, label, icon }) => {
        const entry = calculated
          ? schedule.entries[key as CalculatedPrayerKey]
          : null
        const time = entry?.time ?? (schedule as PrayerDay)[key as PrayerKey]
        const dateTime = entry
          ? new Date(entry.instant).toISOString()
          : `${schedule.date}T${time}:00+03:00`
        const estimated = entry?.estimated ?? false

        return (
          <li
            className="prayer-row"
            data-active={key === activePrayer || undefined}
            data-estimated={estimated || undefined}
            key={key}
          >
            <ScheduleIcon kind={icon} />
            <span className="prayer-name">{label}</span>
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

function calculationProfileLabel(profileId: CalculationProfileId): string {
  return CALCULATION_PROFILES.find(({ id }) => id === profileId)?.label ?? 'ДУМ РТ'
}

interface ScheduleContentProps {
  schedule: DisplaySchedule | null
  previousSchedule: DisplaySchedule | undefined
  tomorrow: DisplaySchedule | undefined
  scheduleLoading: boolean
  scheduleError: string | null
  selectedDate: string
  today: string
  currentTime: Date
  now: () => Date
  officialMode: boolean
  calculationSettings: CalculationSettings
  officialScheduleUrl: string
  methodologyButtonRef: RefObject<HTMLButtonElement | null>
  onChangeDate: (date: string) => void
  onRetrySchedule: () => void
  onOpenMethodology: () => void
}

export function ScheduleContent({
  schedule,
  previousSchedule,
  tomorrow,
  scheduleLoading,
  scheduleError,
  selectedDate,
  today,
  currentTime,
  now,
  officialMode,
  calculationSettings,
  officialScheduleUrl,
  methodologyButtonRef,
  onChangeDate,
  onRetrySchedule,
  onOpenMethodology,
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
  const nextPrayer = selectedDate === today && schedule
    ? findNextPrayer(effectiveCurrentTime, schedule, tomorrow)
    : null
  const currentPrayer = selectedDate === today && schedule
    ? findCurrentPrayer(effectiveCurrentTime, schedule, previousSchedule)
    : null
  const calculatedSchedule = schedule && 'entries' in schedule ? schedule : null
  const profileLabel = calculationProfileLabel(calculationSettings.profile)

  return (
    <div className="content-grid" data-loading={scheduleLoading || undefined}>
      <section className="next-prayer-panel" aria-label="Текущее событие и время до следующего">
        {scheduleError ? (
          <div className="no-next-prayer"><ClockIcon /><p>Расписание временно недоступно</p></div>
        ) : scheduleLoading && !schedule ? (
          <div className="no-next-prayer" aria-live="polite"><ClockIcon /><p>Загружаем расписание…</p></div>
        ) : selectedDate === today ? (
          nextPrayer ? (
            <>
              <div className="current-prayer">
                <p className="current-label">
                  {currentPrayer ? 'Последнее событие' : 'Сейчас'}
                </p>
                <p className="next-name">
                  {currentPrayer ? `${currentPrayer.label} · ${currentPrayer.time}` : 'До первого события'}
                </p>
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
        ) : schedule ? (
          <PrayerSchedule schedule={schedule} activePrayer={currentPrayer?.date === schedule.date ? currentPrayer.key : undefined} />
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
          {calculatedSchedule?.estimatedPrayers.some((key) => key === 'fajr' || key === 'isha') ? (
            <p className="calculation-note">Фаджр и/или Иша определены по правилу северных широт.</p>
          ) : null}
          {calculatedSchedule?.polarResolutionApplied ? (
            <p className="calculation-note">Солнечный цикл восстановлен по ближайшей подходящей широте или дню.</p>
          ) : null}
          <footer className="source-note">
            <CheckIcon />
            {officialMode ? (
              <span>
                Официальное расписание <a href={officialScheduleUrl} target="_blank" rel="noreferrer">ДУМ РТ</a> · Настройки расчёта не влияют ·{' '}
                <button
                  ref={methodologyButtonRef}
                  className="methodology-trigger"
                  type="button"
                  onClick={onOpenMethodology}
                >
                  Методика
                </button>{' '}
                · Доступно офлайн · <a href={PRIVACY_URL}>Конфиденциальность</a>
              </span>
            ) : (
              <span>
                Расчёт по настройкам · {profileLabel} · Аср: {ASR_METHOD_LABELS[calculationSettings.asrMethod]} ·{' '}
                <button
                  ref={methodologyButtonRef}
                  className="methodology-trigger"
                  type="button"
                  onClick={onOpenMethodology}
                >
                  Методика
                </button>{' '}
                · Доступно офлайн · <a href={PRIVACY_URL}>Конфиденциальность</a>
              </span>
            )}
            <span className="source-spark" aria-hidden="true">✦</span>
          </footer>
        </div>
      </section>
    </div>
  )
}
