import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MarkdownArticle } from './MarkdownArticle'

it('показывает разрешённый Markdown, обычные ссылки и пропускает HTML', () => {
  const { container } = render(<MarkdownArticle content={'# Заголовок\n\n## Раздел\n\nАбзац **жирный** *курсив*.\n\n- Пункт\n\n> Цитата\n\n[Внешняя](https://example.com) и [локальная](/salah-pwa/).\n\n<script>alert(1)</script>\n\n![alt](https://example.com/image.png)'} />)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 2, name: 'Раздел' })).toBeVisible()
  expect(container.querySelector('strong')).toHaveTextContent('жирный')
  expect(container.querySelector('em')).toHaveTextContent('курсив')
  expect(screen.getByRole('listitem')).toHaveTextContent('Пункт')
  expect(container.querySelector('blockquote')).toHaveTextContent('Цитата')
  expect(screen.getByRole('link', { name: 'Внешняя' })).toHaveAttribute('rel', 'noreferrer')
  expect(screen.getByRole('link', { name: 'Внешняя' })).toHaveAttribute('target', '_blank')
  expect(screen.getByRole('link', { name: 'локальная' })).toHaveAttribute('href', '/salah-pwa/')
  expect(screen.getByRole('link', { name: 'локальная' })).not.toHaveAttribute('target')
  expect(container.querySelector('script, img')).toBeNull()
})
