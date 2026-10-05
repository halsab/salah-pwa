import { useEffect, useRef, useState } from 'react'
import { APP_SHARE_URL } from '../../platform/appLink'
import { BackButton, Screen } from '../../ui/Screen'
import { ActionButton, ScreenFooter } from '../../ui/controls'

interface ShareDialogProps { open: boolean; onClose: () => void }

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  return open ? <ShareScreen onClose={onClose} /> : null
}

function ShareScreen({ onClose }: Pick<ShareDialogProps, 'onClose'>) {
  const [status, setStatus] = useState<'idle' | 'shared' | 'copied' | 'share-error' | 'copy-error'>('idle')
  const operation = useRef(0)
  const linkRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => () => { operation.current += 1 }, [])
  const copyLink = async () => {
    const epoch = ++operation.current
    setStatus('idle')
    try {
      const clipboard = (navigator as { clipboard?: Clipboard }).clipboard
      if (!clipboard) throw new Error('Clipboard API недоступен')
      await clipboard.writeText(APP_SHARE_URL)
      if (epoch === operation.current) setStatus('copied')
    } catch {
      if (epoch !== operation.current) return
      setStatus('copy-error')
      linkRef.current?.focus({ preventScroll: true })
      linkRef.current?.select()
    }
  }
  const shareLink = () => {
    const share = navigator.share
    if (!share) {
      void copyLink()
      return
    }

    const epoch = ++operation.current
    setStatus('idle')
    void share.call(navigator, { title: 'Salah — время намаза', url: APP_SHARE_URL }).then(
      () => { if (epoch === operation.current) setStatus('shared') },
      error => {
        if (epoch !== operation.current) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('share-error')
      },
    )
  }
  const copyOnly = status === 'share-error' || !navigator.share
  const hasError = status === 'share-error' || status === 'copy-error'
  return <Screen label="Поделиться" top={<BackButton onClick={onClose} />} contentClassName="share-screen"
    bottom={<ScreenFooter><ActionButton variant="primary" onClick={copyOnly ? () => void copyLink() : shareLink}>{status === 'copied' ? 'Скопировано' : copyOnly ? 'Скопировать ссылку' : 'Поделиться'}</ActionButton></ScreenFooter>}>
    <img className="app-share-qr" src={`${import.meta.env.BASE_URL}share-qr.svg`} width="270" height="270" alt="QR-код ссылки на приложение" />
    <div><label className="note share-label" htmlFor="share-url">Ссылка на приложение</label>
      <textarea ref={linkRef} id="share-url" className="app-share-url" value={APP_SHARE_URL} readOnly rows={2} spellCheck={false} />
      <p role="status" aria-live="polite" aria-atomic="true" className={hasError ? 'note screen-space' : 'sr-only'}>
        {status === 'copied' ? 'Ссылка скопирована' : status === 'share-error' ? 'Не удалось поделиться. Скопируйте ссылку.' : status === 'copy-error' ? 'Не удалось скопировать ссылку. Скопируйте выделенный текст.' : ''}
      </p>
    </div>
  </Screen>
}
