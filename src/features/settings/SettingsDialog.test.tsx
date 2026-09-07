import { automaticPreferences } from '../../domain/sourcePreferences'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, type ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { SettingsDialog } from './SettingsDialog'

function renderDialog(overrides: Partial<ComponentProps<typeof SettingsDialog>> = {}) {
  const props: ComponentProps<typeof SettingsDialog> = {
    open: true, preferences: automaticPreferences(), onSourceChange: vi.fn(), officialMode: true,
    settings: { profile: 'turkey', asrMethod: 'standard', highLatitudeRule: 'seventhOfNight' },
    focusMethodologyOnOpen: false, methodologyTriggerRef: createRef<HTMLButtonElement>(),
    getCalculationProfileCapability: () => ({ supported: true }), onClose: vi.fn(), onOpenMethodology: vi.fn(), ...overrides,
  }
  return { props, ...render(<SettingsDialog {...props} />) }
}
it('отделяет понятные настройки от экспертных и применяет только валидную форму', async () => {
  const user = userEvent.setup()
  const { props } = renderDialog()
  expect(screen.queryByLabelText('Профиль')).not.toBeInTheDocument()
  expect(screen.getByText('Автоматически — рекомендуется')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Время намаза' }))
  await user.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
  expect(screen.getByText(/Автоматический выбор источника будет отключён/)).toBeVisible()
  await user.type(screen.getByLabelText('Угол Фаджра, °'), '18oops')
  await user.click(screen.getByRole('button', { name: 'Применить ручной расчёт' }))
  expect(screen.getByRole('alert')).toBeVisible()
  expect(props.onSourceChange).not.toHaveBeenCalled()
  await user.clear(screen.getByLabelText('Угол Фаджра, °'))
  await user.type(screen.getByLabelText('Угол Фаджра, °'), '18.5')
  await user.click(screen.getByRole('button', { name: 'Применить ручной расчёт' }))
  expect(props.onSourceChange).toHaveBeenCalledWith({ mode: 'manual', source: { kind: 'calculated', calculation: {profile: 'turkey', overrides: {asrMethod:'standard', highLatitudeRule:'seventhOfNight', fajrAngle:18.5}} }, calculationDraft: {profile:'turkey', overrides:{asrMethod:'standard', highLatitudeRule:'seventhOfNight', fajrAngle:18.5}} })
})
it('отмена сброса ничего не удаляет, ошибка допускает повтор', async () => {
  const user = userEvent.setup()
  const reset = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
  renderDialog({ onReset: reset })
  await user.click(screen.getByRole('button', { name: 'Данные' }))
  await user.click(screen.getByRole('button', { name: 'Сбросить данные приложения' }))
  await user.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(reset).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Сбросить данные приложения' }))
  await user.click(screen.getByRole('button', { name: 'Удалить данные' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось')
  await user.click(screen.getByRole('button', { name: 'Повторить сброс' }))
  expect(reset).toHaveBeenCalledTimes(2)
})
