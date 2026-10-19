import type { ReactNode } from 'react'
import { ActionButton } from './controls'
import { useLocalization } from '../localization'

export function Screen({ label, top, bottom, children, contentClassName = '', busy = false }: {
  label: string
  top?: ReactNode
  bottom?: ReactNode
  children: ReactNode
  contentClassName?: string
  busy?: boolean
}) {
  return <section className={`app-screen${top ? '' : ' app-screen--no-top'}`} aria-label={label} aria-busy={busy || undefined}>
    {top ? <header className="screen-top">{top}</header> : null}
    <div className="screen-panel">
      <div className={`screen-content${contentClassName ? ` ${contentClassName}` : ''}`}>
        {children}
      </div>
      {bottom ? <footer className="screen-bottom">{bottom}</footer> : null}
    </div>
  </section>
}

export function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useLocalization()
  return <ActionButton data-screen-focus onClick={onClick}>{label ?? t('back')}</ActionButton>
}
