import {
  findNearestCity,
  getCountryGroups,
  searchCities,
  type CityDataset,
} from '../domain/cities'
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

let datasetPromise: Promise<CityDataset> | null = null

function getDataset(): Promise<CityDataset> {
  datasetPromise ??= loadCityDataset().catch((error: unknown) => {
    datasetPromise = null
    throw error
  })
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
  void getDataset().then((dataset) => {
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
  }).catch((error: unknown) => {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Не удалось загрузить города',
    })
  })
})
