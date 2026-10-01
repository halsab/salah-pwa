import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { ActionButton } from '../controls'
import { notifyJellyThemeChange } from './surface'

interface FakeContextCalls {
  fill: number
  clear: number
  colors: string[]
}

const originalDescriptors = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
}

function installContext(): FakeContextCalls {
  const calls: FakeContextCalls = { fill: 0, clear: 0, colors: [] }
  const ctx = {
    clearRect: () => { calls.clear += 1 },
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    bezierCurveTo: () => undefined,
    closePath: () => undefined,
    fill: () => { calls.fill += 1; calls.colors.push(ctx.fillStyle as string) },
    setTransform: () => undefined,
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })

  return calls
}

function installSize(): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 120 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 44 })
}

function pointer(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, { bubbles: true, ...init })
}

afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null })
  if (originalDescriptors.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalDescriptors.offsetWidth)
  if (originalDescriptors.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalDescriptors.offsetHeight)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('рисует поверхность и запускает физику при нажатии и ведении указателя', async () => {
  const calls = installContext()
  installSize()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  render(<ActionButton>Найти город</ActionButton>)
  const button = screen.getByRole('button', { name: 'Найти город' })

  expect(calls.fill).toBeGreaterThan(0)

  const before = calls.fill
  button.dispatchEvent(pointer('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 }))
  button.dispatchEvent(pointer('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 4 }))
  await vi.waitFor(() => { expect(calls.fill).toBeGreaterThan(before) })
  button.dispatchEvent(pointer('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 4 }))
  expect(errors).not.toHaveBeenCalled()
  // Нажатие показывает только деформацию: цвет поверхности не меняется ни в одной теме.
  expect(new Set(calls.colors).size).toBe(1)
})

it('клавиатурная активация даёт импульс и отпускание', async () => {
  const calls = installContext()
  installSize()

  render(<ActionButton>Назад</ActionButton>)
  const button = screen.getByRole('button', { name: 'Назад' })

  const before = calls.fill
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await vi.waitFor(() => { expect(calls.fill).toBeGreaterThan(before) })
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
  button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }))
})

it('disabled не рисует поверхность и не запускает физику', () => {
  const calls = installContext()
  installSize()
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame')

  render(<ActionButton disabled>Недоступно</ActionButton>)
  const button = screen.getByRole('button', { name: 'Недоступно' })

  expect(calls.fill).toBe(0)
  const before = raf.mock.calls.length
  button.dispatchEvent(pointer('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 0, clientY: 0 }))
  expect(raf.mock.calls.length).toBe(before)
})

it('prefers-reduced-motion оставляет статический fallback без canvas-физики', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
  const calls = installContext()
  installSize()
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame')

  render(<ActionButton>Назад</ActionButton>)
  const button = screen.getByRole('button', { name: 'Назад' })

  expect(calls.fill).toBe(0)
  const before = raf.mock.calls.length
  button.dispatchEvent(pointer('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 0, clientY: 0 }))
  expect(raf.mock.calls.length).toBe(before)
})

it('смена темы перерисовывает живую поверхность', () => {
  const calls = installContext()
  installSize()

  render(<ActionButton>Назад</ActionButton>)
  const before = calls.fill

  notifyJellyThemeChange()
  expect(calls.fill).toBeGreaterThan(before)
})

it('отпускание за пределами кнопки подавляет click', () => {
  installContext()
  installSize()

  render(<ActionButton>Найти город</ActionButton>)
  const button = screen.getByRole('button', { name: 'Найти город' })

  button.dispatchEvent(pointer('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 0, clientY: 0 }))
  button.dispatchEvent(pointer('pointerup', { pointerId: 4, pointerType: 'touch', clientX: 500, clientY: 500 }))

  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(true)
})

it('без 2d-контекста кнопка получает статический fallback', () => {
  installSize()

  render(<ActionButton>Назад</ActionButton>)

  expect(screen.getByRole('button', { name: 'Назад' })).toHaveAttribute('data-jelly-fallback')
})
