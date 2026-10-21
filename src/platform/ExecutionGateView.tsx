import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { App } from '../App'
import { useLocalization } from '../localization'
import { AppShell } from '../ui/AppShell'
import { ActionButton, ScreenFooter } from '../ui/controls'
import { Screen } from '../ui/Screen'
import { isThemeFamily, readThemePreferenceCache, themeFamilyFromCacheEvent } from '../ui/themePreferenceCache'
import { applyTheme, resolveTheme } from '../ui/theme'
import { useSystemAppearance } from '../ui/useSystemAppearance'
import { createExecutionGate, waitForExecutionQuiescence } from './executionGate'

type GatePhase = 'resolving' | 'owned' | 'blocked' | 'error'

function currentCivilDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ExecutionGateView() {
  const [phase, setPhase] = useState<GatePhase>('resolving')
  const [failureKind, setFailureKind] = useState<'unsupported' | 'coordination' | null>(null)
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
    if (phase === 'owned') return
    applyTheme(resolveTheme(themeFamily, civilDate, systemTone))
  }, [civilDate, phase, systemTone, themeFamily])

  useEffect(() => {
    const owner = createExecutionGate()
    gate.current = owner
    owner.onTakeover(async () => {
      flushSync(() => { setPhase('blocked'); setBusy(true) })
      try { await waitForExecutionQuiescence() }
      catch (error) { setFailureKind('coordination'); setPhase('error'); setFailed(true); setBusy(false); throw error }
      setBusy(false)
    })
    let relinquishTask: Promise<void> = Promise.resolve()
    const pagehide = () => {
      flushSync(() => setPhase('resolving'))
      relinquishTask = owner.relinquish().catch(() => { setFailureKind('coordination'); setFailed(true) })
    }
    const pageshow = (event: PageTransitionEvent) => {
      if (!event.persisted || gate.current !== owner) return
      void relinquishTask.then(() => {
        owner.close()
        const restoredOwner = createExecutionGate()
        gate.current = restoredOwner
        restoredOwner.onTakeover(async () => {
          flushSync(() => { setPhase('blocked'); setBusy(true) })
          try { await waitForExecutionQuiescence() }
          catch (error) { setFailureKind('coordination'); setPhase('error'); setFailed(true); setBusy(false); throw error }
          setBusy(false)
        })
        return restoredOwner.start().then(ok => {
          if (gate.current !== restoredOwner) return
          setPhase(ok ? 'owned' : restoredOwner.supported && !restoredOwner.hasError() ? 'blocked' : 'error')
          if (!ok) setFailureKind(restoredOwner.supported ? 'coordination' : 'unsupported')
        })
      })
    }
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    void owner.start().then(ok => {
      if (gate.current !== owner) return
      setPhase(ok ? 'owned' : owner.supported && !owner.hasError() ? 'blocked' : 'error')
      if (!ok && (!owner.supported || owner.hasError())) setFailureKind(owner.supported ? 'coordination' : 'unsupported')
    })
    return () => {
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('pageshow', pageshow)
      owner.close()
      gate.current = null
    }
  }, [])

  const request = async () => {
    if (busy || !gate.current) return
    setBusy(true)
    setFailed(false)
    try {
      const ok = await gate.current.requestOwnership()
      if (ok) setPhase('owned')
      else {
        setPhase(gate.current.supported && !gate.current.hasError() ? 'blocked' : 'error')
        if (!gate.current.supported || gate.current.hasError()) setFailureKind(gate.current.supported ? 'coordination' : 'unsupported')
        setFailed(true)
      }
    } catch { setFailureKind('coordination'); setFailed(true) }
    finally { setBusy(false) }
  }

  if (phase === 'resolving') return null
  if (phase === 'owned') return <div className="execution-owner" data-execution-owner="true"><App /></div>
  return <AppShell>
    <Screen label={t(phase === 'blocked' ? 'executionGateTitle' : 'executionGateFailure')}
      contentClassName="screen-center" bottom={
      <ScreenFooter><ActionButton variant="primary" disabled={busy} onClick={() => void request()}>
        {busy ? t('executionGateSwitching') : failed || phase === 'error' ? t('retryAgain') : t('executionGateContinue')}
      </ActionButton></ScreenFooter>
    }>
      <h1 className="screen-title">{t(phase === 'blocked' ? 'executionGateTitle' : 'executionGateFailure')}</h1>
      <p className="screen-copy" role={phase === 'error' ? 'alert' : undefined}>
        {phase === 'blocked' ? t('executionGateDescription')
          : t(failureKind === 'unsupported' ? 'executionGateUnsupported' : 'executionGateError')}
      </p>
      {failed && phase === 'blocked' && <p className="screen-copy" role="alert">{t('executionGateFailure')}</p>}
    </Screen>
  </AppShell>
}
