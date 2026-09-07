import { afterEach, expect, it, vi } from 'vitest'
import { completeDataset } from '../test/prayerDataset'
import { deleteSalahDatabase, getDatasetMeta, replaceDataset } from '../storage/database'
import { createPrayerRepository } from './prayerRepository'
import type { PrayerDatasetManifest } from '../domain/types'

const dataset = completeDataset()
function manifest(hash = 'a', sequence = 1): PrayerDatasetManifest {
  return { schemaVersion: 1, version: `2-${hash.repeat(16)}`, sha256: hash.repeat(64), url: 'prayer-times-current.json', sequence }
}
const response = (value: unknown) => new Response(JSON.stringify(value))
function update(hash = 'a', sequence = 1, value: unknown = dataset) {
  return vi.fn().mockResolvedValueOnce(response(manifest(hash, sequence))).mockResolvedValueOnce(response(value))
}
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await deleteSalahDatabase() })

it('initializes cached state without starting or waiting for a hanging fetch', async () => {
  await replaceDataset(dataset, manifest())
  const fetcher = vi.fn(() => new Promise<Response>(() => {}))
  const repo = createPrayerRepository({ fetch: fetcher })
  expect(await repo.initialize()).toMatchObject({ ok: true, value: { meta: { identity: { sequence: 1 } } } })
  expect(fetcher).not.toHaveBeenCalled()
})
it('cold start succeeds without meta and can select calculated independently', async () => {
  const repo = createPrayerRepository({ fetch: vi.fn() })
  expect(await repo.initialize()).toMatchObject({ ok: true, value: { meta: null, preferences: { mode: 'automatic' } } })
})
it('deduplicates refresh and emits installed metadata only after atomic commit', async () => {
  const fetcher = update()
  const repo = createPrayerRepository({ fetch: fetcher, digest: () => Promise.resolve('a'.repeat(64)) })
  const listener = vi.fn()
  repo.subscribe(listener)
  const first = repo.refresh()
  expect(repo.refresh()).toBe(first)
  await first
  expect(fetcher).toHaveBeenCalledTimes(2)
  const stored = await getDatasetMeta()
  expect(stored).toMatchObject({ ok: true, value: { identity: { sequence: 1 } } })
  expect(listener.mock.lastCall?.[0]).toMatchObject({ meta: stored.ok ? stored.value : null, update: { status: 'idle' } })
})
it('timeout aborts hanging fetch and preserves installed dataset', async () => {
  await replaceDataset(dataset, manifest())
  let signal: AbortSignal | null | undefined
  const repo = createPrayerRepository({ timeoutMs: 5, fetch: (_url, init) => { signal = init?.signal; return new Promise<Response>(() => {}) } })
  const result = await repo.refresh()
  expect(result).toMatchObject({ meta: { identity: { sequence: 1 } }, update: { status: 'failed', reason: 'timeout' } })
  expect(signal?.aborted).toBe(true)
})
it.each(['hash', 'schema', 'transaction'] as const)('failed %s replacement retains usable dataset and exposes freshness', async reason => {
  await replaceDataset(dataset, manifest())
  const repo = createPrayerRepository({ fetch: update('b', 2, reason === 'schema' ? {} : dataset), digest: () => Promise.resolve((reason === 'hash' ? 'c' : 'b').repeat(64)),
    ...(reason === 'transaction' ? { replace: vi.fn().mockResolvedValue({ ok: false, error: { kind: 'storage', reason: 'unavailable' } }) } : {}) })
  expect(await repo.refresh()).toMatchObject({ meta: { identity: { sequence: 1 } }, update: { status: 'failed' } })
  expect(await getDatasetMeta()).toMatchObject({ value: { identity: { sequence: 1 } } })
})
it('rejects a stale release and late competing refresh via transactional compare-and-swap', async () => {
  await replaceDataset(dataset, manifest())
  let finish!: (value: Response) => void
  const slow = vi.fn().mockResolvedValueOnce(response(manifest('b', 2))).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const older = createPrayerRepository({ fetch: slow, digest: () => Promise.resolve('b'.repeat(64)) })
  const pending = older.refresh()
  await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(2))
  const newer = createPrayerRepository({ fetch: update('c', 3), digest: () => Promise.resolve('c'.repeat(64)) })
  await newer.refresh()
  finish(response(dataset))
  await pending
  expect(await getDatasetMeta()).toMatchObject({ value: { identity: { sequence: 3 } } })
  await createPrayerRepository({ fetch: update('b', 2), digest: () => Promise.resolve('b'.repeat(64)) }).refresh()
  expect(await getDatasetMeta()).toMatchObject({ value: { identity: { sequence: 3 } } })
})
it('invalidate-and-drain ignores a late response before reset', async () => {
  let finish!: (value: Response) => void
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  const repo = createPrayerRepository({ fetch: fetcher })
  const listener = vi.fn()
  repo.subscribe(listener)
  const pending = repo.refresh()
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
  await repo.invalidateAndDrain()
  const calls = listener.mock.calls.length
  finish(response(manifest()))
  await pending
  expect(listener).toHaveBeenCalledTimes(calls)
  expect(await getDatasetMeta()).toMatchObject({ value: undefined })
})

it('matching identity skips dataset, digest, decode and parse', async () => {
  await replaceDataset(dataset, manifest())
  const fetcher = vi.fn().mockResolvedValue(response(manifest()))
  const digest = vi.fn(), decode = vi.fn(), parse = vi.fn()
  const repo = createPrayerRepository({ fetch: fetcher, digest, decode, parse })
  await repo.refresh()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(digest).not.toHaveBeenCalled()
  expect(decode).not.toHaveBeenCalled()
  expect(parse).not.toHaveBeenCalled()
})
it('corrupt local rows can be replaced even when their stored hash matches the manifest', async () => {
  await replaceDataset({ ...dataset, days: dataset.days.slice(1) }, manifest())
  const repo = createPrayerRepository({ fetch: update(), digest: () => Promise.resolve('a'.repeat(64)) })
  expect(await repo.initialize()).toMatchObject({ value: { dataState: 'invalid' } })
  expect(await repo.refresh()).toMatchObject({ dataState: 'ready', update: { status: 'idle' } })
})
