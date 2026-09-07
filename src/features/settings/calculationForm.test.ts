import { expect, it } from 'vitest'
import { readCalculationForm } from './calculationForm'
import { DEFAULT_CALCULATION_SETTINGS } from '../../domain/prayerCalculation'

it('не применяет частичные числа, пустую Иша и поправки за пределами домена', () => {
  const form = new FormData()
  form.set('profile', 'dumRt'); form.set('asrMethod', 'hanafi'); form.set('highLatitudeRule', 'dumRt'); form.set('ishaKind', 'default')
  expect(readCalculationForm(form, DEFAULT_CALCULATION_SETTINGS)).not.toBeNull()
  for (const value of ['-', '1.', '18oops', '31', '0']) {
    form.set('fajrAngle', value)
    expect(readCalculationForm(form, DEFAULT_CALCULATION_SETTINGS)).toBeNull()
  }
  form.set('fajrAngle', '18.5'); form.set('ishaKind', 'interval')
  expect(readCalculationForm(form, DEFAULT_CALCULATION_SETTINGS)).toBeNull()
  form.set('ishaValue', '90'); form.set('asr', '-12')
  expect(readCalculationForm(form, DEFAULT_CALCULATION_SETTINGS)?.overrides).toMatchObject({ fajrAngle: 18.5, isha: {kind:'interval', minutes:90}, adjustments: {asr:-12} })
  form.set('asr', '181')
  expect(readCalculationForm(form, DEFAULT_CALCULATION_SETTINGS)).toBeNull()
})
