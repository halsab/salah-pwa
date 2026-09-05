import { readdir, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface BuildArtifact {
  path: string
  size: number
}

export const BUILD_BUDGETS = {
  appJavaScript: 300 * 1024,
  totalJavaScript: 320 * 1024,
  appCss: 34 * 1024,
  privacyCss: 6 * 1024,
  cities: 8 * 1024 * 1024,
  prayerTimes: 6.5 * 1024 * 1024,
  prayerManifest: 8 * 1024,
} as const

type SingletonCategory = Exclude<keyof typeof BUILD_BUDGETS, 'totalJavaScript'>

const SINGLETONS: ReadonlyArray<{
  category: SingletonCategory
  matches: (path: string) => boolean
}> = [
  { category: 'appJavaScript', matches: (path) => /^assets\/app-[^/]+\.js$/.test(path) },
  { category: 'appCss', matches: (path) => /^assets\/app-[^/]+\.css$/.test(path) },
  { category: 'privacyCss', matches: (path) => /^assets\/privacy-[^/]+\.css$/.test(path) },
  { category: 'cities', matches: (path) => path === 'data/cities-current.json' },
  { category: 'prayerTimes', matches: (path) => path === 'data/prayer-times-current.json' },
  { category: 'prayerManifest', matches: (path) => path === 'data/prayer-times-manifest.json' },
]

function overLimitError(
  category: keyof typeof BUILD_BUDGETS,
  path: string,
  actual: number,
): string {
  return `${category}: ${path} — ${actual} bytes, максимум ${BUILD_BUDGETS[category]} bytes`
}

export function validateBuildArtifacts(artifacts: readonly BuildArtifact[]): string[] {
  const errors: string[] = []

  for (const { category, matches } of SINGLETONS) {
    const matchesForCategory = artifacts.filter((artifact) => matches(artifact.path))
    if (matchesForCategory.length === 0) {
      errors.push(`${category}: artifact не найден`)
      continue
    }
    if (matchesForCategory.length > 1) {
      errors.push(`${category}: найдено ${matchesForCategory.length} artifacts`)
      continue
    }

    const artifact = matchesForCategory[0]
    if (artifact && artifact.size > BUILD_BUDGETS[category]) {
      errors.push(overLimitError(category, artifact.path, artifact.size))
    }
  }

  const javaScript = artifacts.filter((artifact) => (
    artifact.path.startsWith('assets/') && artifact.path.endsWith('.js')
  ))
  const totalJavaScript = javaScript.reduce((total, artifact) => total + artifact.size, 0)
  if (totalJavaScript > BUILD_BUDGETS.totalJavaScript) {
    errors.push(overLimitError('totalJavaScript', 'assets/*.js', totalJavaScript))
  }

  return errors
}

async function collectBuildArtifacts(
  root: string,
  directory = root,
): Promise<BuildArtifact[]> {
  const artifacts: BuildArtifact[] = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      artifacts.push(...await collectBuildArtifacts(root, absolutePath))
    } else if (entry.isFile()) {
      const metadata = await stat(absolutePath)
      artifacts.push({
        path: relative(root, absolutePath).split(sep).join('/'),
        size: metadata.size,
      })
    }
  }

  return artifacts
}

export async function checkBuildBudgets(
  distDirectory: string,
  log: (message: string) => void = console.log,
): Promise<void> {
  const artifacts = await collectBuildArtifacts(distDirectory)
  const errors = validateBuildArtifacts(artifacts)

  if (errors.length > 0) {
    throw new Error(`Нарушены бюджеты production-сборки:\n${errors.join('\n')}`)
  }

  const checked = SINGLETONS.map(({ category, matches }) => {
    const artifact = artifacts.find((candidate) => matches(candidate.path))
    return `${category}: ${artifact?.size ?? 0}/${BUILD_BUDGETS[category]} bytes`
  })
  const totalJavaScript = artifacts
    .filter(({ path }) => path.startsWith('assets/') && path.endsWith('.js'))
    .reduce((total, { size }) => total + size, 0)
  checked.push(`totalJavaScript: ${totalJavaScript}/${BUILD_BUDGETS.totalJavaScript} bytes`)
  log(`Бюджеты production-сборки соблюдены:\n${checked.join('\n')}`)
}

export function reportBuildBudgetFailure(error: unknown): void {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

const entryPoint = process.argv[1]
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void checkBuildBudgets(resolve('dist')).catch(reportBuildBudgetFailure)
}
