import { completeDataset } from '../test/prayerDataset'
import { describe, expect, it, vi } from 'vitest'

import type { PrayerDataset, PrayerDatasetManifest } from '../domain/types'
import {
  digestPrayerDatasetBytes,
  resolvePrayerDatasetUrl,
  validatePrayerDatasetManifest,
  verifyPrayerDatasetBytes,
} from './prayerDatasetManifest'

const HASH = 'a'.repeat(64)
const manifest: PrayerDatasetManifest = {
  schemaVersion: 1,
  version: `2-${HASH.slice(0, 16)}`,
  url: 'prayer-times-current.json',
  sha256: HASH,
}
const dataset = completeDataset()

describe('prayer dataset manifest', () => {
  it('принимает только schema 1, производную version, точное имя и lowercase SHA-256', () => {
    expect(validatePrayerDatasetManifest(manifest)).toEqual({
      ok: true,
      value: manifest,
    })

    const invalidValues = [
      { ...manifest, schemaVersion: 2 },
      { ...manifest, version: `2-${'b'.repeat(16)}` },
      { ...manifest, version: `v2-${HASH.slice(0, 16)}` },
      { ...manifest, url: 'other.json' },
      { ...manifest, sha256: 'A'.repeat(64) },
      { ...manifest, sha256: 'a'.repeat(63) },
    ]
    for (const value of invalidValues) {
      expect(validatePrayerDatasetManifest(value)).toEqual({
        ok: false,
        error: { kind: 'data', reason: 'invalid' },
      })
    }
  })

  it('разрешает dataset относительно manifest под BASE_URL', () => {
    expect(resolvePrayerDatasetUrl(
      '/salah-pwa/data/prayer-times-manifest.json',
      manifest,
    )).toBe('/salah-pwa/data/prayer-times-current.json')
  })

  it('вычисляет lowercase SHA-256 через WebCrypto', async () => {
    const bytes = new TextEncoder().encode('abc')

    expect(await digestPrayerDatasetBytes(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('не декодирует и не разбирает байты до успешной сверки SHA-256', async () => {
    const order: string[] = []
    const digest = vi.fn(() => {
      order.push('digest')
      return Promise.resolve('b'.repeat(64))
    })
    const decode = vi.fn(() => {
      order.push('decode')
      return JSON.stringify(dataset)
    })
    const parse = vi.fn(() => {
      order.push('parse')
      return dataset
    })

    expect(await verifyPrayerDatasetBytes(
      new Uint8Array([1, 2, 3]),
      manifest,
      { digest, decode, parse },
    )).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
    expect(order).toEqual(['digest'])
  })

  it('после digest декодирует, разбирает и проверяет schema против version', async () => {
    const order: string[] = []
    const result = await verifyPrayerDatasetBytes(
      new TextEncoder().encode(JSON.stringify(dataset)),
      manifest,
      {
        digest: () => {
          order.push('digest')
          return Promise.resolve(HASH)
        },
        decode: (bytes) => {
          order.push('decode')
          return new TextDecoder().decode(bytes)
        },
        parse: (text) => {
          order.push('parse')
          return JSON.parse(text) as unknown
        },
      },
    )

    expect(result).toEqual({ ok: true, value: dataset })
    expect(order).toEqual(['digest', 'decode', 'parse'])
    expect(await verifyPrayerDatasetBytes(
      new Uint8Array(),
      { ...manifest, version: `3-${HASH.slice(0, 16)}` },
      {
        digest: () => Promise.resolve(HASH),
        decode: () => JSON.stringify(dataset),
        parse: () => dataset,
      },
    )).toEqual({
      ok: false,
      error: { kind: 'data', reason: 'invalid' },
    })
  })
})

it.each([
  (data: PrayerDataset) => ({ ...data, days: data.days.slice(1) }),
  (data: PrayerDataset) => ({ ...data, days: [...data.days, data.days[0]] }),
  (data: PrayerDataset) => ({ ...data, locations: [...data.locations, data.locations[0]] }),
  (data: PrayerDataset) => ({ ...data, days: data.days.map(day => ({ ...day, fajrJamaat: '99:99' })) }),
  (data: PrayerDataset) => ({ ...data, days: data.days.map(day => ({ ...day, date: '2026-02-30' })) }),
  (data: PrayerDataset) => ({ ...data, locations: [{ ...data.locations[0], latitude: Infinity }] }),
  (data: PrayerDataset) => ({ ...data, source: { ...data.source, years: [2027] } }),
  (data: PrayerDataset) => ({ ...data, source: { ...data.source, updatedAt: 2026 } }),
])('rejects hashed but incomplete or corrupt data', async (corrupt) => {
  const value = corrupt(dataset)
  expect(await verifyPrayerDatasetBytes(new Uint8Array(), manifest, { digest: () => Promise.resolve(HASH), decode: () => '', parse: () => value })).toMatchObject({ ok: false, error: { reason: 'invalid' } })
})
