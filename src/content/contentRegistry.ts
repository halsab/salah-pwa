import { aboutArticle, methodologyArticle, PRIVACY_ARTICLE } from './informationArticles'
import { resolveContent, type ContentResolution, type ContentVariant } from '../localization/content'
import type { SupportedLocale } from '../localization/locale'

export type InformationContentId = 'privacy' | 'about' | 'methodology'

export function informationVariants(officialScheduleUrl = ''): readonly ContentVariant[] {
  return [
    { kind: 'information-article', contentId: 'privacy', locale: 'ru', content: PRIVACY_ARTICLE },
    { kind: 'information-article', contentId: 'about', locale: 'ru', content: aboutArticle() },
    { kind: 'information-article', contentId: 'methodology', locale: 'ru', content: methodologyArticle(officialScheduleUrl) },
  ]
}

export function getInformationContent(id: InformationContentId, locale: SupportedLocale, officialScheduleUrl = '', version?: string): ContentResolution {
  const variants = informationVariants(officialScheduleUrl).map(item => item.contentId === 'about' && version
    ? { ...item, content: aboutArticle(version) }
    : item)
  return resolveContent(variants, 'information-article', id, locale)
}
