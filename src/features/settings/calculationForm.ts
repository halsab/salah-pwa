import { CALCULATED_KEYS, isCalculationSelection, type CalculationSelection } from '../../domain/calculationSettings'
import type { CalculationSettings } from '../../domain/prayerCalculation'

export function readCalculationForm(form: FormData, current: CalculationSettings): CalculationSelection | null {
  const numeric = (key: string) => {
    const entry = form.get(key)
    const value = typeof entry === 'string' ? entry.trim() : ''
    return value === '' ? undefined : /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : NaN
  }
  const fajrAngle = numeric('fajrAngle')
  const ishaValue = numeric('ishaValue')
  const ishaKind = form.get('ishaKind')
  const adjustments = Object.fromEntries(CALCULATED_KEYS.flatMap(key => {
    const value = numeric(key)
    return value === undefined ? [] : [[key, value]]
  }))
  const selection = {
    profile: form.get('profile') ?? current.profile,
    overrides: {
      asrMethod: form.get('asrMethod'), highLatitudeRule: form.get('highLatitudeRule'),
      ...(fajrAngle !== undefined ? { fajrAngle } : {}),
      ...(ishaKind === 'default' ? {} : { isha: ishaKind === 'angle' ? { kind: 'angle', angle: ishaValue } : { kind: 'interval', minutes: ishaValue } }),
      ...(Object.keys(adjustments).length ? { adjustments } : {}),
    },
  }
  return isCalculationSelection(selection) ? selection : null
}
