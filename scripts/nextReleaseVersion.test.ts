import { describe, expect, it } from 'vitest'

import { getNextReleaseVersion } from './nextReleaseVersion'

describe('getNextReleaseVersion', () => {
  it('начинает год с первого релиза', () => {
    expect(getNextReleaseVersion([], new Date('2026-09-03T09:00:00.000Z'))).toBe('v26.1')
  })

  it('увеличивает наибольший номер текущего года', () => {
    expect(getNextReleaseVersion(
      ['v25.12', 'v26.1', 'v26.4', 'v26.beta', 'other'],
      new Date('2026-09-03T09:00:00.000Z'),
    )).toBe('v26.5')
  })

  it('учитывает наступление нового года по московскому времени', () => {
    expect(getNextReleaseVersion(
      ['v26.8'],
      new Date('2026-12-31T21:30:00.000Z'),
    )).toBe('v27.1')
  })
})
