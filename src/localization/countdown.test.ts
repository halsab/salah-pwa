import { describe, expect, it } from 'vitest'

import { createTranslator } from './messages'
import { formatRemainingDuration } from './countdown'

const t = createTranslator('ru')

describe('formatRemainingDuration', () => {
  it.each([
    [44_265_000, '12 ч 17 мин'],
    [13_225_000, '3 ч 40 мин'],
    [3_900_000, '1 ч 5 мин'],
    [3_600_000, '1 ч 0 мин'],
    [3_599_999, '59 мин'],
    [1_845_000, '30 мин'],
    [308_000, '5 мин'],
    [60_000, '1 мин'],
    [59_999, '59 сек'],
    [9_000, '9 сек'],
    [1_000, '1 сек'],
    [999, '0 сек'],
    [0, '0 сек'],
  ])('formats %i ms without rounding or padding', (duration, expected) => {
    expect(formatRemainingDuration(duration, t)).toBe(expected)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid duration %s instead of fabricating a countdown',
    duration => expect(formatRemainingDuration(duration, t)).toBeNull(),
  )
})
