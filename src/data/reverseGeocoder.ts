import type { SavedCoordinates } from '../domain/types'

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const REQUEST_TIMEOUT_MS = 8_000

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  hamlet?: string
  county?: string
  state?: string
  country?: string
}

interface NominatimResponse {
  address?: NominatimAddress
}

function buildPlaceName(address: NominatimAddress): string | null {
  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.hamlet ??
    address.county ??
    address.state

  if (!locality) return null
  return address.country && address.country !== locality
    ? `${locality}, ${address.country}`
    : locality
}

export async function resolvePlaceName(
  coordinates: SavedCoordinates,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const endpoint = import.meta.env.VITE_REVERSE_GEOCODER_URL ?? DEFAULT_ENDPOINT
  const url = new URL(endpoint)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', coordinates.latitude.toFixed(3))
  url.searchParams.set('lon', coordinates.longitude.toFixed(3))
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'ru')

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Сервис названий недоступен: ${response.status}`)
    }

    const value = (await response.json()) as NominatimResponse
    const placeName = value.address ? buildPlaceName(value.address) : null
    if (!placeName) throw new Error('Название населённого пункта не найдено')
    return placeName
  } finally {
    window.clearTimeout(timeout)
  }
}
