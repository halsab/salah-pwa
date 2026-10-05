import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ShareDialog } from './ShareDialog'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

function setShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: share })
}

function renderDialog(overrides: Partial<ComponentProps<typeof ShareDialog>> = {}) {
  const props: ComponentProps<typeof ShareDialog> = {
    open: true,
    onClose: vi.fn(),
    ...overrides,
  }

  return { props, ...render(<ShareDialog {...props} />) }
}

afterEach(() => {
  setClipboard(undefined)
  setShare(undefined)
  window.history.replaceState(null, '', '/')
})

describe('ShareDialog', () => {
  it('копирует каноническую ссылку без параметров страницы и сообщает об успехе', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    setShare(undefined)
    window.history.replaceState(null, '', '/?preview=1#schedule')
    const { props } = renderDialog()
    const copyButton = screen.getByRole('button', { name: 'Скопировать ссылку' })

    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledWith('https://halsab.github.io/salah-pwa/')
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Ссылка скопирована')
    expect(status).toHaveClass('sr-only')
    expect(props.onClose).not.toHaveBeenCalled()
    expect(copyButton).toHaveFocus()
  })

  it('сразу передаёт каноническую ссылку в системный share', async () => {
    const user = userEvent.setup()
    const share = vi.fn().mockResolvedValue(undefined)
    setShare(share)
    window.history.replaceState(null, '', '/?place=kazan&source=local&date=2026-10-05')
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Поделиться' }))

    expect(share).toHaveBeenCalledWith({ title: 'Salah — время намаза', url: 'https://halsab.github.io/salah-pwa/' })
    expect(screen.getByRole('textbox', { name: 'Ссылка на приложение' })).toHaveValue('https://halsab.github.io/salah-pwa/')
  })

  it('при отсутствии Web Share API показывает прежнее копирование', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    setShare(undefined)
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    expect(writeText).toHaveBeenCalledWith('https://halsab.github.io/salah-pwa/')
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована')
  })

  it('молча обрабатывает отмену системного share', async () => {
    const user = userEvent.setup()
    setShare(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Поделиться' }))

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Поделиться' })).toBeVisible()
  })

  it('при ошибке share сообщает о ней и даёт скопировать ссылку', async () => {
    const user = userEvent.setup()
    setShare(vi.fn().mockRejectedValue(new Error('unavailable')))
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Поделиться' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось поделиться')
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
    expect(writeText).toHaveBeenCalledWith('https://halsab.github.io/salah-pwa/')
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована')
  })

  it('доступно сообщает об отказе Clipboard API и сохраняет диалог открытым', async () => {
    const user = userEvent.setup()
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    setShare(undefined)
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Не удалось скопировать ссылку')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('textbox', { name: 'Ссылка на приложение' })).toHaveFocus()
    expect(screen.getByRole('textbox')).toHaveValue('https://halsab.github.io/salah-pwa/')
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('обрабатывает отсутствие Clipboard API как доступную ошибку', async () => {
    const user = userEvent.setup()
    setClipboard(undefined)
    setShare(undefined)
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось скопировать ссылку')
  })

  it('сбрасывает обратную связь после закрытия и повторного открытия', async () => {
    const user = userEvent.setup()
    setClipboard(vi.fn().mockResolvedValue(undefined))
    const { props, rerender } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована')

    rerender(<ShareDialog {...props} open={false} />)
    rerender(<ShareDialog {...props} open />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).toHaveClass('sr-only')
  })

  it.each(['resolved', 'rejected'] as const)(
    'игнорирует %s Clipboard-запрос после закрытия и повторного открытия',
    async (outcome) => {
      const user = userEvent.setup()
      const request = deferred<undefined>()
      setClipboard(vi.fn().mockReturnValue(request.promise))
      const { props, rerender } = renderDialog()

      await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
      rerender(<ShareDialog {...props} open={false} />)
      rerender(<ShareDialog {...props} open />)

      await act(async () => {
        if (outcome === 'resolved') request.resolve(undefined)
        else request.reject(new Error('denied'))
        await request.promise.catch(() => undefined)
      })

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.getByRole('status')).toHaveClass('sr-only')
    },
  )

  it('сохраняет QR и возвращается кнопкой Назад', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()
    expect(screen.getByRole('region', { name: 'Поделиться' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'QR-код ссылки на приложение' })).toHaveAttribute('src', '/share-qr.svg')
    expect(screen.getByRole('textbox', { name: 'Ссылка на приложение' })).toHaveValue('https://halsab.github.io/salah-pwa/')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
