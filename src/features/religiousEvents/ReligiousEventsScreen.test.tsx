import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import type { ReligiousEventOccurrence } from '../../domain/religiousEvents'
import {
  ReligiousEventOccurrenceRow,
  ReligiousEventsScreen,
} from './ReligiousEventsScreen'
import { formatReligiousEventOccurrenceDate } from './religiousEventDate'

it('показывает хронологический список с display titles и двумя календарями', async () => {
  const onBack = vi.fn()
  const onOpenEvent = vi.fn()
  render(<ReligiousEventsScreen today="2026-01-01" correction={0} hijriSupported onOpenEvent={onOpenEvent} onBack={onBack} />)

  const region = screen.getByRole('region', { name: 'Праздники и события' })
  expect(within(region).getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
  expect(within(region).queryByRole('heading')).not.toBeInTheDocument()
  const rows = within(region).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Исра и Ми‘радж')
  const rowIds = rows.map(row => within(row).getByRole('button').id)
  expect(rowIds).toEqual([...rowIds].sort())
  expect(region).toHaveTextContent('Начало Рамадана')
  expect(region).toHaveTextContent('Начало Зуль-хиджи')
  expect(region).not.toHaveTextContent('Дни ташрика')
  expect(region).toHaveTextContent('2–3 февраля 2026 · 15 шаабан 1447')
  expect(region).toHaveTextContent('15–16 января 2026 · 27 раджаб 1447')
  expect(region).toHaveTextContent('16 июня 2026 · 1 мухаррам 1448')

  await userEvent.click(within(region).getByRole('button', { name: /Начало Рамадана/ }))
  expect(onOpenEvent).toHaveBeenCalledWith('ramadan')
  await userEvent.click(within(region).getByRole('button', { name: 'Назад' }))
  expect(onBack).toHaveBeenCalledOnce()
})

it('оставляет occurrence без статьи неинтерактивной', () => {
  const occurrence: ReligiousEventOccurrence = {
    eventId: 'ashura',
    kind: 'day',
    title: 'День Ашура',
    civilDate: '2026-06-25',
    hijriDate: { year: 1448, month: 1, day: 10 },
    contentId: null,
  }
  render(<ul><ReligiousEventOccurrenceRow occurrence={occurrence} onOpenEvent={() => {}} /></ul>)
  expect(screen.getByRole('listitem')).toHaveTextContent('День Ашура')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it.each([
  ['2026-02-03', 'night', '2–3 февраля 2026 · 15 шаабан 1447'],
  ['2027-02-01', 'night', '31 января – 1 февраля 2027 · 23 шаабан 1448'],
  ['2027-01-01', 'night', '31 декабря 2026 – 1 января 2027 · 22 раджаб 1448'],
])('форматирует Gregorian night range для %s', (civilDate, kind, expected) => {
  expect(formatReligiousEventOccurrenceDate({
    eventId: 'baraat',
    kind: kind as 'night',
    title: 'Ночь Бараат',
    civilDate,
    hijriDate: civilDate === '2026-02-03'
      ? { year: 1447, month: 8, day: 15 }
      : civilDate === '2027-02-01'
        ? { year: 1448, month: 8, day: 23 }
        : { year: 1448, month: 7, day: 22 },
    contentId: 'baraat',
  })).toBe(expected)
})
