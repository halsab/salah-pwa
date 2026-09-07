import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SourceInfo } from './SourceInfo'
import { calculatePrayerSchedule } from '../../domain/prayerCalculation'
import { parseDumRtCsv } from '../../data/parseDumRtCsv'
import { required } from '../../test/required'

it('показывает факты официальной таблицы и дату позднего сухура без раскрытия идентификаторов', () => {
  const schedule = required(parseDumRtCsv('05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00', 'kazan')[0])
  render(<SourceInfo open onClose={() => {}} schedule={schedule} placeLabel="Рядом: Казань" checkedAt={null} updateFailed context={{ source:'official', provider:'dumRt', mode:'automatic', datasetVersion:'secret-version', datasetRevision:'secret-hash', localityId:'kazan', coverage:'RU-TA', date: schedule.date, timeZone:'Europe/Moscow', location:{id:'private-id', latitude:55, longitude:49} }} meta={{ schemaVersion:2, source:{name:'ДУМ РТ',url:'https://dumrt.ru/ru/help-info/prayertime/', updatedAt:'2026-01-01',years:[2026]}, locations:[{id:'kazan',name:'Казань',latitude:55,longitude:49}] }} />)
  const dialog = screen.getByRole('dialog', { name:'Сведения об источнике' })
  expect(within(dialog).getByText('Казань', { exact:true })).toBeVisible()
  expect(dialog).toHaveTextContent('Europe/Moscow')
  expect(dialog).toHaveTextContent('Проверка обновлений не удалась')
  expect(dialog).toHaveTextContent('Завершение сухура 23:54 — понедельник, 4 мая, накануне дня поста.')
  expect(within(dialog).getByRole('link', { name: /Первичный источник/ })).toHaveAttribute('href','https://dumrt.ru/ru/help-info/prayertime/')
  expect(dialog.textContent).not.toMatch(/secret-|private-id/)
})

it('расчёт показывает эффективные параметры, ручные поправки и приблизительность', () => {
  const settings = {profile:'dumRt',asrMethod:'hanafi',highLatitudeRule:'dumRt',fajrAngle:19,isha:{kind:'interval',minutes:95},adjustments:{asr:12}} as const
  const schedule = calculatePrayerSchedule({latitude:69.65,longitude:18.96},'2026-06-21','Europe/Oslo',settings)
  render(<SourceInfo open onClose={() => {}} schedule={schedule} placeLabel="Тромсё" checkedAt={null} updateFailed={false} meta={null} context={{source:'calculated',mode:'manual',settings,date:schedule.date,timeZone:schedule.timeZone,location:{id:null,latitude:69.65,longitude:18.96}}} />)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('heading', { name:'Расчётное время' })).toBeVisible()
  expect(dialog).toHaveTextContent('19°')
  expect(dialog).toHaveTextContent('95 мин после заката')
  expect(dialog).toHaveTextContent('Аср +12 мин')
  expect(dialog).toHaveTextContent('Приблизительные значения')
  expect(dialog).toHaveTextContent('не представляет ДУМ РТ или другую религиозную организацию')
})
