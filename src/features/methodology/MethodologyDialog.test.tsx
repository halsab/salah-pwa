import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MethodologyDialog } from './MethodologyDialog'

it('сразу показывает разделы методологии и первичный источник', () => {
  render(<MethodologyDialog open officialScheduleUrl="https://dumrt.ru/ru/help-info/prayertime/" onClose={() => {}} />)
  const article = screen.getByRole('region', { name: 'Как рассчитывается время' })
  expect(article.querySelectorAll('h1')).toHaveLength(1)
  for (const heading of ['Официальные таблицы', 'Расчёт на устройстве', 'Часовой пояс', 'Местоположение']) {
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeVisible()
  }
  expect(screen.getByRole('link', { name: 'ДУМ РТ' })).toHaveAttribute('href', 'https://dumrt.ru/ru/help-info/prayertime/')
  expect(article).toHaveTextContent('Координаты не отправляются геокодерам')
  const parameters = screen.getByRole('heading', { level: 2, name: 'Расчёт на устройстве' }).parentElement
  expect(parameters?.querySelectorAll('li')).toHaveLength(3)
  expect(article.querySelector('blockquote')).toHaveTextContent('информационное приложение')
})
