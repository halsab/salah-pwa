import { describe, expect, it } from 'vitest'

import type { PrayerLocation } from './types'
import { findNearestLocation, haversineDistanceKm } from './location'

const locations: PrayerLocation[] = [
  { id: 'kazan', name: 'Казань', latitude: 55.7961, longitude: 49.1064 },
  {
    id: 'naberezhnye-chelny',
    name: 'Набережные Челны',
    latitude: 55.7436,
    longitude: 52.3958,
  },
]

describe('haversineDistanceKm', () => {
  it('даёт нулевое расстояние для одной точки', () => {
    expect(haversineDistanceKm(55.7961, 49.1064, 55.7961, 49.1064)).toBe(0)
  })
})

describe('findNearestLocation', () => {
  it('выбирает ближайший официальный населённый пункт', () => {
    expect(findNearestLocation(55.8, 49.12, locations, 80)?.id).toBe('kazan')
  })

  it('не подставляет город, если пользователь далеко от Татарстана', () => {
    expect(findNearestLocation(55.7558, 37.6173, locations, 80)).toBeNull()
  })
})
