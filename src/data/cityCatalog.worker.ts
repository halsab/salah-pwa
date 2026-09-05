import {
  findNearestCity,
  getCountryGroups,
  searchCities,
  type CityDataset,
} from '../domain/cities'
import type { DataFailure } from '../domain/errors'
import { failure, type Result } from '../domain/result'
import {
  type CityCatalog,
  type CityWorkerRequest,
  type CityWorkerResponse,
} from './cityCatalog'
import { loadCityDataset } from './cityRepository'

const workerScope = self as unknown as {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<CityWorkerRequest>) => void,
  ) => void
  postMessage: (message: CityWorkerResponse) => void
}

let datasetPromise: Promise<Result<CityDataset, DataFailure>> | null = null

function getDataset(): Promise<Result<CityDataset, DataFailure>> {
  if (datasetPromise) return datasetPromise

  const loading = loadCityDataset()
    .catch(() => failure<DataFailure>({ kind: 'data', reason: 'unavailable' }))
    .then((result) => {
      if (!result.ok && datasetPromise === loading) datasetPromise = null
      return result
    })
  datasetPromise = loading
  return datasetPromise
}

function createCatalog(dataset: CityDataset): CityCatalog {
  return {
    source: dataset.source,
    countryGroups: getCountryGroups(dataset),
  }
}

workerScope.addEventListener('message', (event) => {
  const request = event.data
  void getDataset().then((datasetResult) => {
    if (!datasetResult.ok) {
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error: datasetResult.error,
      })
      return
    }
    const dataset = datasetResult.value
    let result: CityWorkerResponse & { ok: true }

    switch (request.type) {
      case 'load':
        result = { id: request.id, ok: true, result: createCatalog(dataset) }
        break
      case 'search':
        result = { id: request.id, ok: true, result: searchCities(dataset, request.query) }
        break
      case 'findNearest':
        result = {
          id: request.id,
          ok: true,
          result: findNearestCity(
            request.latitude,
            request.longitude,
            dataset.cities,
            request.maxDistanceKm,
          ),
        }
        break
    }

    workerScope.postMessage(result)
  }).catch(() => {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
  })
})
