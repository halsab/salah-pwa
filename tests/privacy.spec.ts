import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { back, choosePlace, expectSchedule, openSource, openReset, setSource, expect, readSavedSetting, test } from './fixtures'

test('конфиденциальность открывается внутри настроек и возвращает фокус', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Данные и конфиденциальность' })
  await trigger.click()
  const region = page.getByRole('region', { name: 'Данные и конфиденциальность' })
  await expect(region.getByRole('heading', { level: 1, name: 'Конфиденциальность' })).toBeVisible()
  await expect(region.getByRole('heading', { level: 2 })).toHaveCount(4)
  await expect(region).toContainText('GitHub получает стандартные технические данные сетевого запроса, включая IP-адрес')
  await expect(region).toContainText('Координаты и выбранное место не передаются поставщикам')
  await expect(region.getByRole('button', { name: 'Удалить данные' })).toBeVisible()
  await expect(region.getByRole('link', { name: 'Конфиденциальность' })).toHaveCount(0)
  const content = region.locator('.screen-content')
  await content.evaluate(element => { element.scrollTop = element.scrollHeight })
  const lastParagraph = await region.locator('.markdown-article p').last().boundingBox()
  const contentBounds = await content.boundingBox()
  const actionBounds = await region.getByRole('button', { name: 'Удалить данные' }).boundingBox()
  if (!lastParagraph || !contentBounds || !actionBounds) throw new Error('Не удалось измерить прокрутку privacy')
  expect(lastParagraph.y + lastParagraph.height).toBeLessThanOrEqual(contentBounds.y + contentBounds.height + 1)
  expect(actionBounds.y).toBeGreaterThanOrEqual(contentBounds.y + contentBounds.height)
  await back(page)
  await expect(trigger).toBeFocused()
})

test('текстовые экраны не выходят за ширину mobile и desktop', async ({ page }) => {
  for (const [width, height] of [[320, 800], [390, 844], [667, 375], [1280, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('./')
    await page.getByRole('button', { name: 'Настройки', exact: true }).click()
    for (const name of ['Данные и конфиденциальность', 'О приложении']) {
      await page.getByRole('button', { name }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      const article = page.locator('.markdown-article')
      expect(await article.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      await back(page)
    }
  }
})

test('репозиторий содержит MIT лицензию и уведомления о третьих сторонах', async () => {
  const [license, notices] = await Promise.all([
    readFile(resolve(process.cwd(), 'LICENSE'), 'utf8'),
    readFile(resolve(process.cwd(), 'THIRD_PARTY_NOTICES.md'), 'utf8'),
  ])

  expect(license).toContain('MIT License')
  expect(license).toContain('Copyright (c) 2026 halsab')
  for (const expected of [
    'Old Timey Mono',
    'public/old-timey-mono-license.txt',
    'GeoNames',
    'OpenStreetMap',
    'ДУМ РТ',
  ]) {
    expect(notices).toContain(expected)
  }
  for (const dependency of [
    /\[React \/ ReactDOM 19\.2\.8\]\(https:\/\/github\.com\/react\/react\) — MIT/,
    /\[adhan 4\.4\.6\]\(https:\/\/github\.com\/batoulapps\/adhan-js\) — MIT/,
    /\[idb 8\.0\.3\]\(https:\/\/github\.com\/jakearchibald\/idb\) — ISC/,
    /\[vite-plugin-pwa 1\.3\.0\]\(https:\/\/github\.com\/vite-pwa\/vite-plugin-pwa\) — MIT/,
    /\[Workbox 7\.4\.1\]\(https:\/\/github\.com\/googlechrome\/workbox\) — MIT/,
    /\[Scheduler 0\.27\.0\]\(https:\/\/github\.com\/facebook\/react\) — MIT/,
  ]) {
    expect(notices).toMatch(dependency)
  }
})

test('GPS and automatic startup keep coordinates out of every request and never call Nominatim', async ({ context, page }) => {
  const latitude = 55.812345
  const longitude = 49.123456
  const requests: { url: string; body: string }[] = []
  const messages: string[] = []
  context.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }))
  page.on('console', message => messages.push(message.text()))
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude, longitude, accuracy: 15 })
  await page.goto('./')
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect(page.getByRole('button', { name: /Моё местоположение|Рядом:/ })).toBeVisible()
  await expectSchedule(page)
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('salah')
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('settings', 'readwrite')
      const store = tx.objectStore('settings')
      const read = store.get('locationChoice')
      read.onsuccess = () => {
        const record = read.result as { key: string; value: { place?: { timestamp: number }; source: string } } | undefined
        if (!record?.value.place) { tx.abort(); return }
        record.value.place.timestamp = 1
        store.put(record)
      }
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(new Error('Не удалось состарить GPS-выбор')) }
    }
  }))
  let starts = 0
  page.on('request', request => { if (request.url().endsWith('/data/tatarstan-boundary.json')) starts += 1 })
  await page.reload()
  await expect(page.getByRole('button', { name: /Моё местоположение|Рядом:/ })).toBeVisible()
  await expect.poll(() => starts).toBeGreaterThan(0)
  expect(await readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { accuracy: 15 } })
  expect(requests.filter(request => !request.url.startsWith('http://127.0.0.1:4175/'))).toEqual([])
  for (const request of requests) {
    expect(request.url).not.toMatch(/nominatim/i)
    for (const coordinate of [latitude, longitude]) {
      for (const value of [String(coordinate), coordinate.toFixed(3), coordinate.toFixed(4)]) {
        expect(request.url + request.body).not.toContain(value)
      }
    }
  }
  expect(messages.join('\n')).not.toMatch(/55\.812345|49\.123456/)
})

test('публичные запросы при поиске, настройках, копировании и удалении не содержат пользовательских данных', async ({ page, context }, testInfo) => {
  let phase = 'first-launch'
  const requests: { phase: string; url: string; method: string; body: string | null }[] = []
  const errors: string[] = []
  context.on('request', request => requests.push({ phase, url: request.url(), method: request.method(), body: request.postData() }))
  page.on('pageerror', error => errors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  const isPackage = (url: string) => /\/data\/cities\/[a-f0-9]{20}\/[A-Z]{2}-[0-9]+\.json$/.test(url)
  expect(requests.filter(request => isPackage(request.url))).toEqual([])
  await choosePlace(page)
  expect(requests.some(request => request.url.endsWith('/data/prayer-times-current.json'))).toBe(true)
  phase = 'repeat-launch'
  await page.reload()
  await openSource(page)
  await page.getByRole('button', { name: 'О расписании' }).click()
  await expect(page.getByRole('region', { name: 'Сведения об источнике' })).toContainText(/Проверено/)
  expect(requests.filter(request => request.phase === phase && request.url.endsWith('/data/prayer-times-current.json'))).toEqual([])
  await back(page); await back(page); await back(page)
  phase = 'search-and-select'
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  expect(requests.some(request => request.phase === phase && isPackage(request.url))).toBe(true)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { cityId: 745044 } })
  phase = 'settings'
  await openSource(page)
  await setSource(page, 'Ручной расчёт')
  await expect.poll(() => readSavedSetting(page, 'sourcePreferences')).toMatchObject({ mode: 'manual' })
  await back(page)
  phase = 'sharing'
  await page.getByRole('button', { name: 'Поделиться' }).click()
  await expect(page.getByRole('img', { name: /QR-код/ })).toBeVisible()
  await page.getByRole('button', { name: 'Скопировать ссылку' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://halsab.github.io/salah-pwa/')
  await back(page); await back(page)
  phase = 'table-check'
  const response = page.waitForResponse(response => response.url().endsWith('/data/prayer-times-manifest.json'))
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  expect((await response).status()).toBe(200)
  phase = 'reset'
  await openReset(page)
  await page.getByRole('button', { name: 'Удалить данные', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Найти город' })).toBeVisible()
  expect(requests.filter(request => request.phase === 'reset' && /prayer-times-/.test(request.url))).toEqual([])
  expect(await context.cookies()).toEqual([])
  for (const request of requests) {
    const url = new URL(request.url)
    expect(url.origin).toBe('http://127.0.0.1:4175')
    expect(url.pathname).toMatch(/^\/salah-pwa\/(?:$|index\.html$|assets\/[^/]+$|[a-z0-9-]+\.(?:js|svg|png|txt|webmanifest)$|data\/(?:prayer-times-(?:current|manifest)\.json|cities\/index\.json|cities\/[a-f0-9]{20}\/[A-Z]{2}-[0-9]+\.json|tatarstan-boundary\.(?:json|NOTICE\.txt)|ODbL-1\.0\.txt)$)/)
    expect([...url.searchParams.keys()].filter(key => key !== '__WB_REVISION__')).toEqual([])
    expect(request.method).toBe('GET')
    expect(request.body).toBeNull()
    expect(decodeURIComponent(request.url)).not.toMatch(/Стамбул|745044|locationChoice|sourcePreferences|nominatim/i)
  }
  expect(errors).toEqual([])
  await testInfo.attach('production-requests', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' })
})
