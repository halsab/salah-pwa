import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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

describe('навигация экранов', () => {
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
