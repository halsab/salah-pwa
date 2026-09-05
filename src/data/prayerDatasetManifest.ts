import type { DataFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import type { PrayerDataset, PrayerDatasetManifest } from '../domain/types'

const DATASET_FILE_NAME = 'prayer-times-current.json'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const VERSION_PATTERN = /^([1-9]\d*)-([0-9a-f]{16})$/

export interface PrayerDatasetByteOperations {
  digest: (bytes: Uint8Array) => Promise<string>
  decode: (bytes: Uint8Array) => string
  parse: (text: string) => unknown
}

function invalidData(): DataFailure {
  return { kind: 'data', reason: 'invalid' }
}

function unavailableData(): DataFailure {
  return { kind: 'data', reason: 'unavailable' }
}

function isPrayerDataset(value: unknown): value is PrayerDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<PrayerDataset>

  return (
    dataset.schemaVersion === 2
    && Array.isArray(dataset.source?.years)
    && dataset.source.years.length > 0
    && dataset.source.years.every((year) => typeof year === 'number')
    && typeof dataset.source.updatedAt === 'string'
    && Array.isArray(dataset.locations)
    && dataset.locations.length > 0
    && Array.isArray(dataset.days)
    && dataset.days.length > 0
  )
}

export function validatePrayerDatasetManifest(
  value: unknown,
): Result<PrayerDatasetManifest, DataFailure> {
  if (!value || typeof value !== 'object') return failure(invalidData())
  const manifest = value as Partial<PrayerDatasetManifest>
  const { version, sha256 } = manifest
  if (typeof version !== 'string' || typeof sha256 !== 'string') {
    return failure(invalidData())
  }
  const versionMatch = VERSION_PATTERN.exec(version)

  if (
    manifest.schemaVersion !== 1
    || manifest.url !== DATASET_FILE_NAME
    || !SHA256_PATTERN.test(sha256)
    || !versionMatch
    || versionMatch[2] !== sha256.slice(0, 16)
  ) {
    return failure(invalidData())
  }

  return success({
    schemaVersion: 1,
    version,
    url: DATASET_FILE_NAME,
    sha256,
  })
}

export function resolvePrayerDatasetUrl(
  manifestUrl: string,
  manifest: PrayerDatasetManifest,
): string {
  const directoryEnd = manifestUrl.lastIndexOf('/') + 1
  return `${manifestUrl.slice(0, directoryEnd)}${manifest.url}`
}

export async function digestPrayerDatasetBytes(
  bytes: Uint8Array,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyPrayerDatasetBytes(
  bytes: Uint8Array,
  manifest: PrayerDatasetManifest,
  operations: Partial<PrayerDatasetByteOperations> = {},
): Promise<Result<PrayerDataset, DataFailure>> {
  let digest: string
  try {
    digest = await (operations.digest ?? digestPrayerDatasetBytes)(bytes)
  } catch {
    return failure(unavailableData())
  }
  if (digest !== manifest.sha256) return failure(invalidData())

  let value: unknown
  try {
    const text = (operations.decode
      ?? ((input) => new TextDecoder('utf-8', { fatal: true }).decode(input)))(bytes)
    value = (operations.parse ?? ((input) => JSON.parse(input) as unknown))(text)
  } catch {
    return failure(invalidData())
  }

  if (
    !isPrayerDataset(value)
    || manifest.version !== `${value.schemaVersion}-${digest.slice(0, 16)}`
  ) {
    return failure(invalidData())
  }

  return success(value)
}
