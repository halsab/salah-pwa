import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_FAMILY, getSeason, restoreThemeFamily } from '../domain/theme'
import { applyTheme, resolveTheme, themePalettes } from './theme'

describe('theme', () => {
  it('restores only supported theme families', () => {
    expect(DEFAULT_THEME_FAMILY).toBe('classic')
    expect(restoreThemeFamily(undefined)).toBe('classic')
    expect(restoreThemeFamily('broken')).toBe('classic')
    expect(restoreThemeFamily('seasonal')).toBe('seasonal')
  })

  it.each([
    ['2026-12-01', 'winter'], ['2026-01-15', 'winter'], ['2026-02-28', 'winter'],
    ['2026-03-01', 'spring'], ['2026-04-15', 'spring'], ['2026-05-31', 'spring'],
    ['2026-06-01', 'summer'], ['2026-07-15', 'summer'], ['2026-08-31', 'summer'],
    ['2026-09-01', 'autumn'], ['2026-10-15', 'autumn'], ['2026-11-30', 'autumn'],
  ] as const)('maps %s to %s', (date, season) => {
    expect(getSeason(date)).toBe(season)
  })

  it('keeps every palette limited to the six semantic colors with approved contrast', () => {
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/.{2}/g)?.map(value => Number.parseInt(value, 16) / 255) ?? []
      const [red = 0, green = 0, blue = 0] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }
    const contrast = (left: string, right: string) => {
      const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a)
      return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
    }

    for (const palette of Object.values(themePalettes)) {
      expect(Object.keys(palette)).toEqual([
        'backgroundPrimary', 'backgroundSecondary', 'backgroundTertiary',
        'textPrimary', 'textSecondary', 'accentCountdown',
      ])
      expect(contrast(palette.textPrimary, palette.backgroundSecondary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.textPrimary, palette.backgroundTertiary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.textSecondary, palette.backgroundSecondary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.textSecondary, palette.backgroundTertiary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.accentCountdown, palette.backgroundSecondary)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('matches the approved seasonal palettes', () => {
    expect(Object.fromEntries(Object.entries(themePalettes).filter(([key]) => !key.startsWith('classic-')))).toEqual({
      'winter-dark': { backgroundPrimary: '#4E6270', backgroundSecondary: '#171D21', backgroundTertiary: '#35444D', textPrimary: '#F1F4F6', textSecondary: '#BBC6CC', accentCountdown: '#8EB6C9' },
      'winter-light': { backgroundPrimary: '#B7C8D2', backgroundSecondary: '#F3F6F7', backgroundTertiary: '#D7E0E4', textPrimary: '#222A2F', textSecondary: '#536168', accentCountdown: '#476A7E' },
      'spring-dark': { backgroundPrimary: '#516858', backgroundSecondary: '#18201A', backgroundTertiary: '#37463A', textPrimary: '#F1F5F1', textSecondary: '#BDCAC0', accentCountdown: '#97B798' },
      'spring-light': { backgroundPrimary: '#BBD0BA', backgroundSecondary: '#F2F6F1', backgroundTertiary: '#D4E0D2', textPrimary: '#263028', textSecondary: '#556156', accentCountdown: '#557759' },
      'summer-dark': { backgroundPrimary: '#536C70', backgroundSecondary: '#1D211C', backgroundTertiary: '#3C4940', textPrimary: '#F4F2E9', textSecondary: '#C6C9BB', accentCountdown: '#CDB77D' },
      'summer-light': { backgroundPrimary: '#B9D0CD', backgroundSecondary: '#F6F3E9', backgroundTertiary: '#D9DDCC', textPrimary: '#29302B', textSecondary: '#566158', accentCountdown: '#796738' },
      'autumn-dark': { backgroundPrimary: '#6E5146', backgroundSecondary: '#211C1A', backgroundTertiary: '#493B35', textPrimary: '#F5EFEA', textSecondary: '#CABCB3', accentCountdown: '#DFA774' },
      'autumn-light': { backgroundPrimary: '#D6B29B', backgroundSecondary: '#F7F1EC', backgroundTertiary: '#DFD0C5', textPrimary: '#2E2622', textSecondary: '#655750', accentCountdown: '#8A5033' },
    })
  })

  it('applies the palette and color scheme without changing the PWA theme color', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000"><meta name="color-scheme" content="dark light">'
    const cleanup = applyTheme(resolveTheme('seasonal', '2026-07-15', 'light'))

    expect(document.documentElement.dataset).toMatchObject({ theme: 'seasonal', themeTone: 'light', season: 'summer' })
    expect(document.documentElement.style.getPropertyValue('--background-primary')).toBe('#B9D0CD')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#000000')
    expect(document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content).toBe('light')

    cleanup()
    expect(document.documentElement.style.getPropertyValue('--background-primary')).toBe('')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#000000')
    expect(document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content).toBe('dark light')
  })

  it('keeps palette family and season independent from the system tone', () => {
    expect(resolveTheme('classic', '2026-07-15', 'dark')).toMatchObject({ family: 'classic', season: 'summer', tone: 'dark' })
    expect(resolveTheme('seasonal', '2026-07-15', 'light')).toMatchObject({ family: 'seasonal', season: 'summer', tone: 'light' })
    expect(resolveTheme('seasonal', '2026-07-15', 'dark').palette).toEqual(themePalettes['summer-dark'])
    expect(resolveTheme('seasonal', '2026-07-15', 'light').palette).toEqual(themePalettes['summer-light'])
  })
})
