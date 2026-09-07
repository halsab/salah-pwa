import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { buildCityPackages } from './buildCityPackages'
import {
  BUILD_BUDGETS,
  checkBuildBudgets,
  reportBuildBudgetFailure,
  validateBuildArtifacts,
  type BuildArtifact,
} from './checkBuildBudgets'

const generated = buildCityPackages([[1,'Киров',['киров'],'RU','33',58.6,49.6,5000,'Europe/Moscow','Кировская область','россия']],{name:'GeoNames',url:'https://www.geonames.org/',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',updatedAt:'2026-09-07'})
const catalog = generated.index
const shardPath = `data/cities/${catalog.version}/RU-0.json`
function validArtifacts(): BuildArtifact[] {
  return [
    { path: 'assets/app-a1b2c3.js', size: BUILD_BUDGETS.appJavaScript },
    { path: 'assets/cityCatalog.worker-d4e5f6.js', size: 1 },
    { path: 'assets/app-a1b2c3.css', size: BUILD_BUDGETS.appCss },
    { path: 'assets/privacy-a1b2c3.css', size: BUILD_BUDGETS.privacyCss },
    { path: 'data/cities/index.json', size: BUILD_BUDGETS.cityIndex },
    { path: shardPath, size: BUILD_BUDGETS.cityShard },
    { path: 'data/prayer-times-current.json', size: BUILD_BUDGETS.prayerTimes },
    { path: 'data/prayer-times-manifest.json', size: BUILD_BUDGETS.prayerManifest },
  ]
}

describe('build budgets', () => {
  it('принимает hashed production artifacts на границе каждого бюджета', () => {
    expect(validateBuildArtifacts(validArtifacts(),catalog)).toEqual([])
  })

  it.each([
    ['app JavaScript', 'assets/app-a1b2c3.js', 'appJavaScript'],
    ['app CSS', 'assets/app-a1b2c3.css', 'appCss'],
    ['privacy CSS', 'assets/privacy-a1b2c3.css', 'privacyCss'],
    ['cities data', 'data/cities/index.json', 'cityIndex'],
    ['prayer data', 'data/prayer-times-current.json', 'prayerTimes'],
    ['prayer manifest', 'data/prayer-times-manifest.json', 'prayerManifest'],
  ] as const)('отклоняет превышение %s с path и actual/max', (_, path, budget) => {
    const artifacts = validArtifacts()
    const artifact = artifacts.find((candidate) => candidate.path === path)
    if (!artifact) throw new Error(`Не найден fixture ${path}`)
    artifact.size = BUILD_BUDGETS[budget] + 1

    expect(validateBuildArtifacts(artifacts,catalog)).toContain(
      `${budget}: ${path} — ${artifact.size} bytes, максимум ${BUILD_BUDGETS[budget]} bytes`,
    )
  })

  it('не позволяет обойти aggregate JS budget дополнительным chunk', () => {
    const artifacts = validArtifacts()
    artifacts.push({
      path: 'assets/lazy-feed-c0ffee.js',
      size: BUILD_BUDGETS.totalJavaScript - BUILD_BUDGETS.appJavaScript,
    })

    expect(validateBuildArtifacts(artifacts,catalog)).toContain(
      `totalJavaScript: assets/*.js — ${BUILD_BUDGETS.totalJavaScript + 1} bytes, максимум ${BUILD_BUDGETS.totalJavaScript} bytes`,
    )
  })

  it.each([
    ['appJavaScript', 'assets/app-a1b2c3.js'],
    ['appCss', 'assets/app-a1b2c3.css'],
    ['privacyCss', 'assets/privacy-a1b2c3.css'],
    ['cityIndex', 'data/cities/index.json'],
    ['prayerTimes', 'data/prayer-times-current.json'],
    ['prayerManifest', 'data/prayer-times-manifest.json'],
  ] as const)('отклоняет отсутствующий %s artifact', (category, path) => {
    const artifacts = validArtifacts().filter((artifact) => artifact.path !== path)

    expect(validateBuildArtifacts(artifacts,catalog)).toContain(
      `${category}: artifact не найден`,
    )
  })

  it.each([
    ['appJavaScript', 'assets/app-second.js'],
    ['appCss', 'assets/app-second.css'],
    ['privacyCss', 'assets/privacy-second.css'],
  ] as const)('отклоняет дублирующий hashed %s artifact', (category, path) => {
    const artifacts = validArtifacts()
    artifacts.push({ path, size: 1 })

    expect(validateBuildArtifacts(artifacts,catalog)).toContain(
      `${category}: найдено 2 artifacts`,
    )
  })

  it('рекурсивно проверяет production-каталог и выводит фактические размеры', async () => {
    const root = await mkdtemp(join(tmpdir(), 'salah-budgets-'))
    await mkdir(join(root, 'assets'), { recursive: true })
    await mkdir(join(root, `data/cities/${catalog.version}`), { recursive: true })
    await Promise.all([
      writeFile(join(root, 'assets/app-hash.js'), 'a'),
      writeFile(join(root, 'assets/app-hash.css'), 'a'),
      writeFile(join(root, 'assets/privacy-hash.css'), 'a'),
      writeFile(join(root, 'data/cities/index.json'), JSON.stringify(catalog)),
      writeFile(join(root, shardPath), JSON.stringify(generated.shards['RU-0'])),
      writeFile(join(root, 'data/prayer-times-current.json'), 'a'),
      writeFile(join(root, 'data/prayer-times-manifest.json'), 'a'),
    ])
    const messages: string[] = []

    try {
      await checkBuildBudgets(root, (message) => messages.push(message))
      expect(messages).toHaveLength(1)
      const message = messages[0]
      if (!message) throw new Error('Не получен отчёт о бюджетах')
      expect(message).toContain('appJavaScript: 1/307200 bytes')
      expect(message).toContain('totalJavaScript: 1/327680 bytes')
    } finally {
      await rm(root, { recursive: true })
    }
  })

  it('завершает directory-check ошибкой при неполной сборке', async () => {
    const root = await mkdtemp(join(tmpdir(), 'salah-budgets-'))

    try {
      await expect(checkBuildBudgets(root)).rejects.toThrow(
        'appJavaScript: artifact не найден',
      )
    } finally {
      await rm(root, { recursive: true })
    }
  })

  it('преобразует CLI failure в сообщение и ненулевой exit code', () => {
    const previousExitCode = process.exitCode
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      reportBuildBudgetFailure(new Error('over budget'))
      expect(error).toHaveBeenCalledWith('over budget')
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = previousExitCode
    }
  })
})

 it('обнаруживает отсутствующий, лишний пакет и старый монолит',()=>{
   expect(validateBuildArtifacts(validArtifacts().filter(a=>a.path !== shardPath),catalog)).toContain(`cities: отсутствует ${shardPath}`)
   expect(validateBuildArtifacts([...validArtifacts(),{path:'data/cities/stale/XX-0.json',size:1}],catalog)).toContain('cities: лишний artifact data/cities/stale/XX-0.json')
   expect(validateBuildArtifacts([...validArtifacts(),{path:'data/cities-current.json',size:1}],catalog)).toContain('cities: старый монолит недопустим')
 })
 it('не даёт обойти бюджет отдельного пакета и суммарных данных',()=>{
   const artifacts = validArtifacts().map(a=>a.path===shardPath ? {...a,size:BUILD_BUDGETS.cityTotal+1} : a)
   const errors = validateBuildArtifacts(artifacts,catalog)
   expect(errors.some(e=>e.startsWith('cityShard:'))).toBe(true)
   expect(errors.some(e=>e.startsWith('cityTotal:'))).toBe(true)
 })
