import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { ReligiousEventBanner } from './ReligiousEventBanner'

const state = { eventId: 'arafa', secondary: { type: 'days', count: 1 }, contentId: 'arafa' } as const

it('opens the event article when the banner is activated', async () => {
  function Consumer() {
    const [openedEvent, setOpenedEvent] = useState('')
    return <>
      <ReligiousEventBanner state={state} onOpen={eventId => setOpenedEvent(eventId)} />
      <output>{openedEvent}</output>
    </>
  }

  render(<Consumer />)
  await userEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('status')).toHaveTextContent('arafa')
})

it('does not expose an action when the event has no article', () => {
  render(<ReligiousEventBanner state={{ ...state, contentId: null }} onOpen={() => {}} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
