import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { SettingsScreens } from './SettingsScreens'
import type { AppScreen } from '../../ui/useAppNavigation'
const defaults = { onBack: vi.fn(), onOpen: vi.fn(), sourceLabel: 'ДУМ РТ', getCapability: () => ({ supported: true as const }), onReset: vi.fn(), version: 'v26.4' }

describe('новые настройки', () => {
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
    expect(screen.queryByText('Профиль')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Аср' }), 'standard')
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19, adjustments: { isha: 10 }, asrMethod: 'standard' } }))
    await userEvent.click(screen.getByRole('button', { name: 'По профилю' }))
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation({ profile: 'karachi', overrides: { asrMethod: 'standard' } }))
  })
  it('явный выбор нового профиля заменяет старые поправки и сразу возвращает назад', async () => {
    const onChange = vi.fn(), onBack = vi.fn()
    render(<SettingsScreens {...defaults} onBack={onBack} screen="profiles" preferences={manualCalculation({ profile: 'karachi', overrides: { fajrAngle: 19 } })} onChange={onChange} />)
    expect(screen.getByText('Выбор профиля заменит прежние поправки')).toBeVisible()
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
    expect(onChange).toHaveBeenLastCalledWith(automaticPreferences(draft))
    await userEvent.click(screen.getByRole('button', { name: 'Таблица ДУМ РТ' }))
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'manual', source: { kind: 'official', provider: 'dumRt' }, calculationDraft: draft })
    await userEvent.click(screen.getByRole('button', { name: 'Ручной расчёт' }))
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation(draft))
  })
  it('показывает неподдерживаемый профиль недоступным', () => {
    render(<SettingsScreens {...defaults} screen="profiles" preferences={automaticPreferences()} onChange={vi.fn()} getCapability={profile => profile === 'ummAlQura' ? { supported: false, reason: 'Нет календаря' } : { supported: true }} />)
    expect(screen.getByRole('button', { name: 'Умм аль-Кура' })).toBeDisabled()
    expect(screen.getByText('Нет календаря')).toBeVisible()
  })
  it('позволяет открыть все пункты меню без дополнительных разделов', async () => {
    const onOpen = vi.fn<(screen: AppScreen) => void>()
    render(<SettingsScreens {...defaults} screen="settings" preferences={automaticPreferences()} onChange={vi.fn()} onOpen={onOpen} />)
    for (const [name, target] of [['Расписание ДУМ РТ', 'source'], ['Данные и конфиденциальность', 'privacy'], ['О приложении', 'about'], ['Поделиться', 'share']] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(onOpen).toHaveBeenLastCalledWith(target)
    }
    expect(screen.queryByText('Часовой пояс')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Оформление')).not.toBeInTheDocument()
  })
})
