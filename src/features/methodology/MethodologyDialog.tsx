import { useRef } from 'react'

import { StaticContent } from '../../ui/StaticContent'
import { CloseIcon } from '../../ui/Icons'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'


interface MethodologyDialogProps {
  open: boolean
  officialScheduleUrl: string
  onClose: () => void
}

export function MethodologyDialog({
  open,
  officialScheduleUrl,
  onClose,
}: MethodologyDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, closeRef)
  const layerRef = useDialogViewport(open)
  if (!open) return null

  return (
    <div
      ref={layerRef}
      className="dialog-layer"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        aria-labelledby="methodology-dialog-title"
        aria-modal="true"
        className="location-dialog methodology-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <h2 id="methodology-dialog-title">Как рассчитывается время</h2>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <StaticContent id="methodology-content" sourceUrl={officialScheduleUrl} />
      </section>
    </div>
  )
}
