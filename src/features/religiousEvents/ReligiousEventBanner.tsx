import { ActionButton } from '../../ui/controls'
import type { ReligiousBannerState, ReligiousEventId } from '../../domain/religiousEvents'
import { RELIGIOUS_EVENTS } from '../../domain/religiousEvents'
import { useLocalization } from '../../localization'
import { localizedEventTitle } from '../../localization/religiousEvents'

export function ReligiousEventBanner({ state, onOpen }: {
  state: ReligiousBannerState
  onOpen: (eventId: ReligiousEventId, origin: HTMLElement) => void
}) {
  const { locale } = useLocalization()
  const contentId = state.contentId
  const title = localizedEventTitle(state.eventId, locale)
  const secondaryText = localizeSecondary(state.secondaryText, locale)
  const content = <>
    <span className="religious-event-banner-title">{title}</span>
    {secondaryText ? <span className="religious-event-banner-secondary">{secondaryText}</span> : null}
  </>

  return contentId
    ? <ActionButton id="religious-event-banner" className="religious-event-banner"
        aria-label={[title, secondaryText].filter(Boolean).join(' ')} onClick={event => onOpen(contentId, event.currentTarget)}>{content}</ActionButton>
    : <div id="religious-event-banner" className="religious-event-banner">{content}</div>
}

function localizeSecondary(value: string | null, locale: 'ru'): string | null {
  if (!value) return null
  if (value === 'завтра') return 'завтра'
  const match = value.match(/^(.*) через (\d+) дня$/u)
  if (!match) return value
  const [, rawTitle, rawCount] = match
  const definition = RELIGIOUS_EVENTS.find(item => item.title === rawTitle || item.listTitle === rawTitle)
  const title = definition ? localizedEventTitle(definition.id, locale, definition.listTitle === rawTitle) : rawTitle
  return `${title} через ${rawCount} ${Number(rawCount) === 1 ? 'день' : Number(rawCount) >= 2 && Number(rawCount) <= 4 ? 'дня' : 'дней'}`
}
