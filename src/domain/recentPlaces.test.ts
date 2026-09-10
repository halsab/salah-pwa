import { describe, expect, it } from 'vitest'
import { createOfficialPlace, createGpsPlace } from './place'
import { rememberPlace, restoreRecentPlaces } from './recentPlaces'
const city = (id: string) => createOfficialPlace({ id, name: 'Город', latitude: 55, longitude: 49 }, 10)
const gps = createGpsPlace({ latitude: 50, longitude: 30, accuracy: 10, timestamp: 1 }, 'Europe/Moscow', null, 'gps:1')
describe('недавние места', () => {
  it('сохраняет три предыдущих города по идентификатору, исключая текущий', () => {
    const recents = rememberPlace([city('b'), city('c'), city('d')], city('a'), city('b'))
    expect(recents.map(place => place.id)).toEqual(['locality:a', 'locality:c', 'locality:d'])
  })
  it('не создаёт историю координат GPS и не теряет предыдущий город', () => {
    expect(rememberPlace([city('b')], gps, city('a')).map(place => place.id)).toEqual(['locality:b'])
    expect(rememberPlace([], city('a'), gps)).toEqual([city('a')])
  })
  it('отбрасывает повреждённые записи, GPS, дубликаты и текущий город', () => {
    expect(restoreRecentPlaces([null, {}, gps, city('a'), city('a'), city('b')], 'locality:b')).toEqual([city('a')])
    expect(restoreRecentPlaces('bad')).toEqual([])
  })
})
