import { describe, expect, it } from 'vitest'

import { parseGeoNamesCities } from './parseGeoNamesCities'

describe('parseGeoNamesCities', () => {
  it('сжимает записи, сохраняет кириллические имена для поиска и сортирует по населению', () => {
    const rows = [
      ['2', 'Small', 'Small', 'Смолл,Small', '10.123456', '20.123456', 'P', 'PPL', 'AA', '', '', '', '', '', '5000', '', '', '', '2026-08-20'],
      ['1', 'Large', 'Large', 'Лардж,Large', '30.987654', '40.987654', 'P', 'PPL', 'BB', '', '', '', '', '', '10000', '', '', '', '2026-08-31'],
    ].map((columns) => columns.join('\t')).join('\n')

    const result = parseGeoNamesCities(rows)

    expect(result.updatedAt).toBe('2026-08-31')
    expect(result.cities).toEqual([
      [1, 'Large', 'Лардж', 'BB', 30.9877, 40.9877, 10000],
      [2, 'Small', 'Смолл', 'AA', 10.1235, 20.1235, 5000],
    ])
  })
})
