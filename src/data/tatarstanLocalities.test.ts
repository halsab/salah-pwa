import { describe, expect, it } from 'vitest'
import { TATARSTAN_LOCALITIES } from './tatarstanLocalities'

describe('calculation locality catalog', () => {
  it('retains all 44 local geographic identities independently of timetable data', () => {
    expect(TATARSTAN_LOCALITIES).toHaveLength(44)
    expect(new Set(TATARSTAN_LOCALITIES.map(({ id }) => id)).size).toBe(44)
    expect(TATARSTAN_LOCALITIES.every(({ id, name, latitude, longitude, timeZone }) =>
      Boolean(id && name) && Number.isFinite(latitude) && Number.isFinite(longitude) && timeZone === 'Europe/Moscow')).toBe(true)
  })
})
