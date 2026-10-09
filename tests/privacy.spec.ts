import { expectSchedule, readSavedSetting, expect, test } from './fixtures'

test('геопозиция остаётся локальной и не отправляет координаты', async ({ context, page }) => {
  const latitude = 55.812345
  const longitude = 49.123456
  const requests: { url: string; body: string }[] = []
  context.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }))
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude, longitude, accuracy: 15 })

  await page.goto('./')
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expectSchedule(page)
  await expect.poll(() => readSavedSetting(page, 'locationChoice'))
    .toMatchObject({ place: { selection: 'gps', latitude, longitude, accuracy: 15 } })

  const appOrigin = new URL(page.url()).origin
  expect(requests.filter(({ url }) => new URL(url).origin !== appOrigin)).toEqual([])
  const payloads = requests.map(({ url, body }) => `${url} ${body}`).join('\n')
  for (const coordinate of [latitude, longitude]) {
    for (const value of [String(coordinate), coordinate.toFixed(3), coordinate.toFixed(4)]) {
      expect(payloads).not.toContain(value)
    }
  }
  expect(payloads).not.toMatch(/nominatim/i)
})
