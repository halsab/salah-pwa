import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { resolvePrayerTimeSource, type OfficialDatasetAvailability } from '../../domain/prayerSource'
import { createOfficialPlace } from '../../domain/place'
import { SettingsScreens } from './SettingsScreens'
const defaults = { onBack: vi.fn(), onOpen: vi.fn(), sourceLabel: 'ДУМ РТ', themeFamily: 'classic' as const, onThemeFamilyChange: vi.fn(), getCapability: () => ({ supported: true as const }), onReset: vi.fn(), version: 'v26.4' }
const place = createOfficialPlace({ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }, 0)
const official: OfficialDatasetAvailability = { provider: 'dumRt', priority: 10, timeZone: 'Europe/Moscow', coverage: 'RU-TA', years: [2026], locations: [{ id: 'kazan', name: 'Казань', latitude: 55.79, longitude: 49.12 }], state: 'ready', version: 'v1', revision: 'r1' }

describe('новые настройки', () => {
  it('представляет режим поста переключателем и передаёт новое состояние', async () => {
    const onFastingModeChange = vi.fn()
    const props = { ...defaults, preferences: automaticPreferences(), onChange: vi.fn(), onFastingModeChange }
    const { rerender } = render(<SettingsScreens {...props} screen="settings" fastingModeEnabled={false} />)
    const toggle = screen.getByRole('switch', { name: 'Режим поста' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)
    expect(onFastingModeChange).toHaveBeenCalledWith(true)
    rerender(<SettingsScreens {...props} screen="settings" fastingModeEnabled />)
    expect(screen.getByRole('switch', { name: 'Режим поста' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{Enter}')
    expect(onFastingModeChange).toHaveBeenLastCalledWith(false)
  })

  it('блокирует повторное удаление во время операции и даёт повторить при ошибке', async () => {
    let resolve!: (value: boolean) => void
    const onReset = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValue(true)
    render(<SettingsScreens {...defaults} screen="reset" preferences={automaticPreferences()} onChange={vi.fn()} onReset={onReset} />)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить данные' }))
    expect(screen.getByRole('button', { name: 'Удаляем данные…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
    await act(async () => { resolve(false); await Promise.resolve() })
    expect(screen.getByRole('alert')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onReset).toHaveBeenCalledTimes(2)
  })
  it.each<[SourcePreferences, boolean, boolean]>([
    [automaticPreferences(), false, false],
    [{ mode: 'manual', source: { kind: 'official', provider: 'dumRt' } }, true, false],
    [manualCalculation({ profile: 'karachi', overrides: {} }), false, true],
  ])('показывает только относящиеся к способу пункты', (preferences, table, manual) => {
    render(<SettingsScreens {...defaults} screen="source" preferences={preferences} onChange={vi.fn()} />)
    expect(Boolean(screen.queryByRole('button', { name: 'Таблица' }))).toBe(table)
    expect(Boolean(screen.queryByRole('button', { name: 'Параметры' }))).toBe(manual)
    expect(Boolean(screen.queryByRole('button', { name: /Профиль/ }))).toBe(manual)
    expect(screen.queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument()
  })
  it('не дублирует профиль в параметрах и сохраняет скрытые поправки до явного сброса', async () => {
    const onChange = vi.fn()
    function Harness() {
      const [preferences, setPreferences] = useState(manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19, adjustments: { isha: 10 } } }))
      return <SettingsScreens {...defaults} screen="parameters" preferences={preferences} onChange={value => { setPreferences(value); onChange(value) }} />
    }
    render(<Harness />)
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Аср' }), 'standard')
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19, adjustments: { isha: 10 }, asrMethod: 'standard' } }))
    await userEvent.click(screen.getByRole('button', { name: 'По профилю' }))
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation({ profile: 'karachi', overrides: { asrMethod: 'standard' } }))
  })
  it('явный выбор нового профиля заменяет старые поправки и сразу возвращает назад', async () => {
    const onChange = vi.fn(), onBack = vi.fn()
    render(<SettingsScreens {...defaults} onBack={onBack} screen="profiles" preferences={manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19 } })} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'ДУМ РТ' }))
    expect(onChange).toHaveBeenCalledWith(manualCalculation({ profile: 'dumRt', overrides: {} }))
    expect(onBack).toHaveBeenCalledOnce()
  })
  it('сохраняет черновик при переключении способов', async () => {
    const draft = { profile: 'karachi' as const, overrides: { fajrAngle: 19 } }
    const onChange = vi.fn()
    function Harness() {
      const [preferences, setPreferences] = useState(manualCalculation(draft))
      return <SettingsScreens {...defaults} screen="source-choice" preferences={preferences} onChange={value => { setPreferences(value); onChange(value) }} />
    }
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Автоматически' }))
    expect(onChange).toHaveBeenLastCalledWith(automaticPreferences(draft, { kind: 'calculated', calculation: draft }))
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation(draft))
    expect(screen.queryByRole('button', { name: 'Таблица ДУМ РТ' })).not.toBeInTheDocument()
  })

  it('uses the effective automatic calculation as the first manual selection', async () => {
    const selected = { profile: 'dumRf' as const, overrides: { asrMethod: 'standard' as const, highLatitudeRule: 'seventhOfNight' as const } }
    const onChange = vi.fn()
    render(<SettingsScreens {...defaults} screen="source-choice" preferences={automaticPreferences()} initialManualCalculation={selected} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(onChange).toHaveBeenCalledWith(manualCalculation(selected))
  })
  it('requires explicit profile choice when first-time Manual has no reliable automatic calculation', async () => {
    const onOpen = vi.fn(), onChange = vi.fn()
    render(<SettingsScreens {...defaults} screen="source-choice" preferences={automaticPreferences()} onOpen={onOpen} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(onOpen).toHaveBeenCalledWith('profiles')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('restores the pinned official provider and source kind across a complete mode cycle', async () => {
    const saved = { mode: 'manual' as const, source: { kind: 'official' as const, provider: 'dumRt' }, calculationDraft: { profile: 'karachi' as const, overrides: { asrMethod: 'hanafi' as const } } }
    let latest: SourcePreferences = saved
    function Harness() {
      const [preferences, setPreferences] = useState<SourcePreferences>(saved)
      return <SettingsScreens {...defaults} screen="source-choice" preferences={preferences} onChange={value => { latest = value; setPreferences(value) }} />
    }
    render(<Harness />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Автоматически' }))
    expect(latest).toMatchObject({ mode: 'automatic', manualSourceDraft: { kind: 'official', provider: 'dumRt' } })
    expect(resolvePrayerTimeSource(place, '2026-09-01', latest, [official])).toMatchObject({ kind: 'official', provider: 'dumRt', status: 'ready' })
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(screen.getByRole('button', { name: /Ручной выбор.*Выбрано/ })).toBeVisible()
    expect(latest).toMatchObject({ mode: 'manual', source: { kind: 'official', provider: 'dumRt' }, calculationDraft: saved.calculationDraft })
    expect(resolvePrayerTimeSource(place, '2026-09-01', latest, [official])).toMatchObject({ kind: 'official', provider: 'dumRt', status: 'ready' })
  })
  it('показывает неподдерживаемый профиль недоступным', () => {
    render(<SettingsScreens {...defaults} screen="profiles" preferences={automaticPreferences()} onChange={vi.fn()} getCapability={profile => profile === 'ummAlQura' ? { supported: false, reason: 'ummAlQuraUnavailable' } : { supported: true }} />)
    expect(screen.getByRole('button', { name: 'Умм аль-Кура' })).toBeDisabled()
  })

})
