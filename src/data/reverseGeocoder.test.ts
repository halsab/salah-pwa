import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SavedCoordinates } from '../domain/types'
import { resolvePlaceName } from './reverseGeocoder'

const coordinates: SavedCoordinates = {
  latitude: 55.755826,
  longitude: 37.617306,
  timeZone: 'Europe/Moscow',
  accuracy: 12,
  timestamp: 100,
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('resolvePlaceName', () => {
  it('делает один настраиваемый JSON v2 запрос с округлением до трёх знаков', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        address: {
          city: 'Казань',
          country: 'Россия',
          'ISO3166-2-lvl4': 'RU-TA',
        },
      }), { status: 200 }),
    )

    await expect(resolvePlaceName(coordinates, {
      endpoint: 'https://nominatim.test/reverse',
      fetcher,
    })).resolves.toEqual({
      ok: true,
      value: {
        name: 'Казань, Россия',
        regionEvidence: { source: 'nominatim', regionCode: 'RU-TA' },
      },
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [input, init] = fetcher.mock.calls[0] as [URL, RequestInit]
    const url = new URL(String(input))
    expect(url.origin + url.pathname).toBe('https://nominatim.test/reverse')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'jsonv2',
      lat: '55.756',
      lon: '37.617',
      zoom: '10',
      addressdetails: '1',
      'accept-language': 'ru',
    })
    expect(new Headers(init.headers).get('Accept')).toBe('application/json')
  })

  it('возвращает другой ISO-регион без вывода из state или display_name', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        display_name: 'Казань, Татарстан, Россия',
        address: {
          city: 'Москва',
          state: 'Республика Татарстан',
          country: 'Россия',
          'ISO3166-2-lvl4': 'RU-MOW',
        },
      }), { status: 200 }),
    )

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: true,
      value: {
        name: 'Москва, Россия',
        regionEvidence: { source: 'nominatim', regionCode: 'RU-MOW' },
      },
    })
  })

  it('оставляет регион неизвестным без точного структурированного ISO-кода', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        display_name: 'Казань, Татарстан, Россия',
        address: {
          city: 'Казань',
          state: 'Республика Татарстан',
          country: 'Россия',
        },
      }), { status: 200 }),
    )

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: true,
      value: {
        name: 'Казань, Россия',
        regionEvidence: { source: 'nominatim' },
      },
    })
  })

  it('допускает корректный ответ без названия и региона', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ address: {} }), { status: 200 }),
    )

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: true,
      value: { regionEvidence: { source: 'nominatim' } },
    })
  })

  it.each([
    ['нет address', {}],
    ['address не объект', { address: 'Казань' }],
    ['ISO-код не строка', { address: { 'ISO3166-2-lvl4': 73 } }],
  ])('возвращает invalid для повреждённого ответа: %s', async (_case, body) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    )

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
  })

  it('возвращает invalid при ошибке разбора JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('{', { status: 200 }),
    )

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
  })

  it('возвращает unavailable для HTTP-ошибки', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
  })

  it('не отправляет запрос офлайн', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const fetcher = vi.fn()

    expect(await resolvePlaceName(coordinates, { fetcher })).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'offline' },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('прерывает зависший запрос по таймауту', async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const fetcher = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }) as unknown as typeof fetch

    const resultPromise = resolvePlaceName(coordinates, {
      fetcher,
      timeoutMs: 25,
    })
    await vi.advanceTimersByTimeAsync(25)

    expect(await resultPromise).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
    expect(requestSignal?.aborted).toBe(true)
  })
})
