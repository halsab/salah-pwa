import type { GeolocationFailureReason } from '../../domain/errors'
import { translate, type MessageKey } from '../../localization'

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

export function geolocationFailureMessage(reason: GeolocationFailureReason, locale: 'ru' = 'ru'): string {
  const key: MessageKey = reason === 'denied' ? 'geoDenied' : reason === 'unsupported' ? 'geoUnsupported' : reason === 'timeout' ? 'geoTimeout' : 'geoUnavailable'
  return translate(locale, key)
}

export function nameLookupMessage(state: NameLookupState, locale: 'ru' = 'ru'): string | null {
  const key: MessageKey | null = state === 'loading' ? 'nearestLoading' : state === 'offline' ? 'nearestOffline' : state === 'failed' ? 'nearestFailed' : state === 'not-found' ? 'nearestNotFound' : null
  if (key) return translate(locale, key)
  return null
}

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

export function formatAccuracy(accuracy: number | null): string {
  if (accuracy === null) return translate('ru', 'accuracyUnknown')
  if (accuracy < LOW_ACCURACY_THRESHOLD_METERS) return translate('ru', 'accuracyMeters', { value: Math.round(accuracy) })
  return translate('ru', 'accuracyKilometers', { value: (accuracy / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
}
