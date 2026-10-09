import { getCountryName } from './cities'
import type { SupportedLocale } from '../localization/locale'
import { translate, type MessageKey } from '../localization/messages'

const abbreviations: Readonly<Record<string, MessageKey>> = {
  RU: 'countryRussiaShort', US: 'countryUsShort', ZA: 'countrySouthAfricaShort', AE: 'countryUaeShort',
}

export function getCountryLabel(countryCode: string, locale: SupportedLocale = 'ru'): string {
  const key = abbreviations[countryCode]
  if (key) return translate(locale, key)
  try { return new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode) ?? countryCode } catch { return countryCode }
}

export function compactPlaceLabel(label: string, locale: SupportedLocale = 'ru'): string {
  // Старые сохранённые подписи сокращаем только при выводе, по целому суффиксу страны.
  for (const code of Object.keys(abbreviations)) {
    const full = `, ${new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? getCountryName(code)}`
    const short = `, ${getCountryLabel(code, locale)}`
    if (label.endsWith(full)) return label.slice(0, -full.length) + short
  }
  return label
}
