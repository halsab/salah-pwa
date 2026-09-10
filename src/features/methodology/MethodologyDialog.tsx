import { StaticContent } from '../../ui/StaticContent'
import { BackButton, Screen } from '../../ui/Screen'

export function MethodologyDialog({ open, officialScheduleUrl, onClose }: {
  open: boolean; officialScheduleUrl: string; onClose: () => void
}) {
  if (!open) return null
  return <Screen label="Как рассчитывается время" top={<BackButton onClick={onClose} />} contentClassName="source-readout">
    <StaticContent id="methodology-content" sourceUrl={officialScheduleUrl} />
  </Screen>
}
