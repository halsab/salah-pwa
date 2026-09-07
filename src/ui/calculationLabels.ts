import type { CalculationSettings } from '../domain/prayerCalculation'

export const ASR_METHOD_LABELS: Record<CalculationSettings['asrMethod'], string> = {
  hanafi: 'Ханафитский',
  standard: 'Шафиитский, маликитский и ханбалитский',
}

export const EVENT_LABELS = { fajr: 'Фаджр', sunrise: 'Восход', zenith: 'Зенит', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша' }

export const HIGH_LATITUDE_LABELS = { dumRt: 'ДУМ РТ · 120/90 мин', seventhOfNight: '1/7 ночи', twilightAngle: 'Доля ночи по углу', nearestDay: 'Ближайший день' }
