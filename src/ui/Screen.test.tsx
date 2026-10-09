import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Screen } from './Screen'

it('сохраняет доступные верхние и нижние действия вокруг содержимого', () => {
  render(<Screen label="Расписание" top={<button>Назад</button>} bottom={<button>Сегодня</button>}><p>Аср 16:06</p></Screen>)
  expect(screen.getByRole('region', { name: 'Расписание' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
  expect(screen.getByText('Аср 16:06')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сегодня' })).toBeInTheDocument()
})
