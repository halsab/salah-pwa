import { useMemo, useSyncExternalStore } from 'react'
import { createSettingsPersistence, type SaveSettings } from './settingsPersistence'

export function useSettingsPersistence(save: SaveSettings, reserveSelectionOrder: () => Promise<number>) {
  const writer = useMemo(() => createSettingsPersistence(save, reserveSelectionOrder), [save, reserveSelectionOrder])
  const status = useSyncExternalStore(writer.subscribe, writer.getStatus)
  return { ...writer, status }
}
