import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})

describe('ShareDialog', () => {
  it('копирует текущую ссылку и сообщает об успехе, не закрывая диалог', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    const { props } = renderDialog()
    const copyButton = screen.getByRole('button', { name: 'Скопировать ссылку' })

    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована')
    expect(props.onClose).not.toHaveBeenCalled()
    expect(copyButton).toHaveFocus()
  })

  it('доступно сообщает об отказе Clipboard API и сохраняет диалог открытым', async () => {
    const user = userEvent.setup()
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось скопировать ссылку')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('обрабатывает отсутствие Clipboard API как доступную ошибку', async () => {
    const user = userEvent.setup()
    setClipboard(undefined)
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
  })

  it.each(['resolved', 'rejected'] as const)(
    'игнорирует %s Clipboard-запрос после закрытия и повторного открытия',
    async (outcome) => {
      const user = userEvent.setup()
      const request = deferred<void>()
      setClipboard(vi.fn().mockReturnValue(request.promise))
      const { props, rerender } = renderDialog()

      await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
      rerender(<ShareDialog {...props} open={false} />)
      rerender(<ShareDialog {...props} open />)

      await act(async () => {
        if (outcome === 'resolved') request.resolve()
        else request.reject(new Error('denied'))
        await request.promise.catch(() => undefined)
      })

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    },
  )

  it('сохраняет QR, начальный фокус, закрытие кнопкой, фоном и Escape', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'QR-код Salah' })
    const copyButton = screen.getByRole('button', { name: 'Скопировать ссылку' })

    expect(screen.getByRole('img', { name: 'QR-код со ссылкой на Salah' })).toHaveAttribute(
      'src',
      '/share-qr.svg',
    )
    await waitFor(() => expect(copyButton).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    fireEvent.pointerDown(dialog.parentElement!, { pointerType: 'touch' })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalledTimes(3)
  })
})
