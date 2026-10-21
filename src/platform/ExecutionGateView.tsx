import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocalization } from '../localization'
import { ActionButton } from '../ui/controls'
import { isThemeFamily, readThemePreferenceCache, themeFamilyFromCacheEvent } from '../ui/themePreferenceCache'
import { applyTheme, resolveTheme } from '../ui/theme'
import { useSystemAppearance } from '../ui/useSystemAppearance'
import { createExecutionGate, waitForExecutionQuiescence } from './executionGate'

const App = lazy(() => import('../App').then(module => ({ default: module.App })))

function currentCivilDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ExecutionGateView() {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const gate = useRef<ReturnType<typeof createExecutionGate> | null>(null)
  const { t } = useLocalization()
  const systemTone = useSystemAppearance()
  const [themeFamily, setThemeFamily] = useState(readThemePreferenceCache)
  const [civilDate, setCivilDate] = useState(currentCivilDate)

  useEffect(() => {
    const syncDate = () => setCivilDate(currentCivilDate())
    const syncCache = (event: StorageEvent) => {
      const next = themeFamilyFromCacheEvent(event)
      if (next) setThemeFamily(next)
    }
    window.addEventListener('storage', syncCache)
    const timer = window.setInterval(syncDate, 60_000)
    let channel: BroadcastChannel | null = null
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('salah-theme-preference-v1')
        channel.onmessage = event => {
          if (isThemeFamily(event.data)) {
            setThemeFamily(event.data)
          }
        }
      }
    } catch { /* Синхронизация палитры необязательна для блокировки исполнения. */ }
    return () => {
      window.removeEventListener('storage', syncCache)
      window.clearInterval(timer)
      channel?.close()
    }
  }, [])

  useLayoutEffect(() => {
    if (active) return
    applyTheme(resolveTheme(themeFamily, civilDate, systemTone))
  }, [active, civilDate, systemTone, themeFamily])

  useEffect(() => {
    const owner = createExecutionGate()
    gate.current = owner
    owner.onTakeover(async () => {
      flushSync(() => { setActive(false); setBusy(true) })
      try { await waitForExecutionQuiescence() }
      catch (error) { setFailed(true); setBusy(false); throw error }
      setBusy(false)
    })
    const pagehide = () => {
      flushSync(() => setActive(false))
      void owner.relinquish().catch(() => setFailed(true))
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
    try {
      const ok = await gate.current.requestOwnership()
      if (ok) setActive(true)
      else setFailed(true)
    } catch { setFailed(true) }
    finally { setBusy(false) }
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
