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
  return <section className="app-screen" aria-label={label} aria-busy={busy || undefined}>
    {top ? <div className="screen-top">{top}</div> : null}
    <div className={`screen-content${bottom ? '' : ' screen-content--edge-bottom'}${contentClassName ? ` ${contentClassName}` : ''}`}>
      {children}
    </div>
    {bottom ? <div className="screen-bottom">{bottom}</div> : null}
  </section>
}

export function BackButton({ onClick, label = 'Назад' }: { onClick: () => void; label?: string }) {
  const { t } = useLocalization()
  return <ActionButton data-screen-focus onClick={onClick}>{label === 'Назад' ? t('back') : label}</ActionButton>
}
