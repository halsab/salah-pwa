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

export async function writePrayerDatasetArtifacts(
  outputDirectory: string,
  dataset: PrayerDataset,
): Promise<PrayerDatasetManifest> {
  const datasetBytes = serializePrayerDataset(dataset)
  const manifest = createPrayerDatasetManifest(datasetBytes, dataset.schemaVersion)
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
  const manifest = createPrayerDatasetManifest(
    datasetBytes,
    readDatasetSchemaVersion(datasetBytes),
  )
  await writeFile(manifestPath, serializeManifest(manifest))
  return manifest
}
