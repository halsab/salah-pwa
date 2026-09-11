import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { DateScreen } from '../features/calendar/DateScreen'
import { DEFAULT_CALENDAR_PREFERENCES } from '../domain/calendar'
import { useAppNavigation } from './useAppNavigation'

function NavigationExample() {
  const navigation = useAppNavigation()
  return <>
    <p>{navigation.screen}</p>
    {navigation.screen === 'home' ? <button id="open-settings" onClick={() => navigation.open('settings')}>Настройки</button> : null}
    {navigation.screen === 'settings' ? <button id="open-share" onClick={() => navigation.open('share')}>Поделиться</button> : null}
    {navigation.screen !== 'home' ? <><button onClick={navigation.back}>Назад</button><button onClick={navigation.home}>На главную</button></> : null}
  </>
}

function CalendarNavigationExample() {
  const navigation = useAppNavigation()
  const [date, setDate] = useState('2026-09-02')
  return navigation.screen === 'home'
    ? <button id="open-date" onClick={() => navigation.open('date')}>Выбрать дату</button>
    : <DateScreen selectedDate={date} today="2026-09-01" preferences={DEFAULT_CALENDAR_PREFERENCES} hijriSupported
        onDateChange={setDate} onPreferencesChange={() => {}} onBack={navigation.back} />
}

function controlFrames() {
  const callbacks = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id) })
  return () => act(() => {
    const pending = [...callbacks.values()]
    callbacks.clear()
    for (const callback of pending) callback(0)
  })
}

describe('навигация экранов', () => {
  it.each(['Сегодня', 'Месяц'])('отложенный автофокус не перехватывает фокус после действия «%s»', action => {
    const paint = controlFrames()
    render(<CalendarNavigationExample />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    if (action === 'Сегодня') fireEvent.click(screen.getByRole('button', { name: action }))
    else screen.getByRole('combobox', { name: action }).focus()
    const field = screen.getByRole('combobox', { name: action === 'Сегодня' ? 'День' : 'Месяц' })
    expect(field).toHaveFocus()
    paint()
    expect(field).toHaveFocus()
  })

  it('фокусирует Назад после открытия экрана, если пользователь ещё не выбрал поле', () => {
    const paint = controlFrames()
    render(<CalendarNavigationExample />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать дату' }))
    paint()
    expect(screen.getByRole('button', { name: 'Назад' })).toHaveFocus()
  })

  it('возвращается по шагам и восстанавливает фокус у вызвавшей кнопки', async () => {
    const user = userEvent.setup()
    render(<NavigationExample />)
    await user.click(screen.getByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Поделиться' }))
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Поделиться' })).toHaveFocus())
    act(() => { window.history.back() })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Настройки' })).toHaveFocus())
  })

  it('завершает вложенный сценарий возвращением на главную', async () => {
    const user = userEvent.setup()
    render(<NavigationExample />)
    await user.click(screen.getByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('button', { name: 'Поделиться' }))
    await user.click(screen.getByRole('button', { name: 'На главную' }))
    await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument())
  })
})
