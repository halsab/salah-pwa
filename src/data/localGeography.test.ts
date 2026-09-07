import { afterEach, describe, expect, it, vi } from 'vitest'
import geometry from '../../public/data/tatarstan-boundary.json'
import { loadLocalGeography } from './localGeography'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('offline geographic package', () => {
  it('requests only a fixed local URL and parses the shipped polygon', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(geometry)))
    vi.stubGlobal('fetch', fetcher)
    expect(await loadLocalGeography()).toEqual(geometry)
    expect(fetcher).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}data/tatarstan-boundary.json`, expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }))
  })
  it.each([new Response('{}'), new Response('', { status: 404 })])('handles missing or malformed data', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    expect(await loadLocalGeography()).toBeNull()
  })
  it('bounds network waiting and aborts the actual fetch', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    const loading = loadLocalGeography()
    await vi.advanceTimersByTimeAsync(1500)
    expect(await loading).toBeNull()
  })
})
