import { describe, expect, it } from 'vitest'

import { parseCityDataset } from './cityRepository'

describe('parseCityDataset', () => {
  it('распаковывает компактный список городов schema 2 вместе с таймзоной', () => {
    expect(
      parseCityDataset({
        schemaVersion: 2,
        source: {
          name: 'GeoNames',
          url: 'https://www.geonames.org/',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          updatedAt: '2026-08-31',
        },
        cities: [
          [
            524901,
            'Moscow',
            'Москва Москву',
            'RU',
            55.7522,
            37.6156,
            10_381_222,
            'Europe/Moscow',
          ],
        ],
      }).cities[0],
    ).toEqual({
      id: 524901,
      name: 'Moscow',
      searchNames: 'Москва Москву',
      countryCode: 'RU',
      latitude: 55.7522,
      longitude: 37.6156,
      population: 10_381_222,
      timeZone: 'Europe/Moscow',
    })
  })

  it('отклоняет старую схему и записи с неподдерживаемой таймзоной', () => {
    expect(() => parseCityDataset({ schemaVersion: 1, cities: [] })).toThrow(
      'неизвестный формат',
    )
    expect(() =>
      parseCityDataset({
        schemaVersion: 2,
        source: {
          name: 'GeoNames',
          url: 'https://www.geonames.org/',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          updatedAt: '2026-08-31',
        },
        cities: [
          [
            524901,
            'Moscow',
            'Москва',
            'RU',
            55.7522,
            37.6156,
            10_381_222,
            'Mars/Olympus',
          ],
        ],
      }),
    ).toThrow('неизвестный формат')
  })
})
