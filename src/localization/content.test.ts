import { describe, expect, it } from 'vitest'
import { resolveContent, type ContentVariant } from './content'

const variants: ContentVariant[] = [
  { contentId: 'article', kind: 'event-article', locale: 'ru', content: '# Русский' },
  { contentId: 'other', kind: 'event-article', locale: 'ru', content: '# Другая статья' },
]

describe('content localization', () => {
  it('возвращает полную русскую статью как fallback на каждый документ', () => {
    expect(resolveContent(variants, 'event-article', 'article', 'ru')).toMatchObject({
      status: 'resolved', locale: 'ru', fallback: false, content: '# Русский',
    })
    expect(resolveContent(variants, 'event-article', 'article', 'ru')).toMatchObject({ status: 'resolved' })
  })

  it('различает отсутствующий контент и fallback', () => {
    expect(resolveContent(variants, 'prophet-story', 'missing', 'ru')).toEqual({
      status: 'unavailable', kind: 'prophet-story', contentId: 'missing',
    })
  })
})
