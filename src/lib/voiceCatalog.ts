import type { TtsEngineMode } from '../types/nova';

export type VoiceGender = 'female' | 'male';
export type TtsEngineKind = 'gemini-studio' | 'openai-tts' | 'edge-neural';
export type OpenAiTtsVoice = 'marin' | 'coral' | 'ash' | 'onyx';

export interface VoiceEngineOption {
  id: TtsEngineMode;
  label: string;
  description: string;
}

export const VOICE_ENGINE_OPTIONS: VoiceEngineOption[] = [
  {
    id: 'auto',
    label: 'Auto (Gemini Studio -> ChatGPT Voice -> Edge Neural)',
    description:
      'Automatically selects the highest-realism neural voice available while keeping your speaker gender & style locked.',
  },
  {
    id: 'gemini-studio',
    label: 'Gemini 3.8 Expressive Studio (Ultra-Realistic)',
    description: 'Uses Gemini 3.8 Expressive TTS with breathing nuance & studio warmth (when key active).',
  },
  {
    id: 'openai-tts',
    label: 'OpenAI ChatGPT Voice (gpt-4o-mini-tts)',
    description: 'Uses OpenAI expressive neural speech with warm Urdu/English prosody (when key active).',
  },
  {
    id: 'edge-neural',
    label: 'Edge Neural HD (Fast Native Urdu)',
    description: 'Uses consistent Microsoft Neural Urdu/English voice directly.',
  },
];

export interface VoicePersonaOption {
  id: string;
  label: string;
  shortLabel: string;
  gender: VoiceGender;
  engine: TtsEngineKind;
  languageHint: 'ur' | 'en' | 'bilingual';
  edgeFallbackVoice: string;
  geminiPresetVoice: 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';
}

export const VOICE_PERSONA_OPTIONS: VoicePersonaOption[] = [
  // Original Realistic Female Voices
  {
    id: 'ur-PK-UzmaNeural',
    label: 'Uzma Neural — Original Pakistani Urdu Female (Recommended)',
    shortLabel: 'Uzma (Urdu Female)',
    gender: 'female',
    engine: 'edge-neural',
    languageHint: 'ur',
    edgeFallbackVoice: 'ur-PK-UzmaNeural',
    geminiPresetVoice: 'Zephyr',
  },
  {
    id: 'Zephyr',
    label: 'Zephyr — Warm Expressive Studio Female (Ultra-Realistic)',
    shortLabel: 'Zephyr (Studio Female)',
    gender: 'female',
    engine: 'gemini-studio',
    languageHint: 'bilingual',
    edgeFallbackVoice: 'ur-PK-UzmaNeural',
    geminiPresetVoice: 'Zephyr',
  },
  {
    id: 'Kore',
    label: 'Kore — Natural Bilingual Urdu & English Female (Ultra-Realistic)',
    shortLabel: 'Kore (Bilingual Female)',
    gender: 'female',
    engine: 'gemini-studio',
    languageHint: 'bilingual',
    edgeFallbackVoice: 'ur-PK-UzmaNeural',
    geminiPresetVoice: 'Kore',
  },
  {
    id: 'en-US-JennyNeural',
    label: 'Jenny Neural — Natural Conversational English Female',
    shortLabel: 'Jenny (English Female)',
    gender: 'female',
    engine: 'edge-neural',
    languageHint: 'en',
    edgeFallbackVoice: 'en-US-JennyNeural',
    geminiPresetVoice: 'Zephyr',
  },
  {
    id: 'en-US-AriaNeural',
    label: 'Aria Neural — Expressive English Female',
    shortLabel: 'Aria (English Female)',
    gender: 'female',
    engine: 'edge-neural',
    languageHint: 'en',
    edgeFallbackVoice: 'en-US-AriaNeural',
    geminiPresetVoice: 'Kore',
  },

  // Original Realistic Male Voices
  {
    id: 'ur-PK-AsadNeural',
    label: 'Asad Neural — Original Pakistani Urdu Male (Recommended)',
    shortLabel: 'Asad (Urdu Male)',
    gender: 'male',
    engine: 'edge-neural',
    languageHint: 'ur',
    edgeFallbackVoice: 'ur-PK-AsadNeural',
    geminiPresetVoice: 'Puck',
  },
  {
    id: 'Puck',
    label: 'Puck — Warm Conversational Male (Studio)',
    shortLabel: 'Puck (Studio Male)',
    gender: 'male',
    engine: 'gemini-studio',
    languageHint: 'bilingual',
    edgeFallbackVoice: 'ur-PK-AsadNeural',
    geminiPresetVoice: 'Puck',
  },
  {
    id: 'Charon',
    label: 'Charon — Deep Calm Executive Male (Studio)',
    shortLabel: 'Charon (Deep Male)',
    gender: 'male',
    engine: 'gemini-studio',
    languageHint: 'bilingual',
    edgeFallbackVoice: 'ur-PK-AsadNeural',
    geminiPresetVoice: 'Charon',
  },
  {
    id: 'Fenrir',
    label: 'Fenrir — Confident Dynamic Male (Studio)',
    shortLabel: 'Fenrir (Dynamic Male)',
    gender: 'male',
    engine: 'gemini-studio',
    languageHint: 'bilingual',
    edgeFallbackVoice: 'ur-PK-AsadNeural',
    geminiPresetVoice: 'Fenrir',
  },
  {
    id: 'en-US-GuyNeural',
    label: 'Guy Neural — Natural Conversational English Male',
    shortLabel: 'Guy (English Male)',
    gender: 'male',
    engine: 'edge-neural',
    languageHint: 'en',
    edgeFallbackVoice: 'en-US-GuyNeural',
    geminiPresetVoice: 'Puck',
  },
  {
    id: 'en-US-ChristopherNeural',
    label: 'Christopher Neural — Deep Poised English Male',
    shortLabel: 'Christopher (Deep English Male)',
    gender: 'male',
    engine: 'edge-neural',
    languageHint: 'en',
    edgeFallbackVoice: 'en-US-ChristopherNeural',
    geminiPresetVoice: 'Charon',
  },
];

export const FEMALE_VOICE_OPTIONS = VOICE_PERSONA_OPTIONS.filter((v) => v.gender === 'female');
export const MALE_VOICE_OPTIONS = VOICE_PERSONA_OPTIONS.filter((v) => v.gender === 'male');

const GEMINI_STUDIO_VOICE_IDS = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

export function isGeminiStudioVoiceId(voiceName?: string | null): boolean {
  return GEMINI_STUDIO_VOICE_IDS.has((voiceName || '').trim());
}

export function getVoicePersonaById(voiceName?: string | null): VoicePersonaOption | undefined {
  const clean = (voiceName || '').trim();
  return VOICE_PERSONA_OPTIONS.find((v) => v.id === clean);
}

/**
 * Resolves the TTS engine deterministically so ZARA automatically uses the highest-realism
 * model voice available (Gemini 3.8 Studio -> OpenAI gpt-4o-mini-tts -> Edge Neural HD)
 * while locking speaker gender across refreshes and deployments.
 */
export function resolveEffectiveTtsEngine(
  _voiceName?: string | null,
  engineMode: TtsEngineMode = 'auto',
  hasGeminiKey: boolean = false,
  hasOpenAiKey: boolean = false
): TtsEngineKind {
  if (engineMode === 'edge-neural') {
    return 'edge-neural';
  }
  if (engineMode === 'gemini-studio') {
    if (hasGeminiKey) return 'gemini-studio';
    if (hasOpenAiKey) return 'openai-tts';
    return 'edge-neural';
  }
  if (engineMode === 'openai-tts') {
    if (hasOpenAiKey) return 'openai-tts';
    if (hasGeminiKey) return 'gemini-studio';
    return 'edge-neural';
  }
  // In 'auto' mode, prefer realistic model voices whenever configured in server env
  if (hasGeminiKey) {
    return 'gemini-studio';
  }
  if (hasOpenAiKey) {
    return 'openai-tts';
  }
  return 'edge-neural';
}

const MALE_VOICE_IDS = new Set([
  'ur-PK-AsadNeural',
  'Puck',
  'Charon',
  'Fenrir',
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-SteffanNeural',
  'en-GB-RyanNeural',
]);

export function getVoiceGender(voiceName?: string | null): VoiceGender {
  const clean = (voiceName || '').trim();
  if (!clean) return 'female';
  if (MALE_VOICE_IDS.has(clean)) return 'male';
  if (/(asad|puck|charon|fenrir|guy|christopher|eric|steffan|ryan|\bmale\b)/i.test(clean)) {
    return 'male';
  }
  return 'female';
}

export function isMaleVoice(voiceName?: string | null): boolean {
  return getVoiceGender(voiceName) === 'male';
}

export function isExplicitEdgeNeuralVoice(voiceName?: string | null): boolean {
  return /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test((voiceName || '').trim());
}

/**
 * Resolves the concrete Microsoft Edge Neural speaker ID for a configured voice persona.
 * Ensures Urdu script always routes to a native Urdu neural speaker (Uzma / Asad) so text never drops silently,
 * while explicit English neural selections stay English for English replies.
 */
export function resolveEdgeVoiceForSelection(
  voiceName: string,
  preferUrduSpeaker: boolean,
  containsUrduScript: boolean = false
): string {
  const clean = (voiceName || '').trim();
  const male = isMaleVoice(clean);

  // Known broken/empty legacy voice replacement
  if (clean === 'en-US-AndrewNeural') {
    return preferUrduSpeaker || containsUrduScript ? 'ur-PK-AsadNeural' : 'en-US-GuyNeural';
  }

  if (isExplicitEdgeNeuralVoice(clean)) {
    // Explicit Urdu speaker works for both Urdu & mixed English phrases
    if (clean.startsWith('ur-')) return clean;
    // English neural voices cannot pronounce Perso-Arabic Urdu script properly; route Urdu script to Asad/Uzma
    if (containsUrduScript) {
      return male ? 'ur-PK-AsadNeural' : 'ur-PK-UzmaNeural';
    }
    return clean;
  }

  if (preferUrduSpeaker || containsUrduScript) {
    return male ? 'ur-PK-AsadNeural' : 'ur-PK-UzmaNeural';
  }

  if (clean === 'Charon') return 'en-US-ChristopherNeural';
  if (clean === 'Kore') return 'en-US-AriaNeural';
  if (male) return 'en-US-GuyNeural';
  return 'en-US-JennyNeural';
}

export function resolveGeminiVoiceForSelection(
  voiceName?: string | null
): 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir' {
  const clean = (voiceName || '').trim();
  const matched = VOICE_PERSONA_OPTIONS.find((v) => v.id === clean);
  if (matched) return matched.geminiPresetVoice;
  return isMaleVoice(clean) ? 'Puck' : 'Zephyr';
}

export function resolveOpenAiVoiceForSelection(voiceName?: string | null): OpenAiTtsVoice {
  const clean = (voiceName || '').trim();
  if (clean === 'Charon' || clean === 'en-US-ChristopherNeural' || clean === 'Fenrir') {
    return 'onyx';
  }
  if (clean === 'Kore' || clean === 'en-US-AriaNeural') {
    return 'coral';
  }
  return isMaleVoice(clean) ? 'ash' : 'marin';
}

export function getVoicePreviewSample(
  voiceName: string,
  assistantName: string,
  userNickname: string
): { text: string; language: 'en' | 'ur' } {
  const cleanVoice = (voiceName || '').trim();
  const name = assistantName.trim() || (isMaleVoice(cleanVoice) ? 'ASAD' : 'ZARA');
  const nick = userNickname.trim() || 'Boss';
  const male = isMaleVoice(cleanVoice);

  if (cleanVoice.startsWith('en-')) {
    return {
      text: male
        ? `Hey ${nick}, this is ${name} speaking. Ready whenever you need me.`
        : `Hey ${nick}, this is ${name} speaking. Ready whenever you need me.`,
      language: 'en',
    };
  }

  return {
    text: male
      ? `السلام علیکم ${nick}! میں ${name} بات کر رہا ہوں، بتائیں آج کیا کرنا ہے؟`
      : `السلام علیکم ${nick}! میں ${name} بات کر رہی ہوں، بتائیں آج کیا حال ہے؟`,
    language: 'ur',
  };
}
