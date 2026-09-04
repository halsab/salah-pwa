import { describe, expect, it } from 'vitest'

import {
  enrichLegacyCities,
  enrichLegacyDataset,
  parseGeoNamesCities,
  type CompactCityRecord,
  type LegacyCompactCityRecord,
} from './parseGeoNamesCities'

describe('parseGeoNamesCities', () => {
  it('сжимает записи, сохраняет кириллические имена для поиска и сортирует по населению', () => {
    const rows = [
      ['2', 'Small', 'Small', 'Смолл,Small', '10.123456', '20.123456', 'P', 'PPL', 'AA', '', '', '', '', '', '5000', '', '', 'Etc/GMT-1', '2026-08-20'],
      ['1', 'Large', 'Large', 'Лардж,Large', '30.987654', '40.987654', 'P', 'PPL', 'BB', '', '', '', '', '', '10000', '', '', 'Europe/Paris', '2026-08-31'],
    ].map((columns) => columns.join('\t')).join('\n')

    const result = parseGeoNamesCities(rows)

    expect(result.updatedAt).toBe('2026-08-31')
    expect(result.cities).toEqual([
      [1, 'Large', 'Лардж', 'BB', 30.9877, 40.9877, 10000, 'Europe/Paris'],
      [2, 'Small', 'Смолл', 'AA', 10.1235, 20.1235, 5000, 'Etc/GMT-1'],
    ])
  })
})

describe('enrichLegacyCities', () => {
  it('сохраняет поля и порядок старого набора, добавляя часовой пояс по GeoNames ID', () => {
    const legacyCities: LegacyCompactCityRecord[] = [
      [2, 'Legacy Two', 'Легаси Ту', 'AA', 10.1234, 20.1234, 5_000],
      [1, 'Legacy One', 'Легаси Уан', 'AA', 30.9876, 40.9876, 10_000],
    ]
    const currentCities: CompactCityRecord[] = [
      [1, 'Current One', '', 'AA', 31, 41, 20_000, 'Europe/Paris'],
      [2, 'Current Two', '', 'AA', 11, 21, 15_000, 'Europe/Berlin'],
    ]

    expect(enrichLegacyCities(legacyCities, currentCities)).toEqual([
      [...legacyCities[0]!, 'Europe/Berlin'],
      [...legacyCities[1]!, 'Europe/Paris'],
    ])
  })

  it('использует единственный часовой пояс страны для отсутствующего в текущем архиве города', () => {
    const arkadag: LegacyCompactCityRecord = [
      13_526_673,
      'Arkadag',
      'Аркадаг',
      'TM',
      38.0697,
      58.0678,
      40_524,
    ]
    const currentCities: CompactCityRecord[] = [
      [1, 'Ashgabat', 'Ашхабад', 'TM', 37.95, 58.38, 1_030_063, 'Asia/Ashgabat'],
      [2, 'Turkmenabat', 'Туркменабат', 'TM', 39.07, 63.58, 234_817, 'Asia/Ashgabat'],
    ]

    expect(enrichLegacyCities([arkadag], currentCities)).toEqual([
      [...arkadag, 'Asia/Ashgabat'],
    ])
  })

  it('не угадывает часовой пояс отсутствующего города в стране с несколькими поясами', () => {
    const legacyCity: LegacyCompactCityRecord = [
      999,
      'Missing',
      '',
      'US',
      0,
      0,
      5_000,
    ]
    const currentCities: CompactCityRecord[] = [
      [1, 'East', '', 'US', 0, 0, 5_000, 'America/New_York'],
      [2, 'West', '', 'US', 0, 0, 5_000, 'America/Los_Angeles'],
    ]

    expect(() => enrichLegacyCities([legacyCity], currentCities)).toThrow(
      'Не удалось однозначно определить часовой пояс для города 999 (US)',
    )
  })

  it('отклоняет некорректный часовой пояс GeoNames', () => {
    const legacyCity: LegacyCompactCityRecord = [
      1,
      'Legacy',
      '',
      'AA',
      0,
      0,
      5_000,
    ]
    const currentCities: CompactCityRecord[] = [
      [1, 'Current', '', 'AA', 0, 0, 5_000, 'Invalid/Zone'],
    ]

    expect(() => enrichLegacyCities([legacyCity], currentCities)).toThrow(
      'GeoNames вернул некорректный часовой пояс Invalid/Zone для города 1',
    )
  })
})

describe('enrichLegacyDataset', () => {
  it('повышает версию схемы, не изменяя метаданные источника', () => {
    const source = {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      updatedAt: '2026-09-01',
    }
    const city: LegacyCompactCityRecord = [
      1,
      'Legacy',
      '',
      'AA',
      0,
      0,
      5_000,
    ]
    const currentCity: CompactCityRecord = [
      1,
      'Current',
      '',
      'AA',
      1,
      1,
      10_000,
      'Europe/Paris',
    ]

    expect(
      enrichLegacyDataset(
        { schemaVersion: 1, source, cities: [city] },
        [currentCity],
      ),
    ).toEqual({
      schemaVersion: 2,
      source,
      cities: [[...city, 'Europe/Paris']],
    })
  })
})
