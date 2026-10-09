import { getCivilDate, getDeviceTimeZone } from './locationTime'

export function getSystemDate(now: Date, timeZone = getDeviceTimeZone()): string {
  return getCivilDate(now, timeZone)
}

export function addDays(date: string, amount: number): string {
  const instant = new Date(`${date}T12:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + amount)
  return instant.toISOString().slice(0, 10)
}
