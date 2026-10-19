import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { DEFAULT_CALENDAR_PREFERENCES } from '../../domain/calendar'
import { DateScreen } from './DateScreen'

function renderDateScreen(hijriSupported = true, preferences = DEFAULT_CALENDAR_PREFERENCES, onPreferencesChange = vi.fn()) {
  const onOpenReligiousEvents = vi.fn()
  render(<DateScreen
    selectedDate="2026-01-01"
    today="2026-01-01"
    preferences={preferences}
    hijriSupported={hijriSupported}
    onDateChange={() => {}}
    onPreferencesChange={onPreferencesChange}
    onOpenReligiousEvents={onOpenReligiousEvents}
    onBack={() => {}}
  />)
  return { onOpenReligiousEvents, onPreferencesChange }
}

it('открывает список праздников, не меняя календарные поля', async () => {
  const { onOpenReligiousEvents } = renderDateScreen()
  const religiousEvents = screen.getByRole('button', { name: 'Праздники и события' })
  expect(religiousEvents).toHaveClass('pill-row')
  expect(religiousEvents).not.toHaveClass('pill-row--stacked')
  expect(screen.getAllByRole('combobox')).toHaveLength(4)
  await userEvent.click(screen.getByRole('button', { name: 'Праздники и события' }))
  expect(onOpenReligiousEvents).toHaveBeenCalledOnce()
  expect(screen.getByRole('combobox', { name: 'День' })).toHaveValue('1')
})

it('показывает полные названия календарей и месяцев с заглавной буквы', () => {
  renderDateScreen(true, { calendar: 'hijri', correction: 0 })
  expect(screen.getByRole('combobox', { name: 'Календарь' })).toHaveValue('hijri')
  expect(screen.getByRole('combobox', { name: 'Календарь' })).toHaveTextContent('Григорианский')
  expect(screen.getByRole('combobox', { name: 'Календарь' })).toHaveTextContent('Хиджри')
  expect(within(screen.getByRole('combobox', { name: 'Месяц' })).getAllByRole('option').map(option => option.textContent)).toEqual([
    'Мухаррам', 'Сафар', 'Раби аль-авваль', 'Раби аль-ахир', 'Джумада аль-уля', 'Джумада аль-ахира',
    'Раджаб', 'Шаабан', 'Рамадан', 'Шавваль', 'Зуль-када', 'Зуль-хиджа',
  ])
})

it('показывает только Gregorian-имена месяцев с заглавной буквы в Gregorian picker', () => {
  renderDateScreen()
  expect(within(screen.getByRole('combobox', { name: 'Месяц' })).getAllByRole('option').map(option => option.textContent)).toEqual([
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ])
})

it('отключает вход без поддержки Umm al-Qura и сохраняет существующую note', () => {
  renderDateScreen(false)
  expect(screen.getByRole('button', { name: 'Праздники и события' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Этот браузер не поддерживает календарь хиджры.')
})
