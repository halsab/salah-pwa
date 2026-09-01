import type { PrayerLocation } from './types'

const EARTH_RADIUS_KM = 6_371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const latitudeDelta = toRadians(latitudeB - latitudeA)
  const longitudeDelta = toRadians(longitudeB - longitudeA)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function findNearestLocation(
  latitude: number,
  longitude: number,
  locations: PrayerLocation[],
  maxDistanceKm: number,
): PrayerLocation | null {
  let nearest: PrayerLocation | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const location of locations) {
    const distance = haversineDistanceKm(
      latitude,
      longitude,
      location.latitude,
      location.longitude,
    )
    if (distance < nearestDistance) {
      nearest = location
      nearestDistance = distance
    }
  }

  return nearestDistance <= maxDistanceKm ? nearest : null
}
