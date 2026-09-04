export type GeolocationFailureReason =
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'

export interface GeolocationFailure {
  readonly kind: 'geolocation'
  readonly reason: GeolocationFailureReason
}

export interface DataFailure {
  readonly kind: 'data'
  readonly reason: 'offline' | 'unavailable' | 'invalid'
}

export interface UpdateFailure {
  readonly kind: 'update'
  readonly reason: 'failed'
}

export interface StorageFailure {
  readonly kind: 'storage'
  readonly reason: 'unavailable'
}

export type AppFailure =
  | GeolocationFailure
  | DataFailure
  | UpdateFailure
  | StorageFailure
