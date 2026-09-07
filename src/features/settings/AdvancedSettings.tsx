import { staticText } from '../../ui/staticText'
import { useState, type RefObject } from 'react'
import { CALCULATED_KEYS } from '../../domain/calculationSettings'
import { CALCULATION_PROFILES, type CalculationProfileCapability, type CalculationProfileId, type CalculationSettings } from '../../domain/prayerCalculation'
import { manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { ASR_METHOD_LABELS, EVENT_LABELS, HIGH_LATITUDE_LABELS } from '../../ui/calculationLabels'
import { readCalculationForm } from './calculationForm'


export function AdvancedSettings({ settings, onSourceChange, getCapability, methodologyRef, onOpenMethodology }: {
  settings: CalculationSettings
  onSourceChange: (value: SourcePreferences) => void
  getCapability: (id: CalculationProfileId) => CalculationProfileCapability
  methodologyRef: RefObject<HTMLButtonElement | null>
  onOpenMethodology: () => void
}) {
  const [ishaKind, setIshaKind] = useState(settings.isha?.kind ?? 'default')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  return <form noValidate onChange={() => setSaved(false)} onSubmit={event => {
    event.preventDefault()
    const selection = readCalculationForm(new FormData(event.currentTarget), settings)
    if (!selection || !getCapability(selection.profile).supported) {
      setError(staticText('advanced-copy-3'))
      return
    }
    setError(null); setSaved(true); onSourceChange(manualCalculation(selection))
  }}>
    <p className="settings-mode-note">{staticText('advanced-copy-1')}</p>
    <label className="setting-field"><span>Профиль</span><select aria-label="Профиль" name="profile" defaultValue={settings.profile}>
      {CALCULATION_PROFILES.map(profile => <option key={profile.id} value={profile.id} disabled={!getCapability(profile.id).supported}>{profile.label}</option>)}
    </select></label>
    {CALCULATION_PROFILES.map(profile => { const capability = getCapability(profile.id); return capability.supported ? null : <p className="settings-mode-note" key={profile.id}>{capability.reason}</p> })}
    <label className="setting-field"><span>Аср</span><select aria-label="Аср" name="asrMethod" defaultValue={settings.asrMethod}>
      {Object.entries(ASR_METHOD_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>
    <label className="setting-field"><span>Северные правила</span><select aria-label="Северные правила" name="highLatitudeRule" defaultValue={settings.highLatitudeRule}>
      {Object.entries(HIGH_LATITUDE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>
    <p className="settings-mode-note">{staticText('advanced-copy-2')}</p>
    <label className="setting-field"><span>Угол Фаджра, °</span><input name="fajrAngle" inputMode="decimal" defaultValue={settings.fajrAngle ?? ''} placeholder="По профилю" /></label>
    <label className="setting-field"><span>Способ Иша</span><select name="ishaKind" value={ishaKind} onChange={event => setIshaKind(event.target.value)}><option value="default">По профилю</option><option value="angle">Угол</option><option value="interval">Минуты после заката</option></select></label>
    {ishaKind !== 'default' ? <label className="setting-field"><span>{ishaKind === 'angle' ? 'Угол Иша, °' : 'Интервал Иша, мин'}</span><input key={ishaKind} name="ishaValue" inputMode="decimal" defaultValue={settings.isha?.kind === ishaKind ? settings.isha.kind === 'angle' ? settings.isha.angle : settings.isha.minutes : ''} /></label> : null}
    <fieldset className="adjustment-fields"><legend>Ручные поправки, минуты</legend>{CALCULATED_KEYS.map(key => <label className="setting-field" key={key}><span>{EVENT_LABELS[key]}</span><input aria-label={`Поправка: ${EVENT_LABELS[key]}`} name={key} inputMode="text" defaultValue={settings.adjustments?.[key] ?? ''} placeholder="0" /></label>)}</fieldset>
    {error ? <p role="alert">{error}</p> : null}
    {saved ? <p role="status">Ручной расчёт применён</p> : null}
    <button type="submit" className="primary-button">Применить ручной расчёт</button>
    <button ref={methodologyRef} className="methodology-settings-trigger" type="button" onClick={onOpenMethodology}>Как рассчитывается время</button>
  </form>
}
