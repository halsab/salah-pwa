import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActionButton, ActionRow, IconActionButton } from './controls'

afterEach(() => { vi.unstubAllGlobals() })

it('рендерит действие доступной нативной кнопкой', () => {
  render(<ActionButton>Готово</ActionButton>)
  const button = screen.getByRole('button', { name: 'Готово' })
  expect(button).toHaveAttribute('type', 'button')
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

it('строка настройки доступна как кнопка и сообщает своё значение', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionRow title="Тема" value="Классическая" onClick={onClick} />)
  const row = screen.getByRole('button', { name: /Тема\s*Классическая/ })
  await user.click(row)
  expect(onClick).toHaveBeenCalledTimes(1)
})

it('иконная кнопка получает доступное имя', () => {
  render(<IconActionButton label="Настройки"><svg /></IconActionButton>)
  expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument()
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
