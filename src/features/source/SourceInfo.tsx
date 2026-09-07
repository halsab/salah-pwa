import { staticText } from '../../ui/staticText'
import { useRef } from 'react'
import type { ScheduleContext } from '../../domain/scheduleContext'
import { CALCULATION_PROFILES, getEffectiveParameters } from '../../domain/prayerCalculation'
import type { DatasetMeta } from '../../storage/database'
import { PRAYER_PROVIDERS } from '../../data/prayerProviders'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import { formatDateLabel } from '../../domain/date'
import { ASR_METHOD_LABELS, EVENT_LABELS, HIGH_LATITUDE_LABELS } from '../../ui/calculationLabels'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'
import { CloseIcon } from '../../ui/Icons'
import type { CalculatedPrayerKey } from '../../domain/types'

function sourceLabel(context: ScheduleContext) {
  return context.source === 'official'
    ? `Официальное расписание · ${PRAYER_PROVIDERS.find(provider => provider.id === context.provider)?.label ?? 'Поставщик расписания'}`
    : 'Расчётное время'
}
export function SourceBadge({ context, onOpen }: { context: ScheduleContext; onOpen: () => void }) {
  return <div><button className="source-badge" type="button" onClick={onOpen}>{sourceLabel(context)} <span aria-hidden="true">ⓘ</span></button>{context.mode === 'manual' ? <small>Ручной выбор источника</small> : null}</div>
}

export function SourceInfo({ open, onClose, context, schedule, meta, placeLabel, checkedAt, updateFailed }: {
  open: boolean; onClose: () => void; context: ScheduleContext; schedule: PrayerSchedule
  meta: DatasetMeta | null; placeLabel: string; checkedAt: number | null; updateFailed: boolean
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, closeRef)
  const layerRef = useDialogViewport(open)
  if (!open) return null
  const official = context.source === 'official'
  const provider = official ? PRAYER_PROVIDERS.find(provider => provider.id === context.provider) : null
  const calculated = 'entries' in schedule ? schedule : null
  const params = context.source === 'calculated' ? getEffectiveParameters(context.settings, context.date, context.timeZone) : null
  const lateSuhur = buildScheduleEvents(schedule).find(event => event.key === 'suhurEnd' && event.dayOffset === -1)
  const facts: [string, string][] = [['Место', placeLabel], ['Дата расписания', context.date], ['Часовой пояс расписания', context.timeZone]]
  if (official) facts.push(
    ['Пункт таблицы', meta?.locations.find(location => location.id === context.localityId)?.name ?? 'Опубликованный пункт'],
    ['Обновлено поставщиком', meta?.source.updatedAt ? new Date(meta.source.updatedAt).toLocaleDateString('ru-RU') : 'Дата не указана'],
    ['Актуальность', updateFailed ? staticText('source-copy-5') : checkedAt ? `Проверено ${new Date(checkedAt).toLocaleString('ru-RU')}` : 'Обновления ещё не проверены.'],
  )
  else if (params) facts.push(
    ['Расчётный профиль', CALCULATION_PROFILES.find(profile => profile.id === context.settings.profile)?.label ?? ''],
    ['Фаджр', `${params.fajrAngle}°`],
    ['Иша', params.ishaInterval > 0 ? `${params.ishaInterval} мин после заката` : `${params.ishaAngle}°`],
    ['Аср', ASR_METHOD_LABELS[context.settings.asrMethod]],
    ['Высокие широты', HIGH_LATITUDE_LABELS[context.settings.highLatitudeRule]],
  )
  return <div ref={layerRef} className="dialog-layer" onPointerDown={event => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="location-dialog source-dialog" role="dialog" aria-modal="true" aria-labelledby="source-title" tabIndex={-1}>
      <header className="dialog-header"><h2 id="source-title">Сведения об источнике</h2><button ref={closeRef} className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}><CloseIcon /></button></header>
      <div className="source-content">
        <h3>{sourceLabel(context)}</h3>
        <dl className="source-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {official ? <><p>{staticText('source-copy-1')}</p><a href={meta?.source.url ?? provider?.bundled.source.url} target="_blank" rel="noreferrer">Первичный источник · {provider?.label ?? 'Поставщик'}</a></> : params ? <>
          <p>{staticText('source-copy-2')}</p>

          <p>Режим: {context.mode === 'automatic' ? 'автоматический подбор параметров' : 'ручной расчёт'}. {context.settings.fajrAngle !== undefined || context.settings.isha ? 'Угол Фаджра и/или способ Иша заданы вручную.' : 'Углы и способ Иша взяты из профиля.'}</p>
          <p>Ручные поправки: {Object.entries(context.settings.adjustments ?? {}).filter(([, value]) => value !== 0).map(([key, value]) => `${EVENT_LABELS[key as CalculatedPrayerKey]} ${value > 0 ? '+' : ''}${value} мин`).join('; ') || 'нет'}.</p>
          {calculated?.estimatedPrayers.length ? <p>≈ Приблизительные значения: {calculated.estimatedPrayers.map(key => EVENT_LABELS[key]).join(', ')}. При отсутствии обычных солнечных событий применяется выбранное правило высоких широт.</p> : null}
          {calculated?.polarResolutionApplied ? <p>{staticText('source-copy-3')}</p> : null}
          <a href="https://github.com/batoulapps/adhan-js/blob/master/METHODS.md" target="_blank" rel="noreferrer">Описание расчётных профилей Adhan</a>
        </> : null}
        {lateSuhur ? <p>Завершение сухура {lateSuhur.time} — {formatDateLabel(lateSuhur.date)}, накануне дня поста.</p> : null}
        <p className="methodology-disclaimer">{staticText('source-copy-4')}</p>
      </div>
    </section>
  </div>
}
