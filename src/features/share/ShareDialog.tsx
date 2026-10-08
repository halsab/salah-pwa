import { useEffect, useRef, useState } from 'react'
import { APP_SHARE_URL } from '../../platform/appLink'
import { BackButton, Screen } from '../../ui/Screen'
import { ActionButton, ScreenFooter } from '../../ui/controls'
import { useLocalization } from '../../localization'

interface ShareDialogProps { open: boolean; onClose: () => void }

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  return open ? <ShareScreen onClose={onClose} /> : null
}

function ShareScreen({ onClose }: Pick<ShareDialogProps, 'onClose'>) {
  const { t } = useLocalization()
  const [status, setStatus] = useState<'idle' | 'shared' | 'copied' | 'share-error' | 'copy-error'>('idle')
  const operation = useRef(0)
  const linkRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => () => { operation.current += 1 }, [])
  const copyLink = async () => {
    const epoch = ++operation.current
    setStatus('idle')
    try {
      const clipboard = (navigator as { clipboard?: Clipboard }).clipboard
      if (!clipboard) throw new Error('clipboard-unavailable')
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
    if (typeof navigator.share !== 'function') {
      void copyLink()
      return
    }

    const epoch = ++operation.current
    setStatus('idle')
    try {
      void navigator.share({ title: t('shareTitle'), url: APP_SHARE_URL }).then(
        () => { if (epoch === operation.current) setStatus('shared') },
        (error: unknown) => {
          if (epoch !== operation.current) return
          if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return
          setStatus('share-error')
        },
      )
    } catch {
      if (epoch === operation.current) setStatus('share-error')
    }
  }
  const copyOnly = status === 'share-error' || !navigator.share
  const hasError = status === 'share-error' || status === 'copy-error'
  return <Screen label={t('share')} top={<BackButton onClick={onClose} />} contentClassName="share-screen"
    bottom={<ScreenFooter><ActionButton variant="primary" onClick={copyOnly ? () => void copyLink() : shareLink}>{status === 'copied' ? t('copied') : copyOnly ? t('copyLink') : t('share')}</ActionButton></ScreenFooter>}>
    <img className="app-share-qr" src={`${import.meta.env.BASE_URL}share-qr.svg`} width="270" height="270" alt={t('shareQrAlt')} />
    <div><label className="note share-label" htmlFor="share-url">{t('appLink')}</label>
      <textarea ref={linkRef} id="share-url" className="app-share-url" value={APP_SHARE_URL} readOnly rows={2} spellCheck={false} />
      <p role="status" aria-live="polite" aria-atomic="true" className={hasError ? 'note screen-space' : 'sr-only'}>
        {status === 'copied' ? t('linkCopied') : status === 'share-error' ? t('shareError') : status === 'copy-error' ? t('copyError') : ''}
      </p>
    </div>
  </Screen>
}
