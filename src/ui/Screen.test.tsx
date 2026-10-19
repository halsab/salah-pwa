import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Screen } from './Screen'

it('сохраняет доступные верхние и нижние действия вокруг содержимого', () => {
  render(<Screen label="Расписание" top={<button>Назад</button>} bottom={<button>Сегодня</button>}><p>Аср 16:06</p></Screen>)
  const region = screen.getByRole('region', { name: 'Расписание' })
  const header = region.querySelector('.screen-top')
  const panel = region.querySelector('.screen-panel')
  const content = region.querySelector('.screen-content')
  const footer = region.querySelector('.screen-bottom')

  expect(header?.tagName).toBe('HEADER')
  expect(panel).toBe(region.lastElementChild)
  expect(header?.nextElementSibling).toBe(panel)
  expect(content?.parentElement).toBe(panel)
  expect(footer?.parentElement).toBe(panel)
  expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
  expect(screen.getByText('Аср 16:06')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сегодня' })).toBeInTheDocument()
})

it('не создаёт пустые слоты и сохраняет внутренние отступы прокрутки без панели действий', () => {
  render(<Screen label="Праздники" busy><p>Список событий</p></Screen>)
  const region = screen.getByRole('region', { name: 'Праздники' })
  const panel = region.querySelector('.screen-panel')
  const content = region.querySelector('.screen-content')

  expect(region.querySelector('.screen-top')).not.toBeInTheDocument()
  expect(region.querySelector('.screen-bottom')).not.toBeInTheDocument()
  expect(region.children).toHaveLength(1)
  expect(content?.parentElement).toBe(panel)
  expect(region).toHaveAttribute('aria-busy', 'true')
})
