import type { ReactNode } from 'react'

export function Screen({ label, top, bottom, children, contentClassName = '', busy = false }: {
  label: string
  top?: ReactNode
  bottom?: ReactNode
  children: ReactNode
  contentClassName?: string
  busy?: boolean
}) {
  return <section className="app-screen" aria-label={label} aria-busy={busy || undefined}>
    {top ? <div className="screen-top">{top}</div> : null}
    <div className={`screen-content ${contentClassName}`}>{children}</div>
    {bottom ? <div className="screen-bottom">{bottom}</div> : null}
  </section>
}

export function BackButton({ onClick, label = 'Назад' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="pill" data-screen-focus onClick={onClick}>{label}</button>
}
