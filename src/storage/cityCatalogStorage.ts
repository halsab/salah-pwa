import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CityIndex } from '../domain/cityIndex'

interface CatalogDatabase extends DBSchema {
  indexes: { key: 'current' | 'previous'; value: CityIndex }
  shards: { key: string; value: string }
}
// Публичные пакеты отделены от выбранного места и расписаний в базе salah.
let database: Promise<IDBPDatabase<CatalogDatabase>> | undefined
function openCatalogDatabase() {
  if (!database) {
    database = openDB<CatalogDatabase>('salah-city-catalog', 1, {
      upgrade(db) {
        db.createObjectStore('indexes')
        db.createObjectStore('shards')
      },
      blocking() { void database?.then(db => db.close()); database = undefined },
      terminated() { database = undefined },
    }).catch((error: unknown) => { database = undefined; throw error })
  }
  return database
}
export async function readCatalogIndex(key: 'current' | 'previous' = 'current') { return (await openCatalogDatabase()).get('indexes', key) }
export async function saveCatalogIndex(index: CityIndex) {
  const db = await openCatalogDatabase()
  const tx = db.transaction('indexes', 'readwrite')
  const current = await tx.store.get('current')
  if (current?.version !== index.version) {
    if (current) await tx.store.put(current, 'previous')
  }
  await tx.store.put(index, 'current')
  await tx.done
}
export async function readCatalogShard(key: string) { return (await openCatalogDatabase()).get('shards', key) }
export async function saveCatalogShard(key: string, text: string) { await (await openCatalogDatabase()).put('shards', text, key) }
