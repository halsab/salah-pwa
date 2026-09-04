import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import type { PrayerDataset } from '../src/domain/types'
import {
  createPrayerDatasetManifest,
  hashPrayerDatasetBytes,
  serializePrayerDataset,
  writePrayerDatasetArtifacts,
  writePrayerDatasetManifest,
} from './prayerDatasetArtifacts'

const dataset: PrayerDataset = {
  schemaVersion: 2,
  source: {
    name: 'ДУМ Республики Татарстан',
    url: 'https://dumrt.ru/ru/help-info/prayertime/',
    updatedAt: '2026-09-01T00:00:00.000Z',
    years: [2026],
  },
  locations: [{
    id: 'kazan',
    name: 'Казань',
    latitude: 55.7946,
    longitude: 49.1115,
  }],
  days: [{
    locationId: 'kazan',
    date: '2026-01-01',
    suhurEnd: '06:19',
    fajrJamaat: '07:44',
    sunrise: '08:08',
    zenith: '11:43',
    dhuhr: '12:00',
    asr: '13:17',
    maghrib: '15:25',
    isha: '16:57',
  }],
}

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'salah-prayer-artifacts-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })))
})

describe('prayer dataset artifacts', () => {
  it('сериализует набор ровно с одним финальным LF', () => {
    const bytes = serializePrayerDataset(dataset)

    expect(Buffer.from(bytes).toString('utf8')).toBe(`${JSON.stringify(dataset)}\n`)
    expect(bytes.at(-1)).toBe(0x0a)
    expect(bytes.at(-2)).not.toBe(0x0a)
  })

  it('учитывает финальный LF в SHA-256 и выводит версию из первых 16 символов', () => {
    const bytes = serializePrayerDataset(dataset)
    const hash = hashPrayerDatasetBytes(bytes)
    const hashWithoutFinalLf = hashPrayerDatasetBytes(bytes.subarray(0, bytes.length - 1))

    expect(hashWithoutFinalLf).not.toBe(hash)
    expect(createPrayerDatasetManifest(bytes, dataset.schemaVersion)).toEqual({
      schemaVersion: 1,
      version: `2-${hash.slice(0, 16)}`,
      url: 'prayer-times-current.json',
      sha256: hash,
    })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('пишет согласованные data и manifest из одних и тех же байтов', async () => {
    const directory = await temporaryDirectory()

    const manifest = await writePrayerDatasetArtifacts(directory, dataset)
    const datasetBytes = await readFile(path.join(directory, 'prayer-times-current.json'))
    const manifestBytes = await readFile(path.join(directory, 'prayer-times-manifest.json'))

    expect(datasetBytes).toEqual(Buffer.from(serializePrayerDataset(dataset)))
    expect(JSON.parse(manifestBytes.toString('utf8'))).toEqual(manifest)
    expect(manifest.sha256).toBe(hashPrayerDatasetBytes(datasetBytes))
    expect(manifest.version).toBe(`2-${manifest.sha256.slice(0, 16)}`)
    expect(manifestBytes.toString('utf8').endsWith('\n')).toBe(true)
  })

  it('офлайн пересоздаёт только manifest и повторный запуск идемпотентен', async () => {
    const directory = await temporaryDirectory()
    await writePrayerDatasetArtifacts(directory, dataset)
    const datasetPath = path.join(directory, 'prayer-times-current.json')
    const manifestPath = path.join(directory, 'prayer-times-manifest.json')
    const originalDatasetBytes = await readFile(datasetPath)
    await chmod(datasetPath, 0o444)
    await writeFile(manifestPath, '{"broken":true}\n', 'utf8')

    const firstManifest = await writePrayerDatasetManifest(datasetPath, manifestPath)
    const firstManifestBytes = await readFile(manifestPath)
    const secondManifest = await writePrayerDatasetManifest(datasetPath, manifestPath)
    const secondManifestBytes = await readFile(manifestPath)

    expect(secondManifest).toEqual(firstManifest)
    expect(secondManifestBytes).toEqual(firstManifestBytes)
    expect(await readFile(datasetPath)).toEqual(originalDatasetBytes)
  })

  it('проверяет согласованность текущего набора и manifest', async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const bytes = await readFile(path.join(root, 'public/data/prayer-times-current.json'))
    const checkedInManifest: unknown = JSON.parse(await readFile(
      path.join(root, 'public/data/prayer-times-manifest.json'),
      'utf8',
    ))

    expect(bytes.byteLength).toBeGreaterThan(1_000_000)
    expect(hashPrayerDatasetBytes(bytes)).toMatch(/^[0-9a-f]{64}$/)
    expect(checkedInManifest).toEqual(createPrayerDatasetManifest(bytes, 2))
  })
})
