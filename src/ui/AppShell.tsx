import { useEffect, useRef, type ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = ref.current
    const viewport = window.visualViewport
    if (!element || !viewport) return
    let frame: number | undefined
    const update = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        // Клавиатура Safari меняет visual viewport; масштабирование жестом оставляем браузеру.
        if (viewport.scale !== 1) {
          element.style.removeProperty('--app-viewport-height')
          element.style.removeProperty('--app-viewport-top')
          element.style.removeProperty('--app-viewport-bottom-padding')
          return
        }
        element.style.setProperty('--app-viewport-height', `${viewport.height}px`)
        element.style.setProperty('--app-viewport-top', `${viewport.offsetTop}px`)
        // Safari сохраняет safe-area-inset-bottom над клавиатурой; там нужен только небольшой зазор.
        if (viewport.height + viewport.offsetTop < document.documentElement.clientHeight - 1) {
          element.style.setProperty('--app-viewport-bottom-padding', '8px')
        } else {
          element.style.removeProperty('--app-viewport-bottom-padding')
        }
      })
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return <main ref={ref} className="app-layout" onClickCapture={event => {
    // Safari не фокусирует кнопки при тапе; переход должен запомнить именно нажатую кнопку.
    if (event.target instanceof Element) event.target.closest('button')?.focus({ preventScroll: true })
  }}>{children}</main>
}
