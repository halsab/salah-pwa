import { describe, expect, it, vi } from 'vitest'
import { deleteVaqtProDatabase } from '../storage/database'
import { initializePrayerRepository } from './prayerRepository'

describe('calculation-only repository startup', () => {
  it('does not make network requests while restoring settings', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      await expect(initializePrayerRepository()).resolves.toMatchObject({ ok: true, value: {
        locationChoice: null, recentPlaces: [], preferences: { mode: 'automatic' },
      } })
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      await deleteVaqtProDatabase()
    }
  })
})
