/*
 * Производный от Jelly UI код: https://github.com/jelly-org/ui
 * Upstream-коммит: 1b775385b17884ecb48374615c96ec6ee1b58d21 (MIT).
 *
 * Общий rAF-цикл: один кадр на все живые поверхности. Когда все тела сообщают
 * покой, цикл паркуется и не держит requestAnimationFrame на экранах со
 * множеством action-строк. Локально убраны поля frameDt/colorEasing: контроллер
 * поверхности сам решает, продолжать ли кадры.
 */

export interface JellyComponent {
  frame(dt: number): boolean
}

class JellyEngine {
  private active = new Set<JellyComponent>()
  private running = false
  private lastTime = 0

  // Добавить компонент и разбудить цикл, если он спал.
  wake(component: JellyComponent): void {
    this.active.add(component)

    if (!this.running) {
      this.running = true
      this.lastTime = performance.now()
      requestAnimationFrame(this.loop)
    }
  }

  // Убрать компонент (размонтирование).
  drop(component: JellyComponent): void {
    this.active.delete(component)
  }

  // Кадр: шаг каждому телу, парковка при общем покое. Дельта ограничена,
  // чтобы пауза фоновой вкладки не стала одним гигантским шагом.
  private loop = (now: number): void => {
    const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.033)

    this.lastTime = now

    for (const component of this.active) {
      let keep = false

      try {
        keep = component.frame(dt)
      } catch (error) {
        console.error('Ошибка кадра Jelly', error)
      }

      if (!keep) {
        this.active.delete(component)
      }
    }

    if (this.active.size > 0) {
      requestAnimationFrame(this.loop)
    } else {
      this.running = false
    }
  }
}

export const jellyEngine = new JellyEngine()
