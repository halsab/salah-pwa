import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateCityIndex, parseCityShard } from '../src/domain/citySchema'
import { createSearchFilter, type CityIndex } from '../src/domain/cityIndex'

export interface BuildArtifact {
  path: string
  size: number
}

export const BUILD_BUDGETS = {
  appJavaScript: 300 * 1024,
  totalJavaScript: 320 * 1024,
  appCss: 34 * 1024,
  privacyCss: 6 * 1024,
  cityIndex: 640 * 1024,
  cityShard: 128 * 1024,
  cityTotal: 12 * 1024 * 1024,
  prayerTimes: 6.5 * 1024 * 1024,
  prayerManifest: 8 * 1024,
} as const

type SingletonCategory = Exclude<keyof typeof BUILD_BUDGETS, 'totalJavaScript' | 'cityShard' | 'cityTotal'>

const SINGLETONS: ReadonlyArray<{
  category: SingletonCategory
  matches: (path: string) => boolean
}> = [
  { category: 'appJavaScript', matches: (path) => /^assets\/app-[^/]+\.js$/.test(path) },
  { category: 'appCss', matches: (path) => /^assets\/app-[^/]+\.css$/.test(path) },
  { category: 'privacyCss', matches: (path) => /^assets\/privacy-[^/]+\.css$/.test(path) },
  { category: 'cityIndex', matches: (path) => path === 'data/cities/index.json' },
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

export function validateBuildArtifacts(artifacts: readonly BuildArtifact[], catalog?: Pick<CityIndex, 'version' | 'shards'>): string[] {
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

  const cityArtifacts = artifacts.filter(a => a.path.startsWith('data/cities/'))
  const total = cityArtifacts.reduce((n,a)=>n+a.size,0)
  if (total > BUILD_BUDGETS.cityTotal) errors.push(overLimitError('cityTotal','data/cities/**',total))
  if (artifacts.some(a=>a.path === 'data/cities-current.json')) errors.push('cities: старый монолит недопустим')
  const expected = new Set(['data/cities/index.json', ...(catalog?.shards.map(s=>`data/cities/${catalog.version}/${s.id}.json`) ?? [])])
  for (const artifact of cityArtifacts) {
    if (!expected.has(artifact.path)) errors.push(`cities: лишний artifact ${artifact.path}`)
    if (artifact.path !== 'data/cities/index.json' && artifact.size > BUILD_BUDGETS.cityShard) errors.push(overLimitError('cityShard',artifact.path,artifact.size))
  }
  for (const path of expected) {
    if (!artifacts.some(a=>a.path === path)) errors.push(`cities: отсутствует ${path}`)
    if (artifacts.filter(a=>a.path === path).length > 1) errors.push(`cities: повторный artifact ${path}`)
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
  let catalog: CityIndex | undefined
  const validationErrors: string[] = []
  if (artifacts.some(a=>a.path === 'data/cities/index.json')) {
    try {
      catalog = await validateCityIndex(JSON.parse(await readFile(join(distDirectory,'data/cities/index.json'),'utf8')))
      const ids = new Set<number>()
      for (const descriptor of catalog.shards) {
        const shard = await parseCityShard(await readFile(join(distDirectory,`data/cities/${catalog.version}/${descriptor.id}.json`),'utf8'),catalog,descriptor)
        if (createSearchFilter(shard.cities) !== descriptor.filter) throw new Error(`Повреждён поисковый индекс ${descriptor.id}`)
        for (const city of shard.cities) {
          if (ids.has(city[0])) throw new Error(`Повторный GeoNames ID ${city[0]}`)
          ids.add(city[0])
          const overview = catalog.overview.find(c=>c[0] === city[0])
          if (overview && JSON.stringify(overview) !== JSON.stringify(city)) throw new Error(`Обзор расходится с пакетом для ${city[0]}`)
        }
      }
      if (catalog.overview.some(c=>!ids.has(c[0]))) throw new Error('Обзор содержит отсутствующий город')
    } catch (error) { validationErrors.push(`cities: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const errors = [...validateBuildArtifacts(artifacts,catalog),...validationErrors]

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
  const cityArtifacts = artifacts.filter(a=>a.path.startsWith('data/cities/'))
  checked.push(`cityShard max: ${Math.max(0,...cityArtifacts.filter(a=>a.path !== 'data/cities/index.json').map(a=>a.size))}/${BUILD_BUDGETS.cityShard} bytes`)
  checked.push(`cityTotal: ${cityArtifacts.reduce((n,a)=>n+a.size,0)}/${BUILD_BUDGETS.cityTotal} bytes`)
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
