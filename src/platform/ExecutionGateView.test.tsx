import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ gate: null as null | {
  supported: boolean
  hasError: () => boolean
  start: () => Promise<boolean>
  requestOwnership: () => Promise<boolean>
  close: () => void
  relinquish: () => Promise<void>
  onTakeover: (callback: () => Promise<void>) => void
}, app: vi.fn() }))

vi.mock('../App', () => ({ App: () => { mocks.app(); return <div data-testid="app" /> } }))
vi.mock('./executionGate', () => ({
  createExecutionGate: () => mocks.gate,
  waitForExecutionQuiescence: () => Promise.resolve(),
}))

import { ExecutionGateView } from './ExecutionGateView'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function createGate(start: Promise<boolean>) {
  return {
    supported: true,
    hasError: () => false,
    start: () => start,
    requestOwnership: vi.fn().mockResolvedValue(false),
    close: vi.fn(),
    relinquish: vi.fn().mockResolvedValue(undefined),
    onTakeover: vi.fn(),
  }
}

afterEach(() => {
  mocks.gate = null
  mocks.app.mockClear()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-tone')
  document.documentElement.removeAttribute('data-season')
})

describe('execution gate presentation', () => {
  it('keeps ownership resolution separate from the confirmed blocked screen', async () => {
    const start = deferred<boolean>()
    mocks.gate = createGate(start.promise)

    const view = render(<ExecutionGateView />)

    expect(screen.queryByRole('heading', { name: 'Приложение уже открыто' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()

    await act(async () => { start.resolve(false); await start.promise })

    expect(screen.getByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
    expect(view.container.querySelector('.app-screen')).toBeInTheDocument()
    expect(view.container.querySelector('.screen-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Продолжить здесь' })).toHaveClass('pill--primary')
  })

  it('mounts App immediately after ownership succeeds without a lazy fallback stage', async () => {
    mocks.gate = createGate(Promise.resolve(true))
    render(<ExecutionGateView />)

    expect(await screen.findByTestId('app')).toBeInTheDocument()
    expect(mocks.app).toHaveBeenCalledOnce()
  })

  it('shows a recoverable coordination error instead of claiming another tab owns the lock', async () => {
    const gate = createGate(Promise.resolve(false))
    gate.hasError = () => true
    mocks.gate = gate
    render(<ExecutionGateView />)

    expect(await screen.findByText('Не удалось проверить безопасное владение вкладкой. Повторите попытку.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Приложение уже открыто' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeEnabled()
  })
})
