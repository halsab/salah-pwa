import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { DEFAULT_CALENDAR_PREFERENCES } from '../../domain/calendar'
import { DateScreen } from './DateScreen'

function renderDateScreen(hijriSupported = true) {
  const onOpenReligiousEvents = vi.fn()
  render(<DateScreen
    selectedDate="2026-01-01"
    today="2026-01-01"
    preferences={DEFAULT_CALENDAR_PREFERENCES}
    hijriSupported={hijriSupported}
    onDateChange={() => {}}
    onPreferencesChange={() => {}}
    onOpenReligiousEvents={onOpenReligiousEvents}
    onBack={() => {}}
  />)
  return onOpenReligiousEvents
}

it('открывает список праздников, не меняя календарные поля', async () => {
  const onOpenReligiousEvents = renderDateScreen()
  expect(screen.getAllByRole('combobox')).toHaveLength(4)
  await userEvent.click(screen.getByRole('button', { name: 'Праздники и события' }))
  expect(onOpenReligiousEvents).toHaveBeenCalledOnce()
  expect(screen.getByRole('combobox', { name: 'День' })).toHaveValue('1')
})

it('отключает вход без поддержки Umm al-Qura и сохраняет существующую note', () => {
  renderDateScreen(false)
  expect(screen.getByRole('button', { name: 'Праздники и события' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Этот браузер не поддерживает календарь хиджры.')
})
