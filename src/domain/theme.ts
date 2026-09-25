export type ThemeFamily = 'classic' | 'seasonal'
export type ThemeTone = 'dark' | 'light'
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export interface DaylightWindow {
  sunrise: number
  maghrib: number
}

export const DEFAULT_THEME_FAMILY: ThemeFamily = 'classic'

export function restoreThemeFamily(value: unknown): ThemeFamily {
  return value === 'seasonal' ? 'seasonal' : DEFAULT_THEME_FAMILY
}

export function getSeason(civilDate: string): Season {
  const month = Number(civilDate.slice(5, 7))
  if (month === 12 || month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'autumn'
}

export function getThemeTone(now: Date, daylight: DaylightWindow | null): ThemeTone {
  const instant = now.getTime()
  if (!daylight || !Number.isFinite(instant) || !Number.isFinite(daylight.sunrise)
    || !Number.isFinite(daylight.maghrib) || daylight.sunrise >= daylight.maghrib) return 'dark'
  return instant >= daylight.sunrise && instant < daylight.maghrib ? 'light' : 'dark'
}
