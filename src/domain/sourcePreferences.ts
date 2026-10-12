import { isCalculationSelection, isCalculationSettings, selectionFromSettings, type CalculationSelection } from './calculationSettings'

export type ManualSource = { kind: 'official'; provider: string } | { kind: 'calculated'; calculation: CalculationSelection }
export type SourcePreferences = { calculationDraft?: CalculationSelection; manualSourceDraft?: ManualSource } & (
  | { mode: 'automatic' }
  | { mode: 'manual'; source: ManualSource }
)

export function automaticPreferences(calculationDraft?: CalculationSelection, manualSourceDraft?: ManualSource): SourcePreferences {
  return { mode: 'automatic', ...(calculationDraft ? { calculationDraft } : {}), ...(manualSourceDraft ? { manualSourceDraft } : {}) }
}
export function manualCalculation(calculation: CalculationSelection): SourcePreferences {
  if (!isCalculationSelection(calculation)) throw new RangeError('Некорректные параметры расчёта')
  return { mode: 'manual', source: { kind: 'calculated', calculation }, calculationDraft: calculation }
}
function isManualSource(value: unknown): value is ManualSource {
  if (!value || typeof value !== 'object') return false
  const source = value as { kind?: unknown; provider?: unknown; calculation?: unknown }
  return source.kind === 'official'
    ? typeof source.provider === 'string' && source.provider.length > 0
    : source.kind === 'calculated' && isCalculationSelection(source.calculation)
}
export function isSourcePreferences(value: unknown): value is SourcePreferences {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<SourcePreferences>
  if (p.calculationDraft !== undefined && !isCalculationSelection(p.calculationDraft)) return false
  if (p.manualSourceDraft !== undefined && !isManualSource(p.manualSourceDraft)) return false
  if (p.mode === 'automatic') return true
  if (p.mode !== 'manual' || !p.source) return false
  return isManualSource(p.source)
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
