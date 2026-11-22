import type { AvatarState, HairstyleOption } from '../types/nova';

export const MIC_NOISE_FLOOR = 0.06;
export const LIP_NOISE_FLOOR = 0.03;
export const AMBIENT_BREEZE_WIND = 0.32;

export interface HairWindInput {
  state: AvatarState;
  micLevel: number;
  lipOpenness: number;
  ambientBreeze?: boolean;
}

export interface HairOffsetResult {
  dx: number;
  dy: number;
  mask: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Computes normalized ambient float/glow intensity [0..1].
 * Intentionally invariant to speaking state, lipOpenness, and micLevel so that
 * hair never jerks, speeds up, or moves differently when talking.
 */
export function computeTargetHairWind({
  ambientBreeze = true,
}: HairWindInput): number {
  return ambientBreeze ? AMBIENT_BREEZE_WIND : 0;
}

/**
 * Smoothly ramps ambient breeze toward target.
 */
export function stepHairWind(currentWind: number, targetWind: number, dtScale = 1): number {
  const cur = clamp01(currentWind);
  const tgt = clamp01(targetWind);
  const factor = tgt > cur ? Math.min(1, 0.22 * dtScale) : Math.min(1, 0.09 * dtScale);
  const next = cur + (tgt - cur) * factor;
  if (tgt === 0 && next < 0.004) {
    return 0;
  }
  return clamp01(next);
}

/**
 * Spatial hair region mask [0..1] for the 512x512 portrait:
 * - Inner face oval, crown root, neck, collarbones, shoulders, and shawl = 0
 * - Outer flowing left/right/crown hair locks = > 0
 */
export function computeHairRegionMask(
  colNorm: number,
  rowNorm: number,
  hairstyle: HairstyleOption = 'wavy'
): number {
  const faceDx = (colNorm - 0.555) / 0.12;
  const faceDy = (rowNorm - 0.295) / 0.135;
  const faceDist = Math.hypot(faceDx, faceDy);
  const outsideFace = smoothstep(0.88, 1.32, faceDist);

  const crownFade = smoothstep(0.11, 0.20, rowNorm);

  const torsoDepth = smoothstep(0.34, 0.43, rowNorm);
  const torsoHalfWidth = 0.115 + smoothstep(0.42, 0.55, rowNorm) * 0.13;
  const bodyNormX = Math.abs(colNorm - 0.555) / torsoHalfWidth;
  const outsideTorsoBand = smoothstep(0.85, 1.24, bodyNormX);
  const outsideNeckAndChest = 1 - torsoDepth * (1 - clamp01(outsideTorsoBand));

  let shawlClear: number;
  if (hairstyle === 'bob') {
    shawlClear = 1 - smoothstep(0.42, 0.49, rowNorm);
  } else if (hairstyle === 'straight') {
    const upperSideLocks = 1 - smoothstep(0.45, 0.54, rowNorm);
    const leftLongStrand =
      (1 - smoothstep(0.28, 0.40, colNorm)) * (1 - smoothstep(0.70, 0.86, rowNorm));
    shawlClear = Math.max(upperSideLocks, leftLongStrand);
  } else {
    shawlClear = 1 - smoothstep(0.46, 0.54, rowNorm);
  }

  const leftHair = 1 - smoothstep(0.33, 0.46, colNorm);
  const rightHair = smoothstep(0.64, 0.75, colNorm);
  const upperHalo = (1 - smoothstep(0.23, 0.33, rowNorm)) * crownFade;
  const hairZones = clamp01(Math.max(leftHair, rightHair, upperHalo));

  return clamp01(outsideFace * crownFade * outsideNeckAndChest * shawlClear * hairZones);
}

/**
 * Portrait bitmap mesh offset is strictly zero so the portrait image never
 * bends, tears, or looks crooked ("تصویر ٹیڑھی میڑی نہ ہو").
 */
export function computeHairMeshOffset(params: {
  colNorm: number;
  rowNorm: number;
  wind: number;
  phase: number;
  amplitudePx?: number;
  hairstyle?: HairstyleOption;
}): HairOffsetResult {
  const mask = computeHairRegionMask(params.colNorm, params.rowNorm, params.hairstyle ?? 'wavy');
  return { dx: 0, dy: 0, mask };
}

export interface HairAirWisp {
  x0: number;
  y0: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x1: number;
  y1: number;
  alpha: number;
  lineWidth: number;
}

interface WispAnchor {
  x0: number;
  y0: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x1: number;
  y1: number;
  driftX: number;
  driftY: number;
  speed: number;
  phaseOffset: number;
  baseAlpha: number;
  width: number;
}

const WISP_ANCHORS: Record<HairstyleOption, WispAnchor[]> = {
  wavy: [
    // Layered S-curved hair locks following natural billowing curls on left & right
    { x0: 0.48, y0: 0.15, cx1: 0.40, cy1: 0.17, cx2: 0.34, cy2: 0.23, x1: 0.26, y1: 0.26, driftX: -0.014, driftY: 0.007, speed: 0.86, phaseOffset: 0.0, baseAlpha: 0.30, width: 1.5 },
    { x0: 0.45, y0: 0.18, cx1: 0.37, cy1: 0.21, cx2: 0.30, cy2: 0.28, x1: 0.22, y1: 0.31, driftX: -0.017, driftY: 0.008, speed: 0.94, phaseOffset: 0.9, baseAlpha: 0.32, width: 1.6 },
    { x0: 0.43, y0: 0.23, cx1: 0.35, cy1: 0.27, cx2: 0.28, cy2: 0.33, x1: 0.21, y1: 0.37, driftX: -0.018, driftY: 0.009, speed: 1.02, phaseOffset: 1.7, baseAlpha: 0.30, width: 1.5 },
    { x0: 0.42, y0: 0.29, cx1: 0.34, cy1: 0.34, cx2: 0.27, cy2: 0.39, x1: 0.22, y1: 0.44, driftX: -0.016, driftY: 0.008, speed: 0.90, phaseOffset: 2.4, baseAlpha: 0.28, width: 1.4 },
    { x0: 0.40, y0: 0.35, cx1: 0.33, cy1: 0.40, cx2: 0.27, cy2: 0.45, x1: 0.24, y1: 0.50, driftX: -0.015, driftY: 0.007, speed: 0.84, phaseOffset: 3.2, baseAlpha: 0.25, width: 1.3 },
    { x0: 0.38, y0: 0.41, cx1: 0.32, cy1: 0.46, cx2: 0.28, cy2: 0.50, x1: 0.26, y1: 0.54, driftX: -0.013, driftY: 0.006, speed: 0.96, phaseOffset: 4.0, baseAlpha: 0.22, width: 1.2 },
    // Delicate right-side flowing outer locks
    { x0: 0.62, y0: 0.18, cx1: 0.66, cy1: 0.24, cx2: 0.68, cy2: 0.32, x1: 0.69, y1: 0.41, driftX: 0.013, driftY: 0.007, speed: 0.88, phaseOffset: 1.4, baseAlpha: 0.27, width: 1.35 },
    { x0: 0.64, y0: 0.26, cx1: 0.68, cy1: 0.32, cx2: 0.70, cy2: 0.39, x1: 0.71, y1: 0.46, driftX: 0.015, driftY: 0.006, speed: 1.0, phaseOffset: 2.8, baseAlpha: 0.23, width: 1.2 },
  ],
  bob: [
    // Soft bob curves hugging the rounded chin-length silhouette
    { x0: 0.48, y0: 0.145, cx1: 0.40, cy1: 0.17, cx2: 0.34, cy2: 0.24, x1: 0.29, y1: 0.33, driftX: -0.013, driftY: 0.007, speed: 0.86, phaseOffset: 0.2, baseAlpha: 0.30, width: 1.5 },
    { x0: 0.45, y0: 0.18, cx1: 0.37, cy1: 0.22, cx2: 0.31, cy2: 0.30, x1: 0.28, y1: 0.39, driftX: -0.016, driftY: 0.008, speed: 0.94, phaseOffset: 1.1, baseAlpha: 0.31, width: 1.55 },
    { x0: 0.43, y0: 0.24, cx1: 0.35, cy1: 0.29, cx2: 0.31, cy2: 0.36, x1: 0.31, y1: 0.43, driftX: -0.015, driftY: 0.007, speed: 1.02, phaseOffset: 2.0, baseAlpha: 0.28, width: 1.4 },
    { x0: 0.41, y0: 0.30, cx1: 0.34, cy1: 0.36, cx2: 0.33, cy2: 0.42, x1: 0.37, y1: 0.46, driftX: -0.013, driftY: 0.006, speed: 0.90, phaseOffset: 2.8, baseAlpha: 0.25, width: 1.3 },
    { x0: 0.61, y0: 0.18, cx1: 0.66, cy1: 0.24, cx2: 0.69, cy2: 0.33, x1: 0.67, y1: 0.41, driftX: 0.013, driftY: 0.006, speed: 0.92, phaseOffset: 2.1, baseAlpha: 0.26, width: 1.35 },
    { x0: 0.63, y0: 0.24, cx1: 0.68, cy1: 0.30, cx2: 0.69, cy2: 0.36, x1: 0.68, y1: 0.42, driftX: 0.014, driftY: 0.006, speed: 1.0, phaseOffset: 3.4, baseAlpha: 0.22, width: 1.2 },
  ],
  straight: [
    // Long silky straight strands gliding smoothly along outer cascade
    { x0: 0.48, y0: 0.145, cx1: 0.40, cy1: 0.21, cx2: 0.35, cy2: 0.36, x1: 0.27, y1: 0.51, driftX: -0.014, driftY: 0.006, speed: 0.84, phaseOffset: 0.1, baseAlpha: 0.29, width: 1.5 },
    { x0: 0.45, y0: 0.18, cx1: 0.37, cy1: 0.29, cx2: 0.30, cy2: 0.46, x1: 0.20, y1: 0.62, driftX: -0.017, driftY: 0.007, speed: 0.94, phaseOffset: 0.95, baseAlpha: 0.31, width: 1.6 },
    { x0: 0.41, y0: 0.27, cx1: 0.34, cy1: 0.42, cx2: 0.25, cy2: 0.57, x1: 0.17, y1: 0.70, driftX: -0.018, driftY: 0.008, speed: 1.0, phaseOffset: 1.8, baseAlpha: 0.29, width: 1.5 },
    { x0: 0.38, y0: 0.38, cx1: 0.32, cy1: 0.53, cx2: 0.26, cy2: 0.68, x1: 0.25, y1: 0.80, driftX: -0.015, driftY: 0.007, speed: 0.88, phaseOffset: 2.65, baseAlpha: 0.26, width: 1.4 },
    { x0: 0.34, y0: 0.50, cx1: 0.30, cy1: 0.64, cx2: 0.28, cy2: 0.77, x1: 0.34, y1: 0.88, driftX: -0.013, driftY: 0.006, speed: 0.82, phaseOffset: 3.4, baseAlpha: 0.23, width: 1.3 },
    { x0: 0.63, y0: 0.18, cx1: 0.66, cy1: 0.28, cx2: 0.69, cy2: 0.38, x1: 0.72, y1: 0.48, driftX: 0.013, driftY: 0.006, speed: 0.92, phaseOffset: 2.2, baseAlpha: 0.25, width: 1.3 },
    { x0: 0.64, y0: 0.25, cx1: 0.68, cy1: 0.34, cx2: 0.70, cy2: 0.42, x1: 0.73, y1: 0.50, driftX: 0.014, driftY: 0.006, speed: 0.98, phaseOffset: 3.8, baseAlpha: 0.22, width: 1.2 },
  ],
};

/**
 * Generates smooth, travelling S-curve hair strands that flow gracefully in the air
 * strictly along outer hair locks, without flickering or ever distorting the portrait.
 */
export function computeHairAirWisps(params: {
  hairstyle: HairstyleOption;
  phase: number;
  drawX: number;
  drawY: number;
  drawSize: number;
  intensity?: number;
}): HairAirWisp[] {
  const { hairstyle, phase, drawX, drawY, drawSize, intensity = 1 } = params;
  const gain = clamp01(intensity);
  if (gain <= 0.01 || drawSize <= 0) return [];

  const anchors = WISP_ANCHORS[hairstyle] || WISP_ANCHORS.wavy;
  return anchors.map((a) => {
    const t = phase * a.speed + a.phaseOffset;
    // Travelling wave from hair root (cx1) -> mid lock (cx2) -> flowing tip (x1)
    const w1X = Math.sin(t);
    const w1Y = Math.cos(t * 0.82);
    const w2X = Math.sin(t - 0.85);
    const w2Y = Math.cos((t - 0.85) * 0.82);
    const wTipX = Math.sin(t - 1.65) + 0.35 * Math.sin(t * 1.45 - 0.7);
    const wTipY = Math.cos((t - 1.65) * 0.82);

    // Gentle constant sheen without jarring brightness pulses
    const sheen = 0.88 + 0.12 * Math.sin(phase * 0.7 + a.phaseOffset);

    const dx1 = a.driftX * 0.42 * w1X * drawSize;
    const dy1 = a.driftY * 0.42 * (0.45 + 0.55 * w1Y) * drawSize;
    const dx2 = a.driftX * 0.92 * w2X * drawSize;
    const dy2 = a.driftY * 0.92 * (0.45 + 0.55 * w2Y) * drawSize;
    const dxTip = a.driftX * 1.38 * wTipX * drawSize;
    const dyTip = a.driftY * 1.32 * (0.45 + 0.55 * wTipY) * drawSize;

    return {
      x0: drawX + a.x0 * drawSize,
      y0: drawY + a.y0 * drawSize,
      cx1: drawX + a.cx1 * drawSize + dx1,
      cy1: drawY + a.cy1 * drawSize + dy1,
      cx2: drawX + a.cx2 * drawSize + dx2,
      cy2: drawY + a.cy2 * drawSize + dy2,
      x1: drawX + a.x1 * drawSize + dxTip,
      y1: drawY + a.y1 * drawSize + dyTip,
      alpha: Number(Math.min(0.39, a.baseAlpha * sheen * gain).toFixed(3)),
      lineWidth: Math.max(0.8, a.width * (drawSize / 235)),
    };
  });
}

export interface VoiceWaveBarsInput {
  state: AvatarState;
  micLevel: number;
  lipOpenness: number;
  lipWidth?: number;
  phase: number;
  barCount?: number;
}

export interface VoiceWaveBarsResult {
  active: boolean;
  energy: number;
  bars: number[];
}

/**
 * Computes normalized equalizer bar scales [0.14..1.0] for the voice waves below ZARA.
 * Reacts smoothly when ZARA speaks or hears voice input, and remains completely still
 * at a crisp calm baseline when idle (zero non-hair idle animation).
 */
export function computeVoiceWaveBars({
  state,
  micLevel,
  lipOpenness,
  lipWidth = 0,
  phase,
  barCount = 15,
}: VoiceWaveBarsInput): VoiceWaveBarsResult {
  const count = Math.max(5, Math.min(31, Math.round(barCount)));
  const mic = clamp01(micLevel);
  const lip = clamp01(lipOpenness);
  const widthBoost = clamp01(lipWidth);

  const isSpeaking = state === 'speaking' || lip > LIP_NOISE_FLOOR;
  const isListeningVoice = state === 'listening' || mic > MIC_NOISE_FLOOR;
  const active = isSpeaking || isListeningVoice;

  let energy = 0;
  if (isSpeaking) {
    energy = clamp01(Math.max(0.46, 0.42 + lip * 0.52 + widthBoost * 0.14));
  } else if (isListeningVoice) {
    const gatedMic = mic > MIC_NOISE_FLOOR ? (mic - MIC_NOISE_FLOOR) / (1 - MIC_NOISE_FLOOR) : 0;
    energy = clamp01(Math.max(0.32, 0.28 + gatedMic * 0.72));
  }

  const mid = (count - 1) / 2;
  const bars: number[] = [];

  for (let i = 0; i < count; i++) {
    const normDist = mid > 0 ? Math.abs(i - mid) / mid : 0;
    const bellEnvelope = Math.exp(-normDist * normDist * 2.35);

    if (!active) {
      bars.push(Number((0.14 + bellEnvelope * 0.05).toFixed(3)));
    } else {
      const h1 = 0.5 + 0.5 * Math.sin(phase * 6.8 + i * 0.92);
      const h2 = 0.5 + 0.5 * Math.cos(phase * 10.4 - i * 1.35);
      const harmonic = h1 * 0.62 + h2 * 0.38;
      const height = 0.18 + energy * bellEnvelope * (0.34 + 0.56 * harmonic);
      bars.push(Number(clamp01(height).toFixed(3)));
    }
  }

  return { active, energy, bars };
}
