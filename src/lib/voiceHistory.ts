import type {
  SkillActionType,
  VoiceCommandLog,
  VoiceCommandStatus,
} from '../types/nova';

export type VoiceStatusFilter = 'all' | VoiceCommandStatus;

export interface VoiceHistoryStats {
  total: number;
  matched: number;
  aiFallback: number;
  failed: number;
}

export interface VoiceFrequencyBarSpec {
  index: number;
  minScale: number;
  maxScale: number;
  durationMs: number;
  delayMs: number;
  opacity: number;
}

export function classifyVoiceExecution(params: {
  ok: boolean;
  skillExecuted?: string | null;
}): VoiceCommandStatus {
  if (!params.ok) return 'failed';
  if (params.skillExecuted && params.skillExecuted.trim().length > 0) {
    return 'matched';
  }
  return 'ai_fallback';
}

export function formatVoiceLogStatusLabel(status: VoiceCommandStatus): string {
  if (status === 'matched') return 'Executed';
  if (status === 'failed') return 'Failed';
  return 'AI Reply';
}

export function normalizeVoiceVolume(raw: unknown, fallback = 0.5): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(0, Math.min(1, num));
  return Math.round(clamped * 1000) / 1000;
}

export function formatVolumePercent(volumeLevel: number): string {
  const normalized = normalizeVoiceVolume(volumeLevel, 0.5);
  return `${Math.round(normalized * 100)}%`;
}

export function getVolumeIntensityLabel(volumeLevel: number): 'Quiet' | 'Moderate' | 'Loud' {
  const normalized = normalizeVoiceVolume(volumeLevel, 0.5);
  if (normalized < 0.35) return 'Quiet';
  if (normalized < 0.72) return 'Moderate';
  return 'Loud';
}

export function computeVoiceFrequencyBars(params: {
  volumeLevel: number;
  idSeed?: number;
  barCount?: number;
}): VoiceFrequencyBarSpec[] {
  const volume = normalizeVoiceVolume(params.volumeLevel, 0.5);
  const seed = Math.abs(Math.trunc(params.idSeed ?? 1)) || 1;
  const barCount = Math.max(4, Math.min(32, Math.trunc(params.barCount ?? 14)));
  const center = (barCount - 1) / 2;
  const bars: VoiceFrequencyBarSpec[] = [];

  for (let i = 0; i < barCount; i++) {
    // Voice-formant center-weighted bell curve (0.45 at edges -> 1.0 near center)
    const distNorm = center > 0 ? Math.abs(i - center) / center : 0;
    const formantEnvelope = 0.45 + 0.55 * Math.cos(distNorm * Math.PI * 0.44);

    // Deterministic harmonic ripple seeded by log id + bar index
    const phaseHash = Math.sin((seed * 17.31 + i * 2.47) * 1.13);
    const secondaryHash = Math.cos((seed * 7.19 - i * 1.73) * 0.91);
    const texture = 0.78 + 0.22 * ((phaseHash * 0.65 + secondaryHash * 0.35 + 1) / 2);

    // Amplitude ceiling scales proportionally with recorded command volume
    const rawMax = (0.1 + volume * 0.9) * formantEnvelope * texture;
    const maxScale = Math.round(Math.max(0.1, Math.min(1, rawMax)) * 1000) / 1000;

    // Baseline trough shrinks as volume drops, keeping quiet commands calm and loud commands dynamic
    const oscillationSwing = 0.16 + volume * 0.46;
    const rawMin = maxScale * (1 - oscillationSwing);
    const minScale = Math.round(Math.max(0.08, Math.min(maxScale, rawMin)) * 1000) / 1000;

    // Quieter logs breathe gently; louder logs pulse more energetically
    const baseDuration = 1650 - volume * 780;
    const durationJitter = ((i * 97 + seed * 31) % 240) - 120;
    const durationMs = Math.max(680, Math.round(baseDuration + durationJitter));
    const delayMs = -((i * 115 + seed * 53) % durationMs);
    const opacity = Math.round((0.46 + volume * 0.5) * 100) / 100;

    bars.push({
      index: i,
      minScale,
      maxScale,
      durationMs,
      delayMs,
      opacity,
    });
  }

  return bars;
}

export function filterVoiceHistory(
  logs: VoiceCommandLog[],
  query: string,
  statusFilter: VoiceStatusFilter
): VoiceCommandLog[] {
  const q = query.trim().toLowerCase();
  return logs.filter((entry) => {
    if (statusFilter !== 'all' && entry.status !== statusFilter) {
      return false;
    }
    if (!q) return true;
    return (
      entry.transcript.toLowerCase().includes(q) ||
      (entry.matched_display_name ?? '').toLowerCase().includes(q) ||
      (entry.matched_skill_name ?? '').toLowerCase().includes(q) ||
      entry.response_summary.toLowerCase().includes(q)
    );
  });
}

export function computeVoiceHistoryStats(logs: VoiceCommandLog[]): VoiceHistoryStats {
  let matched = 0;
  let aiFallback = 0;
  let failed = 0;
  for (const log of logs) {
    if (log.status === 'matched') matched++;
    else if (log.status === 'failed') failed++;
    else aiFallback++;
  }
  return {
    total: logs.length,
    matched,
    aiFallback,
    failed,
  };
}

export function resolveSkillDisplayLabel(
  skillName: string | null | undefined,
  skills: Array<{ skill_name: string; display_name: string }>
): string | null {
  if (!skillName) return null;
  if (skillName === 'desktop_command') return 'Desktop Companion';
  const found = skills.find((s) => s.skill_name === skillName);
  return found?.display_name ?? skillName;
}

export function sanitizeVoiceLogActionType(
  raw: string | null | undefined
): SkillActionType | 'ai' | 'desktop' | null {
  if (!raw) return null;
  const allowed = new Set<string>([
    'launch',
    'url',
    'system',
    'ai',
    'note',
    'reminder',
    'calc',
    'study',
    'vision',
    'evolve',
    'desktop',
  ]);
  return allowed.has(raw) ? (raw as SkillActionType | 'ai' | 'desktop') : null;
}

export interface VoiceReplaySegment {
  kind: 'command' | 'response';
  text: string;
  language: 'en' | 'ur';
}

export function buildVoiceReplaySegments(
  log: Pick<VoiceCommandLog, 'transcript' | 'response_summary' | 'language'>
): VoiceReplaySegment[] {
  const segments: VoiceReplaySegment[] = [];
  const commandText = (log.transcript ?? '').trim();
  const responseText = (log.response_summary ?? '').trim();
  const lang: 'en' | 'ur' = log.language === 'ur' ? 'ur' : 'en';

  if (commandText) {
    segments.push({
      kind: 'command',
      text: commandText,
      language: lang,
    });
  }

  if (responseText) {
    segments.push({
      kind: 'response',
      text: responseText,
      language: lang,
    });
  }

  return segments;
}

export function formatVoiceReplayPhaseLabel(params: {
  phase: 'command' | 'response' | null;
  hasRecordedClip?: boolean;
}): string {
  if (params.phase === 'command') {
    return params.hasRecordedClip ? 'Playing recorded voice' : 'Replaying command';
  }
  if (params.phase === 'response') {
    return 'Replaying reply';
  }
  return 'Play';
}

