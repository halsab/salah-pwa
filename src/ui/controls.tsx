import type { ComponentProps, ReactNode } from 'react'

/**
 * Семантические роли интерактивных контролов поверх визуального foundation `.pill`.
 * Роль задаёт геометрию и выравнивание, поэтому feature-экраны не подбирают их локально.
 */
export type ButtonVariant = 'action' | 'primary' | 'auxiliary' | 'field'

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant }

export function Button({ variant = 'action', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`pill pill--${variant}${className ? ` ${className}` : ''}`} {...rest} />
}

type IconButtonProps = ComponentProps<'button'> & { label: string }

export function IconButton({ label, className, type = 'button', ...rest }: IconButtonProps) {
  return <button type={type} aria-label={label} className={`pill icon-button${className ? ` ${className}` : ''}`} {...rest} />
}

type ActionRowProps = Omit<ComponentProps<'button'>, 'title'> & {
  title: ReactNode
  /** Значение/состояние строки, выравнивается вправо от заголовка. */
  value?: ReactNode
  /** Вторая строка, из-за которой строка становится вертикальной и полностью левой. */
  secondary?: ReactNode
}

export function ActionRow({ title, value, secondary, className, type = 'button', ...rest }: ActionRowProps) {
  const stacked = secondary !== undefined
  return <button type={type} className={`pill pill-row${stacked ? ' pill-row--stacked' : ''}${className ? ` ${className}` : ''}`} {...rest}>
    {stacked
      ? <><span className="action-row-title">{title}</span>{secondary}</>
      : <><span>{title}</span>{value !== undefined ? <span className="note">{value}</span> : null}</>}
  </button>
}

/**
 * Общий layout нижних действий. `stretch` — основное полноширинное действие,
 * `end` — одно вспомогательное действие справа, `between` — toolbar с ведущим и завершающим элементом.
 */
export function ScreenFooter({ align = 'stretch', children }: { align?: 'stretch' | 'end' | 'between'; children: ReactNode }) {
  return <div className={`screen-footer screen-footer--${align}`}>{children}</div>
}
