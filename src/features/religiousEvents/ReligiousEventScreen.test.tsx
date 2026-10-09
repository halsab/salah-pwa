import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { RELIGIOUS_EVENTS } from '../../domain/religiousEvents'
import { localizedEventTitle } from '../../localization/religiousEvents'
import { ReligiousEventScreen } from './ReligiousEventScreen'

it.each(RELIGIOUS_EVENTS)('открывает локальную статью события $id', ({ id }) => {
  const { container } = render(<ReligiousEventScreen eventId={id} onBack={() => {}} />)
  const title = localizedEventTitle(id, 'ru')

  expect(screen.getByRole('region', { name: title })).toBeVisible()
  expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
  expect(container.querySelector('.markdown-article blockquote')).not.toBeNull()
})

it('показывает только стандартный Back и локальную Markdown-статью', async () => {
  const onBack = vi.fn()
  render(<ReligiousEventScreen eventId="arafa" onBack={onBack} />)

  const articleScreen = screen.getByRole('region', { name: 'День Арафа' })
  expect(articleScreen).toBeVisible()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('День Арафа')
  expect(screen.getAllByRole('button')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
  expect(onBack).toHaveBeenCalledOnce()
})
