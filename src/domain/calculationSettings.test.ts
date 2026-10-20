import { describe, expect, it } from 'vitest'
import {
  automaticCalculationDefaults,
  effectiveCalculationSettings,
  isCalculationSelection,
  profileDefaults,
  selectionFromSettings,
} from './calculationSettings'

describe('calculation defaults', () => {
  it('preserves existing manual defaults, including the legacy DUM RF Hanafi choice', () => {
    expect(profileDefaults('dumRf')).toMatchObject({ profile: 'dumRf', asrMethod: 'hanafi' })
    expect(effectiveCalculationSettings({ profile: 'dumRf', overrides: {} }))
      .toMatchObject({ profile: 'dumRf', asrMethod: 'hanafi' })
  })

  it('does not treat an ambiguous Russian region code as confirmed Tatarstan coverage', () => {
    expect(automaticCalculationDefaults({
      selection: 'city', region: { code: 'RU.73', name: 'unknown region' }, coverage: 'outside',
    })).toMatchObject({ profile: 'dumRf', asrMethod: 'standard' })
    expect(automaticCalculationDefaults({
      selection: 'city', region: { code: 'RU-TA', name: 'Tatarstan' }, coverage: 'outside',
    })).toMatchObject({ profile: 'dumRf', asrMethod: 'standard' })
  })

  it('uses the regional recommendation only for a Place with confirmed Tatarstan coverage', () => {
    expect(automaticCalculationDefaults({
      selection: 'gps', region: { code: 'RU-TA', name: 'Tatarstan' }, coverage: 'inside',
    })).toMatchObject({ profile: 'dumRt', asrMethod: 'hanafi' })
  })

  it('preserves explicit manual Asr, polar, custom-angle, interval, and adjustment overrides', () => {
    const settings = {
      profile: 'dumRf' as const,
      asrMethod: 'standard' as const,
      highLatitudeRule: 'nearestDay' as const,
      fajrAngle: 17,
      isha: { kind: 'interval' as const, minutes: 105 },
      adjustments: { dhuhr: 2, isha: -3 },
    }
    const selection = selectionFromSettings(settings)
    expect(isCalculationSelection(selection)).toBe(true)
    expect(effectiveCalculationSettings(selection)).toEqual(settings)
  })

  it('falls back to MWL defaults when no future regional policy applies', () => {
    expect(automaticCalculationDefaults(undefined))
      .toMatchObject({ profile: 'muslimWorldLeague', asrMethod: 'standard' })
  })
})
