import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(fileURLToPath(import.meta.url), '../..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:tsx|ts)$/u.test(entry.name) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function productionUiFiles(): string[] {
  return [join(repositoryRoot, 'src/App.tsx'), ...sourceFiles(join(repositoryRoot, 'src/features')), ...sourceFiles(join(repositoryRoot, 'src/ui')).filter(path => !path.includes(join('src', 'ui', 'jelly')))]
}

function rawCyrillicLines(path: string): string[] {
  return readFileSync(path, 'utf8').split(/\r?\n/u).filter(line => {
    const trimmed = line.trim()
    return /[А-Яа-яЁё]/u.test(line)
      && !trimmed.startsWith('//')
      && !trimmed.startsWith('/*')
      && !trimmed.startsWith('*')
      && !trimmed.startsWith('*/')
  })
}

describe('production UI localization boundary', () => {
  it('keeps Cyrillic presentation text out of feature and UI source files', () => {
    const violations = productionUiFiles().flatMap(path => rawCyrillicLines(path).map(line => `${relative(repositoryRoot, path)}: ${line.trim()}`))
    expect(violations).toEqual([])
  })
})
