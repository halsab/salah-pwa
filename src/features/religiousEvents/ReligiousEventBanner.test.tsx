import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { ReligiousEventBanner } from './ReligiousEventBanner'

const state = { eventId: 'arafa', title: 'День Арафа', secondaryText: 'завтра', contentId: 'arafa' } as const

it('рендерит content banner кнопкой со стабильным id', async () => {
  const onOpen = vi.fn()
  render(<ReligiousEventBanner state={state} onOpen={onOpen} />)
  const button = screen.getByRole('button', { name: 'День Арафа завтра' })
  expect(button).toHaveAttribute('id', 'religious-event-banner')
  await userEvent.click(button)
  expect(onOpen).toHaveBeenCalledWith('arafa')
})

it('рендерит banner без content обычным неинтерактивным элементом', () => {
  render(<ReligiousEventBanner state={{ ...state, contentId: null }} onOpen={vi.fn()} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByText('День Арафа').parentElement).not.toHaveAttribute('role', 'button')
})
