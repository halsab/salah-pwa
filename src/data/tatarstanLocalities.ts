import localities from './tatarstanLocalities.json'
import { MOSCOW_TIME_ZONE } from '../domain/locationTime'

export const TATARSTAN_LOCALITIES = localities.map(location => ({ ...location, timeZone: MOSCOW_TIME_ZONE }))
