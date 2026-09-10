import { staticText } from '../../ui/staticText'
import type { ScheduleContext } from '../../domain/scheduleContext'
import { CALCULATION_PROFILES, getEffectiveParameters } from '../../domain/prayerCalculation'
import type { DatasetMeta } from '../../storage/database'
import { PRAYER_PROVIDERS } from '../../data/prayerProviders'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import { formatCompactDateLabel, formatDateLabel } from '../../domain/date'
import { ASR_METHOD_LABELS, EVENT_LABELS, HIGH_LATITUDE_LABELS } from '../../ui/calculationLabels'
import { BackButton, Screen } from '../../ui/Screen'
import type { CalculatedPrayerKey } from '../../domain/types'

export function SourceInfo({ open, onClose, context, schedule, meta, placeLabel, checkedAt, updateFailed, onOpenMethodology }: {
  open: boolean; onClose: () => void; context: ScheduleContext; schedule: PrayerSchedule
  meta: DatasetMeta | null; placeLabel: string; checkedAt: number | null; updateFailed: boolean; onOpenMethodology?: () => void
}) {
  if (!open) return null
  const official = context.source === 'official'
  const provider = official ? PRAYER_PROVIDERS.find(item => item.id === context.provider) : null
  const calculated = 'entries' in schedule ? schedule : null
  const params = context.source === 'calculated' ? getEffectiveParameters(context.settings, context.date, context.timeZone) : null
  const lateSuhur = buildScheduleEvents(schedule).find(event => event.key === 'suhurEnd' && event.dayOffset === -1)
  const title = context.source === 'official' ? provider?.label ?? 'Официальная таблица'
    : CALCULATION_PROFILES.find(profile => profile.id === context.settings.profile)?.label ?? 'Расчёт'
  const facts: [string, string][] = [['Часовой пояс', context.timeZone]]
  if (official) facts.push(
    ['Пункт таблицы', meta?.locations.find(location => location.id === context.localityId)?.name ?? 'Опубликованный пункт'],
    ['Обновлено поставщиком', meta?.source.updatedAt ? new Date(meta.source.updatedAt).toLocaleDateString('ru-RU') : 'Дата не указана'],
    ['Актуальность', updateFailed ? staticText('source-copy-5') : checkedAt ? `Проверено ${new Date(checkedAt).toLocaleString('ru-RU')}` : 'Ещё не проверено'],
  )
  else if (params) facts.push(
    ['Фаджр', `${params.fajrAngle}°`],
    ['Иша', params.ishaInterval > 0 ? `${params.ishaInterval} мин после заката` : `${params.ishaAngle}°`],
    ['Аср', ASR_METHOD_LABELS[context.settings.asrMethod]],
    ['Северное правило', HIGH_LATITUDE_LABELS[context.settings.highLatitudeRule]],
    ['Прежние поправки', Object.entries(context.settings.adjustments ?? {}).filter(([, value]) => value !== 0).map(([key, value]) => `${EVENT_LABELS[key as CalculatedPrayerKey]} ${value > 0 ? '+' : ''}${value} мин`).join('; ') || 'Нет'],
  )
  return <Screen label="Сведения об источнике" top={<BackButton onClick={onClose} />}
    bottom={!official && onOpenMethodology ? <button id="source-methodology" className="pill pill-wide" type="button" onClick={onOpenMethodology}>Как считается время</button> : undefined}>
    <div className="source-readout">
      <h1 className="screen-title">{title}</h1><p>{official ? 'Официальная таблица' : 'Расчётное время'}</p>
      <dl className="readout-facts"><div><dt>Место</dt><dd>{placeLabel}</dd></div><div><dt>Дата</dt><dd>{formatCompactDateLabel(context.date)}</dd></div></dl>
      <p>{official ? 'Времена из таблицы, без пересчёта. Время Москвы.' : 'По координатам, дате и профилю. Расчёт на устройстве.'}</p>
      {context.mode === 'automatic' ? <p>Автоматически: таблица для места и даты. Вне её покрытия — расчёт по региону.</p> : null}
      {calculated?.estimatedPrayers.length ? <p>≈ По северному правилу: {calculated.estimatedPrayers.map(key => EVENT_LABELS[key]).join(', ')}.</p> : null}
      {calculated?.polarResolutionApplied ? <p>{staticText('source-copy-3')}</p> : null}
      {lateSuhur ? <p>Сухур до {lateSuhur.time} — {formatDateLabel(lateSuhur.date)}, накануне дня поста.</p> : null}
      <details className="app-details"><summary>Подробности</summary>
        <dl className="readout-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {official ? <><p className="screen-space">{staticText('source-copy-1')}</p><a href={meta?.source.url ?? provider?.bundled.source.url} target="_blank" rel="noreferrer">Первичный источник · {provider?.label ?? 'Поставщик'}</a></>
          : <><p className="screen-space">{staticText('source-copy-2')}</p><a href="https://github.com/batoulapps/adhan-js/blob/master/METHODS.md" target="_blank" rel="noreferrer">Профили Adhan</a></>}
        <p className="screen-space">{staticText('source-copy-4')}</p>
      </details>
    </div>
  </Screen>
}
