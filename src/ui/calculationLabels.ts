import type { CalculationSettings } from '../domain/prayerCalculation'

export const ASR_METHOD_LABELS: Record<CalculationSettings['asrMethod'], string> = {
  hanafi: 'Ханафитский',
  standard: 'Шафиитский, маликитский и ханбалитский',
}
