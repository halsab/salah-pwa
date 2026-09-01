import { describe, expect, it } from 'vitest'

import { parseDumRtCsv, validateSchedule } from './parseDumRtCsv'

describe('parseDumRtCsv', () => {
  it('преобразует строку ДУМ РТ 2026 года в типизированное расписание', () => {
    const [day] = parseDumRtCsv(
      '01.09.2026;02:21;03:17;04:48;11:44;12:00;16:24;18:39;20:33',
      'kazan',
    )

    expect(day).toEqual({
      locationId: 'kazan',
      date: '2026-09-01',
      suhurEnd: '02:21',
      fajrJamaat: '03:17',
      sunrise: '04:48',
      zenith: '11:44',
      dhuhr: '12:00',
      asr: '16:24',
      maghrib: '18:39',
      isha: '20:33',
    })
  })

  it('принимает старый десятый столбец и не смешивает его с временем иша', () => {
    const [day] = parseDumRtCsv(
      '01.01.2025;5:53;6:42;8:12;11:47;12:00;13:34;15:22;17:18;12:52',
      'kazan',
    )

    expect(day?.isha).toBe('17:18')
    expect(day?.suhurEnd).toBe('05:53')
  })

  it('восстанавливает пропущенный перевод строки между годами в источнике', () => {
    const days = parseDumRtCsv(
      '31.12.2025;5:33;6:23;7:53;11:26;12:00;13:13;15:01;16:58;13:0601.01.2026;05:33;06:22;07:53;11:28;12:00;13:15;15:02;17:00',
      'aktanysh',
    )

    expect(days).toHaveLength(2)
    expect(days[1]).toMatchObject({ date: '2026-01-01', isha: '17:00' })
  })

  it('отклоняет неполные и некорректные строки', () => {
    expect(() => parseDumRtCsv('01.09.2026;02:21;03:17', 'kazan')).toThrow(
      /строк[ае] 1/i,
    )
    expect(() =>
      parseDumRtCsv(
        '31.02.2026;02:21;03:17;04:48;11:44;12:00;16:24;18:39;20:33',
        'kazan',
      ),
    ).toThrow(/дата/i)
  })
})

describe('validateSchedule', () => {
  it('требует полный год без повторяющихся дат', () => {
    const duplicate = parseDumRtCsv(
      [
        '01.09.2026;02:21;03:17;04:48;11:44;12:00;16:24;18:39;20:33',
        '01.09.2026;02:21;03:17;04:48;11:44;12:00;16:24;18:39;20:33',
      ].join('\n'),
      'kazan',
    )

    expect(() => validateSchedule(duplicate, 2026)).toThrow(/повтор/i)
  })
})
