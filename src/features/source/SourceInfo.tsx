import type { ScheduleContext } from '../../domain/scheduleContext'
import { getEffectiveParameters } from '../../domain/prayerCalculation'
import type { DatasetMeta } from '../../storage/database'
import { PRAYER_PROVIDERS } from '../../data/prayerProviders'
import { buildScheduleEvents, type PrayerSchedule, type ResolvedScheduleEvent } from '../../domain/scheduleEvents'
import { ASR_METHOD_KEYS, EVENT_LABEL_KEYS, HIGH_LATITUDE_KEYS } from '../../ui/calculationLabels'
import { BackButton, Screen } from '../../ui/Screen'
import { ActionButton, ScreenFooter } from '../../ui/controls'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { markdownLink, markdownText } from '../../ui/markdownContent'
import type { CalculatedPrayerKey } from '../../domain/types'
import { formatCompactDateLabel, formatDateLabel, formatDateTime, formatLocaleDate, useLocalization } from '../../localization'

export function SourceInfo({ open, onClose, context, schedule, meta, placeLabel, checkedAt, updateFailed, onOpenMethodology }: {
  open: boolean; onClose: () => void; context: ScheduleContext; schedule: PrayerSchedule
  meta: DatasetMeta | null; placeLabel: string; checkedAt: number | null; updateFailed: boolean; onOpenMethodology?: () => void
}) {
  const { locale, t } = useLocalization()
  if (!open) return null
  const official = context.source === 'official'
  const provider = official ? PRAYER_PROVIDERS.find(item => item.id === context.provider) : null
  const providerName = provider?.id === 'dumRt' ? t('dumRt') : t('provider')
  const calculated = 'entries' in schedule ? schedule : null
  const params = context.source === 'calculated' ? getEffectiveParameters(context.settings, context.date, context.timeZone) : null
  const lateFajrStart = buildScheduleEvents(schedule).find((event): event is ResolvedScheduleEvent => event.status === 'resolved' && event.key === 'fajrStart' && event.dayOffset === -1)
  const title = official ? provider ? providerName : t('officialTable') : t('calculatedSourceTitle')
  const facts: [string, string][] = [[t('timezone'), context.timeZone]]
  if (official) facts.push(
    [t('dataPoint'), meta?.locations.find(location => location.id === context.localityId)?.name ?? t('publishedPoint')],
    [t('providerUpdated'), meta?.source.updatedAt ? formatLocaleDate(meta.source.updatedAt.slice(0, 10), locale) : t('sourceDateMissing')],
    [t('freshness'), updateFailed ? t('updateFailed') : checkedAt ? t('checkedAt', { value: formatDateTime(checkedAt, context.timeZone, locale) }) : t('notChecked')],
  )
  else if (params) facts.push(
    [t('prayerFajr'), `${params.fajrAngle}°`],
    [t('prayerIsha'), params.ishaInterval > 0 ? t('minutesAfterSunset', { minutes: params.ishaInterval }) : `${params.ishaAngle}°`],
    [t('asr'), t(ASR_METHOD_KEYS[context.settings.asrMethod])],
    [t('highLatitude'), t(HIGH_LATITUDE_KEYS[context.settings.highLatitudeRule])],
  )
  const adjustments = context.source === 'calculated' ? Object.entries(context.settings.adjustments ?? {})
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${t(EVENT_LABEL_KEYS[key as CalculatedPrayerKey])} ${value > 0 ? '+' : ''}${t('minutes', { count: value })}`).join('; ') : ''
  if (adjustments) facts.push([t('previousAdjustments'), adjustments])

  const lateFajrNote = lateFajrStart ? t('lateFajrNote', { time: markdownText(lateFajrStart.time), date: markdownText(formatDateLabel(lateFajrStart.date, locale)) }) : ''
  const runtimeNotes = [
    calculated?.estimatedPrayers.length ? t('estimatedRule', { values: markdownText(calculated.estimatedPrayers.map(key => t(EVENT_LABEL_KEYS[key])).join(', ')) }) : '',
    calculated?.polarResolutionApplied ? t('polarResolution') : '',
    lateFajrNote,
  ].filter(Boolean)
  const important = official
    ? [t('officialImportant'), ...runtimeNotes]
    : [...runtimeNotes, t('calculatedImportant')]

  const article = [
    `# ${markdownText(title)}`,
    official ? t('officialTable') : t('manualCalculation'),
    `- **${t('placeLabel')}:** ${markdownText(placeLabel)}\n- **${t('dateLabel')}:** ${markdownText(formatCompactDateLabel(context.date, locale))}`,
    official ? t('officialTimes') : t('calculatedTimes'),
    context.mode === 'automatic' ? t('automaticCoverage') : '',
    official ? `## ${t('sourceFacts')}` : `## ${t('sourceParameters')}`,
    facts.map(([label, value]) => `- **${label}:** ${markdownText(value)}`).join('\n'),
    official ? markdownLink(t('primarySource', { name: provider ? providerName : t('provider') }), meta?.source.url ?? provider?.bundled.source.url ?? '') : '',
    `## ${t('important')}`,
    ...important,
    official ? '' : markdownLink(t('adhanProfilesLink'), 'https://github.com/batoulapps/adhan-js/blob/master/METHODS.md'),
    `> ${t('disclaimer')}`,
  ].filter(Boolean).join('\n\n')

  return <Screen label={t('sourceDetails')} top={<BackButton onClick={onClose} />}
    bottom={!official && onOpenMethodology ? <ScreenFooter><ActionButton variant="primary" id="source-methodology" onClick={onOpenMethodology}>{t('sourceMethodology')}</ActionButton></ScreenFooter> : undefined}>
    <MarkdownArticle content={article} />
  </Screen>
}
