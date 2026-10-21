import { useCallback, useRef } from 'react'
import type { Result } from '../../domain/result'

export function useDataReset({ invalidateLocation, invalidateSaves, invalidateRepository, clear }: {
  invalidateLocation: () => void
  invalidateSaves: () => Promise<void>
  invalidateRepository: () => Promise<void>
  clear: () => Promise<Result<void, unknown>>
}) {
  const resetting = useRef(false)
  const pendingReset = useRef<Promise<boolean> | null>(null)
  const reset = useCallback(async (onSettled?: (cleared: boolean) => void) => {
    if (resetting.current) return false
    resetting.current = true
    invalidateLocation()
    const operation = (async () => {
      let result: Awaited<ReturnType<typeof clear>>
      try {
        await Promise.all([invalidateSaves(), invalidateRepository()])
        result = await clear()
      } catch {
        resetting.current = false
        onSettled?.(false)
        return false
      }
      onSettled?.(result.ok)
      if (!result.ok) { resetting.current = false; return false }
      try {
        // Перезагрузка освобождает все ссылки React и мемоизированные данные; оболочка уже доступна офлайн.
        window.location.reload()
        return true
      } catch { resetting.current = false; return false }
    })()
    pendingReset.current = operation
    try { return await operation }
    finally { if (pendingReset.current === operation) pendingReset.current = null }
  }, [clear, invalidateLocation, invalidateRepository, invalidateSaves])
  const drain = useCallback(async () => {
    const operation = pendingReset.current
    if (operation) await operation
  }, [])
  const hasPendingReset = useCallback(() => pendingReset.current !== null, [])
  return { reset, resetting, drain, hasPendingReset }
}
