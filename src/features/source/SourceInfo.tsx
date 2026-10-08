import type { ScheduleContext } from '../../domain/scheduleContext'
import { getEffectiveParameters } from '../../domain/prayerCalculation'
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
import { formatDateTime, formatLocaleDate, useLocalization } from '../../localization'

export function SourceInfo({ open, onClose, context, schedule, meta, placeLabel, checkedAt, updateFailed, onOpenMethodology }: {
  open: boolean; onClose: () => void; context: ScheduleContext; schedule: PrayerSchedule
  meta: DatasetMeta | null; placeLabel: string; checkedAt: number | null; updateFailed: boolean; onOpenMethodology?: () => void
}) {
  const { locale, t } = useLocalization()
  if (!open) return null
  const official = context.source === 'official'
  const provider = official ? PRAYER_PROVIDERS.find(item => item.id === context.provider) : null
  const calculated = 'entries' in schedule ? schedule : null
  const params = context.source === 'calculated' ? getEffectiveParameters(context.settings, context.date, context.timeZone) : null
  const lateFajrStart = buildScheduleEvents(schedule).find(event => event.key === 'fajrStart' && event.dayOffset === -1)
  const title = official ? provider?.label ?? t('officialTable') : t('calculatedSourceTitle')
  const facts: [string, string][] = [[t('timezone'), context.timeZone]]
  if (official) facts.push(
    [t('dataPoint'), meta?.locations.find(location => location.id === context.localityId)?.name ?? t('publishedPoint')],
    [t('providerUpdated'), meta?.source.updatedAt ? formatLocaleDate(meta.source.updatedAt.slice(0, 10), locale) : t('sourceDateMissing')],
    [t('freshness'), updateFailed ? t('updateFailed') : checkedAt ? t('checkedAt', { value: formatDateTime(checkedAt, context.timeZone, locale) }) : t('notChecked')],
  )
  else if (params) facts.push(
    [t('prayerFajr'), `${params.fajrAngle}°`],
    [t('prayerIsha'), params.ishaInterval > 0 ? t('minutesAfterSunset', { minutes: params.ishaInterval }) : `${params.ishaAngle}°`],
    [t('asr'), ASR_METHOD_LABELS[context.settings.asrMethod]],
    [t('highLatitude'), HIGH_LATITUDE_LABELS[context.settings.highLatitudeRule]],
  )
  const adjustments = context.source === 'calculated' ? Object.entries(context.settings.adjustments ?? {})
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${EVENT_LABELS[key as CalculatedPrayerKey]} ${value > 0 ? '+' : ''}${t('minutes', { count: value })}`).join('; ') : ''
  if (adjustments) facts.push([t('previousAdjustments'), adjustments])

  const lateFajrNote = lateFajrStart ? t('lateFajrNote', { time: markdownText(lateFajrStart.time), date: markdownText(formatDateLabel(lateFajrStart.date)) }) : ''
  const runtimeNotes = [
    calculated?.estimatedPrayers.length ? t('estimatedRule', { values: markdownText(calculated.estimatedPrayers.map(key => EVENT_LABELS[key]).join(', ')) }) : '',
    calculated?.polarResolutionApplied ? t('polarResolution') : '',
    lateFajrNote,
  ].filter(Boolean)
  const important = official
    ? [t('officialImportant'), ...runtimeNotes]
    : [...runtimeNotes, t('calculatedImportant')]

  const article = [
    `# ${markdownText(title)}`,
    official ? t('officialTable') : t('manualCalculation'),
    `- **${t('placeLabel')}:** ${markdownText(placeLabel)}\n- **${t('dateLabel')}:** ${markdownText(formatCompactDateLabel(context.date))}`,
    official ? t('officialTimes') : t('calculatedTimes'),
    context.mode === 'automatic' ? t('automaticCoverage') : '',
    official ? `## ${t('sourceFacts')}` : `## ${t('sourceParameters')}`,
    facts.map(([label, value]) => `- **${label}:** ${markdownText(value)}`).join('\n'),
    official ? markdownLink(t('primarySource', { name: provider?.label ?? t('provider') }), meta?.source.url ?? provider?.bundled.source.url ?? '') : '',
    `## ${t('important')}`,
    ...important,
    official ? '' : '[Профили Adhan](https://github.com/batoulapps/adhan-js/blob/master/METHODS.md)',
    `> ${t('disclaimer')}`,
  ].filter(Boolean).join('\n\n')

  return <Screen label={t('sourceDetails')} top={<BackButton onClick={onClose} />}
    bottom={!official && onOpenMethodology ? <ScreenFooter><ActionButton variant="primary" id="source-methodology" onClick={onOpenMethodology}>{t('sourceMethodology')}</ActionButton></ScreenFooter> : undefined}>
    <MarkdownArticle content={article} />
  </Screen>
}
