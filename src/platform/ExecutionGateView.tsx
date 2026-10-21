import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocalization } from '../localization'
import { ActionButton } from '../ui/controls'
import { createExecutionGate, waitForExecutionQuiescence } from './executionGate'

const App = lazy(() => import('../App').then(module => ({ default: module.App })))

export function ExecutionGateView() {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const gate = useRef<ReturnType<typeof createExecutionGate> | null>(null)
  const { t } = useLocalization()

  useEffect(() => {
    const owner = createExecutionGate()
    gate.current = owner
    owner.onTakeover(async () => {
      flushSync(() => setActive(false))
      await waitForExecutionQuiescence()
    })
    const pagehide = () => {
      flushSync(() => setActive(false))
      void owner.relinquish()
    }
    window.addEventListener('pagehide', pagehide)
    void owner.start().then(ok => {
      if (gate.current !== owner) return
      if (ok) setActive(true)
      else setFailed(!owner.supported)
    })
    return () => { window.removeEventListener('pagehide', pagehide); owner.close(); gate.current = null }
  }, [])

  const request = async () => {
    if (busy || !gate.current) return
    setBusy(true)
    setFailed(false)
    const ok = await gate.current.requestOwnership()
    if (ok) setActive(true)
    else setFailed(true)
    setBusy(false)
  }

  if (active) return <Suspense fallback={<main className="execution-gate" aria-busy="true" />}><App /></Suspense>
  return <main className="execution-gate" aria-live="polite">
    <section className="execution-gate__content" aria-labelledby="execution-gate-title">
      <h1 id="execution-gate-title">{t('executionGateTitle')}</h1>
      <p>{t('executionGateDescription')}</p>
      {failed && <p role="alert">{t('executionGateFailure')}</p>}
      <ActionButton variant="primary" disabled={busy} onClick={() => void request()}>
        {busy ? t('executionGateSwitching') : failed ? t('retryAgain') : t('executionGateContinue')}
      </ActionButton>
    </section>
  </main>
}
