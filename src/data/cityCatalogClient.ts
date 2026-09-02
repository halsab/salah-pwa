import {
  type CityCatalog,
  type CityCatalogService,
  type CityWorkerCommand,
  type CityWorkerRequest,
  type CityWorkerResponse,
} from './cityCatalog'

interface PendingRequest {
  resolve: (value: CityWorkerResponse & { ok: true }) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let nextRequestId = 0
let catalogPromise: Promise<CityCatalog> | null = null
const pendingRequests = new Map<number, PendingRequest>()

function failWorker(message: string): void {
  const error = new Error(message)
  for (const request of pendingRequests.values()) request.reject(error)
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
      pending.resolve(response)
    } else {
      pending.reject(new Error(response.error))
    }
  })
  worker.addEventListener('error', (event) => {
    failWorker(event.message || 'Не удалось открыть справочник городов')
  })
  worker.addEventListener('messageerror', () => {
    failWorker('Не удалось обработать справочник городов')
  })
  return worker
}

function request<T>(command: CityWorkerCommand): Promise<T> {
  const id = nextRequestId
  nextRequestId += 1

  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (response) => resolve(response.result as T),
      reject,
    })
    getWorker().postMessage({ ...command, id } satisfies CityWorkerRequest)
  })
}

export const cityCatalogService: CityCatalogService = {
  load: () => {
    catalogPromise ??= request<CityCatalog>({ type: 'load' }).catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
    return catalogPromise
  },
  search: async (query) => {
    await cityCatalogService.load()
    return request({ type: 'search', query })
  },
  findNearest: async (latitude, longitude, maxDistanceKm) => {
    await cityCatalogService.load()
    return request({
      type: 'findNearest',
      latitude,
      longitude,
      maxDistanceKm,
    })
  },
}
