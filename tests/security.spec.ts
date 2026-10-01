import { expect, test } from './fixtures'

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

interface CapturedViolation {
  blockedUri: string
  directive: string
}

test('production CSP единственный, предшествует ресурсам и блокирует сторонний connect', async ({ page, request }) => {
  const response = await request.get('./')
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

  await page.goto('./')
  const meta = page.locator('meta[http-equiv="Content-Security-Policy"]')
  await expect(meta).toHaveCount(1)
  await expect(meta).toHaveAttribute('content', CSP)
  await expect(meta).not.toHaveAttribute('content', /frame-ancestors/)
  await expect(meta).not.toHaveAttribute('content', /(?:^|\s)\*(?:\s|;|$)/)
  await expect(meta).not.toHaveAttribute('content', /(?:data|blob):|unsafe-eval/)
  await page.evaluate(async () => navigator.serviceWorker.ready)

  expect(await page.evaluate(() => (
    (window as Window & { __cspViolations?: CapturedViolation[] }).__cspViolations ?? []
  ))).toEqual([])
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
})
