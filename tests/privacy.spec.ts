import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { back, choosePlace, expectSchedule, openSource, openReset, setSource, expect, readSavedSetting, test } from './fixtures'

test('статическая privacy page точно описывает данные и внешние запросы', async ({ page }) => {
  await page.goto('./privacy/')

  await expect(page.getByRole('heading', { level: 1, name: 'Конфиденциальность' })).toBeVisible()
  await expect(page.locator('script')).toHaveCount(0)
  await expect(page.locator('style')).toHaveCount(0)
  const stylesheet = page.locator('link[rel="stylesheet"]')
  await expect(stylesheet).toHaveCount(1)
  await expect(stylesheet).toHaveAttribute('href', /^\/salah-pwa\/assets\/privacy-.+\.css$/)

  await expect(page.getByText('Приложение поддерживает GitHub-пользователь halsab.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'GitHub Issues проекта' })).toHaveAttribute('href', 'https://github.com/halsab/salah-pwa/issues')
  await expect(page.locator('main')).toContainText('Обращения там публичные')
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)

  const localData = page.getByRole('region', { name: 'Данные на устройстве' })
  for (const detail of ['выбранное место', 'координаты', 'точность', 'время получения', 'часовой пояс', 'настройки', 'недавних', 'до сброса', 'Браузер может удалить']) {
    await expect(localData).toContainText(detail)
  }
  await expect(page.locator('main')).toContainText('нет аккаунтов, собственного сервера, аналитики, рекламы и профилирования')
  await expect(page.locator('main')).toContainText('Историю перемещений и поисковых запросов Salah не ведёт')
  await expect(page.locator('main')).not.toContainText(/IndexedDB|Cache Storage|SHA-256|\bhash\b|JSON|Nominatim|параметры API/i)

  const deletion = page.getByRole('region', { name: 'Как удалить данные' })
  await expect(deletion).toContainText('Настройки → Данные и конфиденциальность → Удалить данные')
  await expect(deletion).toContainText('подтвердите удаление')
  await expect(deletion).toContainText('во всех вкладках')
  await expect(deletion).toContainText('загруженные публичные справочники')
  await expect(deletion).toContainText('настройках браузера')
  await expect(page.getByRole('button', { name: /сброс|удалить/i })).toHaveCount(0)

  await expect(page.getByRole('link', { name: 'политике конфиденциальности GitHub' })).toHaveAttribute(
    'href', 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
  )
  const network = page.getByRole('region', { name: 'Сеть и геопозиция' })
  await expect(network).toContainText(/GitHub Pages.+IP-адрес.+запрос/is)
  await expect(network).toContainText('состав запрошенных пакетов')
  await expect(network).toContainText('не добавляет GPS-координаты')
  await expect(network).toContainText('Браузер или ОС')
  await expect(network).toContainText('ранее выданном разрешении')
  await expect(network).toContainText('Поделиться')
})

test('сохраняет атрибуцию и единое информационное позиционирование', async ({ page, request }) => {
  await page.goto('./privacy/')
  for (const [name, href] of [
    ['ДУМ РТ', 'https://dumrt.ru/ru/help-info/prayertime/'],
    ['GeoNames', 'https://www.geonames.org/'],
    ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
    ['OpenStreetMap', 'https://www.openstreetmap.org/copyright'],
    ['ODbL', 'https://opendatacommons.org/licenses/odbl/1-0/'],
    ['Источники, изменения данных и лицензии', 'https://github.com/halsab/salah-pwa/blob/main/THIRD_PARTY_NOTICES.md'],
  ]) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
  const disclaimer = 'Salah — информационное приложение и не представляет ДУМ РТ или другую религиозную организацию.'
  await expect(page.locator('main')).toContainText(disclaimer)
  await expect(page.locator('main')).toContainText('При наличии официального местного расписания рекомендуется руководствоваться им')
  const appHtml = await (await request.get('./')).text()
  expect(appHtml.match(/Salah — информационное приложение/g)).toHaveLength(2)
  const manifest = await (await request.get('./manifest.webmanifest')).json() as { description: string; start_url: string; scope: string; name: string }
  expect(manifest.description).toBe('Время намаза для выбранного места: официальные таблицы и расчёт на устройстве. Сохранённые данные доступны офлайн.')
  expect(manifest.start_url).toBe('./')
  expect(manifest.scope).toBe('./')
  expect(manifest.name).toBe('Salah — времена намаза')
})

test('переходит из приложения в privacy page и обратно без роутера', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Данные и конфиденциальность' }).click()
  await page.getByRole('link', { name: 'Конфиденциальность' }).click()
  await expect(page).toHaveURL(/\/salah-pwa\/privacy\/$/)
  await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()

  await page.getByRole('link', { name: 'Назад' }).first().click()
  await expect(page).toHaveURL(/\/salah-pwa\/$/)
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
})

test('не обрезает заголовок и сохраняет touch-цели 44 px на мобильном экране', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('./privacy/')

  const heading = page.getByRole('heading', { level: 1, name: 'Конфиденциальность' })
  const dimensions = await heading.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  for (const link of await page.locator('main a').all()) {
    const bounds = await link.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
  }
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    const contrast = await page.locator('.privacy-footer').evaluate(element => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      const luminance = (color: string) => {
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const [red = 0, green = 0, blue = 0] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
          .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        return red * 0.2126 + green * 0.7152 + blue * 0.0722
      }
      const foreground = luminance(getComputedStyle(element).color)
      const background = luminance(getComputedStyle(document.body).backgroundColor)
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })
    expect(contrast, `footer contrast in ${colorScheme}`).toBeGreaterThanOrEqual(4.5)
  }

})

test('privacy page открывается офлайн после первого запуска только приложения', async ({ context, page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.goto('./privacy/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()
    await expect(page.locator('script')).toHaveCount(0)
    await page.getByRole('link', { name: 'Назад' }).first().click()
    await expect(page.getByRole('button', { name: 'Найти город', exact: true })).toBeVisible()
  } finally {
    await context.setOffline(false)
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
  await page.getByText('Подробности', { exact: true }).click()
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
    expect(url.pathname).toMatch(/^\/salah-pwa\/(?:$|index\.html$|privacy\/index\.html$|assets\/[^/]+$|[a-z0-9-]+\.(?:js|svg|png|txt|webmanifest)$|data\/(?:prayer-times-(?:current|manifest)\.json|cities\/index\.json|cities\/[a-f0-9]{20}\/[A-Z]{2}-[0-9]+\.json|tatarstan-boundary\.(?:json|NOTICE\.txt)|ODbL-1\.0\.txt)$)/)
    expect([...url.searchParams.keys()].filter(key => key !== '__WB_REVISION__')).toEqual([])
    expect(request.method).toBe('GET')
    expect(request.body).toBeNull()
    expect(decodeURIComponent(request.url)).not.toMatch(/Стамбул|745044|locationChoice|sourcePreferences|nominatim/i)
  }
  expect(errors).toEqual([])
  await testInfo.attach('production-requests', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' })
})
