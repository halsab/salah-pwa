import { required } from '../test/required'
import { describe, expect, it } from 'vitest'
import { parseDumRtCsv, validateSchedule } from './parseDumRtCsv'
import { diagnoseOfficialSchedule } from './scheduleDiagnostics'
import { addDays } from '../domain/date'

const disputed = parseDumRtCsv([
  '04.05.2026;00:13;02:24;03:55;11:41;12:00;16:57;19:28;22:00',
  '05.05.2026;23:54;02:22;03:53;11:41;12:00;16:58;19:30;21:00',
  '06.05.2026;01:49;02:19;03:50;11:41;12:00;16:59;19:32;21:02',
].join('\n'), 'kazan')

describe('diagnoseOfficialSchedule', () => {
  it('сохраняет реальные строки и сообщает о сухуре накануне и переходе через полночь', () => {
    const original = structuredClone(disputed)
    const warnings = diagnoseOfficialSchedule(disputed)
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'previous-day-suhur', locationId: 'kazan', date: '2026-05-05', fields: ['suhurEnd'],
    }))
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'midnight-transition', locationId: 'kazan', date: '2026-05-05', fields: ['suhurEnd'],
    }))
    expect(disputed).toEqual(original)
  })

  it('выдаёт предупреждения для Зухра до зенита и одинаковых времён', () => {
    const [day] = parseDumRtCsv('07.02.2026;05:21;05:56;07:27;12:01;12:00;14:43;16:35;18:19', 'apastovo')
    expect(diagnoseOfficialSchedule([required(day)])).toContainEqual(expect.objectContaining({
      code: 'unusual-order', locationId: 'apastovo', date: '2026-02-07', fields: ['zenith', 'dhuhr'],
    }))
    expect(diagnoseOfficialSchedule([{ ...required(day), zenith: '12:00' }])).toContainEqual(expect.objectContaining({
      code: 'equal-times', fields: ['zenith', 'dhuhr'],
    }))
  })

  it('выявляет возможную перестановку колонок и скачок между последовательными датами', () => {
    const day = required(disputed[0])
    const warnings = diagnoseOfficialSchedule([day, { ...required(disputed[1]), asr: '20:00', maghrib: '16:58' }])
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'unusual-order', fields: ['asr', 'maghrib'] }))
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'day-jump', fields: ['asr'] }))
  })

  it('сравнивает соседние даты независимо от порядка строк, включая конец года, и не смешивает места', () => {
    const first = { ...required(disputed[0]), date: '2026-12-31', suhurEnd: '00:03' as const }
    const second = { ...first, date: '2027-01-01', suhurEnd: '23:59' as const }
    const ordered = diagnoseOfficialSchedule([first, second])
    expect(diagnoseOfficialSchedule([second, first])).toEqual(ordered)
    expect(ordered).toContainEqual(expect.objectContaining({ code: 'midnight-transition', date: '2027-01-01' }))
    expect(diagnoseOfficialSchedule([first, { ...second, locationId: 'other' }]).filter(({ code }) => code === 'midnight-transition')).toEqual([])
  })

  it('полный год с необычной строкой проходит строгую проверку с предупреждением', () => {
    const days = Array.from({ length: 365 }, (_, index) => ({ ...required(disputed[0]), date: addDays('2026-01-01', index) }))
    days[124] = required(disputed[1])
    expect(validateSchedule(days, 2026)).toContainEqual(expect.objectContaining({ code: 'previous-day-suhur', date: '2026-05-05' }))
    expect(() => validateSchedule(days.filter(({ date }) => date !== '2026-05-06'), 2026)).toThrow(/kazan.*2026-05-06.*date.*пропущ/)
  })
})
