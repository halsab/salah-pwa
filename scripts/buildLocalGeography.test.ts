import { required } from '../src/test/required'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { buildLocalGeography, prepareLocalGeography } from './buildLocalGeography'
import { classifyCoverage, parseCoverageGeometry, type CoverageGeometry } from '../src/domain/localGeography'

const point = (latitude: number, longitude: number, accuracy = 10) => ({ latitude, longitude, accuracy })
describe('checked Tatarstan boundary snapshot', () => {
  it('reproduces the compact offline artifact from the pinned ODbL source', async () => {
    await prepareLocalGeography(true)
    const feature = JSON.parse(await readFile('scripts/geography/tatarstan-source.geojson', 'utf8')) as { geometry: { coordinates: CoverageGeometry['polygons'] } }
    const compact = buildLocalGeography(feature.geometry.coordinates)
    expect(compact.polygons.length).toBe(feature.geometry.coordinates.length)
    expect(compact.polygons.map(p => p.length)).toEqual(feature.geometry.coordinates.map(p => p.length))
  })
  it('checks Kazan, exterior and real border vertices without a bounding-box shortcut', async () => {
    const data = JSON.parse(await readFile('public/data/tatarstan-boundary.json', 'utf8')) as unknown
    const geo = required(parseCoverageGeometry(data))
    expect(geo).not.toBeNull()
    expect(classifyCoverage(point(55.7961, 49.1064), geo)).toBe('inside')
    expect(classifyCoverage(point(55.7558, 37.6173), geo)).toBe('outside')
    // Вятские Поляны внутри охватывающего прямоугольника, но вне Татарстана.
    expect(classifyCoverage(point(56.226, 51.065), geo)).toBe('outside')
    // Восточная граница близ Октябрьского (Башкортостан) и Бавлов (Татарстан).
    expect(classifyCoverage(point(54.481, 53.471), geo)).toBe('outside')
    expect(classifyCoverage(point(54.407, 53.245), geo)).toBe('inside')
    for (const polygon of geo.polygons) {
      const [longitude, latitude] = required(required(polygon[0])[0])
      expect(classifyCoverage(point(latitude, longitude, 0), geo)).toBe('uncertain')
    }
    expect(classifyCoverage(point(55.7961, 49.1064, 100_000), geo)).toBe('uncertain')
    expect(classifyCoverage(point(55.7961, 49.1064), null)).toBe('unavailable')
  })
  it('rejects malformed local packages', () => {
    expect(parseCoverageGeometry({ polygons: [], uncertaintyMeters: 2000 })).toBeNull()
    expect(parseCoverageGeometry({ polygons: [[[[49,55],[50,55],[50,56],[49,56]]]], uncertaintyMeters: 2000 })).toBeNull()
  })
})
