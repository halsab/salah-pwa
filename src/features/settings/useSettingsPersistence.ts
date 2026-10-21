import { useMemo, useSyncExternalStore } from 'react'
import { createSettingsPersistence, type SaveSettings } from './settingsPersistence'

export function useSettingsPersistence(save: SaveSettings, reserveSelectionOrder: () => Promise<number>,
  readCommittedSelectionOrder: () => Promise<number | undefined>) {
  const writer = useMemo(() => createSettingsPersistence(save, reserveSelectionOrder, readCommittedSelectionOrder),
    [save, reserveSelectionOrder, readCommittedSelectionOrder])
  const status = useSyncExternalStore(writer.subscribe, writer.getStatus)
  return { ...writer, status }
}
