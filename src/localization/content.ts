import type { SupportedLocale } from './locale'

export type ContentKind = 'event-article' | 'information-article' | 'prophet-story'

export interface ContentVariant {
  readonly contentId: string
  readonly kind: ContentKind
  readonly locale: string
  readonly content: string
}

export type ContentResolution =
  | { status: 'resolved'; contentId: string; kind: ContentKind; locale: string; content: string; fallback: boolean }
  | { status: 'unavailable'; contentId: string; kind: ContentKind }

export function resolveContent(
  variants: readonly ContentVariant[],
  kind: ContentKind,
  contentId: string,
  preferredLocale: SupportedLocale,
  fallbackLocale: SupportedLocale = 'ru',
): ContentResolution {
  const match = variants.find(item => item.kind === kind && item.contentId === contentId && item.locale === preferredLocale)
    ?? variants.find(item => item.kind === kind && item.contentId === contentId && item.locale === fallbackLocale)
  if (!match) return { status: 'unavailable', contentId, kind }
  return {
    status: 'resolved', contentId, kind, locale: match.locale, content: match.content,
    fallback: match.locale !== preferredLocale,
  }
}
