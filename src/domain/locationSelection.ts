export type LocationSelectionSource = 'default' | 'manual' | 'automatic'

export interface PersistedLocationSelection {
  readonly source?: unknown
}

export function isLocationSelectionSource(
  value: unknown,
): value is LocationSelectionSource {
  return value === 'default' || value === 'manual' || value === 'automatic'
}

export function shouldStartAutomaticLocation(
  persistedSelection: PersistedLocationSelection | null | undefined,
): boolean {
  return persistedSelection?.source === 'automatic'
}
