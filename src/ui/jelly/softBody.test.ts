import { describe, expect, it } from 'vitest'

import { JELLY_PRESETS } from './presets'
import { JellyBody, traceSmoothPath } from './softBody'

const config = JELLY_PRESETS.standard.config

function body(width = 120, height = 44, radius = 22): JellyBody {
  return new JellyBody({ width, height, radius, config })
}

describe('JellyBody', () => {
  it('в покое неподвижно и повторяет размер кнопки', () => {
    const value = body()
    expect(value.isResting()).toBe(true)
    expect(value.getSurfacePoints()).toHaveLength(config.samples)
  })

  it('нажатие деформирует поверхность и затухает до покоя', () => {
    const value = body()

    value.pressAtLocal(0, 0, 0.8)
    expect(value.isResting()).toBe(false)

    const before = value.getSurfacePoints()
    value.update(1 / 60)
    const after = value.getSurfacePoints()
    const moved = after.some((point, index) => {
      const previous = before[index]
      return previous !== undefined && Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01
    })
    expect(moved).toBe(true)

    value.release()
    for (let step = 0; step < 600; step++) value.update(1 / 60)
    expect(value.isResting()).toBe(true)
  })

  it('release снимает удержание, resize перестраивает геометрию', () => {
    const value = body()
    value.pressAtLocal(10, 0, 1)
    value.update(1 / 60)
    value.release()

    value.resize(200, 48, 16)
    expect(value.width).toBe(200)
    expect(value.height).toBe(48)
    expect(value.radius).toBe(16)
    expect(value.isResting()).toBe(true)
  })

  it('клавиатурный импульс из центра не даёт нефинитных чисел', () => {
    const value = body()
    value.centerPulse(1.12)
    for (let step = 0; step < 120; step++) value.update(1 / 60)
    value.release()
    for (let step = 0; step < 600; step++) value.update(1 / 60)

    for (const point of value.getSurfacePoints()) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('восстанавливается после повреждённого состояния', () => {
    const value = body()
    const damaged = value.membrane[0]
    if (!damaged) throw new Error('Мембрана пуста')
    damaged.d = Number.NaN
    value.update(0)
    expect(value.isResting()).toBe(true)
  })

  it('большая дельта кадра не ломает симуляцию', () => {
    const value = body()
    value.pressAtLocal(0, 0, 1)
    value.update(5)
    value.release()
    for (const point of value.getSurfacePoints()) {
      expect(Number.isFinite(point.x)).toBe(true)
    }
  })
})

describe('traceSmoothPath', () => {
  it('рисует замкнутый путь по точкам кольца', () => {
    const calls: string[] = []
    const ctx = {
      beginPath: () => { calls.push('begin') },
      moveTo: () => { calls.push('move') },
      bezierCurveTo: () => { calls.push('curve') },
      closePath: () => { calls.push('close') },
    } as unknown as CanvasRenderingContext2D

    traceSmoothPath(ctx, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])

    expect(calls).toEqual(['begin', 'move', 'curve', 'curve', 'curve', 'curve', 'close'])
  })
})
