import { describe, expect, it } from 'vitest'
import { compactPlaceLabel, getCountryLabel } from './countryLabels'
import { getCountryName } from './cities'

describe('краткие подписи стран', () => {
  it.each([['RU', 'РФ'], ['US', 'США'], ['ZA', 'ЮАР'], ['AE', 'ОАЭ'], ['DE', 'Германия'], ['TR', 'Турция']])('показывает %s как %s', (code, expected) => {
    expect(getCountryLabel(code)).toBe(expected)
  })
  it.each(['RU', 'US', 'ZA', 'AE'])('сокращает страну в сохранённом названии %s', code => {
    expect(compactPlaceLabel(`Город, Регион, ${getCountryName(code)}`)).toBe(`Город, Регион, ${getCountryLabel(code)}`)
  })
  it('сохраняет полные имена для поиска и не сокращает произвольные части названия', () => {
    expect(getCountryName('RU')).toBe('Россия')
    for (const label of ['Россия', 'Рядом: Россия', 'Россия, другой регион, Германия', 'Москва, РФ', 'Казань']) expect(compactPlaceLabel(label)).toBe(label)
    expect(getCountryLabel('invalid')).toBe('invalid')
  })
})
