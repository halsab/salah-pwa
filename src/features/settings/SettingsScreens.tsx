import { useEffect, useRef, useState, type ReactNode } from 'react'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { effectiveCalculationSettings } from '../../domain/calculationSettings'
import { CALCULATION_PROFILES, type CalculationProfileCapability, type CalculationProfileId, type HighLatitudeMethod } from '../../domain/prayerCalculation'
import { HIGH_LATITUDE_LABELS } from '../../ui/calculationLabels'
import { BackButton, Screen } from '../../ui/Screen'
import { StaticContent } from '../../ui/StaticContent'
import type { AppScreen } from '../../ui/useAppNavigation'

interface SettingsScreensProps {
  screen: AppScreen
  preferences: SourcePreferences
  sourceLabel: string
  onChange: (preferences: SourcePreferences) => void
  onOpen: (screen: AppScreen) => void
  onBack: () => void
  getCapability: (profile: CalculationProfileId) => CalculationProfileCapability
  onReset: () => Promise<boolean>
  notice?: ReactNode
  version?: string | undefined
}

export function SettingsScreens({ screen, preferences, sourceLabel, onChange, onOpen, onBack, getCapability, onReset, notice, version }: SettingsScreensProps) {
  const calculation = preferences.mode === 'manual' && preferences.source.kind === 'calculated' ? preferences.source.calculation
    : preferences.calculationDraft ?? { profile: 'muslimWorldLeague', overrides: {} }
  const parameters = effectiveCalculationSettings(calculation)
  const mode = preferences.mode === 'automatic' ? 'automatic' : preferences.source.kind === 'official' ? 'official' : 'calculated'
  const profileLabel = CALCULATION_PROFILES.find(profile => profile.id === calculation.profile)?.label ?? ''
  const legacy = calculation.overrides.fajrAngle !== undefined || calculation.overrides.isha !== undefined || Object.keys(calculation.overrides.adjustments ?? {}).length > 0
  const top = <BackButton onClick={onBack} />
  const row = (id: string, title: string, target: AppScreen, value?: string) => <button className="pill pill-row" id={id} aria-label={value ? `${title} ${value}` : title} type="button" onClick={() => onOpen(target)}><span>{title}</span>{value ? <span className="note">{value}</span> : null}</button>
  if (screen === 'settings') return <Screen label="Настройки" top={top} contentClassName="settings-menu" bottom={<button id="settings-share" className="pill screen-end" type="button" onClick={() => onOpen('share')}>Поделиться</button>}>
    <div className="screen-stack">{row('settings-source', 'Расписание', 'source', sourceLabel)}{row('settings-privacy', 'Данные и конфиденциальность', 'privacy')}{row('settings-about', 'О приложении', 'about')}{notice}</div>
  </Screen>
  if (screen === 'source') return <Screen label="Источник расписания" top={top} bottom={<button id="source-info" className="pill" type="button" onClick={() => onOpen('source-info')}>О расписании</button>}>
    <p className="screen-heading">Расписание</p><h1 className="screen-title">{mode === 'automatic' ? 'Автоматически' : mode === 'official' ? 'Официальная таблица' : 'Ручной расчёт'}</h1>
    <div className="screen-stack screen-space">
      {row('source-method', 'Способ', 'source-choice', mode === 'automatic' ? 'Авто' : mode === 'official' ? 'ДУМ РТ' : 'Ручной')}
      {mode === 'official' ? row('source-table', 'Таблица', 'source-info') : null}
      {mode === 'calculated' ? <>{row('source-profile', 'Профиль', 'profiles', profileLabel)}{row('source-parameters', 'Параметры', 'parameters')}</> : null}
      {notice}
    </div>
  </Screen>
  if (screen === 'source-choice') {
    const choices = [
      { id: 'automatic', label: 'Автоматически', value: automaticPreferences(calculation) },
      { id: 'official', label: 'Таблица ДУМ РТ', value: { mode: 'manual', source: { kind: 'official', provider: 'dumRt' }, calculationDraft: calculation } as SourcePreferences },
      { id: 'calculated', label: 'Ручной расчёт', value: manualCalculation(calculation) },
    ]
    return <Screen label="Выбор способа" top={top}><h1 className="screen-heading">Выбор расписания</h1><div className="screen-stack screen-space">
      {choices.map(choice => <button className="pill pill-row" key={choice.id} type="button" aria-pressed={choice.id === mode} onClick={() => { onChange(choice.value); onBack() }}>
        <span>{choice.label}</span>{choice.id === mode ? <span className="note">Выбрано</span> : null}
      </button>)}{notice}
    </div></Screen>
  }
  if (screen === 'profiles') return <Screen label="Профиль расчёта" top={top}><h1 className="screen-heading">Профиль расчёта</h1>
    {legacy ? <p className="note screen-space">Выбор профиля заменит прежние поправки</p> : null}
    <div className="screen-stack screen-space">{CALCULATION_PROFILES.map(profile => {
      const capability = getCapability(profile.id)
      return <div key={profile.id}><button className="pill pill-row" type="button" disabled={!capability.supported} aria-pressed={calculation.profile === profile.id}
        onClick={() => { onChange(manualCalculation({ profile: profile.id, overrides: {} })); onBack() }}>
        <span>{profile.label}</span>{calculation.profile === profile.id ? <span className="note">Выбрано</span> : null}
      </button>{!capability.supported ? <p className="note">{capability.reason}</p> : null}</div>
    })}{notice}</div>
  </Screen>
  if (screen === 'parameters') return <Screen label="Параметры расчёта" top={top}>
    <div className="screen-stack">
      <label className="screen-field"><span>Аср</span><select className="select-field" value={parameters.asrMethod} onChange={event => {
        const asrMethod = event.target.value
        if (asrMethod === 'hanafi' || asrMethod === 'standard') onChange(manualCalculation({ ...calculation, overrides: { ...calculation.overrides, asrMethod } }))
      }}><option value="hanafi">Ханафитский</option><option value="standard">Остальные мазхабы</option></select></label>
      <label className="screen-field"><span>Северные правила</span><select className="select-field" value={parameters.highLatitudeRule} onChange={event => {
        const highLatitudeRule = event.target.value as HighLatitudeMethod
        if (Object.hasOwn(HIGH_LATITUDE_LABELS, highLatitudeRule)) onChange(manualCalculation({ ...calculation, overrides: { ...calculation.overrides, highLatitudeRule } }))
      }}>{Object.entries(HIGH_LATITUDE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {legacy ? <div className="screen-stack"><p className="note">Сохранены прежние поправки</p><button className="pill" type="button" onClick={() => {
        const { fajrAngle: _angle, isha: _isha, adjustments: _adjustments, ...overrides } = calculation.overrides
        onChange(manualCalculation({ ...calculation, overrides }))
      }}>По профилю</button></div> : null}{notice}
    </div>
  </Screen>
  if (screen === 'privacy') return <Screen label="Данные и конфиденциальность" top={top} bottom={<button id="reset-trigger" className="pill pill-wide" type="button" onClick={() => onOpen('reset')}>Удалить данные</button>}>
    <p className="screen-copy">Место, координаты, настройки и три недавних города — на этом устройстве.</p><p className="note screen-space">Без аккаунта и аналитики.</p>
    <a className="pill screen-space" href={`${import.meta.env.BASE_URL}privacy/`}>Конфиденциальность</a>{notice}
  </Screen>
  if (screen === 'about') return <Screen label="О приложении" top={top}><p className="screen-copy">Время намаза для выбранного места. По официальной таблице или расчёту.</p>{version ? <p className="note screen-space">Версия <span className="app-version">{version}</span></p> : null}<details className="screen-space app-details"><summary>Источники и лицензии</summary><StaticContent id="app-credits" /></details></Screen>
  if (screen === 'reset') return <ResetScreen onBack={onBack} onReset={onReset} />
  return null
}

function ResetScreen({ onBack, onReset }: { onBack: () => void; onReset: () => Promise<boolean> }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const reset = async () => {
    setStatus('busy')
    try { if (!await onReset() && active.current) setStatus('failed') }
    catch { if (active.current) setStatus('failed') }
  }
  return <Screen label="Удаление данных" top={<button className="pill" data-screen-focus type="button" onClick={onBack} disabled={status === 'busy'}>Назад</button>}
    bottom={<button className="pill pill-wide" type="button" onClick={() => void reset()} disabled={status === 'busy'}>{status === 'busy' ? 'Удаляем данные…' : status === 'failed' ? 'Повторить' : 'Удалить данные'}</button>}>
    <p className="screen-title">Удалить данные?</p><p className="screen-copy screen-space">Место, координаты, настройки, недавние города и сохранённые расписания будут удалены во всех вкладках.</p><p className="note screen-space">Приложение и публичные справочники останутся. Отменить удаление нельзя.</p>
    {status === 'failed' ? <p className="note screen-space" role="alert">Не удалось удалить данные</p> : null}
  </Screen>
}
