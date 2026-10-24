import type { ScheduleContext } from '../../domain/scheduleContext'
import { getEffectiveParameters } from '../../domain/prayerCalculation'
import { buildScheduleEvents } from '../../domain/scheduleEvents'
import { ASR_METHOD_KEYS, EVENT_LABEL_KEYS, HIGH_LATITUDE_KEYS, PROFILE_LABEL_KEYS } from '../../ui/calculationLabels'
import { BackButton, Screen } from '../../ui/Screen'
import { ActionButton, ScreenFooter } from '../../ui/controls'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { markdownLink, markdownText } from '../../ui/markdownContent'
import type { CalculatedPrayerKey } from '../../domain/types'
import { formatCompactDateLabel, formatDateLabel, useLocalization } from '../../localization'

export function SourceInfo({ open, onClose, context, schedule, placeLabel, onOpenMethodology }: {
  open: boolean; onClose: () => void; context: ScheduleContext; schedule: import('../../domain/scheduleEvents').PrayerSchedule
  placeLabel: string; onOpenMethodology?: () => void
}) {
  const { locale, t } = useLocalization()
  if (!open) return null
  const params = getEffectiveParameters(context.settings, context.date, context.timeZone)
  const lateFajr = buildScheduleEvents(schedule).find(event => event.key === 'fajr' && event.dayOffset === -1)
  const facts: [string, string][] = [
    [t('timezone'), context.timeZone],
    [t('calculationProfile'), t(PROFILE_LABEL_KEYS[context.settings.profile])],
    [t('prayerFajr'), `${params.fajrAngle}°`],
    [t('prayerIsha'), params.ishaInterval > 0 ? t('minutesAfterSunset', { minutes: params.ishaInterval }) : `${params.ishaAngle}°`],
    [t('asr'), t(ASR_METHOD_KEYS[context.settings.asrMethod])],
    [t('highLatitude'), t(HIGH_LATITUDE_KEYS[context.settings.highLatitudeRule])],
  ]
  const adjustments = Object.entries(context.settings.adjustments ?? {})
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${t(EVENT_LABEL_KEYS[key as CalculatedPrayerKey])} ${value > 0 ? '+' : ''}${t('minutes', { count: value })}`).join('; ')
  if (adjustments) facts.push([t('previousAdjustments'), adjustments])

  const calculated = schedule
  const runtimeNotes = [
    calculated.estimatedPrayers.length
      ? t('estimatedRule', { values: markdownText(calculated.estimatedPrayers.map(key => t(EVENT_LABEL_KEYS[key])).join(', ')) }) : '',
    calculated.polarResolutionApplied ? t('polarResolution') : '',
    lateFajr ? t('lateFajrNote', { time: markdownText(lateFajr.time), date: markdownText(formatDateLabel(lateFajr.date, locale)) }) : '',
  ].filter(Boolean)
  const important = [...runtimeNotes, t('calculatedImportant')]
  const article = [
    `# ${t(context.mode === 'automatic' ? 'calculatedSourceTitle' : 'manualCalculation')}`,
    `- **${t('placeLabel')}:** ${markdownText(placeLabel)}\n- **${t('dateLabel')}:** ${markdownText(formatCompactDateLabel(context.date, locale))}`,
    t('calculatedTimes'),
    context.mode === 'automatic' ? t('automaticScheduleDescription') : '',
    `## ${t('sourceParameters')}`,
    facts.map(([label, value]) => `- **${label}:** ${markdownText(value)}`).join('\n'),
    context.settings.profile === 'tatarstan' ? t('tatarstanDhuhrPolicy') : '',
    `## ${t('important')}`,
    ...important,
    markdownLink(t('adhanProfilesLink'), 'https://github.com/batoulapps/adhan-js'),
    `> ${t('disclaimer')}`,
  ].filter(Boolean).join('\n\n')

  return <Screen label={t('sourceDetails')} top={<BackButton onClick={onClose} />}
    bottom={onOpenMethodology ? <ScreenFooter><ActionButton variant="primary" id="source-methodology" onClick={onOpenMethodology}>{t('sourceMethodology')}</ActionButton></ScreenFooter> : undefined}>
    <MarkdownArticle content={article} />
  </Screen>
}
