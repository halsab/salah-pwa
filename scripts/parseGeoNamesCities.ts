export type Schema2CompactCityRecord = [
  id: number,
  name: string,
  searchNames: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  population: number,
  timeZone: string,
]

export type CompactCityRecord = [
  id: number,
  displayName: string,
  normalizedSearchKey: string,
  countryCode: string,
  admin1Code: string,
  latitude: number,
  longitude: number,
  population: number,
  timeZone: string,
]

export interface Schema2CityDataset<Source = unknown> {
  schemaVersion: 2
  source: Source
  cities: Schema2CompactCityRecord[]
}

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
const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' })

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

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ru-RU')
    .trim()
    .replace(/\s+/g, ' ')
}

function getCountryName(countryCode: string): string {
  const name = countryNames.of(countryCode)
  if (!name || name === countryCode) {
    throw new Error(`Неизвестный код страны GeoNames: ${countryCode}`)
  }
  return name
}

function buildSearchKey(values: readonly string[]): string {
  const unique = new Set<string>()

  for (const value of values) {
    const normalized = normalizeSearchValue(value)
    if (normalized) unique.add(normalized)
  }

  return [...unique].join(' ')
}

function toCompactCity(
  city: ParsedGeoNamesCity,
  russianNames: RussianNames | undefined,
): CompactCityRecord {
  const activeRussianNames = russianNames?.activeNames ?? []
  const displayName = russianNames?.preferredName
    ?? activeRussianNames[0]
    ?? city.primaryName
  const normalizedSearchKey = buildSearchKey([
    displayName,
    city.primaryName,
    city.asciiName,
    ...activeRussianNames,
    getCountryName(city.countryCode),
  ])

  return [
    city.id,
    displayName,
    normalizedSearchKey,
    city.countryCode,
    city.admin1Code,
    city.latitude,
    city.longitude,
    city.population,
    city.timeZone,
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

  cities.sort((left, right) => right.population - left.population)
  return { updatedAt, cities }
}

export function createRussianNameIndex(): RussianNameIndex {
  return new Map<number, RussianNames>()
}

export function addGeoNamesAlternateName(
  index: RussianNameIndex,
  cityIds: ReadonlySet<number>,
  line: string,
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
    if (names.preferredName && names.preferredName !== name) {
      throw new Error(
        `Неоднозначное русское preferred-имя для города ${cityId}`,
      )
    }
    names.preferredName = name
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
): CompactCityRecord[] {
  return cities.map((city) => toCompactCity(city, russianNames.get(city.id)))
}

export function upgradeCityDataset<Source>(
  dataset: Schema2CityDataset<Source>,
  currentCities: readonly ParsedGeoNamesCity[],
  russianNames: RussianNameIndex,
): {
  schemaVersion: 3
  source: Source
  cities: CompactCityRecord[]
} {
  const currentCitiesById = new Map(currentCities.map((city) => [city.id, city]))
  const cities = dataset.cities.map((baselineCity): CompactCityRecord => {
    const [
      id,
      baselineName,
      baselineSearchNames,
      countryCode,
      latitude,
      longitude,
      population,
      timeZone,
    ] = baselineCity
    const currentCity = currentCitiesById.get(id)

    if (!currentCity) {
      const names = russianNames.get(id)
      const activeRussianNames = names?.activeNames ?? []
      const displayName = names?.preferredName
        ?? activeRussianNames[0]
        ?? baselineName
      return [
        id,
        displayName,
        buildSearchKey([
          displayName,
          baselineName,
          baselineSearchNames,
          ...activeRussianNames,
          getCountryName(countryCode),
        ]),
        countryCode,
        '',
        latitude,
        longitude,
        population,
        timeZone,
      ]
    }
    if (currentCity.countryCode !== countryCode) {
      throw new Error(
        `GeoNames и базовый набор расходятся по стране города ${id}`,
      )
    }

    const generated = toCompactCity(currentCity, russianNames.get(id))
    return [
      id,
      generated[1],
      generated[2],
      countryCode,
      generated[4],
      latitude,
      longitude,
      population,
      timeZone,
    ]
  })

  return { schemaVersion: 3, source: dataset.source, cities }
}
