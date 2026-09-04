import { useEffect, useRef, type RefObject } from 'react'

export function useModalDialog(
  open: boolean,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      const coarsePointer = (
        window as unknown as { matchMedia?: Window['matchMedia'] }
      ).matchMedia?.('(pointer: coarse)').matches ?? false
      const focusTarget = coarsePointer ? dialogRef.current : initialFocusRef?.current ?? dialogRef.current
      focusTarget?.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.tagName === 'SUMMARY' || !element.closest('details:not([open])'),
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      if (!firstElement || !lastElement) return

      const moveFocus = (element: HTMLElement) => {
        event.preventDefault()
        requestAnimationFrame(() => element.focus())
      }
      if (!dialogRef.current.contains(document.activeElement)) {
        moveFocus(event.shiftKey ? lastElement : firstElement)
      } else if (event.shiftKey && document.activeElement === firstElement) {
        moveFocus(lastElement)
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        moveFocus(firstElement)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [initialFocusRef, onClose, open])

  return dialogRef
}

export function useDialogViewport(open: boolean) {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !layerRef.current || !window.visualViewport) return
    const layer = layerRef.current
    const viewport = window.visualViewport
    let layoutViewportHeight = Math.max(
      document.documentElement.clientHeight,
      window.innerHeight,
      viewport.offsetTop + viewport.height,
    )
    let animationFrame: number | null = null

    const setProperty = (name: string, value: string) => {
      if (layer.style.getPropertyValue(name) !== value) {
        layer.style.setProperty(name, value)
      }
    }

    const syncViewport = () => {
      if (animationFrame !== null) return
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null
        const viewportHeight = Math.round(viewport.height)
        const viewportTop = Math.round(viewport.offsetTop)
        const visibleBottom = viewportTop + viewportHeight
        const activeElement = document.activeElement
        const textEntryFocused = activeElement instanceof HTMLElement && (
          activeElement.matches('input, textarea') || activeElement.isContentEditable
        )
        const hiddenViewportHeight = Math.max(0, layoutViewportHeight - visibleBottom)
        // Нижняя часть шита уходит под клавиатуру, поэтому видимый край остаётся цельным без скруглений.
        const keyboardInset = textEntryFocused && hiddenViewportHeight >= 80
          ? hiddenViewportHeight
          : 0

        if (keyboardInset === 0) {
          layoutViewportHeight = Math.max(
            document.documentElement.clientHeight,
            window.innerHeight,
            visibleBottom,
          )
        }

        setProperty('--dialog-viewport-height', `${viewportHeight}px`)
        setProperty('--dialog-viewport-top', `${viewportTop}px`)
        setProperty('--dialog-keyboard-inset', `${keyboardInset}px`)
        const keyboardOpen = keyboardInset > 0 ? 'true' : 'false'
        if (layer.dataset.keyboardOpen !== keyboardOpen) {
          layer.dataset.keyboardOpen = keyboardOpen
        }
      })
    }

    syncViewport()
    viewport.addEventListener('resize', syncViewport, { passive: true })
    viewport.addEventListener('scroll', syncViewport, { passive: true })
    return () => {
      viewport.removeEventListener('resize', syncViewport)
      viewport.removeEventListener('scroll', syncViewport)
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    }
  }, [open])

  return layerRef
}
