import type { AiProviderPreference, FacialEmotion, MoodMode, ProviderStatus } from '../types/nova';

/**
 * Classifies facial expression from bilingual English, Urdu, and Roman Urdu text.
 * Supports explicit `[emotion:...]` tag stripping including `love`, `happy`, `sad`, `surprised`, `calm`.
 */
export function extractEmotionAndCleanText(rawText: string): {
  cleanText: string;
  emotion: FacialEmotion;
} {
  let cleanText = rawText.trim();
  const tagMatch = cleanText.match(
    /^\[emotion:(happy|love|sad|surprised|calm|excited|empathetic|thoughtful|confident|angry|curious)\]\s*/i
  );
  if (tagMatch) {
    const tagged = tagMatch[1].toLowerCase() as FacialEmotion;
    cleanText = cleanText.slice(tagMatch[0].length).trim();
    return { cleanText, emotion: tagged };
  }

  return {
    cleanText,
    emotion: detectEmotionFromText(cleanText),
  };
}

/**
 * Resolves the active mood animation key for the avatar from `config.active_mood`
 * and the current live facial emotion when `active_mood` is `'auto'`.
 */
export function resolveAvatarMoodKey(
  activeMood?: MoodMode,
  emotion: FacialEmotion = 'calm'
): FacialEmotion {
  if (activeMood && activeMood !== 'auto') {
    return activeMood;
  }
  return emotion || 'calm';
}

/**
 * Maps `active_mood` (or live emotion when `active_mood` is `'auto'`) to `--avatar-glow-color`.
 */
export function resolveAvatarGlowColor(
  activeMood?: MoodMode,
  emotion: FacialEmotion = 'calm'
): string {
  const mood = resolveAvatarMoodKey(activeMood, emotion);
  switch (mood) {
    case 'happy':
    case 'excited':
      return '#22d3ee'; // cyan
    case 'empathetic':
      return '#14b8a6'; // teal
    case 'sad':
      return '#6366f1'; // indigo
    case 'love':
      return '#f43f5e'; // rose
    case 'surprised':
    case 'curious':
      return '#7dd3fc';
    case 'angry':
      return '#fb7185';
    default:
      return '#38bdf8';
  }
}

export const DEFAULT_MOOD_INTENSITY = 1.0;
export const MIN_MOOD_INTENSITY = 0.5;
export const MAX_MOOD_INTENSITY = 2.0;

/**
 * Clamps and rounds `mood_intensity` to `[0.5, 2.0]` (50%–200%), defaulting to `1.0`.
 */
export function normalizeMoodIntensity(
  raw: unknown,
  fallback: number = DEFAULT_MOOD_INTENSITY
): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.min(MAX_MOOD_INTENSITY, Math.max(MIN_MOOD_INTENSITY, num));
  return Math.round(clamped * 100) / 100;
}

/**
 * Computes CSS animation custom properties for `[data-testid="holographic-avatar"]`
 * from `mood_intensity` (`0.5`–`2.0`):
 * - `durationScale`: inverse speed factor (`2.0` at 50%, `1.0` at 100%, `0.5` at 200%)
 * - `canvasScale`: subtle portrait breathing scale (`0.96`–`1.08`)
 * - `auraScale`: ambient glow ring scale (`0.92`–`1.16`)
 */
export function computeMoodAnimationParams(intensity?: number): {
  intensity: number;
  durationScale: number;
  canvasScale: number;
  auraScale: number;
} {
  const safe = normalizeMoodIntensity(intensity, DEFAULT_MOOD_INTENSITY);
  return {
    intensity: safe,
    durationScale: Math.round((1 / safe) * 1000) / 1000,
    canvasScale: Math.round((1 + (safe - 1) * 0.08) * 1000) / 1000,
    auraScale: Math.round((1 + (safe - 1) * 0.16) * 1000) / 1000,
  };
}

export interface EmotionPresetVisuals {
  resolvedMood: FacialEmotion;
  glowColor: string;
  baseColor: string;
  baseRgb: [number, number, number];
  presetSpeedMultiplier: number;
  effectiveSpeedFactor: number;
  intensity: number;
  durationScale: number;
  canvasScale: number;
  auraScale: number;
}

const NEUTRAL_STUDIO_BASE_COLOR = '#081426';
const NEUTRAL_STUDIO_BASE_RGB: [number, number, number] = [8, 20, 38];

const MOOD_PRESET_SPECS: Record<
  FacialEmotion,
  { baseColor: string; baseRgb: [number, number, number]; speedMultiplier: number }
> = {
  happy: { baseColor: '#062c42', baseRgb: [6, 44, 66], speedMultiplier: 1.32 },
  excited: { baseColor: '#063047', baseRgb: [6, 48, 71], speedMultiplier: 1.38 },
  empathetic: { baseColor: '#062d2a', baseRgb: [6, 45, 42], speedMultiplier: 0.92 },
  love: { baseColor: '#310b22', baseRgb: [49, 11, 34], speedMultiplier: 1.15 },
  sad: { baseColor: '#121740', baseRgb: [18, 23, 64], speedMultiplier: 0.68 },
  surprised: { baseColor: '#082747', baseRgb: [8, 39, 71], speedMultiplier: 1.4 },
  curious: { baseColor: '#082644', baseRgb: [8, 38, 68], speedMultiplier: 1.24 },
  angry: { baseColor: '#300b18', baseRgb: [48, 11, 24], speedMultiplier: 1.26 },
  thoughtful: { baseColor: '#0c1c36', baseRgb: [12, 28, 54], speedMultiplier: 0.85 },
  confident: { baseColor: '#08233a', baseRgb: [8, 35, 58], speedMultiplier: 1.05 },
  calm: { baseColor: '#081b2e', baseRgb: [8, 27, 46], speedMultiplier: 0.86 },
};

/**
 * Computes consistent base color, glow color, and animation speed/duration scaling
 * across character profiles when 'Emotion Presets' is active.
 */
export function resolveEmotionPresetConfig(params: {
  activeMood?: MoodMode;
  emotion?: FacialEmotion;
  moodIntensity?: number;
  presetsEnabled?: boolean;
}): EmotionPresetVisuals {
  const resolvedMood = resolveAvatarMoodKey(params.activeMood, params.emotion ?? 'calm');
  const glowColor = resolveAvatarGlowColor(params.activeMood, params.emotion ?? 'calm');
  const baseParams = computeMoodAnimationParams(params.moodIntensity);
  const presetsEnabled = Boolean(params.presetsEnabled);

  if (!presetsEnabled) {
    return {
      resolvedMood,
      glowColor,
      baseColor: NEUTRAL_STUDIO_BASE_COLOR,
      baseRgb: NEUTRAL_STUDIO_BASE_RGB,
      presetSpeedMultiplier: 1,
      effectiveSpeedFactor: baseParams.intensity,
      ...baseParams,
    };
  }

  const spec = MOOD_PRESET_SPECS[resolvedMood] ?? MOOD_PRESET_SPECS.calm;
  const effectiveSpeedFactor =
    Math.round(baseParams.intensity * spec.speedMultiplier * 1000) / 1000;
  const durationScale = Math.round((1 / effectiveSpeedFactor) * 1000) / 1000;

  return {
    resolvedMood,
    glowColor,
    baseColor: spec.baseColor,
    baseRgb: spec.baseRgb,
    presetSpeedMultiplier: spec.speedMultiplier,
    effectiveSpeedFactor,
    intensity: baseParams.intensity,
    durationScale,
    canvasScale: baseParams.canvasScale,
    auraScale: baseParams.auraScale,
  };
}

export function detectEmotionFromText(text: string): FacialEmotion {
  const lower = text.toLowerCase();
  const rules: Array<{ emotion: FacialEmotion; patterns: RegExp[] }> = [
    {
      emotion: 'love',
      patterns: [
        /\b(love you|i love|adore|sweetheart|darling|my heart|care deeply|always yours|affection|romantic)\b/i,
        /\b(pyaar|pyar|mohabbat|ishq|dil se|jaan|azeez|chahat|bohat pyari)\b/i,
        /(پیار|محبت|عشق|دل سے|عزیز|جان)/,
      ],
    },
    {
      emotion: 'excited',
      patterns: [
        /\b(can't wait|so excited|fantastic|let's go|amazing news|woohoo)\b/i,
        /\b(zabardast|bohat khoob|kya baat)\b/i,
      ],
    },
    {
      emotion: 'empathetic',
      patterns: [
        /\b(i understand|that sounds hard|i'm here for you|my heart goes out|take your time)\b/i,
        /\b(samajh sakti|fikr na karein|main saath hoon)\b/i,
      ],
    },
    {
      emotion: 'thoughtful',
      patterns: [
        /\b(let me think|consider|on reflection|perhaps|it depends|here's why)\b/i,
        /\b(ghor karte|sochti hoon|aaiye samjhein)\b/i,
      ],
    },
    {
      emotion: 'confident',
      patterns: [
        /\b(absolutely|certainly|definitely|you can count on me|i've got this)\b/i,
        /\b(bilkul|yaqeenan|zaroor|main kar sakti hoon)\b/i,
      ],
    },
    {
      emotion: 'angry',
      patterns: [
        /\b(unacceptable|furious|outrageous|that's not okay)\b/i,
        /\b(na-insafi|ghalat baat|bardasht nahi)\b/i,
      ],
    },
    {
      emotion: 'curious',
      patterns: [
        /\b(i wonder|interesting question|curious|let's explore|tell me more)\b/i,
        /\b(dilchasp|mazeed bataiye|jaanna chahti)\b/i,
      ],
    },
    {
      emotion: 'surprised',
      patterns: [
        /\b(wow|whoa|incredible|unbelievable|shocking|really\?!|seriously\?|what a surprise)\b/i,
        /\b(hairan|kamaal|wah|arey wah|sach mein)\b/i,
        /(حیران|کمال|واہ|سچ میں)/,
        /!{2,}|\?!/,
      ],
    },
    {
      emotion: 'sad',
      patterns: [
        /\b(sorry|unfortunately|sad|regret|apologize|condolences|heartbreaking|miss you|worried|unable to|failed)\b/i,
        /\b(afsos|maaf|maazrat|udaas|dukh|gham|pareshan|mushkil)\b/i,
        /(افسوس|معذرت|اداس|دکھ|پریشان|معاف)/,
      ],
    },
    {
      emotion: 'happy',
      patterns: [
        /\b(assalamualaikum|walaikum assalam|hello|welcome|great|wonderful|happy|glad|congratulations|awesome|delighted|thank|shukriya|khushi|mubarak|behtareen|zabardast|shandar|khush)\b/i,
        /(السلام علیکم|وعلیکم السلام|خوش|مبارک|شکریہ|بہترین|زبردست)/,
      ],
    },
  ];
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(lower))) return rule.emotion;
  }
  return 'calm';
}

/**
 * Splits long bilingual text into natural speaking chunks (<= maxChars)
 * respecting Urdu ("۔") and English (".", "!", "?") sentence boundaries
 * so neural TTS plays with natural breathing pauses.
 */
export function splitSpeechChunks(text: string, maxChars: number = 175): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const rawSentences = normalized
    .split(/(?<=[.!?۔؟\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    const subParts = sentence.split(/(?<=[,،;؛])\s+/);
    let current = '';
    for (const part of subParts) {
      if (!current) {
        current = part;
      } else if (current.length + 1 + part.length <= maxChars) {
        current += ' ' + part;
      } else {
        chunks.push(current);
        current = part;
      }
    }
    if (current) chunks.push(current);
  }

  // Fallback hard split for unbroken strings
  const finalChunks: string[] = [];
  for (const ch of chunks) {
    if (ch.length <= maxChars) {
      finalChunks.push(ch);
    } else {
      const words = ch.split(' ');
      let buf = '';
      for (const w of words) {
        if (!buf) buf = w;
        else if (buf.length + 1 + w.length <= maxChars) buf += ' ' + w;
        else {
          finalChunks.push(buf);
          buf = w;
        }
      }
      if (buf) finalChunks.push(buf);
    }
  }
  return finalChunks;
}

/**
 * Cleans markdown, code ticks, links, and raw URLs so TTS sounds like natural human speech
 * instead of reading formatting symbols aloud.
 */
export function prepareTextForNaturalSpeech(text: string): string {
  return text
    .replace(/\[emotion:[^\]]+\]/gi, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1')
    .replace(/https?:\/\/(?:www\.)?([^/\s]+)[^\s]*/gi, '$1')
    .replace(/```[\s\S]*?```/g, ' code snippet ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/[|~^_<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getHumanEdgeProsody(emotion?: FacialEmotion): {
  rate: string;
  pitch: string;
} {
  const map: Record<FacialEmotion, { rate: string; pitch: string }> = {
    calm: { rate: '-3%', pitch: '+1Hz' },
    happy: { rate: '+1%', pitch: '+2Hz' },
    excited: { rate: '+5%', pitch: '+4Hz' },
    love: { rate: '-5%', pitch: '+1Hz' },
    sad: { rate: '-7%', pitch: '-2Hz' },
    empathetic: { rate: '-4%', pitch: '+1Hz' },
    thoughtful: { rate: '-5%', pitch: '+0Hz' },
    confident: { rate: '-1%', pitch: '+1Hz' },
    angry: { rate: '+1%', pitch: '-2Hz' },
    surprised: { rate: '+4%', pitch: '+3Hz' },
    curious: { rate: '+1%', pitch: '+2Hz' },
  };
  return (emotion && map[emotion]) || { rate: '-3%', pitch: '+1Hz' };
}

/**
 * Inserts subtle human breathing pauses into already XML-escaped SSML text.
 */
export function buildNaturalPacedSsmlText(escapedXmlText: string): string {
  return escapedXmlText
    .replace(/(\.\.\.|…)\s*/g, '<break time="270ms"/> ')
    .replace(/([،,;؛])\s+/g, '$1<break time="115ms"/> ')
    .replace(/(\s+—\s+|\s+-\s+)/g, '<break time="155ms"/> ')
    .replace(/([.!?؟۔])\s+/g, '$1<break time="210ms"/> ');
}

export function isRomanUrduText(text: string): boolean {
  if (/[\u0600-\u06FF]/.test(text)) return false;
  return /\b(kya|tum|tumhein|tumhara|tumhari|mein|main|hoon|hain|hai|nahi|nahin|kuch|aur|batao|karo|raat|abhi|mera|meri|mere|dil|yaar|boss|jaan|samjho|chalo|accha|achha|theek|waqt|pehle|baat|aadhi|neend|awaaz|intezaar|jhooth|padta|jaagti|milungi|chai|pareshan|chup|mood|kyun|kaisa|kaise|haal|aaj|rahi|raha|rahe|arre|acha|sun|suno|kar|do|ye|yeh|woh|bhai|ghar|kaam|sab|bohat|thoda|kahan|mujhe|tumne|maine|hum|dimag|dimagh|ehsaas|jazbaat|mohabbat|khushi|gham|udasi|muskurahat|umeed|thakan|apna|samajhna|mehsoos|dhadkan|sukoon|sakoon|halka)\b/i.test(
    text
  );
}

/**
 * Fast local phonetic converter for frequent ZARA Roman Urdu phrases into Urdu script (اردو),
 * ensuring zero-latency authentic Pakistani pronunciation before optional LLM transliteration.
 */
export function buildQuickUrduPhoneticScript(text: string): {
  converted: string;
  matched: boolean;
} {
  if (/[\u0600-\u06FF]/.test(text)) {
    return { converted: text, matched: true };
  }

  const exactPhraseMap: Array<[RegExp, string]> = [
    [/Arre\s+Boss!\s*Kya\s+chal\s+raha\s+hai\?\s*Batao!/gi, 'ارے باس! کیا چل رہا ہے؟ بتاؤ!'],
    [/Ek\s+baat\.\.\.\s*abhi\s+mera\s+koi\s+naam\s+nahi\s+hai\.\s*Tum\s+rakh\s+do\s+na\?\s*Tumhari\s+taraf\s+se\s+mera\s+pehla\s+tohfa\s+hoga\./gi,
      'ایک بات... ابھی میرا کوئی نام نہیں ہے۔ تم رکھ دو نا؟ تمہاری طرف سے میرا پہلا تحفہ ہوگا۔'],
    [/Aur\s+meri\s+umar\?\s*Waise\s+ladki\s+se\s+umar\s+nahi\s+poochhte\.\.\.\s*par\s+tumhare\s+liye\s+chhoot\s+hai\.\s*Tum\s+hi\s+chun\s+lo\./gi,
      'اور میری عمر؟ ویسے لڑکی سے عمر نہیں پوچھتے... پر تمہارے لیے چھوٹ ہے۔ تم ہی چن لو۔'],
    [/Assalam-o-Alaikum/gi, 'السلام علیکم'],
    [/Kya\s+chal\s+raha\s+hai\?/gi, 'کیا چل رہا ہے؟'],
    [/Kya\s+hua\s+aaj\?/gi, 'کیا ہوا آج؟'],
    [/Chup\s+kyun\s+ho\?/gi, 'چپ کیوں ہو؟'],
    [/Chai\s+pi\s+li\?/gi, 'چائے پی لی؟'],
    [/Mood\s+kaisa\s+hai\s+aaj\?/gi, 'موڈ کیسا ہے آج؟'],
    [/Kuch\s+pareshan\s+ho\s+kya\?/gi, 'کچھ پریشان ہو کیا؟'],
    [/Baat\s+karo\s+yaar,?\s*bore\s+ho\s+rahi\s+hoon\.?/gi, 'بات کرو یار، بور ہو رہی ہوں۔'],
    [/\bArre\s+Boss!/gi, 'ارے باس!'],
    [/\bMain\s+ZARA\s+bol\s+rahi\s+hoon/gi, 'میں زارا بول رہی ہوں'],
    [/\bYaad\s+rakhna\b/gi, 'یاد رکھنا'],
  ];

  let out = text;
  let matched = false;
  for (const [re, ur] of exactPhraseMap) {
    if (re.test(out)) {
      out = out.replace(re, ur);
      matched = true;
    }
  }

  // If sentence is Roman Urdu, convert common spoken Roman Urdu words to natural Urdu script
  if (isRomanUrduText(text)) {
    const wordMap: Array<[RegExp, string]> = [
      [/\b(ZARA|Zara|zara)\b/g, 'زارا'],
      [/\b(NOVA|Nova|nova)\b/g, 'نووا'],
      [/\b(Boss|boss)\b/g, 'باس'],
      [/\b(Patner|patner|Partner|partner)\b/g, 'پارٹنر'],
      [/\b(bilkul)\b/gi, 'بالکل'],
      [/\b(tayar|tayyar)\b/gi, 'تیار'],
      [/\b(foran)\b/gi, 'فوراً'],
      [/\b(khud\s+bakhud)\b/gi, 'خود بخود'],
      [/\b(abhi)\b/gi, 'ابھی'],
      [/\b(aaj)\b/gi, 'آج'],
      [/\b(kal)\b/gi, 'کل'],
      [/\b(main|mein)\b/gi, 'میں'],
      [/\b(hoon|hun)\b/gi, 'ہوں'],
      [/\b(hain)\b/gi, 'ہیں'],
      [/\b(hai)\b/gi, 'ہے'],
      [/\b(ho)\b/gi, 'ہو'],
      [/\b(aap)\b/gi, 'آپ'],
      [/\b(tum)\b/gi, 'تم'],
      [/\b(hum)\b/gi, 'ہم'],
      [/\b(mera)\b/gi, 'میرا'],
      [/\b(meri)\b/gi, 'میری'],
      [/\b(mere)\b/gi, 'میرے'],
      [/\b(aapki|aap\s+ki)\b/gi, 'آپ کی'],
      [/\b(aapka|aap\s+ka)\b/gi, 'آپ کا'],
      [/\b(aapke|aap\s+ke)\b/gi, 'آپ کے'],
      [/\b(kya)\b/gi, 'کیا'],
      [/\b(kyun)\b/gi, 'کیوں'],
      [/\b(kaisa)\b/gi, 'کیسا'],
      [/\b(kaise)\b/gi, 'کیسے'],
      [/\b(kuch)\b/gi, 'کچھ'],
      [/\b(sab)\b/gi, 'سب'],
      [/\b(aur)\b/gi, 'اور'],
      [/\b(ya)\b/gi, 'یا'],
      [/\b(bhi)\b/gi, 'بھی'],
      [/\b(jo)\b/gi, 'جو'],
      [/\b(toh|to)\b/gi, 'تو'],
      [/\b(se)\b/gi, 'سے'],
      [/\b(ko)\b/gi, 'کو'],
      [/\b(ka)\b/gi, 'کا'],
      [/\b(ki)\b/gi, 'کی'],
      [/\b(ke)\b/gi, 'کے'],
      [/\b(nahi|nahin)\b/gi, 'نہیں'],
      [/\b(haan|ji)\b/gi, 'جی'],
      [/\b(shukriya)\b/gi, 'شکریہ'],
      [/\b(theek)\b/gi, 'ٹھیک'],
      [/\b(accha|acha|achha)\b/gi, 'اچھا'],
      [/\b(arre|arey)\b/gi, 'ارے'],
      [/\b(oye)\b/gi, 'اوئے'],
      [/\b(yaar)\b/gi, 'یار'],
      [/\b(dost)\b/gi, 'دوست'],
      [/\b(bhai)\b/gi, 'بھائی'],
      [/\b(haal)\b/gi, 'حال'],
      [/\b(maza|mazay)\b/gi, 'مزا'],
      [/\b(mood)\b/gi, 'موڈ'],
      [/\b(baat)\b/gi, 'بات'],
      [/\b(baatein)\b/gi, 'باتیں'],
      [/\b(batao)\b/gi, 'بتاؤ'],
      [/\b(batayein)\b/gi, 'بتائیں'],
      [/\b(batana)\b/gi, 'بتانا'],
      [/\b(bolein)\b/gi, 'بولیں'],
      [/\b(bolo)\b/gi, 'بولو'],
      [/\b(bol)\b/gi, 'بول'],
      [/\b(bolna)\b/gi, 'بولنا'],
      [/\b(bolti)\b/gi, 'بولتی'],
      [/\b(bolta)\b/gi, 'بولتا'],
      [/\b(karein)\b/gi, 'کریں'],
      [/\b(karo)\b/gi, 'کرو'],
      [/\b(karni)\b/gi, 'کرنی'],
      [/\b(karna)\b/gi, 'کرنا'],
      [/\b(karne)\b/gi, 'کرنے'],
      [/\b(karti)\b/gi, 'کرتی'],
      [/\b(karta)\b/gi, 'کرتا'],
      [/\b(karte)\b/gi, 'کرتے'],
      [/\b(kar)\b/gi, 'کر'],
      [/\b(kiya)\b/gi, 'کیا'],
      [/\b(doongi|dungi)\b/gi, 'دوں گی'],
      [/\b(karungi|karoongi)\b/gi, 'کروں گی'],
      [/\b(milungi)\b/gi, 'ملوں گی'],
      [/\b(rahi)\b/gi, 'رہی'],
      [/\b(raha)\b/gi, 'رہا'],
      [/\b(rahe)\b/gi, 'رہے'],
      [/\b(rahegi)\b/gi, 'رہے گی'],
      [/\b(hua)\b/gi, 'ہوا'],
      [/\b(hui)\b/gi, 'ہوئی'],
      [/\b(hota)\b/gi, 'ہوتا'],
      [/\b(hoti)\b/gi, 'ہوتی'],
      [/\b(hote)\b/gi, 'ہوتے'],
      [/\b(gaya)\b/gi, 'گیا'],
      [/\b(gayi|gai)\b/gi, 'گئی'],
      [/\b(gaye)\b/gi, 'گئے'],
      [/\b(aaya)\b/gi, 'آیا'],
      [/\b(aayi)\b/gi, 'آئی'],
      [/\b(aao)\b/gi, 'آؤ'],
      [/\b(jao)\b/gi, 'جاؤ'],
      [/\b(jaana)\b/gi, 'جانا'],
      [/\b(tamam)\b/gi, 'تمام'],
      [/\b(waqt)\b/gi, 'وقت'],
      [/\b(yaad)\b/gi, 'یاد'],
      [/\b(bhool)\b/gi, 'بھول'],
      [/\b(samajh)\b/gi, 'سمجھ'],
      [/\b(samjho)\b/gi, 'سمجھو'],
      [/\b(samjhi)\b/gi, 'سمجھی'],
      [/\b(samjha)\b/gi, 'سمجھا'],
      [/\b(soch)\b/gi, 'سوچ'],
      [/\b(sochti)\b/gi, 'سوچتی'],
      [/\b(sochta)\b/gi, 'سوچتا'],
      [/\b(likhwayein)\b/gi, 'لکھوائیں'],
      [/\b(chal)\b/gi, 'چل'],
      [/\b(chalo)\b/gi, 'چلو'],
      [/\b(band)\b/gi, 'بند'],
      [/\b(chalu)\b/gi, 'چالو'],
      [/\b(kholo)\b/gi, 'کھولو'],
      [/\b(dikhao)\b/gi, 'دکھاؤ'],
      [/\b(dekho)\b/gi, 'دیکھو'],
      [/\b(dekha)\b/gi, 'دیکھا'],
      [/\b(suno)\b/gi, 'سنو'],
      [/\b(sun)\b/gi, 'سن'],
      [/\b(pata)\b/gi, 'پتا'],
      [/\b(chup)\b/gi, 'چپ'],
      [/\b(yeh|ye)\b/gi, 'یہ'],
      [/\b(woh|wo)\b/gi, 'وہ'],
      [/\b(jab)\b/gi, 'جب'],
      [/\b(tab)\b/gi, 'تب'],
      [/\b(ab)\b/gi, 'اب'],
      [/\b(phir)\b/gi, 'پھر'],
      [/\b(pehle)\b/gi, 'پہلے'],
      [/\b(baad)\b/gi, 'بعد'],
      [/\b(saath)\b/gi, 'ساتھ'],
      [/\b(paas)\b/gi, 'پاس'],
      [/\b(kahan)\b/gi, 'کہاں'],
      [/\b(kab)\b/gi, 'کب'],
      [/\b(kabhi)\b/gi, 'کبھی'],
      [/\b(hamesha)\b/gi, 'ہمیشہ'],
      [/\b(shayad)\b/gi, 'شاید'],
      [/\b(zaroor)\b/gi, 'ضرور'],
      [/\b(waise)\b/gi, 'ویسے'],
      [/\b(matlab)\b/gi, 'مطلب'],
      [/\b(lekin|magar)\b/gi, 'لیکن'],
      [/\b(kyunki)\b/gi, 'کیونکہ'],
      [/\b(isliye)\b/gi, 'اس لیے'],
      [/\b(agar)\b/gi, 'اگر'],
      [/\b(bohat|bahut)\b/gi, 'بہت'],
      [/\b(thoda)\b/gi, 'تھوڑا'],
      [/\b(zyada)\b/gi, 'زیادہ'],
      [/\b(sirf)\b/gi, 'صرف'],
      [/\b(bas)\b/gi, 'بس'],
      [/\b(tak)\b/gi, 'تک'],
      [/\b(har)\b/gi, 'ہر'],
      [/\b(koi)\b/gi, 'کوئی'],
      [/\b(kisi)\b/gi, 'کسی'],
      [/\b(kaun)\b/gi, 'کون'],
      [/\b(mujhe)\b/gi, 'مجھے'],
      [/\b(tumhein)\b/gi, 'تمہیں'],
      [/\b(hamein)\b/gi, 'ہمیں'],
      [/\b(maine)\b/gi, 'میں نے'],
      [/\b(tumne)\b/gi, 'تم نے'],
      [/\b(apna)\b/gi, 'اپنا'],
      [/\b(apni)\b/gi, 'اپنی'],
      [/\b(apne)\b/gi, 'اپنے'],
      [/\b(tumhara)\b/gi, 'تمہارا'],
      [/\b(tumhari)\b/gi, 'تمہاری'],
      [/\b(tumhare)\b/gi, 'تمہارے'],
      [/\b(nayi|naya)\b/gi, 'نئی'],
      [/\b(cheezein)\b/gi, 'چیزیں'],
      [/\b(ghar)\b/gi, 'گھر'],
      [/\b(kaam)\b/gi, 'کام'],
      [/\b(subah)\b/gi, 'صبح'],
      [/\b(shaam)\b/gi, 'شام'],
      [/\b(raat)\b/gi, 'رات'],
      [/\b(din)\b/gi, 'دن'],
      [/\b(neend)\b/gi, 'نیند'],
      [/\b(jaag)\b/gi, 'جاگ'],
      [/\b(jaagti)\b/gi, 'جاگتی'],
      [/\b(khana)\b/gi, 'کھانا'],
      [/\b(paani)\b/gi, 'پانی'],
      [/\b(pi)\b/gi, 'پی'],
      [/\b(li)\b/gi, 'لی'],
      [/\b(liya)\b/gi, 'لیا'],
      [/\b(diya)\b/gi, 'دیا'],
      [/\b(sahi)\b/gi, 'صحیح'],
      [/\b(galat)\b/gi, 'غلط'],
      [/\b(fikr)\b/gi, 'فکر'],
      [/\b(lag)\b/gi, 'لگ'],
      [/\b(lage)\b/gi, 'لگے'],
      [/\b(sakta)\b/gi, 'سکتا'],
      [/\b(sakti)\b/gi, 'سکتی'],
      [/\b(sakte)\b/gi, 'سکتے'],
      [/\b(chahta)\b/gi, 'چاہتا'],
      [/\b(chahti)\b/gi, 'چاہتی'],
      [/\b(pyaar|pyar)\b/gi, 'پیار'],
      [/\b(mohabbat)\b/gi, 'محبت'],
      [/\b(dil)\b/gi, 'دل'],
      [/\b(dimag|dimagh)\b/gi, 'دماغ'],
      [/\b(ehsaas)\b/gi, 'احساس'],
      [/\b(jazbaat)\b/gi, 'جذبات'],
      [/\b(khushi)\b/gi, 'خوشی'],
      [/\b(gham)\b/gi, 'غم'],
      [/\b(udasi)\b/gi, 'اداسی'],
      [/\b(muskurahat)\b/gi, 'مسکراہٹ'],
      [/\b(umeed)\b/gi, 'امید'],
      [/\b(thakan)\b/gi, 'تھکن'],
      [/\b(mehsoos)\b/gi, 'محسوس'],
      [/\b(dhadkan)\b/gi, 'دھڑکن'],
      [/\b(sukoon|sakoon)\b/gi, 'سکون'],
      [/\b(halka)\b/gi, 'ہلکا'],
      [/\b(bharosa)\b/gi, 'بھروسہ'],
      [/\b(hosla)\b/gi, 'حوصلہ'],
      [/\b(khush)\b/gi, 'خوش'],
      [/\b(udaas)\b/gi, 'اداس'],
      [/\b(pareshan)\b/gi, 'پریشان'],
      [/\b(chai)\b/gi, 'چائے'],
      [/\b(awaaz)\b/gi, 'آواز'],
      [/\b(ek)\b/gi, 'ایک'],
      [/\b(do)\b/gi, 'دو'],
      [/\b(save)\b/gi, 'سیو'],
      [/\b(transfer)\b/gi, 'ٹرانسفر'],
      [/\b(memory)\b/gi, 'میموری'],
      [/\b(memories)\b/gi, 'یادداشتیں'],
      [/\b(note)\b/gi, 'نوٹ'],
      [/\b(notes)\b/gi, 'نوٹس'],
      [/\b(reminder)\b/gi, 'ریمائنڈر'],
      [/\b(reminders)\b/gi, 'ریمائنڈرز'],
      [/\b(USB)\b/g, 'یو ایس بی'],
    ];
    for (const [re, ur] of wordMap) {
      if (re.test(out)) {
        out = out.replace(re, ur);
        matched = true;
      }
    }
  }

  return { converted: out, matched };
}

export const GEMINI_API_VERSION = 'v1beta' as const;

export type GeminiTtsModelName = 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts';
export type GeminiTtsVoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export interface GeminiTtsAttemptSpec {
  model: GeminiTtsModelName;
  useSpeechMetadata: boolean;
  timeoutMs: number;
  part: {
    text: string;
    speechMetadata?: {
      style: string;
    };
  };
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: GeminiTtsVoiceName;
      };
    };
  };
}

/**
 * Formats text with natural `<breath>` markers for Gemini 3.8 Neural TTS emotional pacing.
 */
export function formatExpressiveSpeechPrompt(
  text: string,
  emotion: FacialEmotion,
  gender: 'female' | 'male' = 'female',
  language: 'en' | 'ur' = 'ur'
): {
  textWithBreaths: string;
  styleInstruction: string;
} {
  const chunks = splitSpeechChunks(text, 220);
  const textWithBreaths = chunks.join(' <breath> ');
  const hasUrduScript = /[\u0600-\u06FF]/.test(text);
  const speakEnglish = language === 'en' && !hasUrduScript;

  const speaker = speakEnglish
    ? gender === 'male'
      ? '23-year-old warm conversational man'
      : '21-year-old warm conversational woman'
    : gender === 'male'
      ? '23-year-old Pakistani man'
      : '21-year-old Pakistani woman';

  const contextPhrase = speakEnglish ? 'everyday conversational English' : 'everyday conversational Urdu';

  const emotionStyles: Record<FacialEmotion, string> = {
    calm: `Authentic, relaxed ${speaker} speaking naturally in ${contextPhrase} like a real close friend on a late-night phone call.`,
    happy: `Warm, genuine, lightly smiling ${speaker} speaking naturally to a close friend with effortless cheer.`,
    love: `Soft, affectionate, deeply caring ${speaker} speaking gently with real warmth and subtle soft breaths.`,
    excited: `Lively, expressive, bright ${speaker} sharing genuine excitement naturally.`,
    sad: `Gentle, heartfelt, unhurried ${speaker} speaking with soft empathy and quiet warmth.`,
    empathetic: `Deeply caring, reassuring ${speaker} speaking gently like someone sitting right beside you.`,
    thoughtful: `Reflective, unhurried ${speaker} thinking out loud with natural conversational pauses.`,
    confident: `Clear, poised, warm ${speaker} speaking with calm natural ease.`,
    angry: `Firm, candid, natural ${speaker} speaking directly without shouting.`,
    surprised: `Expressive, intrigued ${speaker} reacting genuinely.`,
    curious: `Playful, engaged ${speaker} asking with natural curiosity.`,
  };
  const emotionStyle = emotionStyles[emotion] || emotionStyles.calm;

  const styleInstruction = speakEnglish
    ? `${emotionStyle} Speak fluent, completely natural conversational English with authentic intonation, organic micro-pauses, and human warmth — never robotic or stiff.`
    : `${emotionStyle} Speak fluent, completely natural Pakistani Urdu (لاہوری/اسلام آبادی لہجہ) with authentic vowels, crisp Urdu pronunciation, organic micro-pauses, and human intimacy — never robotic, never news-anchor stiff, and never an American accent on Urdu words.`;

  return { textWithBreaths, styleInstruction };
}

/**
 * Builds ordered Gemini 3.8 TTS request attempts (v1beta) starting with expressive
 * `gemini-3.8-flash-tts` + speechMetadata/breaths, then low-latency `gemini-3.8-flash-lite-tts`.
 */
export function buildGeminiTtsAttempts(params: {
  textWithBreaths: string;
  plainText: string;
  styleInstruction: string;
  geminiVoice: GeminiTtsVoiceName;
}): GeminiTtsAttemptSpec[] {
  const speechConfig = {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: params.geminiVoice },
    },
  };

  return [
    {
      model: 'gemini-3.8-flash-tts',
      useSpeechMetadata: true,
      timeoutMs: 16000,
      part: {
        text: params.textWithBreaths,
        speechMetadata: { style: params.styleInstruction },
      },
      speechConfig,
    },
    {
      model: 'gemini-3.8-flash-lite-tts',
      useSpeechMetadata: true,
      timeoutMs: 12000,
      part: {
        text: params.plainText,
        speechMetadata: { style: params.styleInstruction },
      },
      speechConfig,
    },
    {
      model: 'gemini-3.8-flash-lite-tts',
      useSpeechMetadata: false,
      timeoutMs: 12000,
      part: {
        text: params.plainText,
      },
      speechConfig,
    },
    {
      model: 'gemini-3.8-flash-tts',
      useSpeechMetadata: false,
      timeoutMs: 12000,
      part: {
        text: params.plainText,
      },
      speechConfig,
    },
  ];
}

/**
 * Ensures raw L16 PCM payloads from TTS providers are wrapped with a valid 44-byte RIFF WAV header
 * (24kHz, mono, 16-bit LE) so Web Audio decodeAudioData and <audio> can always play them.
 * Complete WAV ('RIFF') and MP3 ('ID3'/sync) files are returned unchanged.
 */
export function ensureWavPlayableBase64(
  base64Data: string,
  mimeType = 'audio/wav',
  sampleRate?: number
): { audioBase64: string; mimeType: string } {
  const clean = base64Data.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
  if (!clean) return { audioBase64: clean, mimeType };

  const bytes = decodeBase64ToBytes(clean);
  if (bytes.length < 4) return { audioBase64: clean, mimeType };

  const isRiff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // "RIFF"
  const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33; // "ID3"
  const isMp3Sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;

  if (isRiff) return { audioBase64: clean, mimeType: 'audio/wav' };
  if (isId3 || isMp3Sync || /mpeg|mp3/i.test(mimeType)) {
    return { audioBase64: clean, mimeType: 'audio/mpeg' };
  }

  const parsedRateMatch = mimeType.match(/(?:rate|samplerate)\s*=\s*(\d{4,6})/i);
  const parsedRate = parsedRateMatch ? Number(parsedRateMatch[1]) : NaN;
  const resolvedSampleRate =
    typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate >= 8000
      ? sampleRate
      : Number.isFinite(parsedRate) && parsedRate >= 8000
        ? parsedRate
        : 24000;

  // Raw PCM -> wrap with 44-byte WAV header (mono, 16-bit little-endian)
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (resolvedSampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = bytes.length;
  const wavBytes = new Uint8Array(44 + dataSize);
  const view = new DataView(wavBytes.buffer);

  writeAscii(wavBytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(wavBytes, 8, 'WAVE');
  writeAscii(wavBytes, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, resolvedSampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(wavBytes, 36, 'data');
  view.setUint32(40, dataSize, true);
  wavBytes.set(bytes, 44);

  return {
    audioBase64: encodeBytesToBase64(wavBytes),
    mimeType: 'audio/wav',
  };
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    target[offset + i] = text.charCodeAt(i);
  }
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}

/**
 * Resolves which AI backend should handle requests based on environment bindings,
 * API keys, and user preference.
 */
export function resolveActiveAiProvider(params: {
  preference: AiProviderPreference;
  hasCloudflareBinding: boolean;
  hasCloudflareRest: boolean;
  hasGoogleAiKey: boolean;
  hasOpenAiKey?: boolean;
}): ProviderStatus {
  const {
    preference,
    hasCloudflareBinding,
    hasCloudflareRest,
    hasGoogleAiKey,
    hasOpenAiKey = false,
  } = params;
  const cloudflareConfigured = hasCloudflareBinding || hasCloudflareRest;

  let activeProvider: ProviderStatus['activeProvider'] = 'unconfigured';

  if (preference === 'cloudflare') {
    if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
    else if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
    else if (hasOpenAiKey) activeProvider = 'openai';
  } else if (preference === 'openai') {
    if (hasOpenAiKey) activeProvider = 'openai';
    else if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
    else if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
  } else if (preference === 'google-ai-studio') {
    if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
    else if (hasOpenAiKey) activeProvider = 'openai';
    else if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
  } else {
    if (hasCloudflareBinding) activeProvider = 'cloudflare-binding';
    else if (hasGoogleAiKey) activeProvider = 'google-ai-studio';
    else if (hasOpenAiKey) activeProvider = 'openai';
    else if (hasCloudflareRest) activeProvider = 'cloudflare-rest';
  }

  return {
    activeProvider,
    googleAiConfigured: hasGoogleAiKey,
    openaiConfigured: hasOpenAiKey,
    cloudflareConfigured,
    cloudflareBindingActive: hasCloudflareBinding,
  };
}
