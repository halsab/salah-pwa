import { getInformationContent } from '../../content/contentRegistry'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { BackButton, Screen } from '../../ui/Screen'
import { useLocalization } from '../../localization'

export function MethodologyDialog({ open, officialScheduleUrl, onClose }: {
  open: boolean; officialScheduleUrl: string; onClose: () => void
}) {
  const { locale, t } = useLocalization()
  if (!open) return null
  const content = getInformationContent('methodology', locale, officialScheduleUrl)
  return <Screen label={t('sourceCalculationDetails')} top={<BackButton onClick={onClose} />}>
    <MarkdownArticle content={content.status === 'resolved' ? content.content : ''} />
  </Screen>
}
