import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseDumRtCsv, validateSchedule } from '../src/data/parseDumRtCsv'
import type { PrayerDataset, PrayerDay } from '../src/domain/types'
import { DUM_RT_LOCATIONS } from './dumRtLocations'

const YEAR = Number(process.env.PRAYER_DATA_YEAR ?? new Date().getUTCFullYear())
const SOURCE_PAGE = 'https://dumrt.ru/ru/help-info/prayertime/'
const SOURCE_BASE = 'https://dumrt.ru/netcat_files/391/638/'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function downloadLocation(
  location: (typeof DUM_RT_LOCATIONS)[number],
): Promise<{ days: PrayerDay[]; updatedAt: string }> {
  const response = await fetch(`${SOURCE_BASE}${location.sourceFile}`, {
    headers: { 'User-Agent': 'salah-pwa-data-sync/1.0 (github.com/halsab/salah-pwa)' },
  })

  if (!response.ok) {
    throw new Error(`${location.name}: источник ответил ${response.status}`)
  }

  const allDays = parseDumRtCsv(await response.text(), location.id)
  const days = allDays.filter((day) => day.date.startsWith(`${YEAR}-`))
  validateSchedule(days, YEAR)

  return {
    days,
    updatedAt: response.headers.get('last-modified') ?? `${YEAR}-01-01T00:00:00.000Z`,
  }
}

async function main(): Promise<void> {
  const downloaded = await Promise.all(DUM_RT_LOCATIONS.map(downloadLocation))
  const latestUpdate = downloaded
    .map(({ updatedAt }) => new Date(updatedAt).getTime())
    .filter(Number.isFinite)
    .reduce((latest, current) => Math.max(latest, current), 0)

  const dataset: PrayerDataset = {
    schemaVersion: 1,
    source: {
      name: 'ДУМ Республики Татарстан',
      url: SOURCE_PAGE,
      updatedAt: new Date(latestUpdate).toISOString(),
      year: YEAR,
    },
    locations: DUM_RT_LOCATIONS.map(({ id, name, latitude, longitude }) => ({
      id,
      name,
      latitude,
      longitude,
    })),
    days: downloaded.flatMap(({ days }) => days),
  }

  const outputDirectory = path.join(root, 'public', 'data')
  const outputPath = path.join(outputDirectory, 'prayer-times-current.json')
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(dataset)}\n`, 'utf8')

  console.log(
    `Сохранено ${dataset.days.length} строк для ${dataset.locations.length} населённых пунктов: ${outputPath}`,
  )
}

await main()
