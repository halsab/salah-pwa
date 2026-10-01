import { ActionButton } from '../../ui/controls'
import type { ReligiousBannerState, ReligiousEventId } from '../../domain/religiousEvents'

export function ReligiousEventBanner({ state, onOpen }: {
  state: ReligiousBannerState
  onOpen: (eventId: ReligiousEventId) => void
}) {
  const contentId = state.contentId
  const content = <>
    <span className="religious-event-banner-title">{state.title}</span>
    {state.secondaryText ? <span className="religious-event-banner-secondary">{state.secondaryText}</span> : null}
  </>

  return contentId
    ? <ActionButton id="religious-event-banner" className="religious-event-banner"
        aria-label={[state.title, state.secondaryText].filter(Boolean).join(' ')} onClick={() => onOpen(contentId)}>{content}</ActionButton>
    : <div id="religious-event-banner" className="religious-event-banner">{content}</div>
}
