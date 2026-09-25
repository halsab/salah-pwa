import { getSeason, getThemeTone, type DaylightWindow, type Season, type ThemeFamily, type ThemeTone } from '../domain/theme'

export interface ThemePalette {
  backgroundPrimary: string
  backgroundSecondary: string
  backgroundTertiary: string
  textPrimary: string
  textSecondary: string
  accentCountdown: string
}

type ThemePaletteKey = `classic-${ThemeTone}` | `${Season}-${ThemeTone}`

export const themePalettes = {
  'classic-dark': {
    backgroundPrimary: '#000000', backgroundSecondary: '#282828', backgroundTertiary: '#383838',
    textPrimary: '#FFFFFF', textSecondary: '#A8A8A8', accentCountdown: '#FF8A3D',
  },
  'classic-light': {
    backgroundPrimary: '#000000', backgroundSecondary: '#F2F2EE', backgroundTertiary: '#E3E3DE',
    textPrimary: '#181818', textSecondary: '#5F5F5A', accentCountdown: '#B34900',
  },
  'winter-dark': {
    backgroundPrimary: '#176FC2', backgroundSecondary: '#071B2D', backgroundTertiary: '#244F70',
    textPrimary: '#F5FAFF', textSecondary: '#C8DCEB', accentCountdown: '#7DD3FC',
  },
  'winter-light': {
    backgroundPrimary: '#8FD0FF', backgroundSecondary: '#F3F9FD', backgroundTertiary: '#9FC7DF',
    textPrimary: '#0D2638', textSecondary: '#334C5E', accentCountdown: '#0A5C9C',
  },
  'spring-dark': {
    backgroundPrimary: '#0E7A4D', backgroundSecondary: '#082018', backgroundTertiary: '#285943',
    textPrimary: '#F3FAF4', textSecondary: '#CDE5D4', accentCountdown: '#8FE388',
  },
  'spring-light': {
    backgroundPrimary: '#9EE06F', backgroundSecondary: '#F5FAF1', backgroundTertiary: '#ADD29B',
    textPrimary: '#15301D', textSecondary: '#3A5541', accentCountdown: '#267A38',
  },
  'summer-dark': {
    backgroundPrimary: '#007FA8', backgroundSecondary: '#17210F', backgroundTertiary: '#4A5F31',
    textPrimary: '#FFF8E8', textSecondary: '#DFE3C9', accentCountdown: '#FFD24A',
  },
  'summer-light': {
    backgroundPrimary: '#59C1E8', backgroundSecondary: '#FFF4CF', backgroundTertiary: '#B0C27C',
    textPrimary: '#243016', textSecondary: '#40502E', accentCountdown: '#946000',
  },
  'autumn-dark': {
    backgroundPrimary: '#A54212', backgroundSecondary: '#24100A', backgroundTertiary: '#63301B',
    textPrimary: '#FFF8F1', textSecondary: '#E8C9B7', accentCountdown: '#FFC857',
  },
  'autumn-light': {
    backgroundPrimary: '#FFB26B', backgroundSecondary: '#FFF4EA', backgroundTertiary: '#E8B28F',
    textPrimary: '#32170D', textSecondary: '#624334', accentCountdown: '#A84600',
  },
} as const satisfies Record<ThemePaletteKey, ThemePalette>

export function resolveTheme(family: ThemeFamily, civilDate: string, now: Date, daylight: DaylightWindow | null) {
  const season = getSeason(civilDate)
  const tone = getThemeTone(now, daylight)
  const key = family === 'classic' ? `classic-${tone}` as const : `${season}-${tone}` as const
  return { family, season, tone, palette: themePalettes[key] }
}

const paletteProperties = {
  backgroundPrimary: '--background-primary',
  backgroundSecondary: '--background-secondary',
  backgroundTertiary: '--background-tertiary',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  accentCountdown: '--accent-countdown',
} as const

export function applyTheme(theme: ReturnType<typeof resolveTheme>): () => void {
  const root = document.documentElement
  for (const [key, property] of Object.entries(paletteProperties) as [keyof ThemePalette, string][]) {
    root.style.setProperty(property, theme.palette[key])
  }
  root.style.colorScheme = theme.tone
  root.dataset.theme = theme.family
  root.dataset.themeTone = theme.tone
  root.dataset.season = theme.season
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const previousThemeColor = themeColor?.content
  if (themeColor) themeColor.content = theme.palette.backgroundPrimary
  const colorScheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  const previousColorScheme = colorScheme?.content
  if (colorScheme) colorScheme.content = theme.tone

  return () => {
    for (const property of Object.values(paletteProperties)) root.style.removeProperty(property)
    root.style.removeProperty('color-scheme')
    delete root.dataset.theme
    delete root.dataset.themeTone
    delete root.dataset.season
    if (themeColor && previousThemeColor !== undefined) themeColor.content = previousThemeColor
    if (colorScheme && previousColorScheme !== undefined) colorScheme.content = previousColorScheme
  }
}
