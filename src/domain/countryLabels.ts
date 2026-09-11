import { getCountryName } from './cities'

const abbreviations = new Map([['RU', 'РФ'], ['US', 'США'], ['ZA', 'ЮАР'], ['AE', 'ОАЭ']])
const countrySuffixes = [...abbreviations].map(([code, short]) => [`, ${getCountryName(code)}`, `, ${short}`] as const)

export function getCountryLabel(countryCode: string): string {
  return abbreviations.get(countryCode) ?? getCountryName(countryCode)
}

export function compactPlaceLabel(label: string): string {
  // Старые сохранённые подписи сокращаем только при выводе, по целому суффиксу страны.
  for (const [full, short] of countrySuffixes) {
    if (label.endsWith(full)) return label.slice(0, -full.length) + short
  }
  return label
}
