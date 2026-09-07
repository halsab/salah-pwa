import { afterEach, expect, it } from 'vitest'
import { openDB } from 'idb'
import { clearAppData, deleteSalahDatabase, getDataGeneration, getSetting, saveSettings, setSetting } from './database'
import { automaticPreferences } from '../domain/sourcePreferences'

afterEach(deleteSalahDatabase)

it('атомарно удаляет все пользовательские и legacy записи, сохраняя соединение', async () => {
  await setSetting('sourcePreferences', automaticPreferences())
  const connection = await openDB('salah')
  await connection.put('settings', { key: 'legacy-private', value: { coordinates: [55, 49] } })
  const generation = await getDataGeneration()
  expect((await clearAppData()).ok).toBe(true)
  expect(await connection.getAll('settings')).toEqual([])
  expect(await connection.getAll('days')).toEqual([])
  expect(await connection.getAll('meta')).toEqual([])
  expect(await getDataGeneration()).toBe(generation + 1)
  connection.close()
})

it('отсекает запись старой вкладки на уровне транзакции и разрешает новую сессию', async () => {
  const generation = await getDataGeneration()
  await clearAppData()
  expect((await saveSettings({ sourcePreferences: automaticPreferences() }, () => true, generation)).ok).toBe(false)
  expect(await getSetting('sourcePreferences')).toEqual({ ok: true, value: undefined })
  expect((await saveSettings({ sourcePreferences: automaticPreferences() }, () => true, await getDataGeneration())).ok).toBe(true)
})

it('не восстанавливает выбор, режим или оформление после повторной инициализации', async () => {
  const { createPrayerRepository } = await import('../data/prayerRepository')
  const first = createPrayerRepository()
  await first.initialize()
  await first.saveSettings({ appearance: 'dark', sourcePreferences: {mode:'manual',source:{kind:'official',provider:'dumRt'}} })
  await clearAppData()
  expect((await first.saveSettings({ appearance: 'dark' })).ok).toBe(false)
  const second = createPrayerRepository()
  const result = await second.initialize()
  expect(result.ok && result.value).toMatchObject({ locationChoice:null,appearance:'system',preferences:{mode:'automatic'},meta:null,dataState:'not-loaded' })
  expect((await second.saveSettings({ appearance:'light' })).ok).toBe(true)
})

it('не позволяет старому refresh записать таблицу после очистки', async () => {
  const { completeDataset } = await import('../test/prayerDataset')
  const { replaceDataset, getStoredDataset } = await import('./database')
  const generation = await getDataGeneration()
  await clearAppData()
  const result = await replaceDataset(completeDataset(), {version:'old',sha256:'old',url:'prayer-times-current.json'}, {generation, revision:null, isCurrent:()=>true})
  expect(result).toEqual({ok:false,error:{kind:'data',reason:'superseded'}})
  expect(await getStoredDataset()).toEqual({ok:true,value:null})
})
