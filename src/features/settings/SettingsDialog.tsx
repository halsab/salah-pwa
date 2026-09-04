import { useRef, type RefObject } from 'react'

import {
  CALCULATION_PROFILES,
  type CalculationProfileId,
  type CalculationSettings,
  type HighLatitudeMethod,
} from '../../domain/prayerCalculation'
import { CloseIcon } from '../../ui/Icons'
import { ASR_METHOD_LABELS } from '../../ui/calculationLabels'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'

interface SettingsDialogProps {
  open: boolean
  officialMode: boolean
  settings: CalculationSettings
  focusMethodologyOnOpen: boolean
  methodologyTriggerRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onChange: (settings: CalculationSettings) => void
  onOpenMethodology: () => void
}

export function SettingsDialog({
  open,
  officialMode,
  settings,
  focusMethodologyOnOpen,
  methodologyTriggerRef,
  onClose,
  onChange,
  onOpenMethodology,
}: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(
    open,
    onClose,
    focusMethodologyOnOpen ? methodologyTriggerRef : closeRef,
  )
  const layerRef = useDialogViewport(open)
  if (!open) return null

  const update = <Key extends keyof CalculationSettings>(
    key: Key,
    value: CalculationSettings[Key],
  ) => onChange({ ...settings, [key]: value })

  return (
    <div ref={layerRef} className="dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className="location-dialog settings-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <h2 id="settings-dialog-title">Настройки расчёта</h2>
          <button ref={closeRef} className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <p className="settings-mode-note" data-active={!officialMode || undefined}>
          {officialMode
            ? 'Сейчас используется готовое расписание ДУМ РТ. Эти параметры сохранятся и применятся после выбора города вне Татарстана.'
            : 'Сейчас расписание пересчитывается по этим параметрам. Изменения применяются сразу.'}
        </p>

        <label className="setting-field">
          <span>Аср</span>
          <select
            aria-label="Аср"
            value={settings.asrMethod}
            onChange={(event) => update('asrMethod', event.target.value as CalculationSettings['asrMethod'])}
          >
            <option value="hanafi">{ASR_METHOD_LABELS.hanafi}</option>
            <option value="standard">{ASR_METHOD_LABELS.standard}</option>
          </select>
        </label>

        <label className="setting-field">
          <span>Профиль</span>
          <select
            aria-label="Профиль"
            value={settings.profile}
            onChange={(event) => update('profile', event.target.value as CalculationProfileId)}
          >
            {CALCULATION_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>

        <label className="setting-field">
          <span>Северные правила</span>
          <select
            aria-label="Северные правила"
            value={settings.highLatitudeRule}
            onChange={(event) => update('highLatitudeRule', event.target.value as HighLatitudeMethod)}
          >
            <option value="dumRt">ДУМ РТ · 120/90 мин</option>
            <option value="seventhOfNight">1/7 ночи</option>
            <option value="twilightAngle">Доля ночи по углу</option>
            <option value="nearestDay">Ближайший день</option>
          </select>
        </label>

        <button
          ref={methodologyTriggerRef}
          className="methodology-settings-trigger"
          type="button"
          onClick={onOpenMethodology}
        >
          Как рассчитывается время
        </button>
      </section>
    </div>
  )
}
