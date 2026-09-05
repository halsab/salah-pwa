import { useCallback, useRef, useState } from 'react'

import type { CityCatalog, CityCatalogService } from '../../data/cityCatalog'

export type CityCatalogStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error'

interface CityCatalogServices {
  cities: CityCatalogService
}

export function useCityCatalog(services: CityCatalogServices) {
  const [cityCatalog, setCityCatalog] = useState<CityCatalog | null>(null)
  const [cityCatalogStatus, setCityCatalogStatus] = useState<CityCatalogStatus>('idle')
  const cityCatalogLoad = useRef<Promise<void> | null>(null)

  const loadCities = useCallback(() => {
    if (cityCatalog || cityCatalogLoad.current) return

    setCityCatalogStatus('loading')
    const load = services.cities.load().then((result) => {
      if (result.ok) {
        setCityCatalog(result.value)
        setCityCatalogStatus('ready')
        return
      }
      setCityCatalogStatus(result.error.reason === 'offline' ? 'offline' : 'error')
    }).catch(() => {
      setCityCatalogStatus('error')
    }).finally(() => {
      cityCatalogLoad.current = null
    })
    cityCatalogLoad.current = load
  }, [cityCatalog, services])

  return { cityCatalog, cityCatalogStatus, loadCities }
}
