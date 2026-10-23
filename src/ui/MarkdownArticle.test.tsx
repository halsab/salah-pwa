import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MarkdownArticle } from './MarkdownArticle'

it('ограничивает небезопасные ссылки и не исполняет встроенный HTML', async () => {
  const { container } = render(<MarkdownArticle content={'# Заголовок\n\n## Раздел\n\nАбзац **жирный** *курсив*.\n\n- Пункт\n\n> Цитата\n\n[Внешняя](https://example.com) и [локальная](/).\n\n<script>alert(1)</script>\n\n![alt](https://example.com/image.png)'} />)
  const links = await screen.findAllByRole('link')
  expect(links[0]).toHaveAttribute('rel', 'noreferrer')
  expect(links[0]).toHaveAttribute('target', '_blank')
  expect(links[1]).toHaveAttribute('href', '/')
  expect(links[1]).not.toHaveAttribute('target')
  expect(container.querySelector('script, img')).toBeNull()
})
