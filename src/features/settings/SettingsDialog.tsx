import { staticText } from '../../ui/staticText'
import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { PRAYER_PROVIDERS } from '../../data/prayerProviders'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { selectionFromSettings } from '../../domain/calculationSettings'
import type { CalculationProfileCapability, CalculationProfileId, CalculationSettings } from '../../domain/prayerCalculation'
import type { Appearance } from '../../storage/database'
import { StaticContent } from '../../ui/StaticContent'
import { CloseIcon } from '../../ui/Icons'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'
import { AdvancedSettings } from './AdvancedSettings'

interface SettingsDialogProps {
  returnFocusId?: string | null
  appearance?: Appearance
  onAppearanceChange?: (value: Appearance) => void
  placeLabel?: string
  timeZone?: string
  onOpenLocation?: () => void
  onOpenShare?: () => void
  version?: string | undefined
  onReset?: () => Promise<boolean>
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
  onOpenMethodology: () => void
}

type Page = 'base' | 'time' | 'advanced' | 'data' | 'confirm'
const TITLES: Record<Page, string> = { base: 'Настройки', time: 'Время намаза', advanced: 'Расширенные настройки', data: 'Данные', confirm: 'Сбросить данные приложения?' }

export function SettingsDialog({ persistenceNotice, preferences, onSourceChange, open, officialMode, settings,
  focusMethodologyOnOpen, methodologyTriggerRef, getCalculationProfileCapability, onClose, onOpenMethodology,
  returnFocusId, appearance = 'system', onAppearanceChange, placeLabel = 'Выберите место', timeZone, onOpenLocation,
  onOpenShare, version, onReset,
}: SettingsDialogProps) {
  const [pageFocusId, setPageFocusId] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('base')
  const [resetStatus, setResetStatus] = useState<'idle' | 'busy' | 'failed'>('idle')
  const closeRef = useRef<HTMLButtonElement>(null)
  const go = useCallback((next: Page, focusId?: string) => {
    setPage(next)
    setPageFocusId(focusId ?? null)
  }, [])
  const close = useCallback(() => {
    if (resetStatus === 'busy') return
    if (page === 'confirm') { go('data', 'reset-trigger'); return }
    setPage('base'); setPageFocusId(null); onClose()
  }, [go, onClose, page, resetStatus])
  const dialogRef = useModalDialog(open, close, focusMethodologyOnOpen ? methodologyTriggerRef : closeRef, page === 'base' && returnFocusId ? returnFocusId : pageFocusId)
  const layerRef = useDialogViewport(open)
  if (!open) return null
  const automatic = () => onSourceChange(automaticPreferences(preferences.calculationDraft))
  return <div ref={layerRef} className="dialog-layer" onPointerDown={event => event.target === event.currentTarget && close()}>
    <section ref={dialogRef} aria-labelledby="settings-dialog-title" aria-modal="true" className="location-dialog settings-dialog" role="dialog" tabIndex={-1}>
      <div className="dialog-handle" aria-hidden="true" />
      <header className="dialog-header"><h2 id="settings-dialog-title">{TITLES[page]}</h2><button ref={closeRef} className="icon-button" type="button" aria-label="Закрыть" onClick={close} disabled={resetStatus === 'busy'}><CloseIcon /></button></header>
      {page !== 'base' && page !== 'confirm' ? <button type="button" className="settings-link" onClick={() => go(page === 'advanced' ? 'time' : 'base', page === 'advanced' ? 'advanced-trigger' : `${page}-trigger`)}>← Назад</button> : null}
      {persistenceNotice}
      {page === 'base' ? <>
        <button className="settings-link" id="settings-location" type="button" onClick={onOpenLocation}>Местоположение · {placeLabel}</button>
        {timeZone ? <p className="settings-mode-note">Часовой пояс места: {timeZone}. Зона таблицы указана в сведениях об источнике.</p> : null}
        <button className="settings-link" id="time-trigger" type="button" onClick={() => go('time')}>Время намаза</button>
        <p className="settings-mode-note">Определение времени: <strong>{preferences.mode === 'automatic' ? 'Автоматически — рекомендуется' : 'Вручную — автоматический выбор отключён'}</strong></p>
        {preferences.mode === 'manual' ? <button className="primary-button" type="button" onClick={automatic}>Вернуться к автоматическому выбору</button> : null}
        <label className="setting-field"><span>Оформление</span><select value={appearance} onChange={event => onAppearanceChange?.(event.target.value as Appearance)}><option value="system">Системное</option><option value="light">Светлое</option><option value="dark">Тёмное</option></select></label>
        <button className="settings-link" id="data-trigger" type="button" onClick={() => go('data')}>Данные</button>
        <button className="settings-link share-button" id="settings-share" type="button" onClick={onOpenShare}>Поделиться</button>
        <a className="settings-link" href={`${import.meta.env.BASE_URL}privacy/`}>Конфиденциальность</a>
        {version ? <small className="app-version">{version}</small> : null}
      </> : null}
      {page === 'time' ? <>
        <p className="settings-mode-note">{preferences.mode === 'automatic' ? staticText('settings-copy-3') : 'Источник выбран вручную. Автоматический выбор отключён.'}</p>
        {preferences.mode === 'manual' ? <button className="primary-button" type="button" onClick={automatic}>Вернуться к автоматическому выбору</button> : null}
        <p className="settings-mode-note">{officialMode ? staticText('settings-copy-4') : 'Сейчас используется расчётное время.'}</p>
        <p className="settings-mode-note">{staticText('settings-copy-1')}</p>
        <label className="setting-field"><span>Источник</span><select aria-label="Источник" value={preferences.mode === 'automatic' ? 'automatic' : preferences.source.kind === 'official' ? preferences.source.provider : 'calculated'} onChange={event => {
          const value = event.target.value
          onSourceChange(value === 'automatic' ? automaticPreferences(preferences.calculationDraft) : value === 'calculated' ? manualCalculation(preferences.calculationDraft ?? selectionFromSettings(settings)) : { mode: 'manual', source: { kind: 'official', provider: value }, ...(preferences.calculationDraft ? {calculationDraft: preferences.calculationDraft} : {}) })
        }}><option value="automatic">Автоматически — рекомендуется</option><option value="calculated">Ручной расчёт</option>{PRAYER_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>Официальный · {provider.label}</option>)}</select></label>
        <button className="settings-link" id="advanced-trigger" type="button" onClick={() => go('advanced')}>Расширенные настройки</button>
      </> : null}
      {page === 'advanced' ? <AdvancedSettings settings={settings} onSourceChange={onSourceChange} getCapability={getCalculationProfileCapability} methodologyRef={methodologyTriggerRef} onOpenMethodology={onOpenMethodology} /> : null}
      {page === 'data' ? <>
        <p className="settings-mode-note">{staticText('settings-copy-2')}</p>
        <button id="reset-trigger" className="settings-link danger-button" type="button" onClick={() => {setResetStatus('idle'); go('confirm')}}>Сбросить данные приложения</button>
      </> : null}
      {page === 'confirm' ? <>
        <StaticContent id="reset-description" />
        {resetStatus === 'failed' ? <p role="alert">Не удалось сбросить данные. Повторите попытку.</p> : null}
        <button className="primary-button" type="button" disabled={resetStatus === 'busy'} onClick={() => go('data', 'reset-trigger')}>Отмена</button>
        <button className="settings-link danger-button" type="button" disabled={resetStatus === 'busy'} onClick={() => { void (async () => {
          setResetStatus('busy')
          try { setResetStatus(await onReset?.() ? 'idle' : 'failed') } catch { setResetStatus('failed') }
        })() }}>{resetStatus === 'busy' ? 'Удаляем данные…' : resetStatus === 'failed' ? 'Повторить сброс' : 'Удалить данные'}</button>
      </> : null}
    </section>
  </div>
}
