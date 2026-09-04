import type { DataFailure } from '../domain/errors'
import { failure, success, type Result } from '../domain/result'
import {
  type CityCatalog,
  type CityCatalogService,
  type CityWorkerCommand,
  type CityWorkerRequest,
  type CityWorkerResponse,
} from './cityCatalog'

interface PendingRequest {
  resolve: (value: Result<unknown, DataFailure>) => void
}

let worker: Worker | null = null
let nextRequestId = 0
let catalogPromise: Promise<Result<CityCatalog, DataFailure>> | null = null
const pendingRequests = new Map<number, PendingRequest>()

function unavailableFailure(): DataFailure {
  return { kind: 'data', reason: 'unavailable' }
}

function failWorker(): void {
  for (const request of pendingRequests.values()) {
    request.resolve(failure(unavailableFailure()))
  }
  pendingRequests.clear()
  worker?.terminate()
  worker = null
  catalogPromise = null
}

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./cityCatalog.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.addEventListener('message', (event: MessageEvent<CityWorkerResponse>) => {
    const response = event.data
    const pending = pendingRequests.get(response.id)
    if (!pending) return

    pendingRequests.delete(response.id)
    if (response.ok) {
      pending.resolve(success(response.result))
    } else {
      pending.resolve(failure(response.error))
    }
  })
  worker.addEventListener('error', () => {
    failWorker()
  })
  worker.addEventListener('messageerror', () => {
    failWorker()
  })
  return worker
}

function request<T>(command: CityWorkerCommand): Promise<Result<T, DataFailure>> {
  const id = nextRequestId
  nextRequestId += 1

  return new Promise<Result<T, DataFailure>>((resolve) => {
    pendingRequests.set(id, {
      resolve: (result) => resolve(result as Result<T, DataFailure>),
    })
    try {
      getWorker().postMessage({ ...command, id } satisfies CityWorkerRequest)
    } catch {
      failWorker()
    }
  })
}

export const cityCatalogService: CityCatalogService = {
  load: () => {
    if (catalogPromise) return catalogPromise

    const loading = request<CityCatalog>({ type: 'load' }).then((result) => {
      if (!result.ok && catalogPromise === loading) catalogPromise = null
      return result
    })
    catalogPromise = loading
    return catalogPromise
  },
  search: async (query) => {
    const catalogResult = await cityCatalogService.load()
    if (!catalogResult.ok) return failure(catalogResult.error)
    return request({ type: 'search', query })
  },
  findNearest: async (latitude, longitude, maxDistanceKm) => {
    const catalogResult = await cityCatalogService.load()
    if (!catalogResult.ok) return failure(catalogResult.error)
    return request({
      type: 'findNearest',
      latitude,
      longitude,
      maxDistanceKm,
    })
  },
}
