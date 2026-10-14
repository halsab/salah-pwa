import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { automaticPreferences, manualCalculation, type SourcePreferences } from '../../domain/sourcePreferences'
import { resolvePrayerTimeSource, type OfficialDatasetAvailability } from '../../domain/prayerSource'
import { createOfficialPlace } from '../../domain/place'
import { SettingsScreens } from './SettingsScreens'
import type { AppScreen } from '../../ui/useAppNavigation'
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

  it('оформляет footer вспомогательным правым действием, а удаление — полноширинным', () => {
    const props = { ...defaults, preferences: automaticPreferences(), onChange: vi.fn() }
    const { rerender } = render(<SettingsScreens {...props} screen="settings" />)
    const share = screen.getByRole('button', { name: 'Поделиться' })
    expect(share).toHaveClass('pill--auxiliary')
    expect(share.closest('.screen-footer')).toHaveClass('screen-footer--end')
    rerender(<SettingsScreens {...props} screen="source" />)
    const about = screen.getByRole('button', { name: 'О расписании' })
    expect(about).toHaveClass('pill--auxiliary')
    expect(about.closest('.screen-footer')).toHaveClass('screen-footer--end')
    rerender(<SettingsScreens {...props} screen="privacy" />)
    const reset = screen.getByRole('button', { name: 'Удалить данные' })
    expect(reset).toHaveClass('pill--primary')
    expect(reset.closest('.screen-footer')).toHaveClass('screen-footer--stretch')
  })
  it('показывает privacy и about как полные статьи без вложенных переходов', async () => {
    const props = { ...defaults, preferences: automaticPreferences(), onChange: vi.fn() }
    const { rerender } = render(<SettingsScreens {...props} screen="privacy" />)
    const privacy = screen.getByRole('region', { name: 'Данные и конфиденциальность' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Конфиденциальность' })).toBeVisible()
    expect(privacy).toHaveTextContent('История перемещений и поисковых запросов не ведётся')
    expect(privacy).toHaveTextContent('GitHub Pages')
    expect(screen.queryByRole('link', { name: 'Конфиденциальность' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Удалить данные' })).toBeVisible()
    rerender(<SettingsScreens {...props} screen="about" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'О приложении' })).toBeVisible()
    expect(screen.getByText('Версия v26.4.')).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Источники и лицензии' })).toBeVisible()
    const sources = screen.getByRole('heading', { level: 2, name: 'Источники и лицензии' }).nextElementSibling
    expect(sources?.tagName).toBe('UL')
    expect(within(sources as HTMLElement).getAllByRole('listitem')).toHaveLength(5)
    expect(within(sources as HTMLElement).getByRole('link', { name: 'SIL Open Font License 1.1' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Все источники и лицензии' })).toBeVisible()
    expect(document.querySelector('details')).toBeNull()
  })
  it.each<[SourcePreferences, string]>([
    [automaticPreferences(), 'Официальная таблица используется, если она доступна для места и даты. Иначе время рассчитывается по региону.'],
    [{ mode: 'manual', source: { kind: 'official', provider: 'dumRt' } }, 'Используется выбранная официальная таблица без пересчёта. Если для места или даты данных нет, расписание не подменяется расчётом.'],
    [manualCalculation({ profile: 'karachi', overrides: {} }), 'Время рассчитывается на устройстве по выбранному профилю, координатам и дате.'],
  ])('поясняет выбранный режим расписания', (preferences, explanation) => {
    render(<SettingsScreens {...defaults} screen="source" preferences={preferences} onChange={vi.fn()} />)
    expect(screen.getByText(explanation)).toBeVisible()
  })
  it('выбирает одно из двух семейств темы прямо в корневом экране', async () => {
    const onThemeFamilyChange = vi.fn()
    render(<SettingsScreens {...defaults} screen="settings" preferences={automaticPreferences()} onChange={vi.fn()} onThemeFamilyChange={onThemeFamilyChange} />)
    const theme = screen.getByRole('combobox', { name: 'Тема' })
    expect(theme).toHaveValue('classic')
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Классическая', 'Сезонная'])
    expect(theme.closest('.pill-row')).toHaveTextContent('Классическая')
    await userEvent.selectOptions(theme, 'seasonal')
    expect(onThemeFamilyChange).toHaveBeenCalledWith('seasonal')
    expect(screen.queryByRole('region', { name: /тема/i })).not.toBeInTheDocument()
  })
  it('блокирует повторное удаление во время операции и даёт повторить при ошибке', async () => {
    let resolve!: (value: boolean) => void
    const onReset = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValue(true)
    render(<SettingsScreens {...defaults} screen="reset" preferences={automaticPreferences()} onChange={vi.fn()} onReset={onReset} />)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить данные' }))
    expect(screen.getByRole('button', { name: 'Удаляем данные…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
    await act(async () => { resolve(false); await Promise.resolve() })
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось удалить данные')
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
    expect(onChange).toHaveBeenLastCalledWith(automaticPreferences(draft, { kind: 'calculated', calculation: draft }))
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(onChange).toHaveBeenLastCalledWith(manualCalculation(draft))
    expect(screen.queryByRole('button', { name: 'Таблица ДУМ РТ' })).not.toBeInTheDocument()
  })
  it.each([
    ['dumRt', { asrMethod: 'standard' as const, highLatitudeRule: 'nearestDay' as const, fajrAngle: 19 }],
    ['dumRf', { asrMethod: 'hanafi' as const, highLatitudeRule: 'twilightAngle' as const, adjustments: { isha: 7 } }],
    ['turkey', { asrMethod: 'hanafi' as const, isha: { kind: 'interval' as const, minutes: 92 } }],
    ['karachi', { asrMethod: 'standard' as const, fajrAngle: 18, adjustments: { maghrib: 2 } }],
    ['muslimWorldLeague', { asrMethod: 'hanafi' as const, highLatitudeRule: 'nearestDay' as const }],
  ] as const)('восстанавливает расчётный профиль %s через полный цикл настроек', async (profile, overrides) => {
    const original = { profile, overrides }
    let latest: SourcePreferences = manualCalculation(original)
    function Harness() {
      const [preferences, setPreferences] = useState<SourcePreferences>(manualCalculation(original))
      return <SettingsScreens {...defaults} screen="source-choice" preferences={preferences} onChange={value => { latest = value; setPreferences(value) }} />
    }
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Автоматически' }))
    expect(latest).toEqual(automaticPreferences(original, { kind: 'calculated', calculation: original }))
    expect(resolvePrayerTimeSource(place, '2026-09-01', latest, [official])).toMatchObject({ kind: 'official', provider: 'dumRt', status: 'ready' })
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(latest).toEqual(manualCalculation(original))
    expect(resolvePrayerTimeSource(place, '2026-09-01', latest, [official])).toMatchObject({ kind: 'calculated', strategy: 'manual', settings: { profile, ...overrides } })
    await userEvent.click(screen.getByRole('button', { name: 'Автоматически' }))
    expect(latest).toEqual(automaticPreferences(original, { kind: 'calculated', calculation: original }))
    expect(resolvePrayerTimeSource(place, '2026-09-01', latest, [official])).toMatchObject({ kind: 'official', provider: 'dumRt', status: 'ready' })
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(latest).toEqual(manualCalculation(original))
    expect(resolvePrayerTimeSource(place, '2026-09-01', latest, [official])).toMatchObject({ kind: 'calculated', strategy: 'manual', settings: { profile, ...overrides } })
  })
  it('restores a persisted manual calculation draft from Automatic mode', async () => {
    const draft = { profile: 'karachi' as const, overrides: { asrMethod: 'standard' as const, fajrAngle: 19 } }
    const onChange = vi.fn()
    render(<SettingsScreens {...defaults} screen="source-choice" preferences={automaticPreferences(draft)} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ручной выбор' }))
    expect(onChange).toHaveBeenCalledWith(manualCalculation(draft))
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
  it('shows the actual automatic source and does not imply an unresolved source is ready', () => {
    const { rerender } = render(<SettingsScreens {...defaults} screen="source" preferences={automaticPreferences()} onChange={vi.fn()}
      effectiveSource={{ kind: 'calculated', status: 'ready', settings: { profile: 'karachi', asrMethod: 'hanafi', highLatitudeRule: 'twilightAngle' }, timeZone: 'Asia/Karachi', strategy: 'regional' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Фактический источник: Расчёт · Карачи · Аср: Ханафитский')
    rerender(<SettingsScreens {...defaults} screen="source" preferences={automaticPreferences()} onChange={vi.fn()}
      effectiveSource={{ kind: 'official', status: 'ready', provider: 'dumRt', version: 'v1', revision: 'r1', coverage: 'RU-TA', locationId: 'kazan', timeZone: 'Europe/Moscow' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Фактический источник: Официальная таблица · ДУМ РТ')
    rerender(<SettingsScreens {...defaults} screen="source" preferences={automaticPreferences()} onChange={vi.fn()} effectiveSource={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Источник ещё не определён')
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
    expect(screen.getByText(/Профиль «Умм аль-Кура» недоступен/)).toBeVisible()
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
