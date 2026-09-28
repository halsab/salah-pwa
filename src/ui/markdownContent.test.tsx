import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { MarkdownArticle } from './MarkdownArticle'
import { markdownLink, markdownText } from './markdownContent'

it('оставляет runtime-значения текстом и принимает только http/https для внешней ссылки', () => {
  const { container } = render(<MarkdownArticle content={`# Источник\n\n${markdownText('Казань [ссылка](https://example.com)')}\n\n${markdownLink('Поставщик', 'javascript:alert(1)')}`} />)
  expect(screen.getByText('Казань [ссылка](https://example.com)')).toBeVisible()
  expect(container.querySelector('a')).toBeNull()
  expect(screen.getByText('Поставщик')).toBeVisible()
})
