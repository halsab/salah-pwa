import { expectSchedule, readSavedSetting, expect, test } from './fixtures'

test('GPS и автоматический старт не отправляют координаты и не вызывают Nominatim', async ({ context, page }) => {
  const latitude = 55.812345
  const longitude = 49.123456
  const requests: { url: string; body: string }[] = []
  const messages: string[] = []
  context.on('request', (request) => requests.push({ url: request.url(), body: request.postData() ?? '' }))
  page.on('console', (message) => messages.push(message.text()))
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude, longitude, accuracy: 15 })

  await page.goto('./')
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect(page.locator('#home-location')).toBeVisible()
  await expectSchedule(page)
  await expect.poll(() => readSavedSetting(page, 'locationChoice'))
    .toMatchObject({ place: { selection: 'gps', latitude, longitude, accuracy: 15 } })

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
  page.on('request', (request) => { if (request.url().endsWith('/data/tatarstan-boundary.json')) starts += 1 })
  await page.reload()
  await expect(page.locator('#home-location')).toBeVisible()
  await expect.poll(() => starts).toBeGreaterThan(0)
  expect(await readSavedSetting(page, 'locationChoice')).toMatchObject({ place: { accuracy: 15 } })
  const appOrigin = new URL(page.url()).origin
  expect(requests.filter((request) => new URL(request.url).origin !== appOrigin)).toEqual([])
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
