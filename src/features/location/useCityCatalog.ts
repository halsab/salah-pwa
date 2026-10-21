import { useCallback, useRef, useState } from 'react'

import type { CityCatalogService } from '../../data/cityCatalog'

export type CityCatalogStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error'

interface CityCatalogServices {
  cities: CityCatalogService
}

export function useCityCatalog(services: CityCatalogServices) {
  const [cityCatalogStatus, setCityCatalogStatus] = useState<CityCatalogStatus>('idle')
  const status = useRef(cityCatalogStatus)
  const cityCatalogLoad = useRef<Promise<void> | null>(null)

  const updateStatus = useCallback((next: CityCatalogStatus) => {
    status.current = next
    setCityCatalogStatus(next)
  }, [])

  const loadCities = useCallback(() => {
    if (status.current === 'ready' || cityCatalogLoad.current) return

    updateStatus('loading')
    const load = services.cities.load().then((result) => {
      if (result.ok) {
        updateStatus('ready')
        return
      }
      updateStatus(result.error.reason === 'offline' ? 'offline' : 'error')
    }).catch(() => {
      updateStatus('error')
    }).finally(() => {
      cityCatalogLoad.current = null
    })
    cityCatalogLoad.current = load
  }, [services, updateStatus])

  return { cityCatalogStatus, loadCities }
}
