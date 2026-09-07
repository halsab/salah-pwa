import { isCalculationSelection, isCalculationSettings, selectionFromSettings, type CalculationSelection } from './calculationSettings'

export type ManualSource = { kind: 'official'; provider: string } | { kind: 'calculated'; calculation: CalculationSelection }
export type SourcePreferences = { calculationDraft?: CalculationSelection } & (
  | { mode: 'automatic' }
  | { mode: 'manual'; source: ManualSource }
)

export function automaticPreferences(calculationDraft?: CalculationSelection): SourcePreferences {
  return { mode: 'automatic', ...(calculationDraft ? { calculationDraft } : {}) }
}
export function manualCalculation(calculation: CalculationSelection): SourcePreferences {
  if (!isCalculationSelection(calculation)) throw new RangeError('Некорректные параметры расчёта')
  return { mode: 'manual', source: { kind: 'calculated', calculation }, calculationDraft: calculation }
}
export function isSourcePreferences(value: unknown): value is SourcePreferences {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<SourcePreferences>
  if (p.calculationDraft !== undefined && !isCalculationSelection(p.calculationDraft)) return false
  if (p.mode === 'automatic') return true
  if (p.mode !== 'manual' || !p.source) return false
  const source = p.source as { kind?: unknown; provider?: unknown; calculation?: unknown }
  return source.kind === 'official'
    ? typeof source.provider === 'string' && source.provider.length > 0
    : source.kind === 'calculated' && isCalculationSelection(source.calculation)
}
export function restoreSourcePreferences(value: unknown, legacySettings?: unknown, legacyChoice?: { mode?: unknown }): SourcePreferences {
  if (isSourcePreferences(value)) return value
  if (!isCalculationSettings(legacySettings)) return automaticPreferences()
  const calculation = selectionFromSettings(legacySettings)
  // Наличие старой записи означает редактирование; даже совпадение с прежним default не доказывает автоматический режим.
  return legacyChoice?.mode === 'official'
    ? { mode: 'manual', source: { kind: 'official', provider: 'dumRt' }, calculationDraft: calculation }
    : manualCalculation(calculation)
}
