import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ActionRow, Button, IconButton, ScreenFooter } from './controls'

it('однострочное действие выражено семантическим action-вариантом', () => {
  render(<Button>Готово</Button>)
  const button = screen.getByRole('button', { name: 'Готово' })
  expect(button).toHaveClass('pill', 'pill--action')
  expect(button).toHaveAttribute('type', 'button')
})

it('основное действие сценария и field-like trigger имеют семантические варианты', () => {
  render(<Button variant="primary">Удалить данные</Button>)
  render(<Button variant="field">Найти город</Button>)
  expect(screen.getByRole('button', { name: 'Удалить данные' })).toHaveClass('pill--primary')
  expect(screen.getByRole('button', { name: 'Найти город' })).toHaveClass('pill--field')
})

it('строка списка слева, значение справа', () => {
  render(<ActionRow title="Тема" value="Классическая" />)
  const row = screen.getByRole('button')
  expect(row).toHaveClass('pill-row')
  expect(row).not.toHaveClass('pill-row--stacked')
  expect(screen.getByText('Классическая')).toHaveClass('note')
})

it('двухстрочная строка помечена вертикальным левым вариантом', () => {
  render(<ActionRow title="Казань" secondary={<span className="action-row-secondary">Татарстан</span>} />)
  const row = screen.getByRole('button')
  expect(row).toHaveClass('pill-row', 'pill-row--stacked')
  expect(screen.getByText('Казань')).toHaveClass('action-row-title')
  expect(screen.getByText('Татарстан')).toHaveClass('action-row-secondary')
})

it('icon-only действие выражено icon-button вариантом', () => {
  render(<IconButton label="Настройки"><svg /></IconButton>)
  expect(screen.getByRole('button', { name: 'Настройки' })).toHaveClass('pill', 'icon-button')
})

it('footer выражает позицию действия общим layout-вариантом', () => {
  const { container } = render(<ScreenFooter align="end"><Button variant="auxiliary">Поделиться</Button></ScreenFooter>)
  expect(container.querySelector('.screen-footer')).toHaveClass('screen-footer--end')
})
