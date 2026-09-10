import { useEffect, useRef, useState } from 'react'
import { APP_SHARE_URL } from '../../platform/appLink'
import { BackButton, Screen } from '../../ui/Screen'

interface ShareDialogProps { open: boolean; onClose: () => void }

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  return open ? <ShareScreen onClose={onClose} /> : null
}

function ShareScreen({ onClose }: Pick<ShareDialogProps, 'onClose'>) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const operation = useRef(0)
  const linkRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => () => { operation.current += 1 }, [])
  const copyLink = async () => {
    const epoch = ++operation.current
    setCopyStatus('idle')
    try {
      const clipboard = (navigator as { clipboard?: Clipboard }).clipboard
      if (!clipboard) throw new Error('Clipboard API недоступен')
      await clipboard.writeText(APP_SHARE_URL)
      if (epoch === operation.current) setCopyStatus('success')
    } catch {
      if (epoch !== operation.current) return
      setCopyStatus('error')
      linkRef.current?.focus({ preventScroll: true })
      linkRef.current?.select()
    }
  }
  return <Screen label="Поделиться" top={<BackButton onClick={onClose} />} contentClassName="share-screen"
    bottom={<button className="pill pill-wide" type="button" onClick={() => void copyLink()}>{copyStatus === 'success' ? 'Скопировано' : 'Скопировать ссылку'}</button>}>
    <img className="app-share-qr" src={`${import.meta.env.BASE_URL}share-qr.svg`} width="270" height="270" alt="QR-код ссылки на приложение" />
    <div><label className="note share-label" htmlFor="share-url">Ссылка на приложение</label>
      <textarea ref={linkRef} id="share-url" className="app-share-url" value={APP_SHARE_URL} readOnly rows={2} spellCheck={false} />
      <p role="status" aria-live="polite" aria-atomic="true" className={copyStatus === 'error' ? 'note screen-space' : 'sr-only'}>
        {copyStatus === 'success' ? 'Ссылка скопирована' : copyStatus === 'error' ? 'Не удалось скопировать ссылку. Скопируйте выделенный текст.' : ''}
      </p>
    </div>
  </Screen>
}
