import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function validateReleaseVersion(version: string, tags: readonly string[]): string {
  const match = /^v\d{2}\.([1-9]\d*)$/.exec(version)
  if (!match || match[0] !== version || !Number.isSafeInteger(Number(match[1]))) {
    throw new Error('Укажите номер сборки в формате vYY.N, например v26.4.')
  }
  if (tags.includes(version)) {
    throw new Error(`Сборка ${version} уже существует. Укажите новый номер.`)
  }
  return version
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
  console.log(validateReleaseVersion(process.env.VITE_APP_VERSION ?? '', tags))
}
