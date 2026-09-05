import { useEffect, useRef, useState } from 'react'

import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'

const APP_SHARE_QR_SRC = `${import.meta.env.BASE_URL}share-qr.svg`

interface ShareDialogProps {
  open: boolean
  onClose: () => void
}

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  return open ? <OpenShareDialog onClose={onClose} /> : null
}

function OpenShareDialog({ onClose }: Pick<ShareDialogProps, 'onClose'>) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const copyOperationEpoch = useRef(0)
  const copyRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(true, onClose, copyRef)
  const layerRef = useDialogViewport(true)

  useEffect(() => {
    return () => {
      copyOperationEpoch.current += 1
    }
  }, [])

  const copyLink = async () => {
    const operationEpoch = ++copyOperationEpoch.current
    setCopyStatus('idle')
    try {
      const clipboard = (navigator as { clipboard?: Clipboard }).clipboard
      if (!clipboard) throw new Error('Clipboard API недоступен')
      await clipboard.writeText(window.location.href)
      if (operationEpoch !== copyOperationEpoch.current) return
      setCopyStatus('success')
    } catch {
      if (operationEpoch !== copyOperationEpoch.current) return
      setCopyStatus('error')
    }
  }

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
            ref={copyRef}
            className="primary-button share-close-button share-copy-button"
            type="button"
            onClick={() => void copyLink()}
          >
            Скопировать ссылку
          </button>
          <p
            className={copyStatus === 'error' ? 'share-copy-status' : 'sr-only'}
            aria-atomic="true"
            aria-live="polite"
            role="status"
          >
            {copyStatus === 'success'
              ? 'Ссылка скопирована'
              : copyStatus === 'error'
                ? 'Не удалось скопировать ссылку'
                : ''}
          </p>
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
