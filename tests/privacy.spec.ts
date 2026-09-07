import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from './fixtures'

test('статическая privacy page точно описывает данные и внешние запросы', async ({ page }) => {
  await page.goto('./privacy/')

  await expect(page.getByRole('heading', { level: 1, name: 'Конфиденциальность' })).toBeVisible()
  await expect(page.locator('script')).toHaveCount(0)
  await expect(page.locator('style')).toHaveCount(0)
  const stylesheet = page.locator('link[rel="stylesheet"]')
  await expect(stylesheet).toHaveCount(1)
  await expect(stylesheet).toHaveAttribute('href', /^\/salah-pwa\/assets\/privacy-.+\.css$/)

  await expect(page.getByText('Владелец проекта: GitHub-пользователь halsab.')).toBeVisible()
  const projectLink = page.getByRole('link', { name: 'Страница проекта и исходный код' })
  await expect(projectLink).toHaveAttribute('href', 'https://github.com/halsab/salah-pwa')
  await expect(page.locator('main')).toContainText(/не является каналом для конфиденциальных\s+обращений/i)
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)

  await expect(page.getByText(/показывает времена намаза/i)).toBeVisible()
  await expect(page.getByText(/нет собственного сервера, аналитики и cookies/i)).toBeVisible()
  const localData = page.getByRole('region', { name: 'Что остаётся в браузере' })
  await expect(localData).toContainText('Координаты, настройки')
  await expect(localData).toContainText('и расписания сохраняются только в браузере')
  await expect(localData).toContainText('IndexedDB')
  await expect(localData).toContainText('Cache Storage')
  await expect(localData).toContainText('обзор городов — в Cache Storage')
  await expect(localData).toContainText('Загруженные пакеты городов сохраняются в IndexedDB')
  await expect(page.getByText(/удалить через настройки данных сайта в браузере/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /сброс|удалить/i })).toHaveCount(0)

  const githubPrivacy = page.getByRole('link', { name: 'политикой конфиденциальности GitHub' })
  await expect(githubPrivacy).toHaveAttribute(
    'href',
    'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
  )
  await expect(page.locator('main')).toContainText(/GitHub Pages.+IP-адрес.+запрос.+устройств/is)

  const location = page.getByRole('region', { name: 'Локальная геопозиция' })
  await expect(location).toContainText('Координаты не отправляются в Nominatim')
  await expect(location).toContainText('при запуске с ранее разрешённым GPS')
  await expect(location).toContainText('непрерывное отслеживание')
  await expect(location).toContainText('зона устройства')
  await expect(location).toContainText('30 минут')
  await expect(location).not.toContainText('Уточнить название онлайн')

})

test('указывает источники, преобразования и границы атрибуции', async ({ page }) => {
  await page.goto('./privacy/')

  await expect(page.getByRole('link', { name: 'ДУМ РТ' })).toHaveAttribute(
    'href',
    'https://dumrt.ru/ru/help-info/prayertime/',
  )
  await expect(page.locator('main')).toContainText(/таблицы.+разбираются.+полнот.+дубли.+JSON.+manifest.+SHA-256/is)
  await expect(page.getByText(/отдельная лицензия таблиц ДУМ РТ не указана/i)).toBeVisible()
  await expect(page.getByText(/не является официальным приложением ДУМ РТ/i)).toBeVisible()

  await expect(page.getByRole('link', { name: 'cities5000.zip' })).toHaveAttribute(
    'href',
    'https://download.geonames.org/export/dump/cities5000.zip',
  )
  await expect(page.getByRole('link', { name: 'alternateNamesV2.zip' })).toHaveAttribute(
    'href',
    'https://download.geonames.org/export/dump/alternateNamesV2.zip',
  )
  await expect(page.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  )
  const geonames = page.getByRole('heading', { name: 'Каталог GeoNames' }).locator('..')
  await expect(geonames).toContainText('от 5 000 человек')
  await expect(geonames).toContainText('до четырёх знаков')
  await expect(geonames).toContainText('действующие русские названия')
  await expect(geonames).toContainText('предпочтением preferred')
  await expect(geonames).toContainText('нормализованный поисковый индекс')
  await expect(geonames).toContainText('компактные записи')

  await expect(page.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/copyright',
  )
  await expect(page.getByRole('link', { name: 'ODbL' })).toHaveAttribute(
    'href',
    'https://opendatacommons.org/licenses/odbl/1-0/',
  )
  await expect(page.locator('main')).toContainText(/Названия, ранее полученные из Nominatim, сохраняются при миграции без сетевого запроса/is)
})

test('переходит из приложения в privacy page и обратно без роутера', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()

  await page.getByRole('link', { name: 'Конфиденциальность' }).click()
  await expect(page).toHaveURL(/\/salah-pwa\/privacy\/$/)
  await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()

  await page.getByRole('link', { name: 'Вернуться в Salah' }).first().click()
  await expect(page).toHaveURL(/\/salah-pwa\/$/)
  await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
})

test('не обрезает заголовок на мобильном экране', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('./privacy/')

  const heading = page.getByRole('heading', { level: 1, name: 'Конфиденциальность' })
  const dimensions = await heading.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
})

test('privacy page открывается офлайн после первого запуска только приложения', async ({ context, page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.goto('./privacy/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()
    await expect(page.locator('script')).toHaveCount(0)
    await page.getByRole('link', { name: 'Вернуться в Salah' }).first().click()
    await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
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
    'Alegreya Sans',
    'public/fonts/AlegreyaSans-OFL-1.1.txt',
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
  page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }))
  page.on('console', message => messages.push(message.text()))
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude, longitude, accuracy: 15 })
  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await expect(page.getByRole('button', { name: 'Уточнить название онлайн' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Определить автоматически' }).click()
  await expect(page.getByRole('button', { name: /Моё местоположение|Рядом:/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)
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
  await page.getByRole('button', { name: /Моё местоположение|Рядом:/ }).click()
  await page.getByText('Сведения о месте и часовой пояс', { exact: true }).click()
  await expect(page.getByText(/точность ±15 м/)).toBeVisible()
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
