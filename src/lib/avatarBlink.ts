import { DEFAULT_MOOD_INTENSITY, normalizeMoodIntensity } from './emotionAndSpeech';
import type { FacialEmotion, HairstyleOption } from '../types/nova';

export type BlinkPhase = 'open' | 'closing' | 'closed' | 'opening';

export interface EyeBox {
  /** Normalized horizontal center within the portrait bitmap [0..1] */
  x: number;
  /** Normalized vertical center within the portrait bitmap [0..1] */
  y: number;
  /** Normalized horizontal half-width */
  rx: number;
  /** Normalized vertical half-height */
  ry: number;
  /** Slight rotation angle (radians) matching the portrait head tilt */
  tilt: number;
}

export interface PortraitEyeGeometry {
  left: EyeBox;
  right: EyeBox;
}

/**
 * Calibrated normalized eye coordinates for each 512x512 holographic portrait
 * (`wavy`, `bob`, `straight`) matching the 3/4 head pose.
 */
export const PORTRAIT_EYE_GEOMETRY: Record<HairstyleOption, PortraitEyeGeometry> = {
  wavy: {
    left: { x: 0.535, y: 0.270, rx: 0.025, ry: 0.014, tilt: -0.04 },
    right: { x: 0.621, y: 0.268, rx: 0.020, ry: 0.013, tilt: 0.05 },
  },
  bob: {
    left: { x: 0.528, y: 0.265, rx: 0.025, ry: 0.014, tilt: -0.03 },
    right: { x: 0.618, y: 0.263, rx: 0.020, ry: 0.013, tilt: 0.05 },
  },
  straight: {
    left: { x: 0.530, y: 0.264, rx: 0.024, ry: 0.014, tilt: -0.03 },
    right: { x: 0.616, y: 0.260, rx: 0.020, ry: 0.013, tilt: 0.05 },
  },
};

export function getPortraitEyeGeometry(hairstyle: HairstyleOption = 'wavy'): PortraitEyeGeometry {
  return PORTRAIT_EYE_GEOMETRY[hairstyle] ?? PORTRAIT_EYE_GEOMETRY.wavy;
}

const BASE_BLINK_DURATION_MS = 180;

const EMOTION_BLINK_PACE: Record<FacialEmotion, number> = {
  calm: 1.0,
  happy: 0.92,
  excited: 0.84,
  love: 1.2,
  empathetic: 1.14,
  sad: 1.26,
  thoughtful: 1.1,
  curious: 0.94,
  surprised: 0.82,
  confident: 0.96,
  angry: 0.88,
};

/**
 * Duration multiplier derived from the `active_mood` intensity slider (`[0.5, 2.0]`),
 * matching the CSS `--avatar-anim-duration-scale` inverse scaling:
 * `2.0x` slower at 50% intensity, `1.0x` at 100%, `0.5x` brisker at 200%.
 */
export function computeBlinkDurationMultiplier(moodIntensity?: number): number {
  const safe = normalizeMoodIntensity(moodIntensity, DEFAULT_MOOD_INTENSITY);
  return Math.round((1 / safe) * 1000) / 1000;
}

/**
 * Computes full blink duration (ms) modulated by `moodIntensity` and active emotion.
 */
export function computeBlinkDurationMs(
  moodIntensity?: number,
  emotion: FacialEmotion = 'calm'
): number {
  const intensityMultiplier = computeBlinkDurationMultiplier(moodIntensity);
  const emotionFactor = EMOTION_BLINK_PACE[emotion] ?? 1.0;
  const raw = BASE_BLINK_DURATION_MS * intensityMultiplier * emotionFactor;
  return Math.round(Math.min(480, Math.max(75, raw)));
}

/**
 * Samples a randomized human inter-blink delay (ms) tailored subtly to the current mood.
 */
export function sampleNextBlinkIntervalMs(
  emotion: FacialEmotion = 'calm',
  rng: () => number = Math.random
): number {
  const r = Math.min(0.9999, Math.max(0, Number.isFinite(rng()) ? rng() : 0.5));
  let minMs = 2300;
  let maxMs = 5200;

  if (emotion === 'excited' || emotion === 'surprised' || emotion === 'angry') {
    minMs = 1750;
    maxMs = 3700;
  } else if (emotion === 'happy' || emotion === 'curious') {
    minMs = 2000;
    maxMs = 4300;
  } else if (emotion === 'sad' || emotion === 'love' || emotion === 'empathetic') {
    minMs = 2700;
    maxMs = 5800;
  }

  return Math.round(minMs + r * (maxMs - minMs));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Evaluates normalized eyelid closure `[0..1]` at normalized progress `t in [0, 1]`.
 * Asymmetric human blink: brisk upper-lid drop (`0..0.38`), brief soft hold (`0.38..0.48`),
 * smooth gentle lift (`0.48..1.0`).
 */
export function evaluateBlinkEnvelope(progress01: number): {
  amount: number;
  phase: BlinkPhase;
} {
  const t = clamp01(progress01);
  if (t <= 0 || t >= 1) {
    return { amount: 0, phase: 'open' };
  }
  if (t < 0.38) {
    const amount = smoothstep01(t / 0.38);
    return { amount, phase: amount >= 0.96 ? 'closed' : 'closing' };
  }
  if (t <= 0.48) {
    return { amount: 1, phase: 'closed' };
  }
  const openT = (t - 0.48) / 0.52;
  const amount = 1 - smoothstep01(openT);
  return { amount, phase: amount <= 0.04 ? 'open' : 'opening' };
}

export interface BlinkSchedulerState {
  isBlinking: boolean;
  blinkStartMs: number;
  blinkDurationMs: number;
  nextBlinkAtMs: number;
  doubleBlinkQueued: boolean;
  blinkAmount: number;
  phase: BlinkPhase;
}

export function createBlinkScheduler(params: {
  nowMs?: number;
  moodIntensity?: number;
  emotion?: FacialEmotion;
  rng?: () => number;
} = {}): BlinkSchedulerState {
  const nowMs = params.nowMs ?? 0;
  const emotion = params.emotion ?? 'calm';
  const rng = params.rng ?? Math.random;
  const initialDelay = Math.min(1800, Math.round(sampleNextBlinkIntervalMs(emotion, rng) * 0.42));

  return {
    isBlinking: false,
    blinkStartMs: 0,
    blinkDurationMs: computeBlinkDurationMs(params.moodIntensity, emotion),
    nextBlinkAtMs: nowMs + initialDelay,
    doubleBlinkQueued: false,
    blinkAmount: 0,
    phase: 'open',
  };
}

export function stepBlinkScheduler(
  state: BlinkSchedulerState,
  nowMs: number,
  params: {
    moodIntensity?: number;
    emotion?: FacialEmotion;
    rng?: () => number;
    prefersReducedMotion?: boolean;
  } = {}
): BlinkSchedulerState {
  const emotion = params.emotion ?? 'calm';
  const durationMs = computeBlinkDurationMs(params.moodIntensity, emotion);

  if (params.prefersReducedMotion) {
    return {
      ...state,
      isBlinking: false,
      blinkDurationMs: durationMs,
      blinkAmount: 0,
      phase: 'open',
    };
  }

  const rng = params.rng ?? Math.random;

  if (state.isBlinking) {
    const elapsed = Math.max(0, nowMs - state.blinkStartMs);
    const activeDuration = Math.max(75, state.blinkDurationMs);
    const progress = elapsed / activeDuration;

    if (progress < 1) {
      const env = evaluateBlinkEnvelope(progress);
      return {
        ...state,
        blinkDurationMs: durationMs,
        blinkAmount: env.amount,
        phase: env.phase,
      };
    }

    // Completed blink — occasionally trigger a subtle natural double-blink (~14%)
    const doDoubleBlink = !state.doubleBlinkQueued && rng() < 0.14;
    const nextDelay = doDoubleBlink ? 160 : sampleNextBlinkIntervalMs(emotion, rng);
    return {
      isBlinking: false,
      blinkStartMs: 0,
      blinkDurationMs: durationMs,
      nextBlinkAtMs: nowMs + nextDelay,
      doubleBlinkQueued: doDoubleBlink,
      blinkAmount: 0,
      phase: 'open',
    };
  }

  if (nowMs >= state.nextBlinkAtMs) {
    const env = evaluateBlinkEnvelope(0.02);
    return {
      isBlinking: true,
      blinkStartMs: nowMs,
      blinkDurationMs: durationMs,
      nextBlinkAtMs: state.nextBlinkAtMs,
      doubleBlinkQueued: state.doubleBlinkQueued,
      blinkAmount: env.amount,
      phase: 'closing',
    };
  }

  return {
    ...state,
    blinkDurationMs: durationMs,
    blinkAmount: 0,
    phase: 'open',
  };
}
