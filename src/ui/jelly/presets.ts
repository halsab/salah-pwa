import type { JellyConfig } from './softBody'

/**
 * Пресеты физического отклика Salah. Числа подобраны так, чтобы отклик был
 * быстрым и спокойным: subtle почти не заметен, expressive ощутим, но тише
 * showcase-настроек Jelly UI (у которых импульс 390 при силе нажатия 1.12).
 */
export type JellyPreset = 'subtle' | 'standard' | 'expressive'

export interface JellyPresetDefinition {
  /** Множитель импульса нажатия. */
  strength: number
  config: JellyConfig
}

const BASE_CONFIG: JellyConfig = {
  insideLocalBulgeImpulse: 390,
  insideLocalHoldBulgeForce: 48,
  insideHeldBulgeAmount: 10.8,
  insideHeldHaloAmount: 2.65,
  insidePointInfluenceWidth: 38,
  insidePointHaloWidth: 70,
  insidePointEdgeBoost: 0.44,
  heldCurveSpring: 135,
  heldCurveDamping: 22,
  membraneSpring: 96,
  membraneDamping: 17,
  waveCoupling: 145,
  pressure: 620,
  volumeCorrection: 0.1,
  maxDent: 8,
  maxBulge: 24,
  samples: 240,
}

export const JELLY_PRESETS: Record<JellyPreset, JellyPresetDefinition> = {
  subtle: {
    strength: 0.5,
    config: {
      ...BASE_CONFIG,
      insideLocalBulgeImpulse: 200,
      insideHeldBulgeAmount: 4,
      insideHeldHaloAmount: 1,
      maxDent: 3,
      maxBulge: 8,
    },
  },
  standard: {
    strength: 0.8,
    config: {
      ...BASE_CONFIG,
      insideLocalBulgeImpulse: 320,
      insideHeldBulgeAmount: 7,
      insideHeldHaloAmount: 1.8,
      maxDent: 4.5,
      maxBulge: 11,
    },
  },
  expressive: {
    strength: 1,
    config: {
      ...BASE_CONFIG,
      insideLocalBulgeImpulse: 400,
      insideHeldBulgeAmount: 10,
      insideHeldHaloAmount: 2.4,
      maxDent: 6,
      maxBulge: 13,
    },
  },
}
