import { required } from '../test/required'
import { describe, expect, it } from 'vitest'
import { classifyCoverage, resolveGpsGeography, type CoverageGeometry } from './localGeography'

const square: CoverageGeometry = { polygons: [[[[49, 55], [50, 55], [50, 56], [49, 56], [49, 55]]]], uncertaintyMeters: 1000 }
const point = (latitude: number, longitude: number, accuracy: number | null = 10) => ({ latitude, longitude, accuracy })

describe('local geographic evidence', () => {
  it('distinguishes interior, exterior and boundary including GPS uncertainty', () => {
    expect(classifyCoverage(point(55.5, 49.5), square)).toBe('inside')
    expect(classifyCoverage(point(54.5, 49.5), square)).toBe('outside')
    expect(classifyCoverage(point(55, 49.5), square)).toBe('uncertain')
    expect(classifyCoverage(point(55.01, 49.5, 2000), square)).toBe('uncertain')
    expect(classifyCoverage(point(55.5, 49.5, null), square)).toBe('uncertain')
    expect(classifyCoverage(point(55.5, 49.5), null)).toBe('unavailable')
  })
  it('handles holes and multiple polygons', () => {
    const geometry: CoverageGeometry = { ...square, polygons: [[required(required(square.polygons[0])[0]), [[49.4,55.4],[49.6,55.4],[49.6,55.6],[49.4,55.6],[49.4,55.4]]]] }
    expect(classifyCoverage(point(55.5, 49.5), geometry)).toBe('outside')
    expect(classifyCoverage(point(55.4, 49.5), geometry)).toBe('uncertain')
  })
  it('never derives timezone from nearest city or connectivity', () => {
    expect(resolveGpsGeography(point(55.5, 49.5), 'America/Los_Angeles', square)).toMatchObject({ coverage: 'inside', timeZone: 'Europe/Moscow', timeZoneSource: 'boundary' })
    expect(resolveGpsGeography(point(54.5, 49.5), 'America/Los_Angeles', square)).toMatchObject({ coverage: 'outside', timeZone: 'America/Los_Angeles', timeZoneSource: 'device' })
    expect(resolveGpsGeography(point(55, 49.5), 'Europe/Samara', square).timeZoneSource).toBe('device')
    expect(resolveGpsGeography(point(55.5, 49.5), 'UTC', null).coverage).toBe('unavailable')
  })
})
