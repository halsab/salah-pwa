import { useRef } from 'react'

import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'

const APP_SHARE_QR_SRC = `${import.meta.env.BASE_URL}share-qr.svg`

interface ShareDialogProps {
  open: boolean
  onClose: () => void
}

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, closeRef)
  const layerRef = useDialogViewport(open)
  if (!open) return null

  return (
    <div
      ref={layerRef}
      className="dialog-layer share-layer"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        aria-label="QR-код Salah"
        aria-modal="true"
        className="share-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <div className="share-content">
          <div className="share-qr-frame">
            <img
              className="share-qr"
              src={APP_SHARE_QR_SRC}
              width="512"
              height="512"
              alt="QR-код со ссылкой на Salah"
            />
          </div>
          <button
            ref={closeRef}
            className="primary-button share-close-button"
            type="button"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </section>
    </div>
  )
}
