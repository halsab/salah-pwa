import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { parseDumRtCsv } from '../../data/parseDumRtCsv'
import { required } from '../../test/required'
import { SourceInfo } from './SourceInfo'

it('does not expose private dataset or location identifiers in source details', async () => {
  const schedule = required(parseDumRtCsv(
    '05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00',
    'kazan',
  )[0])
  const sourceUrl = 'https://dumrt.ru/ru/help-info/prayertime/'

  render(<SourceInfo
    open
    onClose={() => {}}
    schedule={schedule}
    placeLabel="Казань"
    checkedAt={null}
    updateFailed={false}
    context={{
      source: 'official',
      provider: 'dumRt',
      mode: 'automatic',
      datasetVersion: 'private-version',
      datasetRevision: 'private-hash',
      localityId: 'private-locality',
      coverage: 'RU-TA',
      date: schedule.date,
      timeZone: 'Europe/Moscow',
      location: { id: 'private-location', latitude: 55, longitude: 49 },
    }}
    meta={{
      schemaVersion: 2,
      source: { name: 'ДУМ РТ', url: sourceUrl, updatedAt: '2026-01-01', years: [2026] },
      locations: [{ id: 'private-location', name: 'Казань', latitude: 55, longitude: 49 }],
    }}
  />)

  const dialog = await screen.findByRole('region', { name: 'Сведения об источнике' })
  expect(await within(dialog).findByRole('link')).toHaveAttribute('href', sourceUrl)
  expect(dialog.textContent).not.toMatch(/private-(?:version|hash|locality|location)/u)
})
