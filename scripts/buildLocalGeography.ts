import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseCoverageGeometry, segmentDistanceMeters, type GeoPoint, type CoverageGeometry } from '../src/domain/localGeography'

export function simplifyLine(points: readonly GeoPoint[], toleranceMeters: number): GeoPoint[] {
  if (points.length <= 2) return [...points]
  const start = points[0]
  const end = points.at(-1)
  if (!start || !end) return []
  let max = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i]
    if (!point) continue
    const distance = segmentDistanceMeters(point, start, end)
    if (distance > max) { max = distance; index = i }
  }
  if (max <= toleranceMeters) return [start, end]
  return [...simplifyLine(points.slice(0, index + 1), toleranceMeters).slice(0, -1), ...simplifyLine(points.slice(index), toleranceMeters)]
}

export function buildLocalGeography(polygons: CoverageGeometry['polygons']): CoverageGeometry {
  const result = {
    uncertaintyMeters: 2000,
    polygons: polygons.map(polygon => polygon.map(ring => {
      const simplified = simplifyLine(ring, 100)
      // Малые кольца нельзя схлопывать: сохраняем острова и отверстия исходной геометрии.
      return (simplified.length < 4 ? ring : simplified).map(([x, y]): GeoPoint => [Number(x.toFixed(5)), Number(y.toFixed(5))])
    })),
  }
  const parsed = parseCoverageGeometry(result)
  if (!parsed) throw new Error('Некорректная геометрия Татарстана')
  return parsed
}

export async function prepareLocalGeography(check: boolean) {
  const source = await readFile('scripts/geography/tatarstan-source.geojson')
  const metadata = JSON.parse(await readFile('scripts/geography/provenance.json', 'utf8')) as { sha256: string }
  if (createHash('sha256').update(source).digest('hex') !== metadata.sha256) throw new Error('Изменился исходный снимок')
  const feature = JSON.parse(source.toString()) as { properties: { shapeISO: string }; geometry: { type: string; coordinates: CoverageGeometry['polygons'] } }
  if (feature.properties.shapeISO !== 'RU-TA' || feature.geometry.type !== 'MultiPolygon') throw new Error('Не тот регион')
  const result = buildLocalGeography(feature.geometry.coordinates)
  const bytes = JSON.stringify(result) + '\n'
  if (Buffer.byteLength(bytes) > 80 * 1024) throw new Error('Превышен бюджет геопакета')
  const path = 'public/data/tatarstan-boundary.json'
  if (check) {
    if (await readFile(path, 'utf8') !== bytes) throw new Error('Геопакет не воспроизводится')
  } else await writeFile(path, bytes)
  console.log(`Татарстан: ${Buffer.byteLength(bytes)} bytes, ${result.polygons.flat(2).length} vertices`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareLocalGeography(process.argv.includes('--check'))
}
