import Markdown from 'react-markdown'

import { RELIGIOUS_EVENTS, type ReligiousEventId } from '../../domain/religiousEvents'
import { BackButton, Screen } from '../../ui/Screen'
import { RELIGIOUS_EVENT_CONTENT } from './religiousEventContent'

const ALLOWED_ELEMENTS = ['h1', 'h2', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']

export function ReligiousEventScreen({ eventId, onBack }: { eventId: ReligiousEventId; onBack: () => void }) {
  const definition = RELIGIOUS_EVENTS.find(event => event.id === eventId)
  const content = RELIGIOUS_EVENT_CONTENT[eventId]
  if (!definition) return null

  return <Screen label={definition.title} top={<BackButton onClick={onBack} />} contentClassName="religious-event-article">
    <Markdown allowedElements={ALLOWED_ELEMENTS} skipHtml>{content}</Markdown>
  </Screen>
}
