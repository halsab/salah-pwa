import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir, rename, readdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { addGeoNamesAlternateName, createRussianNameIndex, parseGeoNamesCities, parseGeoNamesAdmin1, buildCompactCities } from './parseGeoNamesCities'
import { buildCityPackages, sha256 } from './buildCityPackages'
import { validateCityIndex, parseCityShard } from '../src/domain/citySchema'
import type { CityDatasetSource, CompactCityRecord } from '../src/domain/cities'

import inputs from './geonames-sources.json'

const output = path.resolve('public/data/cities')

async function readBaseline(): Promise<{ source: CityDatasetSource; cities: CompactCityRecord[] }> {
  const index = await validateCityIndex(JSON.parse(await readFile(path.join(output, 'index.json'), 'utf8')))
  const cities: CompactCityRecord[] = []
  for (const shard of index.shards) {
    const text = await readFile(path.join(output, index.version, `${shard.id}.json`), 'utf8')
    cities.push(...(await parseCityShard(text, index, shard)).cities)
  }
  return { source: index.source, cities }
}

async function main() {
  const baseline = await readBaseline()
  let cities = baseline.cities
  if (!process.argv.includes('--repack')) {
    const directory = process.env.GEONAMES_INPUT_DIR
    if (!directory) throw new Error('Укажите GEONAMES_INPUT_DIR со снимками из scripts/geonames-sources.json')
    for (const [name, input] of Object.entries(inputs)) {
      if (sha256(await readFile(path.join(directory, name))) !== input.sha256) throw new Error(`Не совпадает SHA-256 ${name}`)
    }
    const parsed = parseGeoNamesCities(execFileSync('unzip', ['-p', path.join(directory, 'cities5000.zip'), 'cities5000.txt'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    const regions = parseGeoNamesAdmin1(await readFile(path.join(directory, 'admin1CodesASCII.txt'), 'utf8'))
    const ids = new Set([...baseline.cities.map(c => c[0]), ...[...regions.values()].map(r => r.id)])
    const regionIds = new Set([...regions.values()].map(r => r.id))
    const names = createRussianNameIndex()
    const unzip = spawn('unzip', ['-p', path.join(directory, 'alternateNamesV2.zip'), 'alternateNamesV2.txt'])
    const done = new Promise<void>((resolve, reject) => {
      unzip.once('error', reject)
      unzip.once('close', code => code === 0 ? resolve() : reject(new Error('Не удалось распаковать alternateNamesV2')))
    })
    try {
      for await (const line of createInterface({ input: unzip.stdout, crlfDelay: Infinity })) addGeoNamesAlternateName(names, ids, line, regionIds.has(Number(line.split('\t', 2)[1])))
      await done
    } catch (error) {
      unzip.kill()
      await done.catch(() => undefined)
      throw error
    }
    const current = new Map(parsed.cities.map(c => [c.id, c]))
    // Смена формата сохраняет координаты, timezone и admin1Code прежнего набора.
    const preserved = baseline.cities.map(c => ({
      id: c[0], primaryName: current.get(c[0])?.primaryName ?? c[1], asciiName: current.get(c[0])?.asciiName ?? c[1],
      countryCode: c[3], admin1Code: c[4], latitude: c[5], longitude: c[6], population: c[7], timeZone: c[8],
    }))
    cities = buildCompactCities(preserved, names, regions)
  }
  const { index, shards } = buildCityPackages(cities, baseline.source)
  await validateCityIndex(index)
  for (const descriptor of index.shards) await parseCityShard(JSON.stringify(shards[descriptor.id]), index, descriptor)
  const temporary = await mkdtemp(path.join(tmpdir(), 'salah-city-packages-'))
  try {
    await mkdir(path.join(temporary, index.version))
    await writeFile(path.join(temporary, 'index.json'), JSON.stringify(index))
    for (const [id, shard] of Object.entries(shards)) await writeFile(path.join(temporary, index.version, `${id}.json`), JSON.stringify(shard))
    await mkdir(output, { recursive: true })
    const exists = await access(path.join(output, index.version)).then(() => true, () => false)
    if (!exists) await rename(path.join(temporary, index.version), path.join(output, index.version))
    await rename(path.join(temporary, 'index.json'), path.join(output, 'index.json'))
    for (const entry of await readdir(output, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[a-f0-9]{20}$/.test(entry.name) && entry.name !== index.version) await rm(path.join(output, entry.name), { recursive: true })
    }
    console.log(`${cities.length} городов; ${index.shards.length} пакетов; индекс ${Buffer.byteLength(JSON.stringify(index))} bytes; version ${index.version}`)
  } finally { await rm(temporary, { recursive: true, force: true }) }
}
await main()
