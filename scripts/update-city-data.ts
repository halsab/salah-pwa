import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  enrichLegacyDataset,
  parseGeoNamesCities,
  type LegacyCityDataset,
  type LegacyCompactCityRecord,
} from './parseGeoNamesCities'

const ARCHIVE_URL = 'https://download.geonames.org/export/dump/cities5000.zip'
const SOURCE_URL = 'https://www.geonames.org/'
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'
const OUTPUT_PATH = path.resolve('public/data/cities-current.json')

type ExistingCityDataset = LegacyCityDataset | { schemaVersion: 2 }

function isLegacyCompactCityRecord(
  value: unknown,
): value is LegacyCompactCityRecord {
  return Array.isArray(value)
    && value.length === 7
    && Number.isInteger(value[0])
    && typeof value[1] === 'string'
    && typeof value[2] === 'string'
    && typeof value[3] === 'string'
    && typeof value[4] === 'number'
    && typeof value[5] === 'number'
    && typeof value[6] === 'number'
}

function parseExistingDataset(content: string): ExistingCityDataset {
  const dataset: unknown = JSON.parse(content)
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Текущий набор городов имеет неверный формат')
  }

  if ('schemaVersion' in dataset && dataset.schemaVersion === 2) {
    return { schemaVersion: 2 }
  }

  if (
    'schemaVersion' in dataset
    && dataset.schemaVersion === 1
    && 'source' in dataset
    && 'cities' in dataset
    && Array.isArray(dataset.cities)
    && dataset.cities.every(isLegacyCompactCityRecord)
  ) {
    return {
      schemaVersion: 1,
      source: dataset.source,
      cities: dataset.cities,
    }
  }

  throw new Error('Текущий набор городов имеет неподдерживаемую схему')
}

async function downloadArchive(destination: string): Promise<void> {
  const response = await fetch(ARCHIVE_URL)
  if (!response.ok) throw new Error(`GeoNames недоступен: ${response.status}`)
  await writeFile(destination, Buffer.from(await response.arrayBuffer()))
}

async function main(): Promise<void> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'salah-cities-'))
  const downloadedArchive = path.join(temporaryDirectory, 'cities5000.zip')
  const providedArchive = process.env.GEONAMES_ARCHIVE

  try {
    const archivePath = providedArchive
      ? path.resolve(providedArchive)
      : downloadedArchive
    if (!providedArchive) await downloadArchive(archivePath)

    const content = execFileSync('unzip', ['-p', archivePath, 'cities5000.txt'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    const parsed = parseGeoNamesCities(content)
    if (parsed.cities.length === 0) throw new Error('GeoNames не вернул города')

    const existingDataset = parseExistingDataset(
      await readFile(OUTPUT_PATH, 'utf8'),
    )
    const dataset = existingDataset.schemaVersion === 1
      ? enrichLegacyDataset(existingDataset, parsed.cities)
      : {
          schemaVersion: 2,
          source: {
            name: 'GeoNames',
            url: SOURCE_URL,
            license: 'CC BY 4.0',
            licenseUrl: LICENSE_URL,
            updatedAt: parsed.updatedAt,
          },
          cities: parsed.cities,
        }
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
