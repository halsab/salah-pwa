import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

afterEach(() => { vi.unstubAllGlobals() })

function renderWithViewport(height = 844, offsetTop = 0) {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
  render(<AppShell><button>Назад</button></AppShell>)
  return { viewport, layout: screen.getByRole('main') }
}

function expectDefaultViewport(layout: HTMLElement) {
  expect(layout.style.getPropertyValue('--app-viewport-height')).toBe('')
  expect(layout.style.getPropertyValue('--app-viewport-top')).toBe('')
  expect(layout.style.getPropertyValue('--app-viewport-bottom-padding')).toBe('')
}

async function afterViewportFrame() {
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) })
}

it('использует обычный layout viewport без клавиатуры', async () => {
  const { layout } = renderWithViewport()
  await afterViewportFrame()
  await waitFor(() => expectDefaultViewport(layout))
})

it('не сдвигает оболочку при pull-down bounce и отрицательном offsetTop', async () => {
  const { viewport, layout } = renderWithViewport()
  act(() => { viewport.offsetTop = -20; viewport.dispatchEvent(new Event('scroll')) })
  await afterViewportFrame()
  await waitFor(() => expectDefaultViewport(layout))
})

it('не следует за положительным offsetTop при обычном scroll', async () => {
  const { viewport, layout } = renderWithViewport(840)
  act(() => { viewport.offsetTop = 32; viewport.dispatchEvent(new Event('scroll')) })
  await afterViewportFrame()
  await waitFor(() => expectDefaultViewport(layout))
})

it('подстраивается под клавиатуру и восстанавливает исходную геометрию', async () => {
  const { viewport, layout } = renderWithViewport()
  act(() => { viewport.height = 360; viewport.offsetTop = 40; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expect(layout).toHaveStyle('--app-viewport-height: 360px; --app-viewport-top: 40px; --app-viewport-bottom-padding: 8px'))
  act(() => { viewport.offsetTop = 60; viewport.dispatchEvent(new Event('scroll')) })
  await waitFor(() => expect(layout).toHaveStyle('--app-viewport-top: 60px'))
  act(() => { viewport.height = 844; viewport.offsetTop = 0; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expectDefaultViewport(layout))
})

it('ограничивает отрицательный offsetTop при открытой клавиатуре', async () => {
  const { layout } = renderWithViewport(400, -20)
  await waitFor(() => expect(layout).toHaveStyle('--app-viewport-height: 400px; --app-viewport-top: 0px; --app-viewport-bottom-padding: 8px'))
})

it('сбрасывает поправки клавиатуры при масштабировании жестом', async () => {
  const { viewport, layout } = renderWithViewport(360, 40)
  await waitFor(() => expect(layout).toHaveStyle('--app-viewport-bottom-padding: 8px'))
  act(() => { viewport.scale = 2; viewport.dispatchEvent(new Event('resize')) })
  await waitFor(() => expectDefaultViewport(layout))
})

it('перед переходом фиксирует кнопку для возврата фокуса в браузерах без click-focus', () => {
  let focused: Element | null = null
  const onClick = vi.fn(() => { focused = document.activeElement })
  render(<AppShell><button onClick={onClick}><span>Расписание</span></button></AppShell>)
  fireEvent.click(screen.getByText('Расписание'))
  expect(onClick).toHaveBeenCalledOnce()
  expect(focused).toBe(screen.getByRole('button'))
})
