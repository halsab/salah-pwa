import { RELIGIOUS_EVENTS, type ReligiousEventId } from '../../domain/religiousEvents'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { BackButton, Screen } from '../../ui/Screen'
import { RELIGIOUS_EVENT_CONTENT } from './religiousEventContent'

export function ReligiousEventScreen({ eventId, onBack, sharedTransitionName }: { eventId: ReligiousEventId; onBack: () => void; sharedTransitionName?: string | null }) {
  const definition = RELIGIOUS_EVENTS.find(event => event.id === eventId)
  const content = RELIGIOUS_EVENT_CONTENT[eventId]
  if (!definition) return null

  return <Screen label={definition.title} top={<BackButton onClick={onBack} />} contentClassName={sharedTransitionName ? 'religious-event-detail' : ''} sharedTransitionName={sharedTransitionName ?? null}>
    <MarkdownArticle content={content} />
  </Screen>
}
