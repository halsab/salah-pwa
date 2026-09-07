import { parseCoverageGeometry, type CoverageGeometry } from '../domain/localGeography'

export async function loadLocalGeography(): Promise<CoverageGeometry | null> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/tatarstan-boundary.json`, { signal: controller.signal })
    return response.ok ? parseCoverageGeometry(await response.json() as unknown) : null
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
