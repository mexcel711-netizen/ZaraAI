import { computeHeartVoiceDynamics, createDefaultHeartState } from './heartAndBrain';
import type { FacialEmotion, HeartState } from '../types/nova';

export type IntonationContour =
  | 'steady'
  | 'warm-arc'
  | 'gentle-fall'
  | 'rising'
  | 'bright-bounce'
  | 'assertive';

export interface VoiceIntonationProfile {
  emotion: FacialEmotion;
  /** Base pitch shift in cents (-140..+140), applied via Web Audio AudioBufferSourceNode.detune */
  pitchShiftCents: number;
  /** Natural micro-inflection depth in cents over a spoken phrase */
  pitchVarianceCents: number;
  /** Relative speaking tempo multiplier (0.82..1.18) combined with user voice_speed */
  cadenceMultiplier: number;
  /** Natural breath pause in milliseconds inserted between multi-chunk sentences */
  pauseMsBetweenChunks: number;
  /** Intonation phrase curve shape */
  intonationContour: IntonationContour;
  /** Low-shelf warmth gain (dB) at 190 Hz */
  warmthGainDb: number;
  /** Presence peaking gain (dB) at 2750 Hz */
  presenceGainDb: number;
  /** High-shelf sibilance softening gain (dB) at 6200 Hz */
  softnessGainDb: number;
  /** Subtle dynamic loudness trim (0.85..1.10) combined with user voice_volume */
  dynamicGainScale: number;
  /** Concise human-readable description of the resolved vocal delivery */
  expressionSummary: string;
}

export interface VoiceEmotionInput {
  emotion?: FacialEmotion;
  heart?: HeartState | null;
  moodIntensity?: number;
}

export interface ResolvedPlaybackSettings {
  effectiveSpeed: number;
  effectiveVolume: number;
  detuneCents: number;
  pitchVarianceCents: number;
  intonationContour: IntonationContour;
  warmthGainDb: number;
  presenceGainDb: number;
  softnessGainDb: number;
  pauseMsBetweenChunks: number;
}

interface BaseEmotionVoicePreset {
  pitchShiftCents: number;
  pitchVarianceCents: number;
  cadenceMultiplier: number;
  pauseMsBetweenChunks: number;
  intonationContour: IntonationContour;
  dynamicGainScale: number;
  expressionSummary: string;
}

const EMOTION_VOICE_PRESETS: Record<FacialEmotion, BaseEmotionVoicePreset> = {
  calm: {
    pitchShiftCents: 0,
    pitchVarianceCents: 10,
    cadenceMultiplier: 0.99,
    pauseMsBetweenChunks: 150,
    intonationContour: 'steady',
    dynamicGainScale: 0.98,
    expressionSummary: 'Grounded, serene cadence with steady intonation.',
  },
  happy: {
    pitchShiftCents: 32,
    pitchVarianceCents: 22,
    cadenceMultiplier: 1.03,
    pauseMsBetweenChunks: 110,
    intonationContour: 'bright-bounce',
    dynamicGainScale: 1.02,
    expressionSummary: 'Warm, lifted pitch with buoyant conversational cadence.',
  },
  excited: {
    pitchShiftCents: 65,
    pitchVarianceCents: 30,
    cadenceMultiplier: 1.07,
    pauseMsBetweenChunks: 80,
    intonationContour: 'bright-bounce',
    dynamicGainScale: 1.06,
    expressionSummary: 'Bright, energetic pitch lift with brisk lively pacing.',
  },
  love: {
    pitchShiftCents: -14,
    pitchVarianceCents: 16,
    cadenceMultiplier: 0.94,
    pauseMsBetweenChunks: 210,
    intonationContour: 'warm-arc',
    dynamicGainScale: 0.93,
    expressionSummary: 'Soft, affectionate, close-mic warmth with tender lingering pauses.',
  },
  empathetic: {
    pitchShiftCents: -24,
    pitchVarianceCents: 14,
    cadenceMultiplier: 0.93,
    pauseMsBetweenChunks: 230,
    intonationContour: 'warm-arc',
    dynamicGainScale: 0.94,
    expressionSummary: 'Gentle, reassuring tone with unhurried empathetic phrasing.',
  },
  sad: {
    pitchShiftCents: -58,
    pitchVarianceCents: 8,
    cadenceMultiplier: 0.89,
    pauseMsBetweenChunks: 280,
    intonationContour: 'gentle-fall',
    dynamicGainScale: 0.89,
    expressionSummary: 'Low, hushed cadence with slower breaths and soft downward inflection.',
  },
  thoughtful: {
    pitchShiftCents: -12,
    pitchVarianceCents: 12,
    cadenceMultiplier: 0.95,
    pauseMsBetweenChunks: 240,
    intonationContour: 'gentle-fall',
    dynamicGainScale: 0.96,
    expressionSummary: 'Measured reflective pacing with deliberate pauses between thoughts.',
  },
  curious: {
    pitchShiftCents: 26,
    pitchVarianceCents: 24,
    cadenceMultiplier: 1.01,
    pauseMsBetweenChunks: 135,
    intonationContour: 'rising',
    dynamicGainScale: 1.0,
    expressionSummary: 'Inquisitive upward inflection with attentive conversational rhythm.',
  },
  surprised: {
    pitchShiftCents: 56,
    pitchVarianceCents: 28,
    cadenceMultiplier: 1.04,
    pauseMsBetweenChunks: 95,
    intonationContour: 'rising',
    dynamicGainScale: 1.04,
    expressionSummary: 'Expressive high-lift onset with crisp reactive intonation.',
  },
  confident: {
    pitchShiftCents: -8,
    pitchVarianceCents: 15,
    cadenceMultiplier: 1.01,
    pauseMsBetweenChunks: 130,
    intonationContour: 'assertive',
    dynamicGainScale: 1.03,
    expressionSummary: 'Clear, assured delivery with decisive phrase endings.',
  },
  angry: {
    pitchShiftCents: -18,
    pitchVarianceCents: 20,
    cadenceMultiplier: 1.04,
    pauseMsBetweenChunks: 90,
    intonationContour: 'assertive',
    dynamicGainScale: 1.05,
    expressionSummary: 'Firm, taut cadence with crisp forward emphasis.',
  },
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Maps ZARA's live facial emotion and persistent HeartState ("Dil") into concrete
 * speech modulation parameters: pitch shift, cadence tempo, inter-chunk breath pauses,
 * intonation contour, and studio EQ shaping.
 */
export function resolveVoiceSpeechParameters(input: VoiceEmotionInput = {}): VoiceIntonationProfile {
  const heart = input.heart ?? createDefaultHeartState();
  const emotion: FacialEmotion = input.emotion || heart.currentFeeling || 'calm';
  const preset = EMOTION_VOICE_PRESETS[emotion] ?? EMOTION_VOICE_PRESETS.calm;
  const heartDynamics = computeHeartVoiceDynamics(heart, emotion);

  // Scale expressive intensity safely around 1.0 (supports 0.5..2.0 config.mood_intensity)
  const rawIntensity = typeof input.moodIntensity === 'number' ? input.moodIntensity : 1.0;
  const intensityScale = clampNumber(0.65 + rawIntensity * 0.35, 0.75, 1.35);

  // Heart energy and heartbeat subtly steer cadence and pitch liveliness
  const energyOffset = (heart.energy - 65) / 100; // ~ -0.45 .. +0.35
  const bpmLift = clampNumber((heart.heartbeatBpm - 74) * 0.45, -10, 22);
  const affectionSoftening = heart.affection >= 82 ? -0.02 : 0;
  const warmthPresenceBias = heart.warmth >= 85 ? 0.3 : 0;

  const rawPitchShift = (preset.pitchShiftCents + bpmLift * 0.5) * intensityScale;
  const pitchShiftCents = Math.round(clampNumber(rawPitchShift, -140, 140));
  const pitchVarianceCents = Math.round(clampNumber(preset.pitchVarianceCents * intensityScale, 4, 42));

  // Blend emotion preset cadence with HeartState dynamics & energy
  const blendedCadence =
    preset.cadenceMultiplier * 0.65 +
    heartDynamics.speedMultiplier * 0.35 +
    energyOffset * 0.04 +
    affectionSoftening;
  const deviatedCadence = 1 + (blendedCadence - 1) * intensityScale;
  const cadenceMultiplier = roundTo(clampNumber(deviatedCadence, 0.82, 1.18), 3);

  const fatiguePause = heart.energy <= 42 ? 45 : 0;
  const excitementTrim = heart.heartbeatBpm >= 92 ? -20 : 0;
  const pauseMsBetweenChunks = Math.round(
    clampNumber(preset.pauseMsBetweenChunks + fatiguePause + excitementTrim, 50, 420)
  );

  const dynamicGainScale = roundTo(
    clampNumber(
      1 + (preset.dynamicGainScale - 1) * intensityScale + (heart.energy <= 35 ? -0.02 : 0),
      0.85,
      1.1
    ),
    3
  );

  return {
    emotion,
    pitchShiftCents,
    pitchVarianceCents,
    cadenceMultiplier,
    pauseMsBetweenChunks,
    intonationContour: preset.intonationContour,
    warmthGainDb: roundTo(clampNumber(heartDynamics.warmthGainDb + warmthPresenceBias, -2, 5.5), 1),
    presenceGainDb: roundTo(clampNumber(heartDynamics.presenceGainDb, -1, 4.5), 1),
    softnessGainDb: roundTo(clampNumber(heartDynamics.softnessGainDb, -5, 1), 1),
    dynamicGainScale,
    expressionSummary: preset.expressionSummary,
  };
}

/**
 * Combines user-configured speed/volume with the active emotional VoiceIntonationProfile
 * into safe playback parameters for Web Audio / HTMLAudioElement.
 */
export function applyVoiceIntonationToPlayback(params: {
  baseSpeed: number;
  baseVolume: number;
  profile: VoiceIntonationProfile;
}): ResolvedPlaybackSettings {
  const safeBaseSpeed = clampNumber(params.baseSpeed || 1, 0.65, 1.5);
  const safeBaseVolume = clampNumber(params.baseVolume ?? 1, 0.05, 1.5);

  return {
    effectiveSpeed: roundTo(
      clampNumber(safeBaseSpeed * params.profile.cadenceMultiplier, 0.65, 1.6),
      3
    ),
    effectiveVolume: roundTo(
      clampNumber(safeBaseVolume * params.profile.dynamicGainScale, 0.05, 1.5),
      3
    ),
    detuneCents: params.profile.pitchShiftCents,
    pitchVarianceCents: params.profile.pitchVarianceCents,
    intonationContour: params.profile.intonationContour,
    warmthGainDb: params.profile.warmthGainDb,
    presenceGainDb: params.profile.presenceGainDb,
    softnessGainDb: params.profile.softnessGainDb,
    pauseMsBetweenChunks: params.profile.pauseMsBetweenChunks,
  };
}

/**
 * Computes subtle time-varying pitch contour offset (in cents) during Web Audio playback
 * so spoken sentences carry organic emotional rise, fall, or warm arch inflection.
 */
export function computeSentencePitchCurveCents(
  profile: VoiceIntonationProfile,
  progress01: number
): number {
  const t = clampNumber(progress01, 0, 1);
  const depth = profile.pitchVarianceCents;
  let contourOffset = 0;

  switch (profile.intonationContour) {
    case 'rising':
      // Curious / surprised upward lift toward the end of the phrase
      contourOffset = (t - 0.35) * depth * 1.15;
      break;
    case 'gentle-fall':
      // Sad / reflective gentle drop toward sentence cadence end
      contourOffset = (0.35 - t) * depth * 1.1;
      break;
    case 'warm-arc':
      // Affectionate / empathetic swell across middle of phrase
      contourOffset = Math.sin(t * Math.PI) * depth * 0.9;
      break;
    case 'bright-bounce':
      // Cheerful / excited lilting cadence wave
      contourOffset = Math.sin(t * Math.PI * 2.5) * depth * 0.75 + 0.15 * depth;
      break;
    case 'assertive':
      // Confident firm start settling cleanly at phrase resolution
      contourOffset = (0.45 - t) * depth * 0.6;
      break;
    case 'steady':
    default:
      contourOffset = Math.sin(t * Math.PI * 1.5) * depth * 0.35;
      break;
  }

  return Math.round(clampNumber(profile.pitchShiftCents + contourOffset, -160, 160));
}
