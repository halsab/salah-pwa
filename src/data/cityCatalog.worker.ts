import type { CityWorkerRequest, CityWorkerResponse } from './cityCatalog'
import { createCityCatalogEngine } from './cityCatalogEngine'

const workerScope = self as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<CityWorkerRequest>) => void) => void
  postMessage: (message: CityWorkerResponse) => void
}
const catalog = createCityCatalogEngine()
workerScope.addEventListener('message', ({ data: request }) => {
  const operation = request.type === 'load' ? catalog.load()
    : request.type === 'search' ? catalog.search(request.query)
      : catalog.findNearest(request.latitude, request.longitude, request.maxDistanceKm)
  void operation.then(result => workerScope.postMessage(result.ok
    ? { id: request.id, ok: true, result: result.value }
    : { id: request.id, ok: false, error: result.error }))
    .catch(() => workerScope.postMessage({ id: request.id, ok: false, error: { kind: 'data', reason: 'unavailable' } }))
})
