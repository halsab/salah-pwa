import { describe, expect, it } from 'vitest'

import {
  buildCompactCities,
  parseGeoNamesAlternateNames,
  parseGeoNamesCities,
  upgradeCityDataset,
  type Schema2CityDataset,
} from './parseGeoNamesCities'

function cityRow({
  id,
  name,
  asciiName = name,
  countryCode,
  admin1Code,
  latitude = '0',
  longitude = '0',
  population = '5000',
  timeZone,
  modifiedAt = '2026-08-31',
}: {
  id: string
  name: string
  asciiName?: string
  countryCode: string
  admin1Code: string
  latitude?: string
  longitude?: string
  population?: string
  timeZone: string
  modifiedAt?: string
}): string {
  return [
    id,
    name,
    asciiName,
    '',
    latitude,
    longitude,
    'P',
    'PPL',
    countryCode,
    '',
    admin1Code,
    '',
    '',
    '',
    population,
    '',
    '',
    timeZone,
    modifiedAt,
  ].join('\t')
}

function alternateNameRow({
  id,
  cityId,
  name,
  preferred = '',
  historic = '',
  from = '',
  to = '',
}: {
  id: string
  cityId: string
  name: string
  preferred?: string
  historic?: string
  from?: string
  to?: string
}): string {
  return [
    id,
    cityId,
    'ru',
    name,
    preferred,
    '',
    '',
    historic,
    from,
    to,
  ].join('\t')
}

describe('GeoNames city catalog generation', () => {
  it('выбирает активное предпочтительное русское имя и заранее нормализует поиск', () => {
    const parsed = parseGeoNamesCities(cityRow({
      id: '745044',
      name: 'Istanbul',
      countryCode: 'TR',
      admin1Code: '34',
      latitude: '41.01384',
      longitude: '28.94966',
      population: '15701602',
      timeZone: 'Europe/Istanbul',
    }))
    const alternateNames = parseGeoNamesAlternateNames([
      alternateNameRow({
        id: '1',
        cityId: '745044',
        name: 'Стамбул',
        preferred: '1',
      }),
      alternateNameRow({ id: '2', cityId: '745044', name: 'Истанбул' }),
      alternateNameRow({
        id: '3',
        cityId: '745044',
        name: 'Константинополь',
        historic: '1',
      }),
      alternateNameRow({ id: '4', cityId: '745044', name: 'Царьград', to: '1930' }),
    ].join('\n'), new Set([745044]))

    expect(buildCompactCities(parsed.cities, alternateNames)).toEqual([
      [
        745044,
        'Стамбул',
        'стамбул istanbul истанбул турция',
        'TR',
        '34',
        41.0138,
        28.9497,
        15701602,
        'Europe/Istanbul',
      ],
    ])
  })

  it('использует активное русское имя без preferred, затем основное имя', () => {
    const parsed = parseGeoNamesCities([
      cityRow({
        id: '551487',
        name: 'Kazan',
        countryCode: 'RU',
        admin1Code: '73',
        timeZone: 'Europe/Moscow',
        population: '1308660',
      }),
      cityRow({
        id: '2',
        name: 'No Russian Name',
        countryCode: 'FR',
        admin1Code: '11',
        timeZone: 'Europe/Paris',
        population: '10000',
      }),
    ].join('\n'))
    const alternateNames = parseGeoNamesAlternateNames(
      alternateNameRow({ id: '10', cityId: '551487', name: 'Казань' }),
      new Set([551487, 2]),
    )

    const cities = buildCompactCities(parsed.cities, alternateNames)

    expect(cities[0]?.slice(0, 5)).toEqual([
      551487,
      'Казань',
      'казань kazan россия',
      'RU',
      '73',
    ])
    expect(cities[1]?.slice(0, 5)).toEqual([
      2,
      'No Russian Name',
      'no russian name франция',
      'FR',
      '11',
    ])
  })

  it('сохраняет порядок, идентичность, координаты, население, пояс и источник schema 2', () => {
    const source = {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      updatedAt: '2026-09-01',
    }
    const baseline: Schema2CityDataset<typeof source> = {
      schemaVersion: 2,
      source,
      cities: [
        [2, 'Baseline Two', 'Old Two', 'FR', 10.1234, 20.1234, 5000, 'Europe/Paris'],
        [1, 'Baseline One', 'Old One', 'RU', 30.9876, 40.9876, 10000, 'Europe/Moscow'],
      ],
    }
    const current = parseGeoNamesCities([
      cityRow({
        id: '1',
        name: 'Current One',
        countryCode: 'RU',
        admin1Code: '73',
        latitude: '31',
        longitude: '41',
        population: '20000',
        timeZone: 'Europe/Moscow',
      }),
      cityRow({
        id: '2',
        name: 'Current Two',
        countryCode: 'FR',
        admin1Code: '11',
        latitude: '11',
        longitude: '21',
        population: '15000',
        timeZone: 'Europe/Paris',
      }),
    ].join('\n'))
    const alternateNames = parseGeoNamesAlternateNames([
      alternateNameRow({ id: '1', cityId: '1', name: 'Текущий один' }),
      alternateNameRow({ id: '2', cityId: '2', name: 'Текущий два' }),
    ].join('\n'), new Set([1, 2]))

    expect(upgradeCityDataset(baseline, current.cities, alternateNames)).toEqual({
      schemaVersion: 3,
      source,
      cities: [
        [2, 'Текущий два', 'текущии два current two франция', 'FR', '11', 10.1234, 20.1234, 5000, 'Europe/Paris'],
        [1, 'Текущий один', 'текущии один current one россия', 'RU', '73', 30.9876, 40.9876, 10000, 'Europe/Moscow'],
      ],
    })
  })

  it('явно отклоняет неоднозначные preferred-имена', () => {
    const rows = [
      alternateNameRow({ id: '1', cityId: '745044', name: 'Стамбул', preferred: '1' }),
      alternateNameRow({ id: '2', cityId: '745044', name: 'Истанбул', preferred: '1' }),
    ].join('\n')

    expect(() => parseGeoNamesAlternateNames(rows, new Set([745044]))).toThrow(
      'Неоднозначное русское preferred-имя для города 745044',
    )
  })

  it('явно отклоняет повреждённые релевантные строки alternateNamesV2', () => {
    const malformed = ['1', '745044', 'ru', 'Стамбул', 'yes'].join('\t')

    expect(() => parseGeoNamesAlternateNames(malformed, new Set([745044]))).toThrow(
      'Некорректная строка alternateNamesV2',
    )
  })

  it('явно отклоняет повторяющийся GeoNames ID города', () => {
    const row = cityRow({
      id: '1',
      name: 'Duplicate',
      countryCode: 'FR',
      admin1Code: '11',
      timeZone: 'Europe/Paris',
    })

    expect(() => parseGeoNamesCities(`${row}\n${row}`)).toThrow(
      'Повторяющийся GeoNames ID города 1',
    )
  })
})
