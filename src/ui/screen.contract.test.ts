import { describe, expect, it } from 'vitest'
import screenCssRaw from './screen.css?raw'
import themeCssRaw from './theme.css?raw'

/** Нормализует объявления правила, чтобы проверять контракт независимо от форматирования. */
function declarations(css: string, selector: string): string {
  const index = css.indexOf(`${selector} {`)
  if (index === -1) throw new Error(`Нет правила ${selector}`)
  const start = css.indexOf('{', index) + 1
  const end = css.indexOf('}', start)
  return css.slice(start, end).replace(/\s+/g, ' ').trim()
}

describe('контракт стандартизации кнопок и строк', () => {
  it('держит базовую высоту 44 px как токен и в foundation', () => {
    expect(themeCssRaw).toContain('--button-height: 44px;')
    expect(declarations(screenCssRaw, '.pill, .text-field, .select-field')).toContain('min-height: var(--button-height);')
  })

  it('не фиксирует высоту однострочного действия и разрешает перенос', () => {
    const pill = declarations(screenCssRaw, '.pill')
    expect(pill).not.toContain('height: var(--button-height)')
    expect(pill).toContain('white-space: normal;')
    expect(pill).toContain('flex-shrink: 0;')
  })

  it('основное действие полноширинное, field-like trigger слева', () => {
    expect(declarations(screenCssRaw, '.pill--primary')).toContain('width: 100%;')
    const field = declarations(screenCssRaw, '.pill--field')
    expect(field).toContain('width: 100%;')
    expect(field).toContain('justify-content: flex-start;')
  })

  it('строка списка слева, title/value через space-between', () => {
    const row = declarations(screenCssRaw, '.pill-row')
    expect(row).toContain('width: 100%;')
    expect(row).toContain('justify-content: space-between;')
    expect(row).toContain('text-align: left;')
  })

  it('двухстрочная строка вертикальна и выровнена влево', () => {
    const stacked = declarations(screenCssRaw, '.pill-row--stacked')
    expect(stacked).toContain('flex-direction: column;')
    expect(stacked).toContain('align-items: flex-start;')
  })

  it('icon-only действие строго 44×44 px', () => {
    const icon = declarations(screenCssRaw, '.icon-button')
    expect(icon).toContain('width: var(--button-height);')
    expect(icon).toContain('height: var(--button-height);')
  })

  it('footer раскладывает основное и вспомогательное действие общими правилами', () => {
    expect(declarations(screenCssRaw, '.screen-footer--end')).toContain('justify-content: flex-end;')
    expect(declarations(screenCssRaw, '.screen-footer--between')).toContain('justify-content: space-between;')
  })

  it('баннер события остаётся центрированным, а строка списка — нет', () => {
    const banner = declarations(screenCssRaw, '.religious-event-banner')
    expect(banner).toContain('text-align: center;')
    expect(banner).toContain('place-content: center;')
    expect(screenCssRaw).not.toContain('.religious-event-list-row {')
  })

  it('не содержит устаревших локальных layout-хаков', () => {
    for (const banned of ['.pill-wide', '.screen-end', '.search-open', '.home-settings-button', 'place-content: center;']) {
      if (banned === 'place-content: center;') {
        expect(screenCssRaw.split(banned).length - 1).toBe(1)
        continue
      }
      expect(screenCssRaw).not.toContain(banned)
    }
  })

  it('кольцо фокуса включается только после клавиатурного ввода, tap-highlight снят у action', () => {
    expect(screenCssRaw).toContain("html[data-input='keyboard'] .pill:focus-visible")
    expect(screenCssRaw).toContain("html[data-input='keyboard'] .select-field:focus-visible")
    expect(screenCssRaw).toContain("html[data-input='pointer'] .select-field { outline: none; }")
    expect(screenCssRaw).toContain("html[data-input='pointer'] .date-field:has(select:focus-visible)")
    expect(screenCssRaw).toContain('-webkit-tap-highlight-color: transparent')
  })
})
