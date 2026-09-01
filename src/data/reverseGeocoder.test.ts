import { describe, expect, it, vi } from 'vitest'

import { resolvePlaceName } from './reverseGeocoder'

describe('resolvePlaceName', () => {
  it('передаёт только округлённые координаты и возвращает город со страной', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          address: { city: 'Москва', country: 'Россия' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(
      resolvePlaceName(
        {
          latitude: 55.755826,
          longitude: 37.617306,
          accuracy: 12,
          timestamp: 100,
        },
        fetcher,
      ),
    ).resolves.toBe('Москва, Россия')

    const requestedUrl = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(requestedUrl.searchParams.get('lat')).toBe('55.756')
    expect(requestedUrl.searchParams.get('lon')).toBe('37.617')
    expect(requestedUrl.searchParams.get('accept-language')).toBe('ru')
  })

  it('понимает посёлки и сообщает об отсутствии названия', async () => {
    const villageFetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ address: { village: 'Иннополис' } }), {
        status: 200,
      }),
    )
    await expect(
      resolvePlaceName(
        { latitude: 55.75, longitude: 48.74, accuracy: null, timestamp: 100 },
        villageFetcher,
      ),
    ).resolves.toBe('Иннополис')

    const emptyFetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ address: {} }), { status: 200 }),
    )
    await expect(
      resolvePlaceName(
        { latitude: 55.75, longitude: 48.74, accuracy: null, timestamp: 100 },
        emptyFetcher,
      ),
    ).rejects.toThrow('Название населённого пункта не найдено')
  })
})
