import { choosePlace, expectSchedule, readSavedSetting, expect, test } from './fixtures'

test('основной путь: поиск города сохраняет выбор и показывает расписание', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto('./')
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await expectSchedule(page, 7)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.locator('#home-location')).toHaveAccessibleName(/^Стамбул(?: \d{2}:\d{2})?$/)
  await expect.poll(() => readSavedSetting(page, 'locationChoice')).toMatchObject({
    place: { name: 'Стамбул, Стамбул, Турция' },
  })
  expect(pageErrors).toEqual([])
})


test('production entry serves manifest, JavaScript and CSS from site root', async ({ request }) => {
  const response = await request.get('/')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  const manifestPath = html.match(/<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)/)?.[1]
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']manifest["']/)?.[1]
  if (!manifestPath) throw new Error('PWA manifest link is missing from production HTML')

  const manifestResponse = await request.get(manifestPath)
  expect(manifestResponse.ok()).toBe(true)
  expect(manifestResponse.headers()['content-type']).toContain('json')
  expect(await manifestResponse.json()).toMatchObject({ scope: './', start_url: './' })

  for (const pattern of [/<script[^>]+src=["']([^"']+\.js)["']/i, /<link[^>]+href=["']([^"']+\.css)["']/i]) {
    const assetPath = html.match(pattern)?.[1]
    if (!assetPath) throw new Error(`Production asset missing for pattern ${pattern}`)
    expect(assetPath).toMatch(/^\/assets\//)
    const assetResponse = await request.get(assetPath)
    expect(assetResponse.ok()).toBe(true)
    expect(assetResponse.headers()['content-type']).not.toContain('text/html')
  }
})
