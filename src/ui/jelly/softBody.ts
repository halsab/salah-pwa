/*
 * Производный от Jelly UI код: https://github.com/jelly-org/ui
 * Upstream-коммит: 1b775385b17884ecb48374615c96ec6ee1b58d21 (MIT, © Jelly UI contributors).
 * Лицензия и границы производного слоя зафиксированы в THIRD_PARTY_NOTICES.md.
 *
 * Сохранён только soft-body алгоритм, необходимый action-компонентам Salah.
 * Локальные изменения относительно upstream:
 * - удалены каналы depth/tilt/rotateZ/press/clickDepth — кнопки Salah их не используют,
 *   а перспективная проекция при нулевом tilt тождественна;
 * - удалены lean/stretchAlong/pulseAt/centerPop и заготовки под слайдеры;
 * - JellyConfig сокращён до реально используемых полей, комментарии на русском;
 * - индексация через at(): при noUncheckedIndexedAccess инвариант кольца выражен явно.
 * Числовые параметры, порядок вычислений и клампы не изменены: так проще сверять
 * поведение и обновлять upstream контролируемо.
 */

// Максимальный шаг интеграции. Мембрана жёсткая, и один большой кадр (фоновая
// вкладка, долгая пауза, 30 Гц) мог бы впрыснуть энергию вместо затухания.
// Подшаги возвращают симуляцию в режим, на котором физика настроена.
const MAX_STEP = 1 / 58

export interface Point {
  x: number
  y: number
}

// Точка мембраны: покой, нормаль и смещение вдоль нормали со скоростью.
export interface MembranePoint {
  x: number
  y: number
  nx: number
  ny: number
  d: number
  v: number
}

export interface JellyConfig {
  insideLocalBulgeImpulse: number
  insideLocalHoldBulgeForce: number
  insideHeldBulgeAmount: number
  insideHeldHaloAmount: number
  insidePointInfluenceWidth: number
  insidePointHaloWidth: number
  insidePointEdgeBoost: number
  heldCurveSpring: number
  heldCurveDamping: number
  membraneSpring: number
  membraneDamping: number
  waveCoupling: number
  pressure: number
  volumeCorrection: number
  maxDent: number
  maxBulge: number
  samples: number
}

interface JellyState {
  insideCurveHold: number
  insideCurveHoldV: number
  targetInsideCurveHold: number
  pointerActive: boolean
  pointerInsideWeight: number
  pointerLocalX: number
  pointerLocalY: number
}

export interface JellyBodyOptions {
  width: number
  height: number
  radius: number
  config: JellyConfig
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Индексы кольца всегда нормализованы wrap(), поэтому элемент существует.
function at<T>(values: readonly T[], index: number): T {
  return values[index] as T
}

// Полушаговое интегрирование пружины: скорость обновляется первой, поэтому
// пружина затухает к цели без «дребезга» простого метода Эйлера.
function integrateSpring(
  position: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): [number, number] {
  const acceleration = (target - position) * stiffness - velocity * damping
  const nextVelocity = velocity + acceleration * dt

  return [position + nextVelocity * dt, nextVelocity]
}

// Сглаживание 0→1 между порогами.
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)

  return t * t * (3 - 2 * t)
}

// Индекс по кольцу мембраны.
function wrap(index: number, length: number): number {
  return (index + length) % length
}

// Колоколообразное затухание импульса по соседним точкам.
function gaussian(distance: number, width: number): number {
  return Math.exp(-(distance * distance) / (2 * width * width))
}

// Знаковое расстояние до скруглённого прямоугольника: положительно снаружи.
function roundedRectSDF(x: number, y: number, halfW: number, halfH: number, radius: number): number {
  const r = Math.min(radius, halfW, halfH)
  const qx = Math.abs(x) - (halfW - r)
  const qy = Math.abs(y) - (halfH - r)

  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const inside = Math.min(Math.max(qx, qy), 0)

  return outside + inside - r
}

// Равномерное кольцо точек вокруг скруглённого прямоугольника.
function createRoundedRectMembrane(width: number, height: number, radius: number, targetSamples: number): MembranePoint[] {
  const halfW = width / 2
  const halfH = height / 2
  const r = Math.min(radius, halfW, halfH)

  const dense: Point[] = []
  const push = (x: number, y: number): void => { dense.push({ x, y }) }

  const edgeSteps = 48
  const arcSteps = 48

  function line(ax: number, ay: number, bx: number, by: number, includeStart: boolean): void {
    for (let i = includeStart ? 0 : 1; i <= edgeSteps; i++) {
      const t = i / edgeSteps
      push(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
  }

  function arc(cx: number, cy: number, a0: number, a1: number): void {
    for (let i = 1; i <= arcSteps; i++) {
      const a = a0 + (a1 - a0) * (i / arcSteps)
      push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
  }

  // Обход контура по часовой стрелке от верхней кромки.
  line(-halfW + r, -halfH, halfW - r, -halfH, true)
  arc(halfW - r, -halfH + r, -Math.PI / 2, 0)
  line(halfW, -halfH + r, halfW, halfH - r, false)
  arc(halfW - r, halfH - r, 0, Math.PI / 2)
  line(halfW - r, halfH, -halfW + r, halfH, false)
  arc(-halfW + r, halfH - r, Math.PI / 2, Math.PI)
  line(-halfW, halfH - r, -halfW, -halfH + r, false)
  arc(-halfW + r, -halfH + r, Math.PI, Math.PI * 1.5)

  // Накопленная длина, чтобы пересемплировать точки равномерно.
  const cumulative: number[] = [0]
  let perimeter = 0

  for (let i = 0; i < dense.length; i++) {
    const a = at(dense, i)
    const b = at(dense, wrap(i + 1, dense.length))

    perimeter += Math.hypot(b.x - a.x, b.y - a.y)
    cumulative.push(perimeter)
  }

  const points: MembranePoint[] = []

  for (let s = 0; s < targetSamples; s++) {
    const targetDistance = (s / targetSamples) * perimeter

    let segmentIndex = 0
    while (segmentIndex < dense.length - 1 && at(cumulative, segmentIndex + 1) < targetDistance) {
      segmentIndex += 1
    }

    const a = at(dense, segmentIndex)
    const b = at(dense, (segmentIndex + 1) % dense.length)

    const segmentStart = at(cumulative, segmentIndex)
    const segmentEnd = at(cumulative, segmentIndex + 1)
    const segmentLength = Math.max(segmentEnd - segmentStart, 0.0001)
    const t = (targetDistance - segmentStart) / segmentLength

    points.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      nx: 0,
      ny: 0,
      d: 0,
      v: 0,
    })
  }

  softenNormals(points)

  return points
}

interface Normal { nx: number; ny: number }

// Нормаль по соседям кольца.
function outwardNormalFromNeighbors(points: MembranePoint[], index: number): Normal {
  const length = points.length
  const previous = at(points, wrap(index - 1, length))
  const next = at(points, wrap(index + 1, length))

  const tx = next.x - previous.x
  const ty = next.y - previous.y
  const normalLength = Math.hypot(ty, -tx) || 1

  return { nx: ty / normalLength, ny: -tx / normalLength }
}

// Смешивание нормалей с соседями: углы деформируются плавно.
function softenNormals(points: MembranePoint[]): void {
  const length = points.length

  let normals: Normal[] = points.map((_, index) => outwardNormalFromNeighbors(points, index))

  for (let pass = 0; pass < 3; pass++) {
    normals = normals.map((normal, index) => {
      const previous = at(normals, wrap(index - 1, length))
      const next = at(normals, wrap(index + 1, length))

      const nx = previous.nx * 0.22 + normal.nx * 0.56 + next.nx * 0.22
      const ny = previous.ny * 0.22 + normal.ny * 0.56 + next.ny * 0.22
      const normalLength = Math.hypot(nx, ny) || 1

      return { nx: nx / normalLength, ny: ny / normalLength }
    })
  }

  for (let i = 0; i < length; i++) {
    at(points, i).nx = at(normals, i).nx
    at(points, i).ny = at(normals, i).ny
  }
}

// Площадь кольца по формуле шнуровки — база для сохранения объёма.
function polygonArea(points: readonly Point[]): number {
  let area = 0

  for (let i = 0; i < points.length; i++) {
    const a = at(points, i)
    const b = at(points, wrap(i + 1, points.length))

    area += a.x * b.y - b.x * a.y
  }

  return Math.abs(area) * 0.5
}

// Замкнутый сплайн Catmull-Rom как кубические Безье. Заливку задаёт вызывающий.
export function traceSmoothPath(ctx: CanvasRenderingContext2D, points: readonly Point[], tension = 0.68): void {
  const length = points.length

  ctx.beginPath()
  ctx.moveTo(at(points, 0).x, at(points, 0).y)

  for (let i = 0; i < length; i++) {
    const p0 = at(points, wrap(i - 1, length))
    const p1 = at(points, i)
    const p2 = at(points, wrap(i + 1, length))
    const p3 = at(points, wrap(i + 2, length))

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }

  ctx.closePath()
}

// Одно мягкое тело в локальных координатах, центрированных на (0, 0).
export class JellyBody {
  width: number
  height: number
  radius: number
  config: JellyConfig
  membrane: MembranePoint[]
  state: JellyState
  baseArea: number

  constructor({ width, height, radius, config }: JellyBodyOptions) {
    this.width = width
    this.height = height
    this.radius = radius
    this.config = config

    this.membrane = createRoundedRectMembrane(width, height, this.radius, config.samples)

    this.state = {
      insideCurveHold: 0,
      insideCurveHoldV: 0,
      targetInsideCurveHold: 0,
      pointerActive: false,
      pointerInsideWeight: 0,
      pointerLocalX: 0,
      pointerLocalY: 0,
    }

    this.baseArea = polygonArea(this.getSurfacePoints())
  }

  // Перестройка кольца под новый размер. Движение не сохраняется: так размер
  // всегда соответствует фактической геометрии кнопки после reflow.
  resize(width: number, height: number, radius: number): void {
    this.width = width
    this.height = height
    this.radius = radius

    this.membrane = createRoundedRectMembrane(width, height, this.radius, this.config.samples)
    this.state.pointerActive = false
    this.state.pointerInsideWeight = 0
    this.state.insideCurveHold = 0
    this.state.insideCurveHoldV = 0
    this.state.targetInsideCurveHold = 0
    this.baseArea = polygonArea(this.getSurfacePoints())
  }

  // Знаковое расстояние от локальной точки до поверхности покоя.
  sdf(x: number, y: number): number {
    return roundedRectSDF(x, y, this.width / 2, this.height / 2, this.radius)
  }

  // Ближайшая точка мембраны к локальной координате.
  private nearestMembraneIndex(x: number, y: number): number {
    let nearest = 0
    let nearestDistance = Infinity

    for (let i = 0; i < this.membrane.length; i++) {
      const p = at(this.membrane, i)
      const dx = x - p.x
      const dy = y - p.y
      const distance = dx * dx + dy * dy

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = i
      }
    }

    return nearest
  }

  // Импульс мембраны вокруг указателя с мягким гало-противовесом.
  private addInsidePointImpulse(amount: number): void {
    for (let i = 0; i < this.membrane.length; i++) {
      const influence = this.insidePointInfluence(i)
      at(this.membrane, i).v += amount * (influence.local - influence.halo * 0.18)
    }
  }

  // Сглаживание канала смещения по пяти точкам кольца.
  private smoothedMembraneValue(index: number): number {
    const length = this.membrane.length

    const p0 = at(this.membrane, wrap(index - 2, length)).d
    const p1 = at(this.membrane, wrap(index - 1, length)).d
    const p2 = at(this.membrane, index).d
    const p3 = at(this.membrane, wrap(index + 1, length)).d
    const p4 = at(this.membrane, wrap(index + 2, length)).d

    return p0 * 0.06 + p1 * 0.2 + p2 * 0.48 + p3 * 0.2 + p4 * 0.06
  }

  // Насколько сильно удержанный указатель влияет на точку мембраны.
  private insidePointInfluence(index: number): { local: number; halo: number } {
    const point = at(this.membrane, index)

    const dx = point.x - this.state.pointerLocalX
    const dy = point.y - this.state.pointerLocalY
    const distanceFromClick = Math.hypot(dx, dy)

    const local = gaussian(distanceFromClick, this.config.insidePointInfluenceWidth)
    const halo = gaussian(distanceFromClick, this.config.insidePointHaloWidth)

    const pointerRadius = clamp(
      Math.hypot(
        this.state.pointerLocalX / (this.width / 2),
        this.state.pointerLocalY / (this.height / 2),
      ),
      0,
      1,
    )

    const edgeBoost = 1 + smoothstep(0.12, 0.82, pointerRadius) * this.config.insidePointEdgeBoost

    return {
      local: local * edgeBoost,
      halo: Math.max(halo - local * 0.34, 0),
    }
  }

  // Устойчивая выпуклость, пока палец держит точку внутри поверхности.
  private heldMembraneOffset(index: number): number {
    const insidePoint = this.insidePointInfluence(index)

    return this.state.insideCurveHold *
      (this.config.insideHeldBulgeAmount * insidePoint.local -
        this.config.insideHeldHaloAmount * insidePoint.halo)
  }

  // Пятиточечное сглаживание массива значений кольца.
  private smoothArrayValue(values: number[], index: number): number {
    const length = values.length

    return (
      at(values, wrap(index - 2, length)) * 0.06 +
      at(values, wrap(index - 1, length)) * 0.2 +
      at(values, index) * 0.48 +
      at(values, wrap(index + 1, length)) * 0.2 +
      at(values, wrap(index + 2, length)) * 0.06
    )
  }

  // Текущая деформированная поверхность.
  getSurfacePoints(): Point[] {
    const points: Point[] = []
    const length = this.membrane.length
    const totalD: number[] = new Array<number>(length)

    for (let i = 0; i < length; i++) {
      totalD[i] = this.smoothedMembraneValue(i) + this.heldMembraneOffset(i)
    }

    for (let i = 0; i < length; i++) {
      const p = at(this.membrane, i)

      const smoothedD = this.smoothArrayValue(totalD, i)

      const prevD = this.smoothArrayValue(totalD, wrap(i - 1, length))
      const nextD = this.smoothArrayValue(totalD, wrap(i + 1, length))
      const gradient = nextD - prevD

      const tx = -p.ny
      const ty = p.nx
      const tangentSlide = gradient * 0.05

      points.push({
        x: p.x + p.nx * smoothedD + tx * tangentSlide,
        y: p.y + p.ny * smoothedD + ty * tangentSlide,
      })
    }

    return points
  }

  // Направить пружину удержания в текущую позицию указателя.
  private updatePressTargets(localX: number, localY: number, influence = 1): number {
    this.state.pointerLocalX = localX
    this.state.pointerLocalY = localY

    const signedDistance = this.sdf(localX, localY)
    const insideWeight = (1 - smoothstep(-2, 5, signedDistance)) * influence

    this.state.pointerInsideWeight = insideWeight
    this.state.targetInsideCurveHold = insideWeight

    return insideWeight
  }

  // Нажатие в локальной системе координат тела.
  pressAtLocal(localX: number, localY: number, strength = 1, influence = 1): void {
    this.state.pointerActive = true

    const insideWeight = this.updatePressTargets(localX, localY, influence)
    const force = strength * 1.15 * influence

    if (insideWeight > 0.01) {
      this.addInsidePointImpulse(this.config.insideLocalBulgeImpulse * insideWeight * force)
    }
  }

  // Ведение указателя, пока он удерживается.
  moveToLocal(localX: number, localY: number, influence = 1): void {
    this.updatePressTargets(localX, localY, influence)
  }

  // Нажатие с клавиатуры: энергия приходит из центра фигуры, а не от одной
  // выбранной точки мембраны — иначе симметричная кнопка выпучивалась бы вбок.
  centerPulse(strength = 1): void {
    this.pressAtLocal(0, 0, strength)
  }

  // Отпускание: снять удержание и дать мембране затухнуть самостоятельно.
  release(): void {
    this.state.pointerActive = false
    this.state.targetInsideCurveHold = 0
    this.state.pointerInsideWeight = 0
  }

  // Пружина удержания (единственная глобальная пружина после сокращения каналов).
  updateGlobal(dt: number): void {
    const s = this.state
    const c = this.config

    ;[s.insideCurveHold, s.insideCurveHoldV] = integrateSpring(
      s.insideCurveHold, s.insideCurveHoldV, s.targetInsideCurveHold,
      c.heldCurveSpring, c.heldCurveDamping, dt)

    s.insideCurveHold = clamp(s.insideCurveHold, 0, 1)
  }

  // Шаг волнового уравнения мембраны.
  updateMembrane(dt: number): void {
    const length = this.membrane.length
    const c = this.config

    const points = this.getSurfacePoints()
    const area = polygonArea(points)
    const areaError = clamp((this.baseArea - area) / this.baseArea, -0.08, 0.08)

    const membraneAccel: number[] = new Array<number>(length)

    for (let i = 0; i < length; i++) {
      const p = at(this.membrane, i)
      const prev = at(this.membrane, wrap(i - 1, length))
      const next = at(this.membrane, wrap(i + 1, length))

      const membraneLap = prev.d + next.d - 2 * p.d

      membraneAccel[i] =
        -p.d * c.membraneSpring +
        membraneLap * c.waveCoupling -
        p.v * c.membraneDamping +
        areaError * c.pressure
    }

    if (this.state.pointerActive && this.state.pointerInsideWeight > 0.02) {
      for (let i = 0; i < length; i++) {
        const influence = this.insidePointInfluence(i)

        membraneAccel[i] = at(membraneAccel, i) + c.insideLocalHoldBulgeForce * influence.local * this.state.pointerInsideWeight
        membraneAccel[i] = at(membraneAccel, i) - c.insideLocalHoldBulgeForce * 0.18 * influence.halo * this.state.pointerInsideWeight
      }
    }

    for (let i = 0; i < length; i++) {
      const p = at(this.membrane, i)

      p.v += at(membraneAccel, i) * dt
      p.d += p.v * dt

      p.d = clamp(p.d, -c.maxDent, c.maxBulge)
      p.v = clamp(p.v, -410, 410)
    }

    // Коррекция объёма: стравливаем общее вспучивание, чтобы тело сохраняло размер.
    let average = 0
    for (const p of this.membrane) {
      average += p.d
    }
    average /= length
    for (const p of this.membrane) {
      p.d -= average * c.volumeCorrection
    }
  }

  // Шаг симуляции за кадр. Дельта дробится на подшаги MAX_STEP, поэтому
  // поведение не зависит от частоты кадров и переживает паузу вкладки.
  update(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP))
    const h = dt / steps

    for (let i = 0; i < steps; i++) {
      this.updateGlobal(h)
      this.updateMembrane(h)
    }

    this.recoverIfUnstable()
  }

  // Защитный бэкстоп: при нефинитных числах сбросить движение, а не рисовать мусор.
  private recoverIfUnstable(): void {
    const s = this.state

    let healthy = Number.isFinite(s.insideCurveHold) && Number.isFinite(s.insideCurveHoldV)

    if (healthy) {
      for (const p of this.membrane) {
        if (!Number.isFinite(p.d) || !Number.isFinite(p.v)) {
          healthy = false
          break
        }
      }
    }

    if (healthy) {
      return
    }

    for (const p of this.membrane) {
      p.d = 0
      p.v = 0
    }

    s.insideCurveHold = 0
    s.insideCurveHoldV = 0
  }

  // Тело остановилось и ничего не удерживается: движок может уснуть.
  isResting(): boolean {
    const s = this.state

    if (s.pointerActive) {
      return false
    }

    if (Math.abs(s.insideCurveHold) > 1e-3) {
      return false
    }

    for (const p of this.membrane) {
      if (Math.abs(p.d) > 0.03 || Math.abs(p.v) > 0.05) {
        return false
      }
    }

    return true
  }
}
