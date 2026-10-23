import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { CompactCityRecord } from '../src/domain/cities'
import type { PrayerDataset, PrayerDay } from '../src/domain/types'
import { buildCityPackages } from './buildCityPackages'
import {
  checkBuildArtifacts,
  reportBuildArtifactFailure,
  validateBuildArtifacts,
  type BuildArtifact,
} from './checkBuildArtifacts'
import {
  createPrayerDatasetManifest,
  serializePrayerDataset,
} from './prayerDatasetArtifacts'

const citySource = {
  name: 'GeoNames',
  url: 'https://www.geonames.org/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: '2026-09-07',
}
const generated = buildCityPackages([
  [1, 'Киров', ['киров'], 'RU', '33', 58.6, 49.6, 5000, 'Europe/Moscow', 'Кировская область', 'россия'],
], citySource)
const catalog = generated.index
const shardPath = `data/cities/${catalog.version}/RU-0.json`

function completePrayerDataset(): PrayerDataset {
  const days: PrayerDay[] = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)
    return {
      locationId: 'kazan',
      date,
      fajrStart: '06:19' as const,
      fajrJamaat: '07:44' as const,
      sunrise: '08:08' as const,
      zenith: '11:43' as const,
      dhuhr: '12:00' as const,
      asr: '13:17' as const,
      maghrib: '15:25' as const,
      isha: '16:57' as const,
    }
  })

  return {
    schemaVersion: 2,
    source: {
      name: 'ДУМ Республики Татарстан',
      url: 'https://dumrt.ru/ru/help-info/prayertime/',
      updatedAt: '2026-09-01T00:00:00.000Z',
      years: [2026],
    },
    locations: [{ id: 'kazan', name: 'Казань', latitude: 55.7946, longitude: 49.1115 }],
    days,
  }
}

function requiredArtifacts(cityCatalog = catalog): BuildArtifact[] {
  return [
    { path: 'index.html', size: 250 },
    { path: 'manifest.webmanifest', size: 100 },
    { path: 'share-qr.svg', size: 200 },
    { path: 'assets/index-a1b2c3.js', size: 100 },
    { path: 'assets/index-a1b2c3.css', size: 20 },
    { path: 'data/cities/index.json', size: 200 },
    { path: `data/cities/${cityCatalog.version}/${cityCatalog.shards[0]?.id}.json`, size: 300 },
    { path: 'data/prayer-times-current.json', size: 400 },
    { path: 'data/prayer-times-manifest.json', size: 50 },
  ]
}

async function writeBuildArtifacts(
  root: string,
  options: {
    cityCatalog?: typeof catalog
    cityShards?: typeof generated.shards
    mainJavaScript?: string
    css?: string
    html?: string
    manifest?: Record<string, unknown>
    shareQr?: string
  } = {},
): Promise<{ prayerDatasetPath: string; prayerManifestPath: string }> {
  const cityCatalog = options.cityCatalog ?? catalog
  const cityShards = options.cityShards ?? generated.shards
  const cityShardDirectory = join(root, 'data/cities', cityCatalog.version)
  await Promise.all([
    mkdir(join(root, 'assets'), { recursive: true }),
    mkdir(cityShardDirectory, { recursive: true }),
  ])

  const prayerDatasetBytes = serializePrayerDataset(completePrayerDataset())
  const prayerManifest = createPrayerDatasetManifest(prayerDatasetBytes, 2)
  const prayerDatasetPath = join(root, 'data/prayer-times-current.json')
  const prayerManifestPath = join(root, 'data/prayer-times-manifest.json')
  const appManifest = options.manifest ?? {
    name: 'VaqtPro — времена намаза',
    short_name: 'VaqtPro',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  }
  const shareQr = options.shareQr ?? await readFile(join(process.cwd(), 'public/share-qr.svg'), 'utf8')
  const primaryShard = cityCatalog.shards[0]
  if (!primaryShard) throw new Error('Fixture справочника не содержит пакетов')

  await Promise.all([
    writeFile(join(root, 'assets/index-build.js'), options.mainJavaScript ?? 'application code'),
    writeFile(join(root, 'assets/index-build.css'), options.css ?? '.app { display: block; }'),
    writeFile(join(root, 'index.html'), options.html ?? '<meta name="apple-mobile-web-app-title" content="VaqtPro" /><title>VaqtPro — времена намаза</title>'),
    writeFile(join(root, 'manifest.webmanifest'), JSON.stringify(appManifest)),
    writeFile(join(root, 'share-qr.svg'), shareQr),
    writeFile(join(root, 'assets/city-search.worker.js'), 'worker code'),
    writeFile(join(root, 'sw.js'), 'offline worker'),
    writeFile(join(root, 'data/cities/index.json'), JSON.stringify(cityCatalog)),
    ...Object.entries(cityShards).map(([id, shard]) => writeFile(
      join(cityShardDirectory, `${id}.json`),
      JSON.stringify(shard),
    )),
    writeFile(prayerDatasetPath, prayerDatasetBytes),
    writeFile(prayerManifestPath, `${JSON.stringify(prayerManifest)}\n`),
  ])

  return { prayerDatasetPath, prayerManifestPath }
}

async function temporaryDirectory(prefix = 'vaqtpro-build-artifacts-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

describe('production artifact validation', () => {
  it('requires the main bundles, city catalog, prayer data, and manifest', () => {
    expect(validateBuildArtifacts([], catalog)).toEqual(expect.arrayContaining([
      'mainJavaScript: artifact не найден',
      'mainCss: artifact не найден',
      'indexHtml: artifact не найден',
      'webManifest: artifact не найден',
      'shareQr: artifact не найден',
      'cityIndex: artifact не найден',
      'prayerTimes: artifact не найден',
      'prayerManifest: artifact не найден',
      `cities: отсутствует ${shardPath}`,
    ]))
  })

  it('blocks duplicate required main bundles and duplicate city paths', () => {
    const artifacts = requiredArtifacts()
    artifacts.push(
      { path: 'assets/index-second.js', size: 1 },
      { path: 'assets/index-second.css', size: 1 },
      { path: shardPath, size: 1 },
    )

    expect(validateBuildArtifacts(artifacts, catalog)).toEqual(expect.arrayContaining([
      'mainJavaScript: найдено 2 artifacts',
      'mainCss: найдено 2 artifacts',
      `cities: повторный artifact ${shardPath}`,
    ]))
  })

  it('accepts arbitrarily large JavaScript, CSS, city index, shard, and prayer artifacts', () => {
    const artifacts = requiredArtifacts().map((artifact) => ({
      ...artifact,
      size: 64 * 1024 * 1024,
    }))

    expect(validateBuildArtifacts(artifacts, catalog)).toEqual([])
  })

  it('blocks missing, extra, and obsolete city catalog artifacts', () => {
    expect(validateBuildArtifacts(requiredArtifacts().filter((artifact) => artifact.path !== shardPath), catalog))
      .toContain(`cities: отсутствует ${shardPath}`)
    expect(validateBuildArtifacts([
      ...requiredArtifacts(),
      { path: 'data/cities/stale/XX-0.json', size: 1 },
    ], catalog)).toContain('cities: лишний artifact data/cities/stale/XX-0.json')
    expect(validateBuildArtifacts([
      ...requiredArtifacts(),
      { path: 'data/cities-current.json', size: 1 },
    ], catalog)).toContain('cities: старый монолит недопустим')
  })

  it('fails an incomplete production directory before reporting sizes', async () => {
    const root = await temporaryDirectory()
    const messages: string[] = []

    try {
      await expect(checkBuildArtifacts(root, {
        log: (message) => messages.push(message),
      })).rejects.toThrow('mainJavaScript: artifact не найден')
      expect(messages).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects stale branding and a subpath PWA installation scope', async () => {
    const root = await temporaryDirectory()

    try {
      await writeBuildArtifacts(root, {
        html: '<meta name="apple-mobile-web-app-title" content="Salah" /><title>Salah — времена намаза</title>',
        manifest: {
          name: 'Salah — времена намаза',
          short_name: 'Salah',
          id: '/salah-pwa/',
          start_url: '/salah-pwa/',
          scope: '/salah-pwa/',
          display: 'standalone',
        },
      })

      let errorMessage = ''
      try {
        await checkBuildArtifacts(root, { log: () => undefined })
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error)
      }
      expect(errorMessage).toContain('appTitle: index.html не содержит название VaqtPro')
      expect(errorMessage).toContain('appleTitle: index.html не содержит название VaqtPro')
      expect(errorMessage).toContain('webManifest: имя приложения должно быть VaqtPro')
      expect(errorMessage).toContain('webManifest: id должен указывать на корень сайта')
      expect(errorMessage).toContain('webManifest: start_url должен указывать на корень сайта')
      expect(errorMessage).toContain('webManifest: scope должен указывать на корень сайта')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a QR image that differs from the verified VaqtPro destination', async () => {
    const root = await temporaryDirectory()

    try {
      await writeBuildArtifacts(root, { shareQr: '<svg xmlns="http://www.w3.org/2000/svg" />' })

      let errorMessage = ''
      try {
        await checkBuildArtifacts(root, { log: () => undefined })
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error)
      }
      expect(errorMessage).toContain('shareQr: QR-код не соответствует проверенной ссылке https://vaqt.pro/')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('validates an intact production directory and reports bundles larger than the former limits', async () => {
    const root = await temporaryDirectory()
    const summaryPath = join(root, 'step-summary.md')
    const messages: string[] = []
    const mainJavaScript = 'x'.repeat(600 * 1024)
    const css = 'y'.repeat(50 * 1024)

    try {
      await writeBuildArtifacts(root, { mainJavaScript, css })
      await expect(checkBuildArtifacts(root, {
        summaryPath,
        log: (message) => messages.push(message),
      })).resolves.toBeUndefined()

      const output = messages.join('\n')
      expect(output).toContain('Main JavaScript: 614,400 bytes raw')
      expect(output).toContain('Total JavaScript: 614,425 bytes raw')
      expect(output).toContain('Total CSS: 51,200 bytes raw')
      expect(output).toContain('gzip')

      const summary = await readFile(summaryPath, 'utf8')
      expect(summary).toContain('| Main JavaScript | 614,400 bytes |')
      expect(summary).toContain('| Total JavaScript | 614,425 bytes |')
      expect(summary).toContain('| Total CSS | 51,200 bytes |')
      expect(summary).toContain('absolute sizes are shown')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports absolute sizes when a PR base build is not available', async () => {
    const root = await temporaryDirectory()
    const messages: string[] = []

    try {
      await writeBuildArtifacts(root)
      await checkBuildArtifacts(root, {
        baselineDirectory: join(root, 'missing-baseline'),
        log: (message) => messages.push(message),
      })

      expect(messages.join('\n')).toContain('Comparison baseline unavailable; absolute sizes only.')
      expect(messages.join('\n')).toContain('::notice::PR base size comparison unavailable')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('compares gzip size with a reliable baseline and highlights increases without failing', async () => {
    const root = await temporaryDirectory()
    const current = join(root, 'current')
    const baseline = join(root, 'baseline')
    const summaryPath = join(root, 'summary.md')
    const messages: string[] = []

    try {
      await writeBuildArtifacts(current, {
        mainJavaScript: 'x'.repeat(80 * 1024),
        css: 'y'.repeat(20 * 1024),
      })
      await mkdir(join(baseline, 'assets'), { recursive: true })
      await Promise.all([
        writeFile(join(baseline, 'assets/index-main.js'), 'x'.repeat(20 * 1024)),
        writeFile(join(baseline, 'assets/index-main.css'), 'y'.repeat(2 * 1024)),
      ])

      await expect(checkBuildArtifacts(current, {
        baselineDirectory: baseline,
        summaryPath,
        log: (message) => messages.push(message),
      })).resolves.toBeUndefined()

      expect(messages.join('\n')).toContain('Δ vs PR base')
      expect(messages.join('\n')).toContain('::warning title=Production asset size increased::')
      expect((await readFile(summaryPath, 'utf8'))).toContain('| Δ gzip vs PR base |')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('blocks corrupted city catalog input and duplicate city artifacts', async () => {
    const root = await temporaryDirectory()
    try {
      await mkdir(join(root, 'data/cities'), { recursive: true })
      await writeFile(join(root, 'data/cities/index.json'), '{broken')
      await expect(checkBuildArtifacts(root)).rejects.toThrow('cities:')
      expect(validateBuildArtifacts([
        ...requiredArtifacts(),
        { path: shardPath, size: 1 },
      ], catalog)).toContain(`cities: повторный artifact ${shardPath}`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(['filter', 'timezone', 'missing-city'] as const)(
    'rejects a self-consistent catalog checksum with inconsistent %s data',
    async (kind) => {
      const index = structuredClone(catalog)
      const descriptor = index.shards[0]
      const city = index.overview[0]
      if (!descriptor || !city) throw new Error('Отсутствует город fixture')
      if (kind === 'filter') descriptor.filter = 'A'.repeat(descriptor.filter.length)
      if (kind === 'timezone') city[8] = 'Europe/Samara'
      if (kind === 'missing-city') city[0] = 9999
      const { sha256 } = await import('./buildCityPackages')
      index.checksum = sha256(JSON.stringify({ ...index, checksum: '' }))
      const root = await temporaryDirectory()

      try {
        await writeBuildArtifacts(root)
        await writeFile(join(root, 'data/cities/index.json'), JSON.stringify(index))
        await writeFile(join(root, `data/cities/${index.version}/${descriptor.id}.json`), JSON.stringify(generated.shards[descriptor.id]))
        const expected = kind === 'filter' ? 'Повреждён поисковый индекс'
          : kind === 'timezone' ? 'Обзор расходится с пакетом' : 'Обзор содержит отсутствующий город'
        await expect(checkBuildArtifacts(root)).rejects.toThrow(expected)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it('blocks duplicate GeoNames IDs spread across different shards', async () => {
    const records: CompactCityRecord[] = Array.from({ length: 300 }, (_, index) => {
      const id = index + 1
      return [
        id,
        `Город ${id}`,
        [`город ${id}`],
        'RU',
        '00',
        55 + id % 5,
        49 + id % 10,
        id <= 3 ? 100_000 + id : 5000,
        'Europe/Moscow',
        'регион',
        'россия',
      ]
    })
    const lastCity = records.at(-1)
    if (!lastCity) throw new Error('Отсутствует последний город fixture')
    const duplicateCity = [...lastCity] as CompactCityRecord
    duplicateCity[5] = 89
    duplicateCity[6] = 179
    const duplicateCatalog = buildCityPackages([...records, duplicateCity], citySource)
    expect(duplicateCatalog.index.shards).toHaveLength(2)
    expect(duplicateCatalog.index.overview.map((city) => city[0])).toEqual([3, 2, 1])
    expect(duplicateCatalog.index.shards.map((shard) => shard.count)).toEqual([300, 1])
    const root = await temporaryDirectory()

    try {
      await writeBuildArtifacts(root, {
        cityCatalog: duplicateCatalog.index,
        cityShards: duplicateCatalog.shards,
      })
      await expect(checkBuildArtifacts(root)).rejects.toThrow('Повторный GeoNames ID 300')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts a city shard larger than the former cap when its checksums and index agree', async () => {
    const longName = 'А'.repeat(70_000)
    const largeCatalog = buildCityPackages([[
      2,
      longName,
      [longName.toLocaleLowerCase('ru-RU')],
      'RU',
      '00',
      55.7,
      49.1,
      5000,
      'Europe/Moscow',
      'регион',
      'россия',
    ]], citySource)
    expect(largeCatalog.index.shards[0]?.bytes).toBeGreaterThan(128 * 1024)
    const root = await temporaryDirectory()

    try {
      await writeBuildArtifacts(root, {
        cityCatalog: largeCatalog.index,
        cityShards: largeCatalog.shards,
      })
      await expect(checkBuildArtifacts(root)).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(['malformed-manifest', 'wrong-url', 'malformed-dataset', 'corrupt-dataset', 'invalid-dataset'] as const)(
    'blocks %s prayer artifacts',
    async (kind) => {
      const root = await temporaryDirectory()
      try {
        const paths = await writeBuildArtifacts(root)
        if (kind === 'malformed-manifest') {
          await writeFile(paths.prayerManifestPath, '{broken')
        } else if (kind === 'wrong-url') {
          const manifest = JSON.parse(await readFile(paths.prayerManifestPath, 'utf8')) as { url: string }
          manifest.url = 'other-prayer-times.json'
          await writeFile(paths.prayerManifestPath, JSON.stringify(manifest))
        } else if (kind === 'malformed-dataset') {
          const bytes = Buffer.from('{broken\n')
          const manifest = createPrayerDatasetManifest(bytes, 2)
          await writeFile(paths.prayerDatasetPath, bytes)
          await writeFile(paths.prayerManifestPath, JSON.stringify(manifest))
        } else if (kind === 'corrupt-dataset') {
          await writeFile(paths.prayerDatasetPath, '{}\n')
        } else {
          const invalidDataset = { ...completePrayerDataset(), days: [] }
          const bytes = serializePrayerDataset(invalidDataset)
          const manifest = createPrayerDatasetManifest(bytes, 2)
          await writeFile(paths.prayerDatasetPath, bytes)
          await writeFile(paths.prayerManifestPath, JSON.stringify(manifest))
        }

        await expect(checkBuildArtifacts(root)).rejects.toThrow(
          kind === 'malformed-manifest' || kind === 'wrong-url' ? 'prayerManifest:' : 'prayerTimes:',
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it('reports correctness failures through the CLI with a non-zero exit code', () => {
    const previousExitCode = process.exitCode
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      reportBuildArtifactFailure(new Error('invalid artifact'))
      expect(error).toHaveBeenCalledWith('invalid artifact')
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = previousExitCode
    }
  })
})
