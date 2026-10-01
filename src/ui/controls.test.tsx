import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActionButton, ActionRow, IconActionButton, ScreenFooter } from './controls'

afterEach(() => { vi.unstubAllGlobals() })

it('однострочное действие выражено семантическим action-вариантом', () => {
  render(<ActionButton>Готово</ActionButton>)
  const button = screen.getByRole('button', { name: 'Готово' })
  expect(button).toHaveClass('pill', 'pill--action', 'jelly-action')
  expect(button).toHaveAttribute('type', 'button')
  expect(button).toHaveAttribute('data-jelly-preset', 'standard')
  expect(button.querySelector('canvas.jelly-action-canvas')).toHaveAttribute('aria-hidden', 'true')
})

it('основное действие сценария и field-like trigger имеют семантические варианты', () => {
  render(<ActionButton variant="primary">Удалить данные</ActionButton>)
  render(<ActionButton variant="field">Найти город</ActionButton>)
  expect(screen.getByRole('button', { name: 'Удалить данные' })).toHaveClass('pill--primary')
  expect(screen.getByRole('button', { name: 'Найти город' })).toHaveClass('pill--field')
})

it('нажимается мышью и клавиатурой как нативная кнопка', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionButton onClick={onClick}>Повторить</ActionButton>)
  const button = screen.getByRole('button', { name: 'Повторить' })
  await user.click(button)
  expect(onClick).toHaveBeenCalledTimes(1)
  button.focus()
  await user.keyboard('{Enter}')
  await user.keyboard(' ')
  expect(onClick).toHaveBeenCalledTimes(3)
})

it('disabled остаётся семантическим и не вызывает действие', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionButton disabled onClick={onClick}>Недоступно</ActionButton>)
  const button = screen.getByRole('button', { name: 'Недоступно' })
  expect(button).toBeDisabled()
  await user.click(button)
  await user.keyboard('{Enter}')
  expect(onClick).not.toHaveBeenCalled()
})

it('прокидывает ref, id, классы и aria-атрибуты на нативный button', () => {
  const ref = createRef<HTMLButtonElement>()
  render(<ActionButton ref={ref} id="home-settings" className="home-settings-extra" aria-pressed="true" aria-label="Настройки">Настройки</ActionButton>)
  const button = screen.getByRole('button', { name: 'Настройки' })
  expect(ref.current).toBe(button)
  expect(button).toHaveAttribute('id', 'home-settings')
  expect(button).toHaveClass('home-settings-extra')
  expect(button).toHaveAttribute('aria-pressed', 'true')
})

it('строка списка слева, значение справа', () => {
  render(<ActionRow title="Тема" value="Классическая" />)
  const row = screen.getByRole('button')
  expect(row).toHaveClass('pill-row', 'jelly-action')
  expect(row).not.toHaveClass('pill-row--stacked')
  expect(row).toHaveAttribute('data-jelly-preset', 'subtle')
  expect(screen.getByText('Классическая')).toHaveClass('note')
})

it('двухстрочная строка помечена вертикальным левым вариантом', () => {
  render(<ActionRow title="Казань" secondary={<span className="action-row-secondary">Татарстан</span>} />)
  const row = screen.getByRole('button')
  expect(row).toHaveClass('pill-row', 'pill-row--stacked')
  expect(screen.getByText('Казань')).toHaveClass('action-row-title')
  expect(screen.getByText('Татарстан')).toHaveClass('action-row-secondary')
})

it('icon-only действие выражено icon-button вариантом и expressive-пресетом', () => {
  render(<IconActionButton label="Настройки"><svg /></IconActionButton>)
  const button = screen.getByRole('button', { name: 'Настройки' })
  expect(button).toHaveClass('pill', 'icon-button', 'jelly-action')
  expect(button).toHaveAttribute('data-jelly-preset', 'expressive')
})

it('при prefers-reduced-motion действие и семантика сохраняются', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionButton onClick={onClick}>Назад</ActionButton>)
  await user.click(screen.getByRole('button', { name: 'Назад' }))
  expect(onClick).toHaveBeenCalledTimes(1)
})

it('footer выражает позицию действия общим layout-вариантом', () => {
  const { container } = render(<ScreenFooter align="end"><ActionButton variant="auxiliary">Поделиться</ActionButton></ScreenFooter>)
  expect(container.querySelector('.screen-footer')).toHaveClass('screen-footer--end')
})
