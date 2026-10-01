import { useEffect, useRef } from 'react'

import type { JellyPreset } from './presets'
import { JellySurface } from './surface'

/**
 * Подключает jelly-поверхность к нативной кнопке и её canvas. Пока 2d-контекста
 * нет (jsdom или окружение без canvas), компонент остаётся на CSS-fallback и
 * никакой физики не запускает.
 */
export function useJellySurface(preset: JellyPreset, disabled: boolean | undefined) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const button = buttonRef.current
    const canvas = canvasRef.current
    if (!button || !canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      button.dataset.jellyFallback = ''
      return () => { delete button.dataset.jellyFallback }
    }

    const surface = new JellySurface(button, canvas, ctx, preset, Boolean(disabled))
    surface.mount()

    return () => { surface.destroy() }
  }, [preset, disabled])

  return { buttonRef, canvasRef }
}
