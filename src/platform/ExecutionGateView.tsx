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
  const lifecycle = useRef(0)
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
    let disposed = false
    let generation = 0
    const controllers = new Set<ReturnType<typeof createExecutionGate>>()
    let relinquishTask: Promise<void> = Promise.resolve()
    let relinquishFailed = false
    const isCurrent = (controller: ReturnType<typeof createExecutionGate>, token: number) =>
      !disposed && generation === token && gate.current === controller
    const showControllerResult = (controller: ReturnType<typeof createExecutionGate>, token: number, ok: boolean) => {
      if (!isCurrent(controller, token)) return
      setPhase(ok ? 'owned' : controller.supported && !controller.hasError() ? 'blocked' : 'error')
      if (!ok) setFailureKind(controller.supported ? 'coordination' : 'unsupported')
      else setFailureKind(null)
    }
    const configure = (controller: ReturnType<typeof createExecutionGate>) => {
      controllers.add(controller)
      controller.onTakeover(async () => {
        const token = generation
        if (!isCurrent(controller, token)) throw new Error('Execution controller was superseded')
        flushSync(() => { setPhase('blocked'); setBusy(true) })
        try {
          await waitForExecutionQuiescence()
          if (!isCurrent(controller, token)) throw new Error('Execution controller was superseded')
          setBusy(false)
        } catch (error) {
          if (isCurrent(controller, token)) {
            setFailureKind('coordination')
            setPhase('error')
            setFailed(true)
            setBusy(false)
          }
          throw error
        }
      })
    }
    const initial = createExecutionGate()
    configure(initial)
    gate.current = initial
    const initialToken = generation
    void initial.start().then(ok => showControllerResult(initial, initialToken, ok)).catch(() => {
      if (isCurrent(initial, initialToken)) { setFailureKind('coordination'); setPhase('error') }
    })
    const pagehide = () => {
      const controller = gate.current
      const token = ++generation
      lifecycle.current = token
      relinquishFailed = false
      flushSync(() => setPhase('resolving'))
      if (!controller) return
      relinquishTask = controller.relinquish().catch(() => {
        relinquishFailed = true
        if (isCurrent(controller, token)) {
          setFailureKind('coordination')
          setPhase('error')
          setFailed(true)
          setBusy(false)
        }
      })
    }
    const pageshow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      const token = ++generation
      lifecycle.current = token
      const previous = gate.current
      flushSync(() => setPhase('resolving'))
      void relinquishTask.then(() => {
        if (disposed || generation !== token || relinquishFailed) return
        previous?.close()
        if (previous && gate.current === previous) gate.current = null
        const restored = createExecutionGate()
        configure(restored)
        gate.current = restored
        return restored.start().then(ok => showControllerResult(restored, token, ok), () => {
          if (isCurrent(restored, token)) { setFailureKind('coordination'); setPhase('error') }
        })
      })
    }
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    return () => {
      window.removeEventListener('pagehide', pagehide)
      window.removeEventListener('pageshow', pageshow)
      disposed = true
      generation += 1
      for (const controller of controllers) controller.close()
      controllers.clear()
      gate.current = null
    }
  }, [])

  const request = async () => {
    const controller = gate.current
    const token = lifecycle.current
    if (busy || !controller) return
    setBusy(true)
    setFailed(false)
    try {
      const ok = await controller.requestOwnership()
      if (gate.current !== controller || lifecycle.current !== token) return
      if (ok) setPhase('owned')
      else {
        setPhase(controller.supported && !controller.hasError() ? 'blocked' : 'error')
        if (!controller.supported || controller.hasError()) setFailureKind(controller.supported ? 'coordination' : 'unsupported')
        setFailed(true)
      }
    } catch {
      if (gate.current === controller && lifecycle.current === token) {
        setFailureKind('coordination')
        setPhase('error')
        setFailed(true)
      }
    } finally { if (gate.current === controller && lifecycle.current === token) setBusy(false) }
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
