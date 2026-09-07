import { afterEach, expect, it, vi } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { forceCloseDatabase } from 'fake-indexeddb'

const name = 'salah-city-catalog'
afterEach(async () => { vi.restoreAllMocks(); await deleteDB(name) })

it('closes the public catalog connection when another version blocks it, then permits retry', async () => {
  vi.resetModules()
  const storage = await import('./cityCatalogStorage')
  expect(await storage.readCatalogIndex()).toBeUndefined()
  const other = await openDB(name, 2)
  other.close()
  await expect(storage.readCatalogIndex()).rejects.toThrow()
  await deleteDB(name)
  expect(await storage.readCatalogIndex()).toBeUndefined()
})

it('reopens the local catalog after unexpected browser connection termination', async () => {
  vi.resetModules()
  const originalOpen = indexedDB.open.bind(indexedDB)
  let connection: IDBDatabase | undefined
  vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
    const request = originalOpen(...args)
    request.addEventListener('success', () => { connection = request.result })
    return request
  })
  const storage = await import('./cityCatalogStorage')
  await storage.saveCatalogShard('example', 'saved')
  if (!connection) throw new Error('Не открыто соединение')
  // В fake-indexeddb 6.2.5 декларация ошибочно требует конструктор; реализация принимает соединение.
  const closeConnection = forceCloseDatabase as unknown as (database: IDBDatabase) => void
  closeConnection(connection)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(await storage.readCatalogShard('example')).toBe('saved')
})
