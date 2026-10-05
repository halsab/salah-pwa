import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { ActionButton } from './controls'

export function Screen({ label, top, bottom, children, contentClassName = '', busy = false, sharedTransitionName }: {
  label: string
  top?: ReactNode
  bottom?: ReactNode
  children: ReactNode
  contentClassName?: string
  busy?: boolean
  sharedTransitionName?: string | null
}) {
  const sharedSurfaceRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const surface = sharedSurfaceRef.current
    if (!surface || !sharedTransitionName) return
    surface.style.setProperty('view-transition-name', sharedTransitionName)
    return () => { surface.style.removeProperty('view-transition-name') }
  }, [sharedTransitionName])

  return <section className="app-screen" aria-label={label} aria-busy={busy || undefined}>
    {top ? <div className="screen-top">{top}</div> : null}
    <div className={`screen-content${bottom ? '' : ' screen-content--edge-bottom'}${contentClassName ? ` ${contentClassName}` : ''}`}>
      {sharedTransitionName ? <>
        <div ref={sharedSurfaceRef} id="religious-event-transition-surface" className="screen-shared-surface" aria-hidden="true" />
        <div className="screen-shared-content">{children}</div>
      </> : children}
    </div>
    {bottom ? <div className="screen-bottom">{bottom}</div> : null}
  </section>
}

export function BackButton({ onClick, label = 'Назад' }: { onClick: () => void; label?: string }) {
  return <ActionButton data-screen-focus onClick={onClick}>{label}</ActionButton>
}
