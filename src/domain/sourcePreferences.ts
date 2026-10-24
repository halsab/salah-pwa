import { isCalculationSelection, type CalculationSelection } from './calculationSettings'

export type ManualSource = { kind: 'calculated'; calculation: CalculationSelection }
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
  const source = value as { kind?: unknown; calculation?: unknown }
  return source.kind === 'calculated' && isCalculationSelection(source.calculation)
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
export function restoreSourcePreferences(value: unknown): SourcePreferences {
  // Old official sources and retired profile IDs are intentionally not migrated.
  return isSourcePreferences(value) ? value : automaticPreferences()
}
