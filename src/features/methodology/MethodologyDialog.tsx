import { methodologyArticle } from '../../content/informationArticles'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { BackButton, Screen } from '../../ui/Screen'

export function MethodologyDialog({ open, officialScheduleUrl, onClose }: {
  open: boolean; officialScheduleUrl: string; onClose: () => void
}) {
  if (!open) return null
  return <Screen label="Как рассчитывается время" top={<BackButton onClick={onClose} />}>
    <MarkdownArticle content={methodologyArticle(officialScheduleUrl)} />
  </Screen>
}
