import { getSeason, getThemeTone, type DaylightWindow, type Season, type ThemeFamily, type ThemeTone } from '../domain/theme'
import { notifyJellyThemeChange } from './jelly/surface'

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
    backgroundPrimary: '#4E6270', backgroundSecondary: '#171D21', backgroundTertiary: '#35444D',
    textPrimary: '#F1F4F6', textSecondary: '#BBC6CC', accentCountdown: '#8EB6C9',
  },
  'winter-light': {
    backgroundPrimary: '#B7C8D2', backgroundSecondary: '#F3F6F7', backgroundTertiary: '#D7E0E4',
    textPrimary: '#222A2F', textSecondary: '#536168', accentCountdown: '#476A7E',
  },
  'spring-dark': {
    backgroundPrimary: '#516858', backgroundSecondary: '#18201A', backgroundTertiary: '#37463A',
    textPrimary: '#F1F5F1', textSecondary: '#BDCAC0', accentCountdown: '#97B798',
  },
  'spring-light': {
    backgroundPrimary: '#BBD0BA', backgroundSecondary: '#F2F6F1', backgroundTertiary: '#D4E0D2',
    textPrimary: '#263028', textSecondary: '#556156', accentCountdown: '#557759',
  },
  'summer-dark': {
    backgroundPrimary: '#536C70', backgroundSecondary: '#1D211C', backgroundTertiary: '#3C4940',
    textPrimary: '#F4F2E9', textSecondary: '#C6C9BB', accentCountdown: '#CDB77D',
  },
  'summer-light': {
    backgroundPrimary: '#B9D0CD', backgroundSecondary: '#F6F3E9', backgroundTertiary: '#D9DDCC',
    textPrimary: '#29302B', textSecondary: '#566158', accentCountdown: '#796738',
  },
  'autumn-dark': {
    backgroundPrimary: '#6E5146', backgroundSecondary: '#211C1A', backgroundTertiary: '#493B35',
    textPrimary: '#F5EFEA', textSecondary: '#CABCB3', accentCountdown: '#DFA774',
  },
  'autumn-light': {
    backgroundPrimary: '#D6B29B', backgroundSecondary: '#F7F1EC', backgroundTertiary: '#DFD0C5',
    textPrimary: '#2E2622', textSecondary: '#655750', accentCountdown: '#8A5033',
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

let appliedJellySignature = ''

export function applyTheme(theme: ReturnType<typeof resolveTheme>): () => void {
  const root = document.documentElement
  for (const [key, property] of Object.entries(paletteProperties) as [keyof ThemePalette, string][]) {
    root.style.setProperty(property, theme.palette[key])
  }
  root.style.colorScheme = theme.tone
  root.dataset.theme = theme.family
  root.dataset.themeTone = theme.tone
  root.dataset.season = theme.season

  // Jelly-поверхности читают цвета из токенов: обновляем их только при смене
  // палитры, а не на каждом минутном тике времени.
  const jellySignature = `${theme.palette.backgroundPrimary}|${theme.palette.backgroundTertiary}`
  if (jellySignature !== appliedJellySignature) {
    appliedJellySignature = jellySignature
    notifyJellyThemeChange()
  }
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
