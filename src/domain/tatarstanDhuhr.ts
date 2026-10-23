import { createLocationClock } from './locationTime'
import { haversineDistanceKm } from './location'
import localities from '../data/tatarstanLocalities.json'

export const TATARSTAN_FIXED_DHUHR = Object.freeze({
  agriz: '11:45', aznakayevo: '12:00', aksubayevo: '12:00', aktanysh: '12:00', alekseevsk: '12:00',
  almetyevsk: '12:00', arsk: '12:00', bavly: '12:00', 'bazarnye-mataki': '12:00', baltasi: '12:00',
  'bogatye-saby': '12:00', bolgar: '12:00', 'bolshaya-atnya': '12:00', bugulma: '12:00', buinsk: '12:15',
  'verkhniy-uslon': '12:00', 'vysokaya-gora': '12:00', elabuga: '12:00', zainsk: '12:00', zelenodolsk: '12:05',
  kazan: '12:00', 'kamskoye-ustye': '12:00', kukmor: '12:00', laishevo: '12:00', leninogorsk: '12:00',
  mamadysh: '12:00', mendeleevsk: '12:00', menzelinsk: '12:00', muslyumovo: '11:50', 'naberezhnye-chelny': '12:00',
  nizhnekamsk: '11:50', novosheshminsk: '12:00', nurlat: '12:00', pestretsy: '12:00', 'rybnaya-sloboda': '12:00',
  sarmanovo: '12:00', 'staroe-drozhzhanoe': '12:15', tetyushi: '12:00', tyulyachi: '12:00', urussu: '12:00',
  cheremshan: '12:00', chistopol: '12:00',
} as const)

export type TatarstanLocalityId = keyof typeof TATARSTAN_FIXED_DHUHR

const GEONAMES_LOCALITY_IDS: Readonly<Record<number, TatarstanLocalityId>> = Object.freeze({
  583983: 'agriz', 580062: 'aznakayevo', 583583: 'aksubayevo', 583578: 'aktanysh', 582775: 'alekseevsk',
  582432: 'almetyevsk', 580850: 'arsk', 578638: 'bavly', 578467: 'bazarnye-mataki', 579384: 'baltasi',
  575728: 'bogatye-saby', 570990: 'bolgar', 571170: 'bugulma', 571155: 'buinsk', 470212: 'vysokaya-gora',
  468082: 'elabuga', 465543: 'zainsk', 463835: 'zelenodolsk', 551487: 'kazan', 539689: 'kukmor',
  537158: 'laishevo', 536162: 'leninogorsk', 529709: 'mamadysh', 527579: 'mendeleevsk', 527529: 'menzelinsk',
  524183: 'muslyumovo', 523750: 'naberezhnye-chelny', 521118: 'nizhnekamsk', 516716: 'nurlat', 510342: 'pestretsy',
  499987: 'rybnaya-sloboda', 498537: 'sarmanovo', 483150: 'tetyushi', 478565: 'urussu', 569318: 'cheremshan',
  567990: 'chistopol',
})

export interface TatarstanPlaceIdentity {
  id: string
  selection: 'city' | 'gps'
  latitude?: number
  longitude?: number
  accuracy?: number | null
  region?: { code: string } | null
  coverage?: string
  cityId?: number
  nearbyCity?: { id: number; distanceKm: number; countryCode?: string } | null
}

export function verifiedTatarstanLocalityId(place: TatarstanPlaceIdentity): TatarstanLocalityId | undefined {
  if (place.selection !== 'city' || place.region?.code !== 'RU-TA' || place.coverage !== 'inside') return undefined
  if (place.id.startsWith('locality:')) {
    const localityId = place.id.slice('locality:'.length)
    if (!Object.hasOwn(TATARSTAN_FIXED_DHUHR, localityId)) return undefined
    const canonical = localities.find(item => item.id === localityId)
    if (!canonical || typeof place.latitude !== 'number' || !Number.isFinite(place.latitude)
      || typeof place.longitude !== 'number' || !Number.isFinite(place.longitude)) return undefined
    return haversineDistanceKm(place.latitude, place.longitude, canonical.latitude, canonical.longitude) <= 1
      ? localityId as TatarstanLocalityId : undefined
  }
  if (place.cityId !== undefined && place.id === `geonames:${place.cityId}`) {
    return GEONAMES_LOCALITY_IDS[place.cityId]
  }
  // GPS proximity alone is not verified locality membership.
  return undefined
}

export function tatarstanDhuhrInstant(
  date: string,
  timeZone: string,
  zenithInstant: number,
  localityId?: string,
): number {
  if (!Number.isFinite(zenithInstant)) throw new RangeError('invalid-solar-zenith')
  const clock = createLocationClock(timeZone)
  const baseline = clock.toInstant(date, '12:00').getTime()
  const afterZenith = Math.ceil((zenithInstant + 60_000) / 60_000) * 60_000
  const fixed = localityId && Object.hasOwn(TATARSTAN_FIXED_DHUHR, localityId)
    ? TATARSTAN_FIXED_DHUHR[localityId as TatarstanLocalityId]
    : undefined
  const configuredMinimum = fixed ? clock.toInstant(date, fixed).getTime() : baseline
  return Math.max(configuredMinimum, afterZenith)
}

