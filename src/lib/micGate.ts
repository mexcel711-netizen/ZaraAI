export const DEFAULT_VOICE_ACTIVITY_THRESHOLD = 0.065;
export const MIN_VOICE_ACTIVITY_THRESHOLD = 0.02;
export const MAX_VOICE_ACTIVITY_THRESHOLD = 0.25;

export function normalizeVoiceActivityThreshold(
  value: unknown,
  fallback = DEFAULT_VOICE_ACTIVITY_THRESHOLD
): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(MAX_VOICE_ACTIVITY_THRESHOLD, Math.max(MIN_VOICE_ACTIVITY_THRESHOLD, num));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Applies the configurable microphone noise gate so ambient background noise
 * below `threshold` settles cleanly to 0 while speech above it scales smoothly.
 */
export function applyMicNoiseGate(
  rawLevel: number,
  threshold = DEFAULT_VOICE_ACTIVITY_THRESHOLD
): number {
  if (!Number.isFinite(rawLevel) || rawLevel <= 0) return 0;
  const gate = normalizeVoiceActivityThreshold(threshold);
  if (rawLevel < gate) return 0;
  return Math.min(1, (rawLevel - gate) / 0.58);
}

export function describeVoiceActivitySensitivity(threshold: number): {
  label: string;
  hint: string;
} {
  const gate = normalizeVoiceActivityThreshold(threshold);
  if (gate <= 0.045) {
    return {
      label: 'High Sensitivity',
      hint: 'Quiet room — picks up soft voice and whispers easily.',
    };
  }
  if (gate <= 0.1) {
    return {
      label: 'Balanced (Default)',
      hint: 'Filters gentle ambient hum while staying responsive.',
    };
  }
  return {
    label: 'Noise-Filtered',
    hint: 'Busy room — ignores fan, keyboard, and background chatter.',
  };
}
