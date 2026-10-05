import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Screen } from './Screen'

it('сохраняет доступные верхние и нижние действия вокруг содержимого', () => {
  render(<Screen label="Расписание" top={<button>Назад</button>} bottom={<button>Сегодня</button>}><p>Аср 16:06</p></Screen>)
  expect(screen.getByRole('region', { name: 'Расписание' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
  expect(screen.getByText('Аср 16:06')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сегодня' })).toBeInTheDocument()
  expect(screen.getByText('Аср 16:06').parentElement).toHaveClass('screen-content')
  expect(screen.getByText('Аср 16:06').parentElement).not.toHaveClass('screen-content--edge-bottom')
})

it('прокручивает экран без нижнего действия до края и сохраняет локальный класс', () => {
  render(<Screen label="Список" contentClassName="screen-center"><ul><li>Событие</li></ul></Screen>)
  const region = screen.getByRole('region', { name: 'Список' })
  expect(region.querySelector('.screen-content')).toHaveClass('screen-content--edge-bottom', 'screen-center')
  expect(screen.getByRole('list')).toBeInTheDocument()
})

it('рендерит содержимое статьи в обычном scroll-root без shared surface', () => {
  render(<Screen label="Событие"><p>Статья</p></Screen>)
  const content = screen.getByRole('region', { name: 'Событие' }).querySelector('.screen-content')
  expect(content).toContainElement(screen.getByText('Статья'))
  expect(content?.querySelector('.screen-shared-surface')).toBeNull()
})
