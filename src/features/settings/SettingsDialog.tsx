import { PRAYER_PROVIDERS } from '../../data/prayerProviders'
import { effectiveCalculationSettings, selectionFromSettings } from '../../domain/calculationSettings'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { useRef, type ReactNode, type RefObject } from 'react'

import {
  CALCULATION_PROFILES,
  type CalculationProfileCapability,
  type CalculationProfileId,
  type CalculationSettings,
  type HighLatitudeMethod,
} from '../../domain/prayerCalculation'
import { CloseIcon } from '../../ui/Icons'
import { ASR_METHOD_LABELS } from '../../ui/calculationLabels'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'

interface SettingsDialogProps {
  persistenceNotice?: ReactNode
  preferences: SourcePreferences
  onSourceChange: (preferences: SourcePreferences) => void
  open: boolean
  officialMode: boolean
  settings: CalculationSettings
  focusMethodologyOnOpen: boolean
  methodologyTriggerRef: RefObject<HTMLButtonElement | null>
  getCalculationProfileCapability: (
    profile: CalculationProfileId,
  ) => CalculationProfileCapability
  onClose: () => void
  onChange: (settings: CalculationSettings) => void
  onOpenMethodology: () => void
}

export function SettingsDialog({
  persistenceNotice,
  preferences,
  onSourceChange,
  open,
  officialMode,
  settings,
  focusMethodologyOnOpen,
  methodologyTriggerRef,
  getCalculationProfileCapability,
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
  const ummAlQuraCapability = getCalculationProfileCapability('ummAlQura')

  const update = <Key extends keyof CalculationSettings>(
    key: Key,
    value: CalculationSettings[Key],
  ) => {
    onChange(key === 'profile'
      ? effectiveCalculationSettings({ profile: value as CalculationProfileId, overrides: preferences.mode === 'manual' && preferences.source.kind === 'calculated' ? preferences.source.calculation.overrides : {} })
      : { ...settings, [key]: value })
  }

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
        {persistenceNotice}

        <label className="setting-field">
          <span>Источник</span>
          <select aria-label="Источник" value={preferences.mode === 'automatic' ? 'automatic' : preferences.source.kind === 'official' ? preferences.source.provider : 'calculated'}
            onChange={event => {
              const value = event.target.value
              onSourceChange(value === 'automatic' ? automaticPreferences(preferences.calculationDraft)
                : value === 'calculated' ? manualCalculation(preferences.calculationDraft ?? selectionFromSettings(settings))
                  : { mode: 'manual', source: { kind: 'official', provider: value }, ...(preferences.calculationDraft ? { calculationDraft: preferences.calculationDraft } : {}) })
            }}>
            <option value="automatic">Автоматически</option>
            <option value="calculated">Ручной расчёт</option>
            {PRAYER_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>Официальный · {provider.label}</option>)}
          </select>
        </label>
        <p className="settings-mode-note">{preferences.mode === 'automatic' ? 'Автоматический выбор источника по месту и дате.' : 'Источник выбран вручную.'}</p>
        {preferences.mode === 'manual' ? <button className="primary-button" type="button" onClick={() => onSourceChange(automaticPreferences(preferences.calculationDraft))}>Вернуться к автоматическому выбору</button> : null}

        <p className="settings-mode-note" data-active={!officialMode || undefined}>
          {officialMode
            ? 'Сейчас используется официальное расписание. Изменение параметров включит ручной расчёт.'
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
            aria-describedby={!ummAlQuraCapability.supported
              ? 'umm-al-qura-capability'
              : undefined}
            value={settings.profile}
            onChange={(event) => update('profile', event.target.value as CalculationProfileId)}
          >
            {CALCULATION_PROFILES.map((profile) => (
              <option
                disabled={profile.id === 'ummAlQura' && !ummAlQuraCapability.supported}
                key={profile.id}
                value={profile.id}
              >
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        {!ummAlQuraCapability.supported ? (
          <p id="umm-al-qura-capability" className="settings-mode-note">
            {ummAlQuraCapability.reason}
          </p>
        ) : null}

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
