import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { ActionButton, ActionRow, IconActionButton } from './controls'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('native action buttons work with pointer and keyboard input', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionButton onClick={onClick}>Back</ActionButton>)

  const button = screen.getByRole('button', { name: 'Back' })
  await user.click(button)
  await user.keyboard('{Enter}')

  expect(onClick).toHaveBeenCalledTimes(2)
})

it('disabled action buttons cannot be activated', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionButton disabled onClick={onClick}>Unavailable</ActionButton>)

  await user.click(screen.getByRole('button', { name: 'Unavailable' }))

  expect(onClick).not.toHaveBeenCalled()
})

it('settings rows stay keyboard-accessible and expose their value', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionRow title="Theme" value="Classic" onClick={onClick} />)

  const row = screen.getByRole('button', { name: /Theme.*Classic/ })
  expect(row).toHaveAccessibleName()
  await user.click(row)

  expect(onClick).toHaveBeenCalledOnce()
})

it('icon-only buttons expose an accessible name', () => {
  render(<IconActionButton label="Settings"><svg /></IconActionButton>)

  expect(screen.getByRole('button')).toHaveAccessibleName()
})

it('keeps buttons keyboard-operable when reduced motion is requested', async () => {
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
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<ActionButton onClick={onClick}>Back</ActionButton>)

  await user.tab()
  await user.keyboard('{Enter}')

  expect(onClick).toHaveBeenCalledOnce()
})
