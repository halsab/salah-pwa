import { performance } from 'node:perf_hooks'

import { addDays } from '../src/domain/date'
import { calculatePrayerSchedule } from '../src/domain/prayerCalculation'

const location = { latitude: 43.6532, longitude: -79.3832 }
const timeZone = 'America/Toronto'
const settings = {
  profile: 'canadaFcna',
  asrMethod: 'standard',
  highLatitudeRule: 'twilightAngle',
} as const

function calculateMonth(): void {
  for (let offset = 0; offset < 31; offset += 1) {
    calculatePrayerSchedule(location, addDays('2026-07-01', offset), timeZone, settings)
  }
}

calculateMonth()
const samples: number[] = []
const windowsPerSample = 200
for (let sample = 0; sample < 7; sample += 1) {
  const start = performance.now()
  for (let window = 0; window < windowsPerSample; window += 1) calculateMonth()
  samples.push((performance.now() - start) / windowsPerSample)
}
samples.sort((left, right) => left - right)
const median = samples[Math.floor(samples.length / 2)] ?? Number.NaN
console.log(`Toronto 31-day schedule: median ${median.toFixed(2)} ms (${(median / 31).toFixed(3)} ms/day) across 7 samples of ${windowsPerSample} windows`)
