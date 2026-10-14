import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MethodologyDialog } from './MethodologyDialog'

it('показывает утверждённые разделы статьи и первичные источники', () => {
  const officialScheduleUrl = 'https://dumrt.ru/ru/help-info/prayertime/?source=approved-copy'
  render(<MethodologyDialog open officialScheduleUrl={officialScheduleUrl} onClose={() => {}} />)
  const article = screen.getByRole('region', { name: 'Как рассчитывается время' })
  expect(article.querySelectorAll('h1')).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Как рассчитывается время намаза' })).toBeVisible()
  for (const heading of [
    'Откуда берётся расписание',
    'Как рассчитывается время',
    'Методики расчёта',
    'Особенности северных широт',
    'Местоположение и часовой пояс',
    'Работа без интернета',
    'Точность и ограничения',
  ]) {
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeVisible()
  }
  expect(screen.getByRole('link', { name: 'ДУМ РТ' })).toHaveAttribute('href', officialScheduleUrl)
  expect(screen.getByRole('link', { name: 'Adhan JS' })).toHaveAttribute('href', 'https://github.com/batoulapps/adhan-js')
  expect(article.querySelector('a[href*="/blob/master/METHODS.md"]')).toBeNull()
})

it('различает источники расписания и раскрывает ограничения расчёта', () => {
  render(<MethodologyDialog open officialScheduleUrl="https://dumrt.ru/ru/help-info/prayertime/" onClose={() => {}} />)
  const article = screen.getByRole('region', { name: 'Как рассчитывается время' })

  expect(article).toHaveTextContent('Время берётся непосредственно из таблицы, без повторного расчёта.')
  expect(article).toHaveTextContent('Если официальная таблица не предусмотрена для выбранного места или даты, приложение рассчитывает время самостоятельно по подходящей региональной методике.')
  expect(article).toHaveTextContent('Если официальная таблица предусмотрена, но её данные не загружены или повреждены, приложение сообщает о проблеме, а не подменяет расписание незаметно.')
  expect(article).toHaveTextContent('Если определить подходящий региональный профиль не удалось, используется методика Всемирной мусульманской лиги (MWL).')

  expect(article).toHaveTextContent('часовой пояс берётся из настроек устройства. Сами координаты не определяют часовой пояс автоматически.')
  expect(article).toHaveTextContent('используется часовой пояс этого города из справочника GeoNames.')
  expect(article).toHaveTextContent('Для официальных таблиц ДУМ РТ всегда используется московское время, независимо от часового пояса устройства.')

  expect(article).toHaveTextContent('Фаджр определяется за 120 минут до восхода.')
  expect(article).toHaveTextContent('Иша определяется через 90 минут после захода Солнца.')
  expect(article).toHaveTextContent('является расчётной оценкой и может отличаться от местного расписания.')
  expect(article).toHaveTextContent('Salah — информационное приложение и не является официальным представителем религиозных организаций.')
  expect(article).toHaveTextContent('не можем гарантировать полное совпадение с местными расписаниями или отсутствие ошибок.')
  expect(article).toHaveTextContent('Рекомендуем проверять время намаза по надёжным местным источникам')
})
