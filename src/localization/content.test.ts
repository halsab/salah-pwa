import { describe, expect, it } from 'vitest'
import { resolveContent, type ContentVariant } from './content'

const variants: ContentVariant[] = [
  { contentId: 'article', kind: 'event-article', locale: 'ru', content: '# Русский' },
  { contentId: 'article', kind: 'event-article', locale: 'future', content: '# Дополнительная версия' },
  { contentId: 'other', kind: 'event-article', locale: 'ru', content: '# Другая статья' },
]

describe('content localization', () => {
  it('возвращает полную русскую статью как fallback на каждый документ', () => {
    expect(resolveContent(variants, 'event-article', 'article', 'ar')).toMatchObject({
      status: 'resolved', locale: 'ru', fallback: true, content: '# Русский',
    })
    expect(resolveContent(variants, 'event-article', 'article', 'future')).toMatchObject({
      status: 'resolved', locale: 'future', fallback: false, content: '# Дополнительная версия',
    })
  })

  it('различает отсутствующий контент и fallback', () => {
    expect(resolveContent(variants, 'prophet-story', 'missing', 'ru')).toEqual({
      status: 'unavailable', kind: 'prophet-story', contentId: 'missing',
    })
  })
})
