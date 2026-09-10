import { back, choosePlace, openSchedule, expect, test } from './fixtures'

const CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "media-src 'none'",
  "form-action 'none'",
].join('; ')

for (const [name, path] of [['app', './'], ['privacy', './privacy/']] as const) {
  test(`${name}: CSP meta единственный и предшествует ресурсам`, async ({ page, request }) => {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    const html = await response.text()
    const metaTags = html.match(
      /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
    ) ?? []

    expect(metaTags).toHaveLength(1)
    const metaIndex = html.indexOf(metaTags[0] ?? '')
    const firstResourceIndex = html.search(/<(?:link|script)\b/i)
    expect(metaIndex).toBeGreaterThanOrEqual(0)
    expect(firstResourceIndex).toBeGreaterThan(metaIndex)

    await page.goto(path)
    const meta = page.locator('meta[http-equiv="Content-Security-Policy"]')
    await expect(meta).toHaveCount(1)
    await expect(meta).toHaveAttribute('content', CSP)
    await expect(meta).not.toHaveAttribute('content', /frame-ancestors/)
    await expect(meta).not.toHaveAttribute('content', /(?:^|\s)\*(?:\s|;|$)/)
    await expect(meta).not.toHaveAttribute('content', /(?:data|blob):|unsafe-eval/)
  })
}

interface CapturedViolation {
  blockedUri: string
  directive: string
}

test('production CSP разрешает приложение и блокирует посторонний connect', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => {
    const runtimeWindow = window as Window & { __cspViolations?: CapturedViolation[] }
    runtimeWindow.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      runtimeWindow.__cspViolations?.push({
        blockedUri: event.blockedURI,
        directive: event.effectiveDirective,
      })
    })
  })

  const localFailures: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.origin === 'http://127.0.0.1:4175') localFailures.push(url.pathname)
  })

  const externalRequests: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4175') externalRequests.push(request.url())
  })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.7558, longitude: 37.6173 })

  await page.goto('./')
  await choosePlace(page)
  await openSchedule(page)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => Array.from(document.fonts).some(face => face.family === 'Old Timey Mono' && face.status === 'loaded'))).toBe(true)
  await back(page)
  await choosePlace(page, 'Стамбул', 'Стамбул, Стамбул, Турция')
  await page.locator('#home-location').click()
  await page.getByRole('button', { name: 'По геопозиции' }).click()
  await expect(page.locator('#home-location')).toContainText(/Моё местоположение|Рядом: Москва/)
  expect(externalRequests).toEqual([])

  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Поделиться', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Поделиться' })).toBeVisible()
  await back(page)
  await page.evaluate(async () => navigator.serviceWorker.ready)

  const violationsBeforeProbe = await page.evaluate(() => (
    (window as Window & { __cspViolations?: CapturedViolation[] }).__cspViolations ?? []
  ))
  expect(violationsBeforeProbe).toEqual([])
  expect(localFailures).toEqual([])
  expect(pageErrors).toEqual([])

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.invalid/csp-probe')
      return false
    } catch {
      return true
    }
  })
  expect(blocked).toBe(true)

  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __cspViolations?: CapturedViolation[] }).__cspViolations ?? []
  ))).toContainEqual({
    blockedUri: 'https://example.invalid/csp-probe',
    directive: 'connect-src',
  })

  const unexpectedViolations = await page.evaluate(() => (
    (window as Window & { __cspViolations?: CapturedViolation[] }).__cspViolations ?? []
  )).then((violations) => violations.filter(({ blockedUri, directive }) => (
    directive !== 'connect-src' || blockedUri !== 'https://example.invalid/csp-probe'
  )))
  expect(unexpectedViolations).toEqual([])

  await page.goto('./privacy/')
  await expect(page.getByRole('heading', { name: 'Конфиденциальность' })).toBeVisible()
})
