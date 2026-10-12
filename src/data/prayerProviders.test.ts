import { describe, expect, it } from 'vitest'
import { officialDatasets, PRAYER_PROVIDERS } from './prayerProviders'
import type { DatasetMeta } from '../storage/database'

describe('official dataset descriptors', () => {
  it('keeps DUM RT as the only production official timetable provider', () => {
    expect(PRAYER_PROVIDERS.map(provider => provider.id)).toEqual(['dumRt'])
  })

  it('keeps v2 year coverage and exposes exact v3 civil date bounds', () => {
    const v2 = officialDatasets(null)[0]
    expect(v2).toMatchObject({ schemaVersion: 2, years: [2026] })
    expect(v2?.startDate).toBeUndefined()

    const v3: DatasetMeta = {
      provider: 'dumRt', schemaVersion: 3,
      providerInfo: {
        id: 'dumRt', revision: 'revision-3', timeZone: 'Europe/Moscow',
        coverage: { geographic: 'RU-TA', startDate: '2026-03-15', endDate: '2026-10-20' },
      },
      source: { name: 'ДУМ Республики Татарстан', url: 'https://dumrt.ru/ru/help-info/prayertime/', updatedAt: '2026-01-01', years: [2026] },
      locations: [{ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }],
      identity: { version: 'v3', url: 'data.json', sha256: 'a'.repeat(64) },
    }
    expect(officialDatasets(v3, 'ready')[0]).toMatchObject({
      schemaVersion: 3, startDate: '2026-03-15', endDate: '2026-10-20', timeZone: 'Europe/Moscow', coverage: 'RU-TA',
    })
  })
})
