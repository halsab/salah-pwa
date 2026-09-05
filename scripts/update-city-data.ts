import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'

import {
  addGeoNamesAlternateName,
  createRussianNameIndex,
  parseGeoNamesCities,
  upgradeCityDataset,
  type CompactCityRecord,
  type RussianNameIndex,
  type Schema2CityDataset,
  type Schema2CompactCityRecord,
} from './parseGeoNamesCities'

const CITIES_ARCHIVE_URL = 'https://download.geonames.org/export/dump/cities5000.zip'
const ALTERNATE_NAMES_ARCHIVE_URL = 'https://download.geonames.org/export/dump/alternateNamesV2.zip'
const OUTPUT_PATH = path.resolve('public/data/cities-current.json')

type ExistingCityDataset<Source = unknown> = Schema2CityDataset<Source> | {
  schemaVersion: 3
  source: Source
  cities: CompactCityRecord[]
}

function isSchema2CityRecord(value: unknown): value is Schema2CompactCityRecord {
  return Array.isArray(value)
    && value.length === 8
    && Number.isInteger(value[0])
    && typeof value[1] === 'string'
    && typeof value[2] === 'string'
    && typeof value[3] === 'string'
    && typeof value[4] === 'number'
    && typeof value[5] === 'number'
    && typeof value[6] === 'number'
    && typeof value[7] === 'string'
}

function isSchema3CityRecord(value: unknown): value is CompactCityRecord {
  return Array.isArray(value)
    && value.length === 9
    && Number.isInteger(value[0])
    && typeof value[1] === 'string'
    && typeof value[2] === 'string'
    && typeof value[3] === 'string'
    && typeof value[4] === 'string'
    && typeof value[5] === 'number'
    && typeof value[6] === 'number'
    && typeof value[7] === 'number'
    && typeof value[8] === 'string'
}

function hasUniqueCityIds(cities: readonly (readonly unknown[])[]): boolean {
  const ids = cities.map((city) => city[0])
  return new Set(ids).size === ids.length
}

function parseExistingDataset(content: string): ExistingCityDataset {
  const dataset: unknown = JSON.parse(content)
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Текущий набор городов имеет неверный формат')
  }

  if (
    'schemaVersion' in dataset
    && dataset.schemaVersion === 2
    && 'source' in dataset
    && 'cities' in dataset
    && Array.isArray(dataset.cities)
    && dataset.cities.every(isSchema2CityRecord)
    && hasUniqueCityIds(dataset.cities)
  ) {
    return {
      schemaVersion: 2,
      source: dataset.source,
      cities: dataset.cities,
    }
  }

  if (
    'schemaVersion' in dataset
    && dataset.schemaVersion === 3
    && 'source' in dataset
    && 'cities' in dataset
    && Array.isArray(dataset.cities)
    && dataset.cities.every(isSchema3CityRecord)
    && hasUniqueCityIds(dataset.cities)
  ) {
    return {
      schemaVersion: 3,
      source: dataset.source,
      cities: dataset.cities,
    }
  }

  throw new Error('Текущий набор городов имеет неподдерживаемую схему')
}

function toSchema2Dataset<Source>(
  dataset: ExistingCityDataset<Source>,
): Schema2CityDataset<Source> {
  if (dataset.schemaVersion === 2) return dataset

  return {
    schemaVersion: 2,
    source: dataset.source,
    cities: dataset.cities.map(([
      id,
      name,
      normalizedSearchKey,
      countryCode,
      ,
      latitude,
      longitude,
      population,
      timeZone,
    ]) => [
      id,
      name,
      normalizedSearchKey,
      countryCode,
      latitude,
      longitude,
      population,
      timeZone,
    ]),
  }
}

async function downloadArchive(
  url: string,
  destination: string,
  label: string,
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GeoNames (${label}) недоступен: ${response.status}`)
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

async function readRussianNames(
  archivePath: string,
  cityIds: ReadonlySet<number>,
): Promise<RussianNameIndex> {
  const index = createRussianNameIndex()
  const unzip = spawn('unzip', ['-p', archivePath, 'alternateNamesV2.txt'])
  let stderr = ''
  unzip.stderr.setEncoding('utf8')
  unzip.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  const completion = new Promise<number | null>((resolve, reject) => {
    unzip.once('error', reject)
    unzip.once('close', resolve)
  })
  const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity })

  try {
    for await (const line of lines) {
      addGeoNamesAlternateName(index, cityIds, line)
    }
    const exitCode = await completion
    if (exitCode !== 0) {
      throw new Error(
        `Не удалось прочитать alternateNamesV2.zip: ${stderr.trim()}`,
      )
    }
  } catch (error) {
    unzip.kill()
    await completion.catch(() => undefined)
    throw error
  }

  return index
}

async function main(): Promise<void> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'salah-cities-'))
  const downloadedCitiesArchive = path.join(temporaryDirectory, 'cities5000.zip')
  const downloadedAlternateNamesArchive = path.join(
    temporaryDirectory,
    'alternateNamesV2.zip',
  )
  const providedCitiesArchive = process.env.GEONAMES_ARCHIVE
  const providedAlternateNamesArchive = process.env.GEONAMES_ALTERNATE_NAMES_ARCHIVE

  try {
    const citiesArchivePath = providedCitiesArchive
      ? path.resolve(providedCitiesArchive)
      : downloadedCitiesArchive
    const alternateNamesArchivePath = providedAlternateNamesArchive
      ? path.resolve(providedAlternateNamesArchive)
      : downloadedAlternateNamesArchive

    if (!providedCitiesArchive) {
      await downloadArchive(
        CITIES_ARCHIVE_URL,
        citiesArchivePath,
        'cities5000.zip',
      )
    }
    if (!providedAlternateNamesArchive) {
      await downloadArchive(
        ALTERNATE_NAMES_ARCHIVE_URL,
        alternateNamesArchivePath,
        'alternateNamesV2.zip',
      )
    }

    const cityContent = execFileSync(
      'unzip',
      ['-p', citiesArchivePath, 'cities5000.txt'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
    const parsed = parseGeoNamesCities(cityContent)
    if (parsed.cities.length === 0) throw new Error('GeoNames не вернул города')

    const existingDataset = toSchema2Dataset(parseExistingDataset(
      await readFile(OUTPUT_PATH, 'utf8'),
    ))
    const cityIds = new Set(existingDataset.cities.map((city) => city[0]))
    const russianNames = await readRussianNames(
      alternateNamesArchivePath,
      cityIds,
    )
    const dataset = upgradeCityDataset(
      existingDataset,
      parsed.cities,
      russianNames,
    )
    await writeFile(OUTPUT_PATH, JSON.stringify(dataset))

    const size = (await readFile(OUTPUT_PATH)).byteLength
    process.stdout.write(
      `Сохранено ${dataset.cities.length} городов (${(size / 1024 / 1024).toFixed(2)} МБ)\n`,
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

await main()
