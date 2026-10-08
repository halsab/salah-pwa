export * from './locale'
export * from './formatters'
export * from './messages'

import { useMemo } from 'react'
import { translate, type Translator } from './messages'
import { useLocalizationSnapshot } from './locale'

export function useLocalization() {
  const { locale, preference } = useLocalizationSnapshot()
  const t = useMemo<Translator>(() => (key, ...args) => translate(locale, key, ...args), [locale])
  return { locale, preference, t }
}
