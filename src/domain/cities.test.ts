import { describe, expect, it } from 'vitest'

import type { City, CityDataset } from './cities'
import {
  findNearestCity,
  formatCityLabel,
  getCountryGroups,
  groupCitiesByCountry,
  searchCities,
} from './cities'

const cities: City[] = [
  {
    id: 524901,
    name: 'Moscow',
    searchNames: 'Москва Москву',
    countryCode: 'RU',
    latitude: 55.7522,
    longitude: 37.6156,
    population: 10_381_222,
  },
  {
    id: 745044,
    name: 'Istanbul',
    searchNames: 'Стамбул Истанбул',
    countryCode: 'TR',
    latitude: 41.0138,
    longitude: 28.9497,
    population: 15_701_602,
  },
  {
    id: 323786,
    name: 'Ankara',
    searchNames: 'Анкара',
    countryCode: 'TR',
    latitude: 39.9199,
    longitude: 32.8543,
    population: 5_504_000,
  },
]

const dataset: CityDataset = {
  source: {
    name: 'GeoNames',
    url: 'https://www.geonames.org/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    updatedAt: '2026-08-31',
  },
  cities,
}

describe('findNearestCity', () => {
  it('находит ближайший город в допустимом радиусе', () => {
    expect(findNearestCity(55.7558, 37.6173, cities, 30)?.id).toBe(524901)
  })

  it('не подставляет название далёкого города', () => {
    expect(findNearestCity(55, 35, cities, 30)).toBeNull()
  })
})

describe('searchCities', () => {
  it('ищет по основному названию, русскому псевдониму и стране', () => {
    expect(searchCities(dataset, 'Стамбул').map(({ id }) => id)).toEqual([745044])
    expect(searchCities(dataset, 'Турция').map(({ id }) => id)).toEqual([
      745044,
      323786,
    ])
  })
})

describe('getCountryGroups', () => {
  it('группирует пресеты по стране и оставляет крупнейшие города', () => {
    const turkey = getCountryGroups(dataset, 1).find(({ code }) => code === 'TR')

    expect(turkey?.cities.map(({ id }) => id)).toEqual([745044])
  })
})

describe('groupCitiesByCountry', () => {
  it('сохраняет все найденные города и группирует их по стране', () => {
    const groups = groupCitiesByCountry([cities[1]!, cities[0]!, cities[2]!])

    expect(groups.map(({ name }) => name)).toEqual(['Россия', 'Турция'])
    expect(groups.find(({ code }) => code === 'TR')?.cities.map(({ id }) => id)).toEqual([
      745044,
      323786,
    ])
  })
})

describe('formatCityLabel', () => {
  it('добавляет локализованное название страны', () => {
    expect(formatCityLabel(cities[0]!)).toBe('Moscow, Россия')
  })
})
