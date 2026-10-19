import { DEFAULT_THEME_FAMILY, type ThemeFamily } from '../domain/theme'

export const THEME_PREFERENCE_CACHE_KEY = 'salah-theme-preference-v1'
const CACHE_VERSION = 1

export function isThemeFamily(value: unknown): value is ThemeFamily {
  return value === 'classic' || value === 'seasonal'
}

export function readThemePreferenceCache(): ThemeFamily {
  let raw: string | null
  try {
    raw = localStorage.getItem(THEME_PREFERENCE_CACHE_KEY)
  } catch {
    return DEFAULT_THEME_FAMILY
  }
  if (raw === null) return DEFAULT_THEME_FAMILY
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null
      && 'version' in value && value.version === CACHE_VERSION
      && 'themeFamily' in value && isThemeFamily(value.themeFamily)) return value.themeFamily
  } catch {
    // Повреждённый JSON ниже удаляется так же, как устаревший формат.
  }
  try { localStorage.removeItem(THEME_PREFERENCE_CACHE_KEY) } catch { /* Очистка необязательна для безопасного cache miss. */ }
  return DEFAULT_THEME_FAMILY
}

export function writeThemePreferenceCache(themeFamily: ThemeFamily): boolean {
  try {
    localStorage.setItem(THEME_PREFERENCE_CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, themeFamily }))
    return true
  } catch {
    return false
  }
}

export function clearThemePreferenceCache(): void {
  try {
    localStorage.removeItem(THEME_PREFERENCE_CACHE_KEY)
  } catch {
    // Сброс продолжает работу через авторитетную базу IndexedDB.
  }
}

export function isThemePreferenceCacheEvent(event: StorageEvent): boolean {
  return event.key === THEME_PREFERENCE_CACHE_KEY
}
