import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseDumRtCsv, validateSchedule } from '../src/data/parseDumRtCsv'
import type { PrayerDataset, PrayerDay } from '../src/domain/types'
import { DUM_RT_LOCATIONS } from './dumRtLocations'
import { selectCompleteDatasetYears } from './selectDatasetYear'

const requestedYear = process.env.PRAYER_DATA_YEAR
  ? Number(process.env.PRAYER_DATA_YEAR)
  : undefined
const currentYear = new Date().getUTCFullYear()
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

  return {
    days: parseDumRtCsv(await response.text(), location.id),
    updatedAt: response.headers.get('last-modified') ?? '1970-01-01T00:00:00.000Z',
  }
}

async function main(): Promise<void> {
  const downloaded = await Promise.all(DUM_RT_LOCATIONS.map(downloadLocation))
  const years = requestedYear === undefined
    ? selectCompleteDatasetYears(downloaded.map(({ days }) => days), currentYear)
    : [requestedYear]

  const schedules = downloaded.map(({ days, updatedAt }) => {
    const selectedDays = years.flatMap((year) => {
      const yearDays = days.filter((day) => day.date.startsWith(`${year}-`))
      validateSchedule(yearDays, year)
      return yearDays
    })
    return { days: selectedDays, updatedAt }
  })
  const latestUpdate = downloaded
    .map(({ updatedAt }) => new Date(updatedAt).getTime())
    .filter(Number.isFinite)
    .reduce((latest, current) => Math.max(latest, current), 0)

  const dataset: PrayerDataset = {
    schemaVersion: 2,
    source: {
      name: 'ДУМ Республики Татарстан',
      url: SOURCE_PAGE,
      updatedAt: new Date(latestUpdate).toISOString(),
      years,
    },
    locations: DUM_RT_LOCATIONS.map(({ id, name, latitude, longitude }) => ({
      id,
      name,
      latitude,
      longitude,
    })),
    days: schedules.flatMap(({ days }) => days),
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
