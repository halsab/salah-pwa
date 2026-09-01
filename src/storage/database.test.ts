import { afterEach, describe, expect, it } from 'vitest'

import type { PrayerDataset } from '../domain/types'
import {
  deleteSalahDatabase,
  getDatasetMeta,
  getPrayerDay,
  getSetting,
  replaceDataset,
  setSetting,
} from './database'

const dataset: PrayerDataset = {
  schemaVersion: 1,
  source: {
    name: 'ДУМ Республики Татарстан',
    url: 'https://dumrt.ru/ru/help-info/prayertime/',
    updatedAt: '2025-12-27T10:49:04.000Z',
    year: 2026,
  },
  locations: [
    { id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 },
  ],
  days: [
    {
      locationId: 'kazan',
      date: '2026-09-01',
      suhurEnd: '02:21',
      fajrJamaat: '03:17',
      sunrise: '04:48',
      zenith: '11:44',
      dhuhr: '12:00',
      asr: '16:24',
      maghrib: '18:39',
      isha: '20:33',
    },
  ],
}

afterEach(async () => {
  await deleteSalahDatabase()
})

describe('database', () => {
  it('атомарно сохраняет набор данных и читает день по городу и дате', async () => {
    await replaceDataset(dataset)

    expect(await getPrayerDay('kazan', '2026-09-01')).toEqual(dataset.days[0])
    expect(await getDatasetMeta()).toEqual({
      schemaVersion: 1,
      source: dataset.source,
      locations: dataset.locations,
    })
  })

  it('хранит пользовательский населённый пункт отдельно от расписания', async () => {
    await setSetting('locationId', 'kazan')

    expect(await getSetting('locationId')).toBe('kazan')
  })
})
