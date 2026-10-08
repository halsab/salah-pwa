import { useSyncExternalStore } from 'react'

export const SUPPORTED_LOCALES = ['ru'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]
export type LanguagePreference = 'auto' | SupportedLocale

export interface LocaleDefinition {
  readonly tag: string
  readonly direction: 'ltr'
  readonly nativeName: string
}

export const LOCALE_REGISTRY: readonly LocaleDefinition[] = Object.freeze([
  { tag: 'ru', direction: 'ltr', nativeName: 'Русский' },
])

function canonicalize(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const [tag] = Intl.getCanonicalLocales(value.trim())
    return tag || null
  } catch {
    return null
  }
}

export function normalizeLocale(value: unknown): string | null {
  const canonical = canonicalize(value)
  if (!canonical) return null
  const [language, ...rest] = canonical.split('-')
  if (!language) return null
  return [language.toLowerCase(), ...rest.map(part => part.length === 2 || (part.length === 3 && /^\d+$/.test(part)) ? part.toUpperCase() : part)].join('-')
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  const normalized = normalizeLocale(value)
  return normalized !== null && (SUPPORTED_LOCALES as readonly string[]).includes(normalized)
}

export function restoreLanguagePreference(value: unknown): LanguagePreference {
  if (value === 'auto') return 'auto'
  const normalized = normalizeLocale(value)
  if (!normalized) return 'auto'
  if (isSupportedLocale(normalized)) return normalized
  const base = normalized.split('-')[0]
  return base && (SUPPORTED_LOCALES as readonly string[]).includes(base) ? base as SupportedLocale : 'auto'
}

export function resolveLocale(
  preference: unknown,
  requestedLocales: readonly unknown[] = [],
  supported: readonly string[] = SUPPORTED_LOCALES,
  fallback = 'ru',
): string {
  const normalizedSupported = supported.map(value => normalizeLocale(value)).filter((value): value is string => value !== null)
  const normalizedFallback = normalizeLocale(fallback) ?? normalizedSupported[0] ?? 'ru'
  const explicit = normalizeLocale(preference)
  if (explicit && normalizedSupported.includes(explicit)) return explicit
  if (preference !== 'auto' && explicit) {
    const base = explicit.split('-')[0]
    const baseMatch = normalizedSupported.find(value => value.split('-')[0] === base)
    if (baseMatch) return baseMatch
  }
  if (preference === 'auto' || preference == null || !explicit) {
    for (const value of requestedLocales) {
      const normalized = normalizeLocale(value)
      if (!normalized) continue
      const exact = normalizedSupported.find(candidate => candidate === normalized)
      if (exact) return exact
      const base = normalized.split('-')[0]
      const baseMatch = normalizedSupported.find(candidate => candidate.split('-')[0] === base)
      if (baseMatch) return baseMatch
    }
  }
  return normalizedSupported.includes(normalizedFallback) ? normalizedFallback : (normalizedSupported[0] ?? normalizedFallback)
}

export function browserLanguagePreferences(): string[] {
  if (typeof navigator === 'undefined') return []
  const languages: readonly unknown[] = Array.isArray(navigator.languages) ? navigator.languages : []
  return [...languages, navigator.language].filter((value, index, all): value is string => typeof value === 'string' && all.indexOf(value) === index)
}

export function resolveBrowserLocale(preference: unknown = 'auto'): SupportedLocale {
  return resolveLocale(preference, browserLanguagePreferences(), SUPPORTED_LOCALES, 'ru') as SupportedLocale
}

interface LocalizationSnapshot {
  preference: LanguagePreference
  locale: SupportedLocale
}

let snapshot: LocalizationSnapshot = { preference: 'auto', locale: resolveBrowserLocale() }
const listeners = new Set<() => void>()

function applyDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = LOCALE_REGISTRY.find(item => item.tag === locale)?.direction ?? 'ltr'
}

applyDocumentLocale(snapshot.locale)

export function getLocalizationSnapshot(): LocalizationSnapshot {
  return snapshot
}

export function setLanguagePreference(preference: unknown): void {
  const restored = restoreLanguagePreference(preference)
  const locale = resolveBrowserLocale(restored)
  if (snapshot.preference === restored && normalizeLocale(snapshot.locale) === normalizeLocale(locale)) return
  snapshot = { preference: restored, locale }
  applyDocumentLocale(locale)
  for (const listener of listeners) listener()
}

export function subscribeLocalization(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLocalizationSnapshot(): LocalizationSnapshot {
  return useSyncExternalStore(subscribeLocalization, getLocalizationSnapshot, getLocalizationSnapshot)
}
