import { describe, expect, it } from 'vitest'
import {
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveLocale,
  restoreLanguagePreference,
} from './locale'
import { formatCivilDate, formatClockTime, formatDateLabel, formatCompactDateLabel, formatDateTime, formatLocaleDate, formatNumber, interpolate, pluralCategory } from './formatters'
import { createTranslator, translate, validateCatalog } from './messages'
import { calendarMonthLabels, formatLocalizedCalendarDate, formatLocalizedCalendarFullDate, formatLocalizedGregorianDate, formatLocalizedGregorianNightRange, formatLocalizedHijriDate, formatLocalizedHijriMonth } from './calendar'
import { civilDateFromCalendar } from '../domain/calendar'
import { addDays } from '../domain/date'

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
    expect(formatDateLabel('2026-09-01')).toBe('вторник, 1 сентября')
    expect(formatCompactDateLabel('2026-09-01')).toBe('1 сентября')
    expect(formatLocalizedCalendarDate('2026-09-10', { calendar: 'hijri', correction: 0 })).toBe('28 раби авв.')
    expect(formatLocalizedCalendarFullDate('2026-09-10', { calendar: 'hijri', correction: 0 })).toBe('28 раби аль-авваль')
    expect(formatLocalizedCalendarDate('2026-09-10', { calendar: 'gregorian', correction: 1 })).toBe('10 сентября')
    expect(formatNumber(1_234.5)).toBe('1 234,5')
  })

  it('сохраняет канонические, компактные и picker-названия всех месяцев по стабильному номеру', () => {
    const full = ['мухаррам', 'сафар', 'раби аль-авваль', 'раби аль-ахир', 'джумада аль-уля', 'джумада аль-ахира',
      'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа']
    const compact = ['мухаррам', 'сафар', 'раби авв.', 'раби ахир', 'джум. уля', 'джум. ах.',
      'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа']
    const picker = ['Мухаррам', 'Сафар', 'Раби аль-авваль', 'Раби аль-ахир', 'Джумада аль-уля', 'Джумада аль-ахира',
      'Раджаб', 'Шаабан', 'Рамадан', 'Шавваль', 'Зуль-када', 'Зуль-хиджа']
    expect(Array.from({ length: 12 }, (_, index) => formatLocalizedHijriMonth(index + 1))).toEqual(full)
    expect(Array.from({ length: 12 }, (_, index) => formatLocalizedHijriMonth(index + 1, 'ru', true))).toEqual(compact)
    const translator = createTranslator('ru')
    expect(calendarMonthLabels(translator, 'hijri')).toEqual(picker)
    expect(calendarMonthLabels(translator, 'gregorian')).toEqual([
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ])
    for (let month = 1; month <= 12; month += 1) {
      const civilDate = civilDateFromCalendar({ year: 1448, month, day: 8 }, 'hijri')
      expect(formatLocalizedCalendarDate(civilDate, { calendar: 'hijri', correction: 0 })).toBe(`8 ${compact[month - 1]}`)
      expect(formatLocalizedCalendarFullDate(civilDate, { calendar: 'hijri', correction: 0 })).toBe(`8 ${full[month - 1]}`)
    }
  })

  it('формирует полную доступную дату Hijri без компактной подписи', () => {
    expect(formatLocalizedHijriDate('2026-09-10', { calendar: 'hijri', correction: 0 })).toBe('28 раби аль-авваль 1448')
  })

  it('обновляет компактное и полное представление при переходах месяца и года с поправкой', () => {
    const newYear = civilDateFromCalendar({ year: 1448, month: 1, day: 1 }, 'hijri')
    expect(formatLocalizedCalendarDate(addDays(newYear, -1), { calendar: 'hijri', correction: 0 })).toBe('29 зуль-хиджа')
    expect(formatLocalizedCalendarFullDate(addDays(newYear, -1), { calendar: 'hijri', correction: 0 })).toBe('29 зуль-хиджа')
    expect(formatLocalizedCalendarDate(newYear, { calendar: 'hijri', correction: 0 })).toBe('1 мухаррам')
    expect(formatLocalizedHijriDate(newYear, { calendar: 'hijri', correction: 0 })).toBe('1 мухаррам 1448')
    expect(formatLocalizedCalendarDate(newYear, { calendar: 'hijri', correction: -1 })).toBe('29 зуль-хиджа')
    expect(formatLocalizedCalendarDate(addDays(newYear, -1), { calendar: 'hijri', correction: 1 })).toBe('1 мухаррам')
  })

  it.each(['th-TH-u-ca-buddhist', 'ar-SA-u-ca-islamic-umalqura'])('явно форматирует Gregorian даты для locale %s', locale => {
    const formatYear = (year: number) => new Intl.NumberFormat(locale, { useGrouping: false }).format(year)
    expect(formatLocaleDate('2026-01-02', locale, { year: 'numeric' })).toContain(formatYear(2026))
    expect(formatLocaleDate('2026-01-02', locale, { day: 'numeric', month: 'numeric', year: 'numeric' })).not.toContain(formatYear(1447))
    expect(formatLocalizedGregorianDate('2026-01-02', locale)).toContain(formatYear(2026))
    expect(formatLocalizedGregorianNightRange('2026-01-03', '2026-01-02', locale)).toContain(formatYear(2026))
  })

  it('сохраняет civil day и час Place на границе календарного года', () => {
    expect(formatLocaleDate('2026-12-31', 'ru', { day: 'numeric', month: 'numeric', year: 'numeric' })).toBe('31.12.2026')
    expect(formatDateTime(new Date('2026-12-31T23:30:00.000Z'), 'Europe/Moscow')).toContain('01.01.2027')
    expect(formatClockTime(new Date('2026-12-31T23:30:00.000Z'), 'Europe/Moscow')).toBe('02:30')
  })

  it('безопасно восстанавливает сохранённое значение', () => {
    expect(restoreLanguagePreference('ru-RU')).toBe('ru')
    expect(restoreLanguagePreference('en')).toBe('auto')
    expect(restoreLanguagePreference({})).toBe('auto')
  })

  it('интерполирует и выбирает русские plural forms', () => {
    expect(interpolate('До {name}: {count}', { name: 'Асра', count: 3 })).toBe('До Асра: 3')
    const cases = [[0, 'через 0 дней'], [1, 'через 1 день'], [2, 'через 2 дня'], [3, 'через 3 дня'],
      [4, 'через 4 дня'], [5, 'через 5 дней'], [11, 'через 11 дней'], [14, 'через 14 дней'],
      [21, 'через 21 день'], [22, 'через 22 дня'], [25, 'через 25 дней'], [101, 'через 101 день']] as const
    for (const [count, expected] of cases) {
      expect(translate('ru', 'inDays', { count })).toBe(expected)
    }
    expect(pluralCategory(1, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })).toBe('день')
    expect(pluralCategory(2, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })).toBe('дня')
    expect(pluralCategory(5, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })).toBe('дней')
  })

  it('не оставляет отсутствующих ключей в исходном каталоге', () => {
    expect(validateCatalog('ru')).toEqual([])
  })
})
