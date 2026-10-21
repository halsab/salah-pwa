import { useMemo, useSyncExternalStore } from 'react'
import { createSettingsPersistence, type SaveSettings } from './settingsPersistence'

export function useSettingsPersistence(save: SaveSettings) {
  const writer = useMemo(() => createSettingsPersistence(save), [save])
  const status = useSyncExternalStore(writer.subscribe, writer.getStatus)
  return { ...writer, status }
}
