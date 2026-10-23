import { isCalculationSelection, isCalculationSettings, selectionFromSettings, type CalculationSelection } from './calculationSettings'
import type { CalculationSettings } from './prayerCalculation'

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
function migrateSelection(value: unknown): CalculationSelection | undefined {
  if (!value || typeof value !== 'object') return undefined
  const selection = value as { profile?: unknown; overrides?: unknown }
  const profile = selection.profile === 'dumRt' ? 'tatarstan'
    : selection.profile === 'dumRf' ? 'russia' : selection.profile
  if (profile !== 'tatarstan' && profile !== 'russia' && profile !== 'turkey'
    && profile !== 'muslimWorldLeague' && profile !== 'karachi' && profile !== 'northAmerica'
    && profile !== 'ummAlQura' && profile !== 'canadaFcna' && profile !== 'dubai'
    && profile !== 'qatar' && profile !== 'kuwait' && profile !== 'egyptian') return undefined
  const overrides = selection.overrides && typeof selection.overrides === 'object'
    ? { ...(selection.overrides as CalculationSelection['overrides']) } : {}
  if (String(overrides.highLatitudeRule) === 'dumRt') overrides.highLatitudeRule = 'tatarstan'
  const migrated = { profile, overrides }
  return isCalculationSelection(migrated) ? migrated : undefined
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
export function restoreSourcePreferences(value: unknown, legacySettings?: unknown, legacyChoice?: { mode?: unknown }): SourcePreferences {
  const rawLegacy = legacySettings && typeof legacySettings === 'object' ? legacySettings as Record<string, unknown> : null
  const migratedLegacy = rawLegacy ? migrateSelection({ profile: rawLegacy.profile, overrides: {
    asrMethod: rawLegacy.asrMethod, highLatitudeRule: rawLegacy.highLatitudeRule,
    fajrAngle: rawLegacy.fajrAngle, isha: rawLegacy.isha, adjustments: rawLegacy.adjustments,
  } }) : undefined
  if (value && typeof value === 'object') {
    const saved = value as Partial<SourcePreferences> & { mode?: unknown; source?: unknown; calculationDraft?: unknown; manualSourceDraft?: unknown }
    const draft = migrateSelection(saved.calculationDraft) ?? migratedLegacy
    const migrateSource = (source: unknown): ManualSource | undefined => {
      if (!source || typeof source !== 'object') return undefined
      const candidate = source as { kind?: unknown; provider?: unknown; calculation?: unknown }
      if (candidate.kind === 'calculated') {
        const calculation = migrateSelection(candidate.calculation)
        return calculation ? { kind: 'calculated', calculation } : undefined
      }
      if (candidate.kind === 'official' && candidate.provider === 'dumRt') {
        return { kind: 'calculated', calculation: { profile: 'tatarstan', overrides: draft?.overrides ?? {} } }
      }
      return undefined
    }
    const manualSource = migrateSource(saved.source)
    const manualDraft = migrateSource(saved.manualSourceDraft)
    if (saved.mode === 'automatic') return automaticPreferences(draft, manualDraft)
    if (saved.mode === 'manual' && manualSource) return { mode: 'manual', source: manualSource, ...(draft ? { calculationDraft: draft } : {}) }
    if (isSourcePreferences(value)) return value
  }
  if (!isCalculationSettings(legacySettings) && !migratedLegacy) {
    return legacyChoice?.mode === 'official'
      ? manualCalculation({ profile: 'tatarstan', overrides: {} })
      : automaticPreferences()
  }
  const calculation = migratedLegacy ?? selectionFromSettings(legacySettings as CalculationSettings)
  // Наличие старой записи означает редактирование; даже совпадение с прежним default не доказывает автоматический режим.
  return legacyChoice?.mode === 'official'
    ? manualCalculation({ profile: 'tatarstan', overrides: calculation.overrides })
    : manualCalculation(calculation)
}
