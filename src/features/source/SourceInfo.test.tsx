import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { calculatePrayerSchedule } from '../../domain/prayerCalculation'
import type { ScheduleContext } from '../../domain/scheduleContext'
import { SourceInfo } from './SourceInfo'

it('describes the independent Tatarstan calculation without provider branding or timetable links', async () => {
  const date = '2026-05-05'
  const context: ScheduleContext = {
    source: 'calculated', mode: 'automatic', date, timeZone: 'Europe/Moscow',
    location: { id: 'locality:kazan', latitude: 55.79, longitude: 49.12, localityId: 'kazan' },
    settings: { profile: 'tatarstan', asrMethod: 'hanafi', highLatitudeRule: 'tatarstan' },
  }
  const schedule = calculatePrayerSchedule(context.location, date, context.timeZone, context.settings)
  render(<SourceInfo open onClose={() => {}} context={context} schedule={schedule} placeLabel="Казань" />)

  const dialog = await screen.findByRole('region', { name: 'Сведения об источнике' })
  expect(await within(dialog).findByText(/фиксированное местное время/u)).toBeVisible()
  expect(dialog.textContent).toMatch(/Профиль расчёта: Татарстан/u)
  expect(dialog.textContent).not.toMatch(/ДУМ|DUM/u)
  expect(within(dialog).queryByRole('link', { name: /dumrt/u })).not.toBeInTheDocument()
})
