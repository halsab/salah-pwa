import { describe, expect, it } from 'vitest'

import { classifyChanges, formatChangeAreas } from './detectChanges'

describe('classifyChanges', () => {
  it('не отмечает области для пустого списка', () => {
    expect(classifyChanges([])).toEqual({ dependencies: false, workflows: false })
  })

  it.each(['package.json', 'package-lock.json'])(
    'отмечает зависимости при изменении %s',
    (file) => {
      expect(classifyChanges([file])).toEqual({ dependencies: true, workflows: false })
    },
  )

  it('отмечает workflow при изменении каталога .github/workflows', () => {
    expect(classifyChanges(['.github/workflows/ci.yml'])).toEqual({
      dependencies: false,
      workflows: true,
    })
  })

  it('не считает вложенный package.json изменением зависимостей', () => {
    expect(classifyChanges(['src/package.json']).dependencies).toBe(false)
  })

  it('не считает workflow вне каталога .github/workflows', () => {
    expect(classifyChanges(['.github/actions/ci.yml']).workflows).toBe(false)
  })

  it('нормализует пробелы и windows-разделители', () => {
    expect(
      classifyChanges(['  package.json  ', 'src\\index.ts', '.github\\workflows\\release.yml']),
    ).toEqual({ dependencies: true, workflows: true })
  })

  it('игнорирует пустые строки', () => {
    expect(classifyChanges(['', '   ', '\r'])).toEqual({ dependencies: false, workflows: false })
  })

  it('форматирует вывод для GitHub Actions', () => {
    expect(formatChangeAreas({ dependencies: true, workflows: false })).toBe(
      'dependencies=true\nworkflows=false',
    )
  })
})
