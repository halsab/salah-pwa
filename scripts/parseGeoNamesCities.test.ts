import { describe, expect, it } from 'vitest'

import {
  buildCompactCities,
  parseGeoNamesAlternateNames,
  parseGeoNamesCities,
  parseGeoNamesAdmin1,
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
        ['стамбул', 'istanbul', 'истанбул'],
        'TR',
        '34',
        41.0138,
        28.9497,
        15701602,
        'Europe/Istanbul',
        '',
        'турция tr',
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
      ['казань', 'kazan'],
      'RU',
      '73',
    ])
    expect(cities[1]?.slice(0, 5)).toEqual([
      2,
      'No Russian Name',
      ['no russian name'],
      'FR',
      '11',
    ])
  })

  it('получает регион по существующему admin1Code, без вымышленных fallback-имён', () => {
    const regions = parseGeoNamesAdmin1('RU.33\tKirov Oblast\tKirov Oblast\t548389\n')
    const parsed = parseGeoNamesCities(cityRow({id:'548408', name:'Kirov', countryCode:'RU', admin1Code:'33', timeZone:'Europe/Moscow'}))
    const names = parseGeoNamesAlternateNames(alternateNameRow({id:'1',cityId:'548389',name:'Кировская область'}),new Set([548389]))
    expect(buildCompactCities(parsed.cities,names,regions)[0]?.[9]).toBe('Кировская область')
    expect(buildCompactCities(parsed.cities,names)[0]?.[9]).toBe('')
    expect(()=>parseGeoNamesAdmin1('RU.33\tInvented')).toThrow('admin1CodesASCII')
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
