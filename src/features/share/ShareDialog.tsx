import { useEffect, useRef, useState } from 'react'

import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'

const APP_SHARE_QR_SRC = `${import.meta.env.BASE_URL}share-qr.svg`

interface ShareDialogProps {
  open: boolean
  onClose: () => void
}

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const copyOperationEpoch = useRef(0)
  const copyRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, copyRef)
  const layerRef = useDialogViewport(open)

  useEffect(() => {
    copyOperationEpoch.current += 1
    setCopyStatus('idle')
    return () => {
      copyOperationEpoch.current += 1
    }
  }, [open])

  if (!open) return null

  const copyLink = async () => {
    const operationEpoch = ++copyOperationEpoch.current
    setCopyStatus('idle')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API недоступен')
      await navigator.clipboard.writeText(window.location.href)
      if (!open || operationEpoch !== copyOperationEpoch.current) return
      setCopyStatus('success')
    } catch {
      if (!open || operationEpoch !== copyOperationEpoch.current) return
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
            className="share-copy-status"
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
