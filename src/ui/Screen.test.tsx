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

it('не назначает detail scroll-root имя shared surface', () => {
  render(<Screen label="Событие" contentClassName="religious-event-detail" sharedTransitionName="salah-religious-event-arafa"><p>Статья</p></Screen>)
  const content = screen.getByRole('region', { name: 'Событие' }).querySelector('.screen-content')
  const surface = content?.querySelector('.screen-shared-surface')

  expect(content).not.toHaveStyle({ viewTransitionName: 'salah-religious-event-arafa' })
  expect(surface).toHaveStyle({ viewTransitionName: 'salah-religious-event-arafa' })
})
