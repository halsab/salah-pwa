import type { GeolocationFailureReason } from '../../domain/errors'

export const LOW_ACCURACY_THRESHOLD_METERS = 1000

export type GpsUiState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'refining' }
  | { status: 'ready'; lowAccuracy: boolean }
  | { status: 'error'; reason: GeolocationFailureReason }

export type NameLookupState = 'idle' | 'loading' | 'resolved' | 'not-found' | 'offline' | 'failed'

export function isLowAccuracy(accuracy: number | null): boolean {
  return accuracy === null || accuracy > LOW_ACCURACY_THRESHOLD_METERS
}

const failurePriority: Record<GeolocationFailureReason, number> = {
  denied: 0,
  unsupported: 1,
  unavailable: 2,
  timeout: 3,
}

export function preferredGeolocationFailure(reasons: readonly GeolocationFailureReason[]): GeolocationFailureReason {
  return reasons.reduce<GeolocationFailureReason>((preferred, reason) =>
    failurePriority[reason] < failurePriority[preferred] ? reason : preferred, 'timeout')
}

export function geolocationFailureMessage(reason: GeolocationFailureReason): string {
  if (reason === 'denied') return 'Доступ к геопозиции запрещён. Разрешите доступ в настройках браузера или выберите город вручную.'
  if (reason === 'unsupported') return 'Этот браузер не поддерживает геопозицию. Выберите город вручную.'
  if (reason === 'timeout') return 'Не удалось определить местоположение вовремя. Попробуйте ещё раз или выберите город вручную.'
  return 'Устройство не смогло определить геопозицию. Проверьте службы геолокации и попробуйте снова.'
}

export function nameLookupMessage(state: NameLookupState): string | null {
  if (state === 'loading') return 'Определяем ближайший населённый пункт…'
  if (state === 'offline') return 'Нет интернета. Используем координаты.'
  if (state === 'failed') return 'Название места определить не удалось. Используем координаты.'
  if (state === 'not-found') return 'Ближайший населённый пункт не найден. Используем координаты.'
  return null
}

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

export function formatAccuracy(accuracy: number | null): string {
  if (accuracy === null) return 'Точность неизвестна'
  if (accuracy < LOW_ACCURACY_THRESHOLD_METERS) return `Точность ±${Math.round(accuracy)} м`
  return `Точность ±${(accuracy / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} км`
}
