import { describe, expect, it } from 'vitest'

import {
  findNearestCity,
  formatCityLabel,
  getCountryGroups,
  groupCitiesByCountry,
  searchCities,
  type City,
  type CityDataset,
  type CompactCityRecord,
} from './cities'

const records: CompactCityRecord[] = [
  [
    745044,
    'Стамбул',
    'стамбул istanbul истанбул турция',
    'TR',
    '34',
    41.0138,
    28.9497,
    15_701_602,
    'Europe/Istanbul',
  ],
  [
    524901,
    'Москва',
    'москва moscow россия',
    'RU',
    '48',
    55.7522,
    37.6156,
    10_381_222,
    'Europe/Moscow',
  ],
  [
    323786,
    'Анкара',
    'анкара ankara турция',
    'TR',
    '68',
    39.9199,
    32.8543,
    5_504_000,
    'Europe/Istanbul',
  ],
  [
    551487,
    'Казань',
    'казань kazan россия',
    'RU',
    '73',
    55.7887,
    49.1221,
    1_243_500,
    'Europe/Moscow',
  ],
]

const dataset: CityDataset = {
  source: {
    name: 'GeoNames',
    url: 'https://www.geonames.org/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    updatedAt: '2026-09-01',
  },
  cities: records,
}

function recordAt(index: number): CompactCityRecord {
  const record = records[index]
  if (!record) throw new Error(`Не найдена тестовая запись ${index}`)
  return record
}

describe('findNearestCity', () => {
  it('находит и материализует ближайший город в допустимом радиусе', () => {
    expect(findNearestCity(55.7558, 37.6173, records, 30)).toEqual({
      id: 524901,
      name: 'Москва',
      countryCode: 'RU',
      admin1Code: '48',
      latitude: 55.7522,
      longitude: 37.6156,
      population: 10_381_222,
      timeZone: 'Europe/Moscow',
    })
  })

  it('не материализует проигравшие записи', () => {
    const distant = [...recordAt(0)] as CompactCityRecord
    Object.defineProperty(distant, 1, {
      get: () => {
        throw new Error('Проигравший город не должен материализоваться')
      },
    })

    expect(findNearestCity(55.7558, 37.6173, [distant, recordAt(1)], 30)?.id)
      .toBe(524901)
  })

  it('не подставляет название далёкого города', () => {
    expect(findNearestCity(55, 35, records, 30)).toBeNull()
  })
})

describe('searchCities', () => {
  it('ищет по готовому ключу и возвращает русское имя с admin1', () => {
    expect(searchCities(dataset, 'Стамбул')).toEqual([
      {
        id: 745044,
        name: 'Стамбул',
        countryCode: 'TR',
        admin1Code: '34',
        latitude: 41.0138,
        longitude: 28.9497,
        population: 15_701_602,
        timeZone: 'Europe/Istanbul',
      },
    ])
    expect(searchCities(dataset, 'Istanbul').map(({ id }) => id)).toEqual([
      745044,
    ])
    expect(searchCities(dataset, 'Турция').map(({ id }) => id)).toEqual([
      745044,
      323786,
    ])
  })

  it('сканирует готовый ключ без второго полноразмерного индекса', () => {
    let searchKeyReads = 0
    const tracked = [...recordAt(0)] as CompactCityRecord
    Object.defineProperty(tracked, 2, {
      get: () => {
        searchKeyReads += 1
        return 'стамбул istanbul турция'
      },
    })
    const trackedDataset = { ...dataset, cities: [tracked] }

    expect(searchCities(trackedDataset, 'нет')).toEqual([])
    expect(searchCities(trackedDataset, 'нет')).toEqual([])
    expect(searchKeyReads).toBe(2)
  })

  it('не материализует несовпавшие записи и ограничивает результат 60 городами', () => {
    const hidden = [...recordAt(1)] as CompactCityRecord
    hidden[2] = 'другой ключ'
    Object.defineProperty(hidden, 1, {
      get: () => {
        throw new Error('Несовпавший город не должен материализоваться')
      },
    })
    const matching = Array.from({ length: 61 }, (_, index): CompactCityRecord => [
      10_000 + index,
      `Город ${index}`,
      'совпадение',
      'RU',
      '73',
      55 + index / 100,
      49,
      100_000 - index,
      'Europe/Moscow',
    ])

    expect(searchCities({ ...dataset, cities: [hidden, ...matching] }, 'совпадение'))
      .toHaveLength(60)
  })
})

describe('getCountryGroups', () => {
  it('материализует не больше пяти крупнейших и сохраняет точное totalCount', () => {
    const turkey = Array.from({ length: 6 }, (_, index): CompactCityRecord => [
      20_000 + index,
      `Город ${index}`,
      `город ${index} турция`,
      'TR',
      '34',
      41 + index / 100,
      29,
      1_000_000 - index,
      'Europe/Istanbul',
    ])
    const sixthCity = turkey[5]
    if (!sixthCity) throw new Error('Не найден шестой тестовый город')
    Object.defineProperty(sixthCity, 1, {
      get: () => {
        throw new Error('Шестой город не должен материализоваться')
      },
    })

    const groups = getCountryGroups({ ...dataset, cities: [recordAt(1), ...turkey] })
    const group = groups.find(({ code }) => code === 'TR')

    expect(group?.cities.map(({ id }) => id)).toEqual([
      20000,
      20001,
      20002,
      20003,
      20004,
    ])
    expect(group?.totalCount).toBe(6)
    expect(groups.map(({ name }) => name)).toEqual(['Россия', 'Турция'])
  })

  it('группирует материализованные результаты поиска', () => {
    const matches = searchCities(dataset, 'россия')
    const groups = groupCitiesByCountry(matches)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.code).toBe('RU')
    expect(groups[0]?.cities.map(({ id }) => id)).toEqual([524901, 551487])
    expect(groups[0]?.totalCount).toBe(2)
  })
})

describe('formatCityLabel', () => {
  it('добавляет локализованное название страны', () => {
    const city: City = {
      id: 551487,
      name: 'Казань',
      countryCode: 'RU',
      admin1Code: '73',
      latitude: 55.7887,
      longitude: 49.1221,
      population: 1_243_500,
      timeZone: 'Europe/Moscow',
    }

    expect(formatCityLabel(city)).toBe('Казань, Россия')
  })
})
