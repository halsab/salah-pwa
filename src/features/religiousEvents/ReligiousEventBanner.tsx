import { ActionButton } from '../../ui/controls'
import type { ReligiousBannerState, ReligiousEventId } from '../../domain/religiousEvents'
import { RELIGIOUS_EVENTS } from '../../domain/religiousEvents'
import { translate, useLocalization } from '../../localization'
import { localizedEventTitle } from '../../localization/religiousEvents'
import type { Translator } from '../../localization/messages'

export function ReligiousEventBanner({ state, onOpen }: {
  state: ReligiousBannerState
  onOpen: (eventId: ReligiousEventId, origin: HTMLElement) => void
}) {
  const { locale, t } = useLocalization()
  const contentId = state.contentId
  const title = localizedEventTitle(state.eventId, locale)
  const secondaryText = localizeSecondary(state.secondaryText, locale, t)
  const content = <>
    <span className="religious-event-banner-title">{title}</span>
    {secondaryText ? <span className="religious-event-banner-secondary">{secondaryText}</span> : null}
  </>

  return contentId
    ? <ActionButton id="religious-event-banner" className="religious-event-banner"
        aria-label={[title, secondaryText].filter(Boolean).join(' ')} onClick={event => onOpen(contentId, event.currentTarget)}>{content}</ActionButton>
    : <div id="religious-event-banner" className="religious-event-banner">{content}</div>
}

function localizeSecondary(value: string | null, locale: 'ru', t: Translator): string | null {
  if (!value) return null
  if (value === translate('ru', 'tomorrow')) return t('tomorrow')
  const match = value.match(/(\d+)/u)
  if (!match) return value
  const rawCount = match[1]
  const definition = RELIGIOUS_EVENTS.find(item => value.startsWith(item.title) || (item.listTitle && value.startsWith(item.listTitle)))
  if (!definition) return value
  const title = localizedEventTitle(definition.id, locale, definition.listTitle !== undefined && value.startsWith(definition.listTitle))
  return `${title} ${t('inDays', { count: Number(rawCount) })}`
}
