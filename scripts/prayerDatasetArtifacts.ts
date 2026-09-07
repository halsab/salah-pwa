import { validatePrayerDatasetManifest } from '../src/data/prayerDatasetManifest'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  PrayerDataset,
  PrayerDatasetManifest,
} from '../src/domain/types'

export const PRAYER_DATASET_FILE_NAME = 'prayer-times-current.json'
export const PRAYER_MANIFEST_FILE_NAME = 'prayer-times-manifest.json'

export function serializePrayerDataset(dataset: PrayerDataset): Uint8Array {
  return Buffer.from(`${JSON.stringify(dataset)}\n`, 'utf8')
}

export function hashPrayerDatasetBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function createPrayerDatasetManifest(
  datasetBytes: Uint8Array,
  datasetSchemaVersion: number,
): PrayerDatasetManifest {
  if (!Number.isInteger(datasetSchemaVersion) || datasetSchemaVersion < 1) {
    throw new Error('Набор расписаний имеет неизвестную версию схемы')
  }

  const sha256 = hashPrayerDatasetBytes(datasetBytes)
  return {
    schemaVersion: 1,
    version: `${datasetSchemaVersion}-${sha256.slice(0, 16)}`,
    url: PRAYER_DATASET_FILE_NAME,
    sha256,
  }
}

function serializeManifest(manifest: PrayerDatasetManifest): Uint8Array {
  return Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8')
}

function readDatasetSchemaVersion(datasetBytes: Uint8Array): number {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(datasetBytes).toString('utf8'))
  } catch {
    throw new Error('Набор расписаний имеет неизвестный формат')
  }

  if (!value || typeof value !== 'object' || !('schemaVersion' in value)) {
    throw new Error('Набор расписаний имеет неизвестный формат')
  }
  const schemaVersion = value.schemaVersion
  if (!Number.isInteger(schemaVersion) || Number(schemaVersion) < 1) {
    throw new Error('Набор расписаний имеет неизвестную версию схемы')
  }
  return Number(schemaVersion)
}

async function withReleaseSequence(manifest: PrayerDatasetManifest, manifestPath: string): Promise<PrayerDatasetManifest> {
  let previous: PrayerDatasetManifest | undefined
  try {
    const result = validatePrayerDatasetManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown)
    if (result.ok) previous = result.value
  } catch (error) {
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const sequence = previous?.sequence ?? 0
  return { ...manifest, sequence: previous?.sha256 === manifest.sha256 && sequence > 0 ? sequence : sequence + 1 }
}

export async function writePrayerCoverage(datasetPath: string, manifest: PrayerDatasetManifest, outputPath: string): Promise<void> {
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as PrayerDataset
  const { schemaVersion: _manifestSchema, ...identity } = manifest
  await writeFile(outputPath, `${JSON.stringify({ schemaVersion: dataset.schemaVersion, source: dataset.source, locations: dataset.locations, identity })}\n`)
}

export async function writePrayerDatasetArtifacts(
  outputDirectory: string,
  dataset: PrayerDataset,
): Promise<PrayerDatasetManifest> {
  const datasetBytes = serializePrayerDataset(dataset)
  const manifest = await withReleaseSequence(createPrayerDatasetManifest(datasetBytes, dataset.schemaVersion), path.join(outputDirectory, PRAYER_MANIFEST_FILE_NAME))
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(path.join(outputDirectory, PRAYER_DATASET_FILE_NAME), datasetBytes),
    writeFile(path.join(outputDirectory, PRAYER_MANIFEST_FILE_NAME), serializeManifest(manifest)),
  ])
  return manifest
}

export async function writePrayerDatasetManifest(
  datasetPath: string,
  manifestPath: string,
): Promise<PrayerDatasetManifest> {
  const datasetBytes = await readFile(datasetPath)
  const manifest = await withReleaseSequence(createPrayerDatasetManifest(datasetBytes, readDatasetSchemaVersion(datasetBytes)), manifestPath)
  await writeFile(manifestPath, serializeManifest(manifest))
  return manifest
}
