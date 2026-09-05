import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsDialog } from './SettingsDialog'

const settings = {
  profile: 'turkey',
  asrMethod: 'standard',
  highLatitudeRule: 'seventhOfNight',
} as const

function renderDialog(overrides: Partial<ComponentProps<typeof SettingsDialog>> = {}) {
  const props: ComponentProps<typeof SettingsDialog> = {
    open: true,
    officialMode: false,
    settings,
    focusMethodologyOnOpen: false,
    methodologyTriggerRef: createRef<HTMLButtonElement>(),
    getCalculationProfileCapability: () => ({ supported: true }),
    onClose: vi.fn(),
    onChange: vi.fn(),
    onOpenMethodology: vi.fn(),
    ...overrides,
  }

  return { props, ...render(<SettingsDialog {...props} />) }
}

describe('SettingsDialog', () => {
  it('отключает все параметры в официальном режиме, сохраняя выбранные значения', () => {
    const { props } = renderDialog({ officialMode: true })
    const asr = screen.getByRole('combobox', { name: 'Аср' })
    const profile = screen.getByRole('combobox', { name: 'Профиль' })
    const highLatitude = screen.getByRole('combobox', { name: 'Северные правила' })

    expect(asr).toBeDisabled()
    expect(profile).toBeDisabled()
    expect(highLatitude).toBeDisabled()
    expect(asr).toHaveAttribute('aria-disabled', 'true')
    expect(profile).toHaveAttribute('aria-disabled', 'true')
    expect(highLatitude).toHaveAttribute('aria-disabled', 'true')
    expect(asr).toHaveValue('standard')
    expect(profile).toHaveValue('turkey')
    expect(highLatitude).toHaveValue('seventhOfNight')

    fireEvent.change(asr, { target: { value: 'hanafi' } })
    fireEvent.change(profile, { target: { value: 'dumRt' } })
    fireEvent.change(highLatitude, { target: { value: 'dumRt' } })
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('оставляет методику доступной в официальном режиме', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog({ officialMode: true })

    const methodology = screen.getByRole('button', { name: 'Как рассчитывается время' })
    expect(methodology).toBeEnabled()
    await user.click(methodology)
    expect(props.onOpenMethodology).toHaveBeenCalledTimes(1)
  })

  it('снова разрешает менять параметры в расчётном режиме', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()
    const asr = screen.getByRole('combobox', { name: 'Аср' })
    const profile = screen.getByRole('combobox', { name: 'Профиль' })
    const highLatitude = screen.getByRole('combobox', { name: 'Северные правила' })

    expect(asr).toBeEnabled()
    expect(profile).toBeEnabled()
    expect(highLatitude).toBeEnabled()
    expect(asr).not.toHaveAttribute('aria-disabled', 'true')

    await user.selectOptions(asr, 'hanafi')
    expect(props.onChange).toHaveBeenCalledWith({
      ...settings,
      asrMethod: 'hanafi',
    })
  })
})
