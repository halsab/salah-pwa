import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SourceInfo } from './SourceInfo'
import { calculatePrayerSchedule } from '../../domain/prayerCalculation'
import { parseDumRtCsv } from '../../data/parseDumRtCsv'
import { required } from '../../test/required'

it('показывает факты официальной таблицы и дату позднего сухура без раскрытия идентификаторов', () => {
  const schedule = required(parseDumRtCsv('05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00', 'kazan')[0])
  render(<SourceInfo open onClose={() => {}} schedule={schedule} placeLabel="Рядом: Казань" checkedAt={null} updateFailed context={{ source:'official', provider:'dumRt', mode:'automatic', datasetVersion:'secret-version', datasetRevision:'secret-hash', localityId:'kazan', coverage:'RU-TA', date: schedule.date, timeZone:'Europe/Moscow', location:{id:'private-id', latitude:55, longitude:49} }} meta={{ schemaVersion:2, source:{name:'ДУМ РТ',url:'https://dumrt.ru/ru/help-info/prayertime/', updatedAt:'2026-01-01',years:[2026]}, locations:[{id:'kazan',name:'Казань',latitude:55,longitude:49}] }} />)
  const dialog = screen.getByRole('region', { name:'Сведения об источнике' })
  expect(within(dialog).getByRole('heading', { level: 1, name: 'ДУМ РТ' })).toBeVisible()
  expect(within(dialog).getByRole('heading', { level: 2, name: 'Сведения' })).toBeVisible()
  expect(within(dialog).getByRole('heading', { level: 2, name: 'Важно' })).toBeVisible()
  expect(dialog.querySelectorAll('ul')).toHaveLength(2)
  expect(dialog.querySelector('ul')?.querySelectorAll('li')).toHaveLength(2)
  expect(dialog.querySelectorAll('ul')[1]?.querySelectorAll('li')).toHaveLength(4)
  expect(dialog.querySelector('blockquote')).toHaveTextContent('не представляет ДУМ РТ')
  expect(dialog.querySelector('details')).toBeNull()
  expect(dialog).toHaveTextContent('Казань')
  expect(dialog).toHaveTextContent('Europe/Moscow')
  expect(dialog).toHaveTextContent('Проверка обновлений не удалась')
  expect(dialog).toHaveTextContent('Фаджр (конец сухура) 23:54 — понедельник, 4 мая, накануне дня поста.')
  expect(within(dialog).getByRole('link', { name: /Первичный источник/ })).toHaveAttribute('href','https://dumrt.ru/ru/help-info/prayertime/')
  expect(dialog.textContent).not.toMatch(/secret-|private-id/)
})

it('объясняет рассчитанный зенит в сведениях официальной таблицы', () => {
  const { zenith: _zenith, ...withoutZenith } = required(parseDumRtCsv('05.05.2026;02:22;03:17;03:53;11:41;12:00;16:58;19:30;21:00', 'kazan')[0])
  const schedule = { ...withoutZenith, coordinates: { latitude: 55.79, longitude: 49.12 } }
  render(<SourceInfo open onClose={() => {}} schedule={schedule} placeLabel="Казань" checkedAt={null} updateFailed={false} context={{ source:'official', provider:'dumRt', mode:'automatic', datasetVersion:'v1', datasetRevision:'hash', localityId:'kazan', coverage:'RU-TA', date:schedule.date, timeZone:'Europe/Moscow', location:{id:'kazan', latitude:55.79, longitude:49.12} }} meta={null} />)
  expect(screen.getByRole('region', { name:'Сведения об источнике' })).toHaveTextContent('Зенит рассчитан астрономически: таблица не публикует это время.')
})

it('расчёт показывает эффективные параметры, ручные поправки и приблизительность', () => {
  const settings = {profile:'dumRt',asrMethod:'hanafi',highLatitudeRule:'dumRt',fajrAngle:19,isha:{kind:'interval',minutes:95},adjustments:{asr:12}} as const
  const schedule = calculatePrayerSchedule({latitude:69.65,longitude:18.96},'2026-06-21','Europe/Oslo',settings)
  render(<SourceInfo open onClose={() => {}} schedule={schedule} placeLabel="Тромсё" checkedAt={null} updateFailed={false} meta={null} context={{source:'calculated',mode:'manual',settings,date:schedule.date,timeZone:schedule.timeZone,location:{id:null,latitude:69.65,longitude:18.96}}} />)
  const dialog = screen.getByRole('region', { name:'Сведения об источнике' })
  expect(dialog.querySelector('details')).toBeNull()
  expect(within(dialog).getByRole('heading', { level: 2, name: 'Параметры' })).toBeVisible()
  expect(within(dialog).getByRole('heading', { level: 2, name: 'Важно' })).toBeVisible()
  expect(dialog.querySelectorAll('ul')).toHaveLength(2)
  expect(dialog.querySelectorAll('ul')[1]?.querySelectorAll('li')).toHaveLength(6)
  expect(dialog.querySelector('blockquote')).toHaveTextContent('не представляет ДУМ РТ')
  expect(within(dialog).getByText('Расчётное время', { exact:true })).toBeVisible()
  expect(dialog).toHaveTextContent('19°')
  expect(dialog).toHaveTextContent('95 мин после заката')
  expect(dialog).toHaveTextContent('Аср +12 мин')
  expect(dialog).toHaveTextContent('≈ По северному правилу')
  expect(dialog).toHaveTextContent('не представляет ДУМ РТ или другую религиозную организацию')
})
