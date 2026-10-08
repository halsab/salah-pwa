import { describe, expect, it } from 'vitest'
import {
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveLocale,
  restoreLanguagePreference,
} from './locale'
import { formatCivilDate, formatClockTime, formatDateTime, formatNumber, interpolate, pluralCategory } from './formatters'
import { translate, validateCatalog } from './messages'

describe('локализация', () => {
  it('регистрирует только полностью поддержанный русский интерфейс', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ru'])
    expect(LOCALE_REGISTRY).toEqual([{ tag: 'ru', direction: 'ltr', nativeName: 'Русский' }])
  })

  it.each([
    ['RU-ru', 'ru-RU'],
    ['ru_ru', null],
    ['ar', 'ar'],
    ['', null],
    [null, null],
  ])('нормализует BCP 47 %s', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected)
  })

  it('выбирает точный или базовый released locale и fallback', () => {
    const supported = ['ru', 'en-GB']
    expect(resolveLocale('auto', ['en-US', 'ru-RU'], supported)).toBe('en-GB')
    expect(resolveLocale('auto', ['en-US'], supported)).toBe('en-GB')
    expect(resolveLocale('en-GB', ['ru'], supported)).toBe('en-GB')
    expect(resolveLocale('de', ['de'], supported)).toBe('ru')
  })

  it('форматирует дату и время с явными locale и timezone, сохраняя 24-часовое расписание', () => {
    const instant = new Date('2026-09-01T12:00:00.000Z')
    expect(formatClockTime(instant, 'Europe/Moscow')).toBe('15:00')
    expect(formatDateTime(instant, 'Europe/Moscow')).toContain('15:00')
    expect(formatCivilDate('2026-09-01')).toBe('1 сентября')
    expect(formatNumber(1_234.5)).toBe('1 234,5')
  })

  it('безопасно восстанавливает сохранённое значение', () => {
    expect(restoreLanguagePreference('ru-RU')).toBe('ru')
    expect(restoreLanguagePreference('en')).toBe('auto')
    expect(restoreLanguagePreference({})).toBe('auto')
  })

  it('интерполирует и выбирает русские plural forms', () => {
    expect(interpolate('До {name}: {count}', { name: 'Асра', count: 3 })).toBe('До Асра: 3')
    expect(pluralCategory(1, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })).toBe('день')
    expect(pluralCategory(2, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })).toBe('дня')
    expect(pluralCategory(5, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })).toBe('дней')
    expect(translate('ru', 'inDays', { count: 21 })).toBe('через 21 день')
  })

  it('не оставляет отсутствующих ключей в исходном каталоге', () => {
    expect(validateCatalog('ru')).toEqual([])
  })
})
