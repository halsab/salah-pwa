import { expect, test } from '@playwright/test'

test('весь интерфейс использует рукописный шрифт', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()

  const bodyFont = await page.locator('body').evaluate((element) =>
    getComputedStyle(element).fontFamily,
  )
  const buttonFont = await page.getByRole('button', { name: /Казань/ }).evaluate((element) =>
    getComputedStyle(element).fontFamily,
  )
  const decorationFont = await page.locator('.next-label').evaluate((element) =>
    getComputedStyle(element, '::before').fontFamily,
  )

  await page.getByRole('button', { name: /Казань/ }).click()
  const inputFont = await page.getByRole('searchbox').evaluate((element) =>
    getComputedStyle(element).fontFamily,
  )

  for (const fontFamily of [bodyFont, buttonFont, decorationFont, inputFont]) {
    expect(fontFamily).toContain('Neucha')
  }
})

test('после первого запуска расписание полностью открывается без сети', async ({
  context,
  page,
}) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Salah' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Казань/ })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(8)
    await expect(page.getByRole('link', { name: 'ДУМ РТ' })).toBeVisible()
    await expect(page.getByText('Доступно офлайн')).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})

test('сохранённое GPS-расписание вне Татарстана рассчитывается без сети', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 55.7558, longitude: 37.6173 })
  await page.goto('./')

  await expect(page.getByRole('button', { name: /Moscow, Россия/i })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
  await expect(
    page
      .getByRole('list', { name: 'Времена намаза' })
      .getByText('Фаджр', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Рассчитано на устройстве · ДУМ РТ/)).toBeVisible()
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Moscow, Россия/i })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
    await expect(
      page
        .getByRole('list', { name: 'Времена намаза' })
        .getByText('Фаджр', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/Рассчитано на устройстве · ДУМ РТ/)).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})

test('город из офлайн-справочника сохраняется и рассчитывается без сети', async ({
  context,
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Казань/ }).click()
  await page.getByRole('searchbox').fill('Стамбул')
  await page.getByRole('button', { name: 'Istanbul, Турция' }).click()

  await expect(page.getByRole('button', { name: /Istanbul, Турция/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /Istanbul, Турция/ })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Времена намаза' }).getByRole('listitem')).toHaveCount(7)
  } finally {
    await context.setOffline(false)
  }
})
