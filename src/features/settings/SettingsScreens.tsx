import { useEffect, useRef, useState, type ReactNode } from 'react'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { effectiveCalculationSettings } from '../../domain/calculationSettings'
import { CALCULATION_PROFILES, type CalculationProfileCapability, type CalculationProfileId, type HighLatitudeMethod } from '../../domain/prayerCalculation'
import { HIGH_LATITUDE_LABELS } from '../../ui/calculationLabels'
import { BackButton, Screen } from '../../ui/Screen'
import { ActionRow, Button, ScreenFooter } from '../../ui/controls'
import { MarkdownArticle } from '../../ui/MarkdownArticle'
import { PRIVACY_ARTICLE, aboutArticle } from '../../content/informationArticles'
import type { AppScreen } from '../../ui/useAppNavigation'
import type { ThemeFamily } from '../../domain/theme'

interface SettingsScreensProps {
  screen: AppScreen
  preferences: SourcePreferences
  sourceLabel: string
  themeFamily: ThemeFamily
  onThemeFamilyChange: (family: ThemeFamily) => void
  onChange: (preferences: SourcePreferences) => void
  onOpen: (screen: AppScreen) => void
  onBack: () => void
  getCapability: (profile: CalculationProfileId) => CalculationProfileCapability
  onReset: () => Promise<boolean>
  notice?: ReactNode
  version?: string | undefined
}

export function SettingsScreens({ screen, preferences, sourceLabel, themeFamily, onThemeFamilyChange, onChange, onOpen, onBack, getCapability, onReset, notice, version }: SettingsScreensProps) {
  const calculation = preferences.mode === 'manual' && preferences.source.kind === 'calculated' ? preferences.source.calculation
    : preferences.calculationDraft ?? { profile: 'muslimWorldLeague', overrides: {} }
  const parameters = effectiveCalculationSettings(calculation)
  const mode = preferences.mode === 'automatic' ? 'automatic' : preferences.source.kind === 'official' ? 'official' : 'calculated'
  const profileLabel = CALCULATION_PROFILES.find(profile => profile.id === calculation.profile)?.label ?? ''
  const legacy = calculation.overrides.fajrAngle !== undefined || calculation.overrides.isha !== undefined || Object.keys(calculation.overrides.adjustments ?? {}).length > 0
  const top = <BackButton onClick={onBack} />
  const row = (id: string, title: string, target: AppScreen, value?: string) => <ActionRow id={id} title={title} value={value} aria-label={value ? `${title} ${value}` : title} onClick={() => onOpen(target)} />
  if (screen === 'settings') return <Screen label="Настройки" top={top} contentClassName="settings-menu" bottom={<ScreenFooter align="end"><Button variant="auxiliary" id="settings-share" onClick={() => onOpen('share')}>Поделиться</Button></ScreenFooter>}>
    <div className="screen-stack">{row('settings-source', 'Расписание', 'source', sourceLabel)}
      <label className="pill pill-row theme-field"><span>Тема</span><span className="note">{themeFamily === 'classic' ? 'Классическая' : 'Сезонная'}</span>
        <select aria-label="Тема" value={themeFamily} onChange={event => onThemeFamilyChange(event.target.value as ThemeFamily)}>
          <option value="classic">Классическая</option><option value="seasonal">Сезонная</option>
        </select>
      </label>
      {row('settings-privacy', 'Данные и конфиденциальность', 'privacy')}{row('settings-about', 'О приложении', 'about')}{notice}</div>
  </Screen>
  if (screen === 'source') return <Screen label="Источник расписания" top={top} bottom={<ScreenFooter align="end"><Button variant="auxiliary" id="source-info" onClick={() => onOpen('source-info')}>О расписании</Button></ScreenFooter>}>
    <p className="screen-heading">Расписание</p><h1 className="screen-title">{mode === 'automatic' ? 'Автоматически' : mode === 'official' ? 'Официальная таблица' : 'Ручной расчёт'}</h1>
    <p className="note screen-space">{mode === 'automatic' ? 'Официальная таблица используется, если она доступна для места и даты. Иначе время рассчитывается по региону.' : mode === 'official' ? 'Используется выбранная официальная таблица без пересчёта. Если для места или даты данных нет, расписание не подменяется расчётом.' : 'Время рассчитывается на устройстве по выбранному профилю, координатам и дате.'}</p>
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
      {choices.map(choice => <ActionRow key={choice.id} title={choice.label} value={choice.id === mode ? 'Выбрано' : undefined} aria-pressed={choice.id === mode} onClick={() => { onChange(choice.value); onBack() }} />
      )}{notice}
    </div></Screen>
  }
  if (screen === 'profiles') return <Screen label="Профиль расчёта" top={top}><h1 className="screen-heading">Профиль расчёта</h1>
    {legacy ? <p className="note screen-space">Выбор профиля заменит прежние поправки</p> : null}
    <div className="screen-stack screen-space">{CALCULATION_PROFILES.map(profile => {
      const capability = getCapability(profile.id)
      return <div key={profile.id}><ActionRow title={profile.label} value={calculation.profile === profile.id ? 'Выбрано' : undefined} disabled={!capability.supported} aria-pressed={calculation.profile === profile.id}
        onClick={() => { onChange(manualCalculation({ profile: profile.id, overrides: {} })); onBack() }} />
        {!capability.supported ? <p className="note">{capability.reason}</p> : null}</div>
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
      {legacy ? <div className="screen-stack"><p className="note">Сохранены прежние поправки</p><Button onClick={() => {
        const { fajrAngle: _angle, isha: _isha, adjustments: _adjustments, ...overrides } = calculation.overrides
        onChange(manualCalculation({ ...calculation, overrides }))
      }}>По профилю</Button></div> : null}{notice}
    </div>
  </Screen>
  if (screen === 'privacy') return <Screen label="Данные и конфиденциальность" top={top} bottom={<ScreenFooter><Button variant="primary" id="reset-trigger" onClick={() => onOpen('reset')}>Удалить данные</Button></ScreenFooter>}>
    <MarkdownArticle content={PRIVACY_ARTICLE} />{notice}
  </Screen>
  if (screen === 'about') return <Screen label="О приложении" top={top}><MarkdownArticle content={aboutArticle(version)} /></Screen>
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
  return <Screen label="Удаление данных" top={<Button data-screen-focus onClick={onBack} disabled={status === 'busy'}>Назад</Button>}
    bottom={<ScreenFooter><Button variant="primary" onClick={() => void reset()} disabled={status === 'busy'}>{status === 'busy' ? 'Удаляем данные…' : status === 'failed' ? 'Повторить' : 'Удалить данные'}</Button></ScreenFooter>}>
    <p className="screen-title">Удалить данные?</p><p className="screen-copy screen-space">Место, координаты, настройки, недавние города и сохранённые расписания будут удалены во всех вкладках.</p><p className="note screen-space">Приложение и публичные справочники останутся. Отменить удаление нельзя.</p>
    {status === 'failed' ? <p className="note screen-space" role="alert">Не удалось удалить данные</p> : null}
  </Screen>
}
