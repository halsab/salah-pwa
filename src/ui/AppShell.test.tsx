import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

afterEach(() => { vi.unstubAllGlobals() })
it('подстраивает оболочку под видимую область клавиатуры и восстанавливает высоту', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  render(<AppShell><button>Назад</button></AppShell>)
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 844px'))
  act(() => { viewport.height = 360; viewport.offsetTop = 40; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 360px; --app-viewport-top: 40px'))
  act(() => { viewport.height = 844; viewport.offsetTop = 0; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 844px; --app-viewport-top: 0px'))
})

it('перед переходом фиксирует кнопку для возврата фокуса в браузерах без click-focus', () => {
  let focused: Element | null = null
  const onClick = vi.fn(() => { focused = document.activeElement })
  render(<AppShell><button onClick={onClick}><span>Расписание</span></button></AppShell>)
  fireEvent.click(screen.getByText('Расписание'))
  expect(onClick).toHaveBeenCalledOnce()
  expect(focused).toBe(screen.getByRole('button'))
})
