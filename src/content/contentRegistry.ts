import { aboutArticle, methodologyArticle, PRIVACY_ARTICLE } from './informationArticles'
import { resolveContent, type ContentResolution, type ContentVariant } from '../localization/content'
import type { SupportedLocale } from '../localization/locale'

export type InformationContentId = 'privacy' | 'about' | 'methodology'

export function informationVariants(): readonly ContentVariant[] {
  return [
    { kind: 'information-article', contentId: 'privacy', locale: 'ru', content: PRIVACY_ARTICLE },
    { kind: 'information-article', contentId: 'about', locale: 'ru', content: aboutArticle() },
    { kind: 'information-article', contentId: 'methodology', locale: 'ru', content: methodologyArticle() },
  ]
}

export function getInformationContent(id: InformationContentId, locale: SupportedLocale, version?: string): ContentResolution {
  const variants = informationVariants().map(item => item.contentId === 'about' && version
    ? { ...item, content: aboutArticle(version) }
    : item)
  return resolveContent(variants, 'information-article', id, locale)
}
