import type { DataFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import type { SavedCoordinates } from '../domain/types'

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000
const ISO_REGION_FIELD = 'ISO3166-2-lvl4'

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  hamlet?: string
  county?: string
  state?: string
  country?: string
  [ISO_REGION_FIELD]?: string
}

export interface NominatimRegionEvidence {
  source: 'nominatim'
  regionCode?: string
}

export interface ResolvedPlace {
  name?: string
  regionEvidence: NominatimRegionEvidence
}

export interface ReverseGeocoderOptions {
  endpoint?: string
  fetcher?: typeof fetch
  timeoutMs?: number
}

const ADDRESS_NAME_FIELDS = [
  'city',
  'town',
  'village',
  'municipality',
  'hamlet',
  'county',
  'state',
  'country',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseAddress(value: unknown): NominatimAddress | null {
  if (!isRecord(value)) return null

  for (const field of ADDRESS_NAME_FIELDS) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      return null
    }
  }
  const regionCode = value[ISO_REGION_FIELD]
  if (
    regionCode !== undefined
    && (typeof regionCode !== 'string' || regionCode.length === 0)
  ) {
    return null
  }

  return value
}

function buildPlaceName(address: NominatimAddress): string | undefined {
  const locality =
    address.city
    ?? address.town
    ?? address.village
    ?? address.municipality
    ?? address.hamlet
    ?? address.county
    ?? address.state

  if (!locality) return undefined
  return address.country && address.country !== locality
    ? `${locality}, ${address.country}`
    : locality
}

function dataFailure(reason: DataFailure['reason']): DataFailure {
  return { kind: 'data', reason }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export async function resolvePlaceName(
  coordinates: SavedCoordinates,
  options: ReverseGeocoderOptions = {},
): Promise<Result<ResolvedPlace, DataFailure>> {
  if (isOffline()) return failure(dataFailure('offline'))

  const endpoint = options.endpoint
    ?? (import.meta.env.VITE_REVERSE_GEOCODER_URL as string | undefined)
    ?? DEFAULT_ENDPOINT
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const url = new URL(endpoint)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', coordinates.latitude.toFixed(3))
  url.searchParams.set('lon', coordinates.longitude.toFixed(3))
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'ru')

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetcher(url, {
        // User-Agent управляется браузером; подменять его запрещённым заголовком нельзя.
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch {
      return failure(dataFailure(isOffline() ? 'offline' : 'unavailable'))
    }

    if (!response.ok) return failure(dataFailure('unavailable'))

    let value: unknown
    try {
      value = await response.json() as unknown
    } catch {
      return failure(dataFailure('invalid'))
    }
    if (!isRecord(value) || !('address' in value)) {
      return failure(dataFailure('invalid'))
    }

    const address = parseAddress(value.address)
    if (!address) return failure(dataFailure('invalid'))

    const name = buildPlaceName(address)
    const regionCode = address[ISO_REGION_FIELD]
    const regionEvidence: NominatimRegionEvidence = regionCode
      ? { source: 'nominatim', regionCode }
      : { source: 'nominatim' }

    return success({
      ...(name ? { name } : {}),
      regionEvidence,
    })
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
