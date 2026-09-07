import { describe, expect, it } from 'vitest'

import { validateReleaseVersion } from './releaseVersion'

describe('validateReleaseVersion', () => {
  it('сохраняет выбранный пользователем номер сборки', () => {
    expect(validateReleaseVersion('v26.7', ['v26.1', 'v26.3'])).toBe('v26.7')
  })

  it('разрешает первую сборку нового года', () => {
    expect(validateReleaseVersion('v27.1', ['v26.7'])).toBe('v27.1')
  })

  it.each(['', '26.4', 'v2026.4', 'v26.0', 'v26.04', 'v26.-1', 'v26.4.1', ' v26.4', 'v26.4\n', 'v26.9007199254740992'])('отклоняет некорректный номер %j', (version) => {
    expect(() => validateReleaseVersion(version, [])).toThrow('vYY.N')
  })

  it('не разрешает повторно публиковать существующий номер', () => {
    expect(() => validateReleaseVersion('v26.3', ['v26.1', 'v26.3']))
      .toThrow('v26.3 уже существует')
  })
})
