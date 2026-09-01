export type GeolocationPermission = PermissionState | 'unsupported'

export interface Coordinates {
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: number
}

export type PositionAccuracy = 'coarse' | 'precise'

export async function getGeolocationPermission(): Promise<GeolocationPermission> {
  if (!navigator.permissions) return 'unsupported'

  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state
  } catch {
    return 'unsupported'
  }
}

export function getCurrentPosition(
  accuracy: PositionAccuracy = 'coarse',
): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Геолокация не поддерживается этим браузером'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
          timestamp,
        }),
      () => reject(new Error('Не удалось получить местоположение')),
      accuracy === 'precise'
        ? { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 }
        : { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  })
}

export function pulseHaptic(): void {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
  }
}
