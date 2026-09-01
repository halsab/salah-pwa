import { expect, test } from '@playwright/test'

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
