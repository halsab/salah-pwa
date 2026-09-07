import { useCallback, useEffect, useRef } from 'react'
import type { Result } from '../../domain/result'

const RESET_CHANNEL = 'salah-data-reset'

export function useDataReset({ invalidateLocation, invalidateSaves, invalidateRepository, clear, getGeneration }: {
  invalidateLocation: () => void
  invalidateSaves: () => Promise<void>
  invalidateRepository: () => Promise<void>
  clear: () => Promise<Result<void, unknown>>
  getGeneration: () => Promise<number>
}) {
  const resetting = useRef(false)
  const channel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    let active = true
    let initial: number | undefined
    void getGeneration().then(value => { if (active) initial = value }).catch(() => undefined)
    const reload = () => {
      if (!active || resetting.current) return
      resetting.current = true
      invalidateLocation()
      void invalidateSaves()
      void invalidateRepository()
      window.location.reload()
    }
    const check = () => {
      void getGeneration().then(value => { if (initial !== undefined && value !== initial) reload() }).catch(() => undefined)
    }
    const connection = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(RESET_CHANNEL)
    if (connection) connection.onmessage = reload
    channel.current = connection
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', check)
    return () => { active = false; connection?.close(); window.removeEventListener('focus', check); window.removeEventListener('pageshow', check); document.removeEventListener('visibilitychange', check) }
  }, [getGeneration, invalidateLocation, invalidateRepository, invalidateSaves])
  const reset = useCallback(async () => {
    if (resetting.current) return false
    resetting.current = true
    invalidateLocation()
    try {
      await Promise.all([invalidateSaves(), invalidateRepository()])
      const result = await clear()
      if (!result.ok) { resetting.current = false; return false }
      channel.current?.postMessage('reset')
      // Перезагрузка освобождает все ссылки React и мемоизированные данные; оболочка уже доступна офлайн.
      window.location.reload()
      return true
    } catch { resetting.current = false; return false }
  }, [clear, invalidateLocation, invalidateRepository, invalidateSaves])
  return { reset, resetting }
}
