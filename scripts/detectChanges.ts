import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export interface ChangeAreas {
  dependencies: boolean
  workflows: boolean
}

// Проверки зависимостей и workflow нужны только при изменениях в этих корневых файлах.
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json'])

export function classifyChanges(paths: readonly string[]): ChangeAreas {
  const areas: ChangeAreas = { dependencies: false, workflows: false }

  for (const rawPath of paths) {
    const path = rawPath.trim().replaceAll('\\', '/')
    if (!path) continue
    if (DEPENDENCY_FILES.has(path)) areas.dependencies = true
    else if (path.startsWith('.github/workflows/')) areas.workflows = true
  }

  return areas
}

export function formatChangeAreas(areas: ChangeAreas): string {
  return `dependencies=${areas.dependencies}\nworkflows=${areas.workflows}`
}

async function main(): Promise<void> {
  const file = process.argv[2]
  const source = file ? await readFile(file, 'utf8') : ''
  process.stdout.write(`${formatChangeAreas(classifyChanges(source.split(/\r?\n/)))}\n`)
}

const entryPoint = process.argv[1]
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
