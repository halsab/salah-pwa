import { normalizeCitySearch, getCountryName, type CompactCityRecord } from '../src/domain/cities'
export type { CompactCityRecord } from '../src/domain/cities'

export interface ParsedGeoNamesCity {
  id: number
  primaryName: string
  asciiName: string
  countryCode: string
  admin1Code: string
  latitude: number
  longitude: number
  population: number
  timeZone: string
}

interface ParsedCities {
  updatedAt: string
  cities: ParsedGeoNamesCity[]
}

export interface RussianNames {
  activeNames: string[]
  preferredName?: string
}

export type RussianNameIndex = Map<number, RussianNames>

const VALID_TIME_ZONES = new Set<string>()


function roundCoordinate(value: string): number {
  return Number(Number(value).toFixed(4))
}

function assertValidTimeZone(timeZone: string, cityId: number): void {
  if (VALID_TIME_ZONES.has(timeZone)) return

  try {
    new Intl.DateTimeFormat('en', { timeZone })
    VALID_TIME_ZONES.add(timeZone)
  } catch {
    throw new Error(
      `GeoNames вернул некорректный часовой пояс ${timeZone} для города ${cityId}`,
    )
  }
}

export interface Admin1 { name: string; id: number }
export function parseGeoNamesAdmin1(content: string): Map<string, Admin1> {
  const regions = new Map<string, Admin1>()
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    const [code, name, , id, ...extra] = line.replace(/\r$/, '').split('\t')
    if (!code || !/^[A-Z]{2}\.[^\s.]+$/.test(code) || !name || !Number.isInteger(Number(id)) || Number(id) <= 0 || extra.length || regions.has(code)) {
      throw new Error('Некорректная строка admin1CodesASCII')
    }
    regions.set(code, { name, id: Number(id) })
  }
  return regions
}

function toCompactCity(
  city: ParsedGeoNamesCity,
  russianNames: RussianNames | undefined,
  admin1Name = '',
): CompactCityRecord {
  const activeRussianNames = russianNames?.activeNames ?? []
  const displayName = russianNames?.preferredName
    ?? [...activeRussianNames].sort()[0]
    ?? city.primaryName
  const normalizedNames = [...new Set([
    displayName, city.primaryName, city.asciiName, ...[...activeRussianNames].sort(),
  ].map(normalizeCitySearch).filter(Boolean))]

  return [
    city.id,
    displayName,
    normalizedNames,
    city.countryCode,
    city.admin1Code,
    city.latitude,
    city.longitude,
    city.population,
    city.timeZone,
    admin1Name,
    normalizeCitySearch(`${getCountryName(city.countryCode)} ${city.countryCode} ${admin1Name}`),
  ]
}

export function parseGeoNamesCities(content: string): ParsedCities {
  const cities: ParsedGeoNamesCity[] = []
  const cityIds = new Set<number>()
  let updatedAt = ''

  for (const line of content.split('\n')) {
    if (!line) continue
    const columns = line.replace(/\r$/, '').split('\t')
    const id = Number(columns[0])
    const primaryName = columns[1] ?? ''
    const asciiName = columns[2] ?? ''
    const latitude = columns[4] ?? ''
    const longitude = columns[5] ?? ''
    const countryCode = columns[8] ?? ''
    const admin1Code = columns[10] ?? ''
    const population = Number(columns[14])
    const timeZone = columns[17] ?? ''
    const modifiedAt = columns[18] ?? ''

    if (
      !Number.isInteger(id)
      || !primaryName
      || !countryCode
      || !Number.isFinite(population)
      || population < 5_000
    ) {
      continue
    }
    if (cityIds.has(id)) {
      throw new Error(`Повторяющийся GeoNames ID города ${id}`)
    }

    assertValidTimeZone(timeZone, id)
    cityIds.add(id)
    cities.push({
      id,
      primaryName,
      asciiName,
      countryCode,
      admin1Code,
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
      population,
      timeZone,
    })
    if (modifiedAt > updatedAt) updatedAt = modifiedAt
  }

  cities.sort((left, right) => right.population - left.population || left.id - right.id)
  return { updatedAt, cities }
}

export function createRussianNameIndex(): RussianNameIndex {
  return new Map<number, RussianNames>()
}

export function addGeoNamesAlternateName(
  index: RussianNameIndex,
  cityIds: ReadonlySet<number>,
  line: string,
  allowPreferredVariants = false,
): void {
  if (!line) return
  const columns = line.replace(/\r$/, '').split('\t')
  const cityId = Number(columns[1])
  const language = columns[2] ?? ''

  if (language !== 'ru' || !cityIds.has(cityId)) return

  const alternateNameId = Number(columns[0])
  const name = columns[3]?.trim() ?? ''
  const flags = columns.slice(4, 8)
  const historic = columns[7] ?? ''
  const validFlags = flags.length === 4
    && flags.every((flag) => flag === '' || flag === '1')

  if (
    columns.length !== 10
    || !Number.isInteger(alternateNameId)
    || alternateNameId <= 0
    || !Number.isInteger(cityId)
    || cityId <= 0
    || !name
    || !validFlags
  ) {
    throw new Error(`Некорректная строка alternateNamesV2: ${line}`)
  }

  const ended = (columns[9] ?? '').trim() !== ''
  if (historic === '1' || ended) return

  const names = index.get(cityId) ?? { activeNames: [] }
  if (!names.activeNames.includes(name)) names.activeNames.push(name)

  if (columns[4] === '1') {
    if (!allowPreferredVariants && names.preferredName && names.preferredName !== name) {
      throw new Error(
        `Неоднозначное русское preferred-имя для города ${cityId}`,
      )
    }
    // У регионов бывают несколько действующих preferred-имён; выбираем кратчайшее, затем по строке.
    names.preferredName = [names.preferredName, name].filter((v): v is string => Boolean(v))
      .sort((a,b)=>a.length-b.length || (a < b ? -1 : a > b ? 1 : 0))[0]
  }

  index.set(cityId, names)
}

export function parseGeoNamesAlternateNames(
  content: string,
  cityIds: ReadonlySet<number>,
): RussianNameIndex {
  const index = createRussianNameIndex()
  for (const line of content.split('\n')) {
    addGeoNamesAlternateName(index, cityIds, line)
  }
  return index
}

export function buildCompactCities(
  cities: readonly ParsedGeoNamesCity[],
  russianNames: RussianNameIndex,
  regions: ReadonlyMap<string, Admin1> = new Map(),
): CompactCityRecord[] {
  return cities.map((city) => {
    const region = regions.get(`${city.countryCode}.${city.admin1Code}`)
    const names = region ? russianNames.get(region.id) : undefined
    const admin1Name = names?.preferredName ?? [...(names?.activeNames ?? [])].sort()[0] ?? region?.name ?? ''
    return toCompactCity(city, russianNames.get(city.id), admin1Name)
  })
}
