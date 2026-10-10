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

  it.each(['canadaFcna', 'dubai', 'qatar', 'kuwait', 'egyptian'] as const)(
    'uses Standard Asr as the manual default for %s',
    profile => expect(profileDefaults(profile)).toMatchObject({ profile, asrMethod: 'standard' }),
  )

  it.each(['canadaFcna', 'dubai', 'qatar', 'kuwait', 'egyptian'] as const)(
    'accepts the stable manual selection shape for %s',
    profile => expect(isCalculationSelection({ profile, overrides: {} })).toBe(true),
  )

  it.each([
    ['RU-TA', 'dumRt', 'hanafi'], ['RU.48', 'dumRf', 'standard'],
    ['TR.34', 'turkey', 'standard'], ['PK.01', 'karachi', 'hanafi'],
    ['BD.81', 'karachi', 'hanafi'], ['IN.07', 'karachi', 'hanafi'],
    ['KZ.75', 'muslimWorldLeague', 'hanafi'], ['KG.01', 'muslimWorldLeague', 'hanafi'],
    ['UZ.13', 'muslimWorldLeague', 'hanafi'], ['US.NY', 'northAmerica', 'standard'],
    ['CA.ON', 'canadaFcna', 'standard'], ['SA.01', 'ummAlQura', 'standard'],
    ['AE.AZ', 'dubai', 'standard'], ['QA.01', 'qatar', 'standard'],
    ['KW.01', 'kuwait', 'standard'], ['EG.C', 'egyptian', 'standard'],
    ['ZA.11', 'muslimWorldLeague', 'standard'],
  ] as const)('provides future automatic defaults for %s without changing resolver behavior', (region, profile, asrMethod) => {
    expect(automaticCalculationDefaults(region)).toMatchObject({ profile, asrMethod })
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
