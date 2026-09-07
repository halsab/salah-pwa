import { describe, expect, it } from 'vitest'
import { buildCityPackages } from './buildCityPackages'
import { citySearchCandidates, nearestCityCandidates } from '../src/domain/cityIndex'
import type { CompactCityRecord } from '../src/domain/cities'
const source = { name: 'GeoNames', url: 'https://www.geonames.org/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', updatedAt: '2026-09-07' }
const rows: CompactCityRecord[] = [
  [1, 'Киров', ['киров', 'kirov'], 'RU', '33', 58.6, 49.6, 5000, 'Europe/Moscow', 'Кировская область', 'россия кировская область'],
  [2, 'Стамбул', ['стамбул', 'istanbul'], 'TR', '34', 41, 29, 5000, 'Europe/Istanbul', 'Стамбул', 'турция стамбул'],
]
describe('пакеты каталога', () => {
  it('воспроизводимы, выбирают только нужную страну и локальную ячейку', () => {
    const a = buildCityPackages(rows, source)
    expect(buildCityPackages([...rows].reverse(), source)).toEqual(a)
    expect(citySearchCandidates(a.index, 'kirov').map(s => s.country)).toEqual(['RU'])
    expect(nearestCityCandidates(a.index, 58.6, 49.6, 20).map(s => s.country)).toEqual(['RU'])
    expect(Object.values(a.shards).flatMap(s => s.cities).map(c => c[0])).toEqual([1, 2])
  })
  it('меняет версию при изменении региона или поисковых имён', () => {
    const updated = structuredClone(rows)
    const first = updated[0]
    if (!first) throw new Error('Нет тестового города')
    first[9] = ''
    expect(buildCityPackages(updated, source).index.version).not.toBe(buildCityPackages(rows, source).index.version)
  })
})

it('пространственные ячейки не теряют города на меридиане 180°, полюсе и границе радиуса', () => {
  const places: CompactCityRecord[] = [
    [1, 'Один', ['один'], 'RU', '01', 0, -179.99, 5000, 'UTC', '', 'россия'],
    [2, 'Два', ['два'], 'RU', '01', 89.99, 120, 5000, 'UTC', '', 'россия'],
  ]
  const { index } = buildCityPackages(places, source)
  expect(nearestCityCandidates(index, 0, 179.99, 5)).toHaveLength(1)
  expect(nearestCityCandidates(index, 90, -60, 5)).toHaveLength(1)
})
