import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type MockGate = {
  supported: boolean
  hasError: () => boolean
  start: () => Promise<boolean>
  requestOwnership: () => Promise<boolean>
  close: () => void
  relinquish: () => Promise<void>
  onTakeover: (callback: () => Promise<void>) => void
}

const mocks = vi.hoisted(() => ({ gate: null as MockGate | null,
  createGate: vi.fn<() => MockGate | null>(), app: vi.fn() }))

vi.mock('../App', () => ({ App: () => { mocks.app(); return <div data-testid="app" /> } }))
vi.mock('./executionGate', () => ({
  createExecutionGate: () => mocks.createGate() ?? mocks.gate,
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
    start: vi.fn(() => start),
    requestOwnership: vi.fn().mockResolvedValue(false),
    close: vi.fn(),
    relinquish: vi.fn().mockResolvedValue(undefined),
    onTakeover: vi.fn(),
  }
}

afterEach(() => {
  mocks.gate = null
  mocks.createGate.mockReset()
  mocks.app.mockClear()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-tone')
  document.documentElement.removeAttribute('data-season')
})

describe('execution gate presentation', () => {
  it('uses a fresh controller across consecutive BFCache lifecycle cycles', async () => {
    const first = createGate(Promise.resolve(true))
    const second = createGate(Promise.resolve(true))
    const third = createGate(Promise.resolve(true))
    mocks.createGate.mockReset().mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third)
    render(<ExecutionGateView />)
    expect(await screen.findByTestId('app')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      await Promise.resolve()
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await Promise.resolve()
    })
    expect(await screen.findByTestId('app')).toBeInTheDocument()
    expect(first.relinquish).toHaveBeenCalledOnce()
    expect(first.close).toHaveBeenCalledOnce()

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      await Promise.resolve()
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await Promise.resolve()
    })
    expect(await screen.findByTestId('app')).toBeInTheDocument()
    expect(second.relinquish).toHaveBeenCalledOnce()
    expect(second.close).toHaveBeenCalledOnce()
    expect(mocks.createGate).toHaveBeenCalledTimes(3)
  })

  it('ignores initial ownership completion after a BFCache controller replacement', async () => {
    const lateStart = deferred<boolean>()
    const first = createGate(lateStart.promise)
    const replacement = createGate(Promise.resolve(false))
    mocks.createGate.mockReset().mockReturnValueOnce(first).mockReturnValueOnce(replacement)
    render(<ExecutionGateView />)

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      await Promise.resolve()
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await Promise.resolve()
    })
    expect(await screen.findByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
    await act(async () => { lateStart.resolve(true); await lateStart.promise })
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
  })

  it('ignores a takeover result from a controller replaced while the request is pending', async () => {
    const request = deferred<boolean>()
    const previous = createGate(Promise.resolve(false))
    previous.requestOwnership = vi.fn(() => request.promise)
    const restored = createGate(Promise.resolve(false))
    mocks.createGate.mockReset().mockReturnValueOnce(previous).mockReturnValueOnce(restored)
    render(<ExecutionGateView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Продолжить здесь' }))
    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      await Promise.resolve()
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await Promise.resolve()
    })
    expect(await screen.findByRole('heading', { name: 'Приложение уже открыто' })).toBeVisible()
    await act(async () => { request.resolve(true); await request.promise })
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
  })

  it('shows a retryable error when lifecycle relinquishment fails', async () => {
    const owner = createGate(Promise.resolve(true))
    owner.relinquish.mockRejectedValueOnce(new Error('quiescence failed'))
    mocks.createGate.mockReset().mockReturnValue(owner)
    render(<ExecutionGateView />)

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeEnabled()
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
  })

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
