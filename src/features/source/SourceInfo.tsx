import type { ScheduleContext } from '../../domain/scheduleContext'
import { CALCULATION_PROFILES, getEffectiveParameters } from '../../domain/prayerCalculation'
import type { DatasetMeta } from '../../storage/database'
import { PRAYER_PROVIDERS } from '../../data/prayerProviders'
import { buildScheduleEvents, type PrayerSchedule } from '../../domain/scheduleEvents'
import { formatCompactDateLabel, formatDateLabel } from '../../domain/date'
import { ASR_METHOD_LABELS, EVENT_LABELS, HIGH_LATITUDE_LABELS } from '../../ui/calculationLabels'
import { BackButton, Screen } from '../../ui/Screen'
import { ActionButton, ScreenFooter } from '../../ui/controls'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { markdownLink, markdownText } from '../../ui/markdownContent'
import type { CalculatedPrayerKey } from '../../domain/types'

const DISCLAIMER = 'Информационное приложение не представляет ДУМ РТ или другую религиозную организацию. Расчётное время может отличаться от расписания местной мечети. При наличии официального местного расписания рекомендуется руководствоваться им.'

export function SourceInfo({ open, onClose, context, schedule, meta, placeLabel, checkedAt, updateFailed, onOpenMethodology }: {
  open: boolean; onClose: () => void; context: ScheduleContext; schedule: PrayerSchedule
  meta: DatasetMeta | null; placeLabel: string; checkedAt: number | null; updateFailed: boolean; onOpenMethodology?: () => void
}) {
  if (!open) return null
  const official = context.source === 'official'
  const provider = official ? PRAYER_PROVIDERS.find(item => item.id === context.provider) : null
  const calculated = 'entries' in schedule ? schedule : null
  const params = context.source === 'calculated' ? getEffectiveParameters(context.settings, context.date, context.timeZone) : null
  const lateFajrStart = buildScheduleEvents(schedule).find(event => event.key === 'fajrStart' && event.dayOffset === -1)
  const title = official ? provider?.label ?? 'Официальная таблица'
    : CALCULATION_PROFILES.find(profile => profile.id === context.settings.profile)?.label ?? 'Расчёт'
  const facts: [string, string][] = [['Часовой пояс', context.timeZone]]
  if (official) facts.push(
    ['Пункт таблицы', meta?.locations.find(location => location.id === context.localityId)?.name ?? 'Опубликованный пункт'],
    ['Обновлено поставщиком', meta?.source.updatedAt ? new Date(meta.source.updatedAt).toLocaleDateString('ru-RU') : 'Дата не указана'],
    ['Актуальность', updateFailed ? 'Проверка обновлений не удалась. Показана сохранённая таблица.' : checkedAt ? `Проверено ${new Date(checkedAt).toLocaleString('ru-RU')}` : 'Ещё не проверено'],
  )
  else if (params) facts.push(
    ['Фаджр', `${params.fajrAngle}°`],
    ['Иша', params.ishaInterval > 0 ? `${params.ishaInterval} мин после заката` : `${params.ishaAngle}°`],
    ['Аср', ASR_METHOD_LABELS[context.settings.asrMethod]],
    ['Северное правило', HIGH_LATITUDE_LABELS[context.settings.highLatitudeRule]],
  )
  const adjustments = context.source === 'calculated' ? Object.entries(context.settings.adjustments ?? {})
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${EVENT_LABELS[key as CalculatedPrayerKey]} ${value > 0 ? '+' : ''}${value} мин`).join('; ') : ''
  if (adjustments) facts.push(['Прежние поправки', adjustments])

  const lateFajrNote = lateFajrStart ? `Фаджр (конец сухура) ${markdownText(lateFajrStart.time)} — ${markdownText(formatDateLabel(lateFajrStart.date))}, накануне дня поста.` : ''
  const runtimeNotes = [
    calculated?.estimatedPrayers.length ? `≈ По северному правилу: ${markdownText(calculated.estimatedPrayers.map(key => EVENT_LABELS[key]).join(', '))}.` : '',
    calculated?.polarResolutionApplied ? 'Солнечный цикл восстановлен по ближайшей подходящей широте или дню.' : '',
    lateFajrNote,
  ].filter(Boolean)
  const important = official
    ? ['Опубликованные значения показаны без пересчёта. Пункт таблицы может отличаться от выбранного места: для подтверждённого покрытия используется ближайший опубликованный пункт. Утренний намаз в мечетях — время джамаата, а завершение сухура не заменяет начало Фаджра.', ...runtimeNotes]
    : [...runtimeNotes, 'Вычислено на устройстве для выбранного места и даты. Интернет для расчёта не нужен. Название профиля обозначает параметры расчёта, а не официальность результата.']

  const article = [
    `# ${markdownText(title)}`,
    official ? 'Официальная таблица' : 'Расчётное время',
    `- **Место:** ${markdownText(placeLabel)}\n- **Дата:** ${markdownText(formatCompactDateLabel(context.date))}`,
    official ? 'Времена взяты из опубликованной таблицы без пересчёта.' : 'Время рассчитывается на устройстве по координатам, дате и выбранному профилю.',
    context.mode === 'automatic' ? 'Автоматически: таблица для места и даты. Вне её покрытия — расчёт по региону.' : '',
    official ? '## Сведения' : '## Параметры',
    facts.map(([label, value]) => `- **${label}:** ${markdownText(value)}`).join('\n'),
    official ? markdownLink(`Первичный источник · ${provider?.label ?? 'Поставщик'}`, meta?.source.url ?? provider?.bundled.source.url ?? '') : '',
    '## Важно',
    ...important,
    official ? '' : '[Профили Adhan](https://github.com/batoulapps/adhan-js/blob/master/METHODS.md)',
    `> ${DISCLAIMER}`,
  ].filter(Boolean).join('\n\n')

  return <Screen label="Сведения об источнике" top={<BackButton onClick={onClose} />}
    bottom={!official && onOpenMethodology ? <ScreenFooter><ActionButton variant="primary" id="source-methodology" onClick={onOpenMethodology}>Как считается время</ActionButton></ScreenFooter> : undefined}>
    <MarkdownArticle content={article} />
  </Screen>
}
