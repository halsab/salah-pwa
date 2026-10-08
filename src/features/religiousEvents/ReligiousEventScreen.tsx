import { RELIGIOUS_EVENTS, type ReligiousEventId } from '../../domain/religiousEvents'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { BackButton, Screen } from '../../ui/Screen'
import { getReligiousEventContent } from './religiousEventContent'
import { useLocalization } from '../../localization'
import { localizedEventTitle } from '../../localization/religiousEvents'

export function ReligiousEventScreen({ eventId, onBack }: { eventId: ReligiousEventId; onBack: () => void }) {
  const { locale, t } = useLocalization()
  const definition = RELIGIOUS_EVENTS.find(event => event.id === eventId)
  const resolved = getReligiousEventContent(eventId, locale)
  if (!definition) return null
  if (resolved.status !== 'resolved') return <Screen label={localizedEventTitle(eventId, locale)} top={<BackButton onClick={onBack} />}><p role="status">{t('contentUnavailable')}</p></Screen>

  return <Screen label={localizedEventTitle(eventId, locale)} top={<BackButton onClick={onBack} />}>
    <MarkdownArticle content={resolved.content} />
  </Screen>
}
