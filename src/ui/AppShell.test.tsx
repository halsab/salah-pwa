import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

afterEach(() => { vi.unstubAllGlobals() })
it('подстраивает оболочку под видимую область клавиатуры и восстанавливает высоту', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
  render(<AppShell><button>Назад</button></AppShell>)
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 844px'))
  expect(screen.getByRole('main').style.getPropertyValue('--app-viewport-bottom-padding')).toBe('')
  act(() => { viewport.height = 360; viewport.offsetTop = 40; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 360px; --app-viewport-top: 40px'))
  expect(screen.getByRole('main')).toHaveStyle('--app-viewport-bottom-padding: 8px')
  act(() => { viewport.offsetTop = 60; viewport.dispatchEvent(new Event('scroll')) })
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-top: 60px'))
  expect(screen.getByRole('main')).toHaveStyle('--app-viewport-bottom-padding: 8px')
  act(() => { viewport.height = 844; viewport.offsetTop = 0; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 844px; --app-viewport-top: 0px'))
  expect(screen.getByRole('main').style.getPropertyValue('--app-viewport-bottom-padding')).toBe('')
})

it('сохраняет обычный нижний отступ, если сдвинутая видимая область доходит до низа экрана', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 804, offsetTop: 40, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
  render(<AppShell><button>Назад</button></AppShell>)
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-height: 804px'))
  expect(screen.getByRole('main').style.getPropertyValue('--app-viewport-bottom-padding')).toBe('')
})

it('сбрасывает поправки клавиатуры при масштабировании жестом', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 360, offsetTop: 40, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
  render(<AppShell><button>Назад</button></AppShell>)
  await waitFor(() => expect(screen.getByRole('main')).toHaveStyle('--app-viewport-bottom-padding: 8px'))
  act(() => { viewport.scale = 2; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(screen.getByRole('main').style.getPropertyValue('--app-viewport-height')).toBe(''))
  expect(screen.getByRole('main').style.getPropertyValue('--app-viewport-top')).toBe('')
  expect(screen.getByRole('main').style.getPropertyValue('--app-viewport-bottom-padding')).toBe('')
})

it('перед переходом фиксирует кнопку для возврата фокуса в браузерах без click-focus', () => {
  let focused: Element | null = null
  const onClick = vi.fn(() => { focused = document.activeElement })
  render(<AppShell><button onClick={onClick}><span>Расписание</span></button></AppShell>)
  fireEvent.click(screen.getByText('Расписание'))
  expect(onClick).toHaveBeenCalledOnce()
  expect(focused).toBe(screen.getByRole('button'))
})
