export type GeolocationPermission = PermissionState | 'unsupported'

export interface Coordinates {
  latitude: number
  longitude: number
}

export async function getGeolocationPermission(): Promise<GeolocationPermission> {
  if (!navigator.permissions) return 'unsupported'

  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state
  } catch {
    return 'unsupported'
  }
}

export function getCurrentPosition(): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Геолокация не поддерживается этим браузером'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('Не удалось получить местоположение')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  })
}

export function pulseHaptic(): void {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
  }
}
