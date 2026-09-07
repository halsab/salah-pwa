import { DUM_RT_TIME_ZONE } from './locationTime'

export type Coverage = 'inside' | 'outside' | 'uncertain' | 'unavailable'
export type GeoPoint = readonly [longitude: number, latitude: number]
export interface CoverageGeometry {
  polygons: readonly (readonly (readonly GeoPoint[])[])[]
  uncertaintyMeters: number
}
export interface Position {
  latitude: number
  longitude: number
  accuracy: number | null
}

export function validPosition(point: Position): boolean {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    && (point.accuracy === null || (Number.isFinite(point.accuracy) && point.accuracy >= 0))
}

export function segmentDistanceMeters(point: GeoPoint, start: GeoPoint, end: GeoPoint): number {
  // Локальная проекция для коротких сегментов Татарстана; запас модели покрывает её погрешность.
  const xScale = 111_195 * Math.cos(point[1] * Math.PI / 180)
  const ax = (start[0] - point[0]) * xScale
  const ay = (start[1] - point[1]) * 111_195
  const bx = (end[0] - point[0]) * xScale
  const by = (end[1] - point[1]) * 111_195
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

function inRing(point: GeoPoint, ring: readonly GeoPoint[]): boolean {
  let inside = false
  for (let i = 1; i < ring.length; i += 1) {
    const a = ring[i - 1]
    const b = ring[i]
    if (!a || !b) continue
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function classifyCoverage(point: Position, geometry: CoverageGeometry | null): Coverage {
  if (!geometry) return 'unavailable'
  if (!validPosition(point) || point.accuracy === null) return 'uncertain'
  const coordinate: GeoPoint = [point.longitude, point.latitude]
  const margin = geometry.uncertaintyMeters + point.accuracy
  for (const polygon of geometry.polygons) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i += 1) {
        const a = ring[i - 1]
        const b = ring[i]
        if (a && b && segmentDistanceMeters(coordinate, a, b) <= margin) return 'uncertain'
      }
    }
  }
  return geometry.polygons.some(([outer, ...holes]) => outer
    && inRing(coordinate, outer) && !holes.some(hole => inRing(coordinate, hole))) ? 'inside' : 'outside'
}

export function resolveGpsGeography(point: Position, deviceTimeZone: string, geometry: CoverageGeometry | null) {
  const coverage = classifyCoverage(point, geometry)
  return {
    coverage,
    timeZone: coverage === 'inside' ? DUM_RT_TIME_ZONE : deviceTimeZone,
    timeZoneSource: coverage === 'inside' ? 'boundary' as const : 'device' as const,
  }
}

export function parseCoverageGeometry(value: unknown): CoverageGeometry | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<CoverageGeometry>
  if (data.uncertaintyMeters !== 2000 || !Array.isArray(data.polygons) || !data.polygons.length) return null
  let vertices = 0
  for (const polygon of data.polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return null
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null
      for (const point of ring) {
        if (!Array.isArray(point) || point.length !== 2
          || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || point[0] < 47 || point[0] > 55 || point[1] < 53 || point[1] > 57) return null
        vertices += 1
      }
      if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) return null
    }
  }
  return vertices <= 4000 ? data as CoverageGeometry : null
}
