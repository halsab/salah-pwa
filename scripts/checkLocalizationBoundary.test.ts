import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const repositoryRoot = resolve(fileURLToPath(import.meta.url), '../..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:tsx|ts)$/u.test(entry.name) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function presentationFiles(): string[] {
  return [
    join(repositoryRoot, 'src/App.tsx'),
    ...sourceFiles(join(repositoryRoot, 'src/features')),
    ...sourceFiles(join(repositoryRoot, 'src/ui')),
    join(repositoryRoot, 'src/data/prayerProviders.ts'),
    join(repositoryRoot, 'src/domain/prayerCalculation.ts'),
    join(repositoryRoot, 'src/domain/religiousEvents.ts'),
    join(repositoryRoot, 'src/domain/scheduleEvents.ts'),
  ]
}

function hardcodedPresentationText(path: string, source: string): string[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
  const lines = source.split(/\r?\n/u)
  const findings: string[] = []
  const hasCyrillic = (value: string) => /[А-Яа-яЁё]/u.test(value)
  const isRenderedText = (node: ts.Node) => {
    if (ts.isJsxText(node)) return /[\p{L}\p{N}]/u.test(node.getText(file))
    if (!/[\p{L}\p{N}]/u.test(node.getText(file).replace(/^['`]|['`]$/gu, ''))) return false
    const parent = node.parent
    if (ts.isJsxExpression(parent) && parent.expression === node) {
      return ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent)
    }
    if (ts.isJsxAttribute(parent)) {
      const initializer = parent.initializer
      const name = parent.name.getText(file)
      return ['aria-label', 'aria-description', 'alt', 'label', 'placeholder', 'title'].includes(name)
        && initializer !== undefined
        && (initializer === node || (ts.isJsxExpression(initializer) && initializer.expression === node))
    }
    return false
  }
  const isHardcodedPresentationField = (node: ts.Node) => {
    const parent = node.parent
    if (!ts.isPropertyAssignment(parent) || parent.initializer !== node) return false
    if (!/[\p{L}]/u.test(node.getText(file))) return false
    return ['aria-label', 'ariaLabel', 'label', 'listTitle', 'title'].includes(parent.name.getText(file))
  }
  const isConsoleDiagnostic = (node: ts.Node) => {
    const parent = ts.findAncestor(node.parent, ts.isCallExpression)
    return parent !== undefined && ts.isPropertyAccessExpression(parent.expression)
      && parent.expression.expression.getText(file) === 'console'
  }
  const visit = (node: ts.Node) => {
    const isText = ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)
    const text = node.getText(file).replace(/^['`]|['`]$/gu, '')
    if (isText && !isConsoleDiagnostic(node)
      && (hasCyrillic(text) || isRenderedText(node) || isHardcodedPresentationField(node))) {
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line
      findings.push(`${line + 1}: ${lines[line]?.trim() ?? ''}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return findings
}

describe('production UI localization boundary', () => {
  it('keeps Cyrillic presentation literals out of UI and event domain code', () => {
    const violations = presentationFiles().flatMap(path => hardcodedPresentationText(path, readFileSync(path, 'utf8'))
      .map(line => `${relative(repositoryRoot, path)}:${line}`))
    expect(violations).toEqual([])
  })

  it('ignores comments, stable ids, quotes in approved content, and Russian content resources', () => {
    const source = [
      '// Комментарий на русском',
      "const id = 'arafa'",
      "const message = 'Нужна локализация'",
    ].join('\n')
    expect(hardcodedPresentationText('src/features/example.ts', source)).toEqual(["3: const message = 'Нужна локализация'"])
    expect(presentationFiles().some(path => path.endsWith(join('src', 'content', 'informationArticles.ts')))).toBe(false)
    expect(presentationFiles().some(path => path.endsWith(join('src', 'localization', 'messages.ts')))).toBe(false)
  })

  it('catches direct JSX text and accessible labels even when they are not Cyrillic', () => {
    const source = '<button aria-label="Settings">Open schedule</button>'
    expect(hardcodedPresentationText('src/features/example.tsx', source)).toEqual([
      '1: <button aria-label="Settings">Open schedule</button>',
      '1: <button aria-label="Settings">Open schedule</button>',
    ])
  })

  it('catches literal presentation fields in domain/data modules, including English labels', () => {
    expect(hardcodedPresentationText('src/domain/example.ts', "const event = { id: 'asr', label: 'Sunrise' }")).toEqual([
      "1: const event = { id: 'asr', label: 'Sunrise' }",
    ])
    expect(hardcodedPresentationText('src/domain/example.ts', "const event = { id: 'asr', labelKey: 'eventSunrise' }")).toEqual([])
  })
})
