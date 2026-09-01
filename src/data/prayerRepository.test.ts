import { describe, expect, it } from 'vitest'

import type { PrayerDataset } from '../domain/types'
import type { DatasetMeta } from '../storage/database'
import { shouldReplaceDataset } from './prayerRepository'

const dataset = {
  schemaVersion: 2,
  source: {
    name: 'ДУМ Республики Татарстан',
    url: 'https://dumrt.ru/ru/help-info/prayertime/',
    updatedAt: '2025-12-27T10:49:10.000Z',
    years: [2026],
  },
  locations: [],
  days: [],
} satisfies PrayerDataset

describe('shouldReplaceDataset', () => {
  it('заменяет сохранённые метаданные старой версии без поля years', () => {
    const legacyMeta = {
      schemaVersion: 1,
      source: { ...dataset.source, years: undefined, year: 2026 },
      locations: [],
    } as unknown as DatasetMeta

    expect(shouldReplaceDataset(legacyMeta, dataset)).toBe(true)
  })

  it('не перезаписывает идентичный актуальный набор', () => {
    const currentMeta: DatasetMeta = {
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
      locations: [],
    }

    expect(shouldReplaceDataset(currentMeta, dataset)).toBe(false)
  })
})
