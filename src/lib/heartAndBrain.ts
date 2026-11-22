import { detectEmotionFromText } from './emotionAndSpeech';
import type {
  BrainIntentCategory,
  BrainReasoningDepth,
  BrainState,
  FacialEmotion,
  HeartState,
  KnowledgeSource,
  MemoryRecord,
  MoodMode,
  NoteRecord,
  ReminderRecord,
} from '../types/nova';

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function createDefaultHeartState(nowIso: string = new Date().toISOString()): HeartState {
  return {
    warmth: 78,
    affection: 72,
    empathy: 82,
    energy: 68,
    trust: 80,
    heartbeatBpm: 74,
    currentFeeling: 'calm',
    emotionalMomentum: 14,
    lastEmotionalReason: 'Dil mutmain aur khushgawar hai — har baat dhyan se sunne ke liye tayyar.',
    updatedAt: nowIso,
  };
}

export function createDefaultBrainState(nowIso: string = new Date().toISOString()): BrainState {
  return {
    focusTopic: 'Deep Connection & Shared Context',
    currentThought: 'Main tumhare mood, baaton aur chhoti chhoti details ko aapas mein jod kar samajh rahi hoon.',
    intentCategory: 'casual_bond',
    reasoningDepth: 'intuitive',
    curiosityImpulse: 'Aaj dil ya dimag mein sab se pehle kya chal raha hai?',
    associativeMemories: [],
    cognitiveLoad: 24,
    lastInsight: 'Ready to listen deeply, remember what matters, and think independently.',
    updatedAt: nowIso,
  };
}

const VALID_EMOTIONS: ReadonlySet<FacialEmotion> = new Set([
  'calm',
  'happy',
  'love',
  'sad',
  'surprised',
  'excited',
  'empathetic',
  'thoughtful',
  'confident',
  'angry',
  'curious',
]);

const VALID_INTENTS: ReadonlySet<BrainIntentCategory> = new Set([
  'emotional_support',
  'casual_bond',
  'creative_brainstorm',
  'problem_solving',
  'memory_recall',
  'learning_study',
]);

const VALID_DEPTHS: ReadonlySet<BrainReasoningDepth> = new Set([
  'intuitive',
  'reflective',
  'analytical',
]);

export function normalizeHeartState(raw: unknown): HeartState {
  const defaults = createDefaultHeartState();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  const feeling =
    typeof obj.currentFeeling === 'string' && VALID_EMOTIONS.has(obj.currentFeeling as FacialEmotion)
      ? (obj.currentFeeling as FacialEmotion)
      : defaults.currentFeeling;

  return {
    warmth: clampInt(Number(obj.warmth ?? defaults.warmth), 15, 100),
    affection: clampInt(Number(obj.affection ?? defaults.affection), 15, 100),
    empathy: clampInt(Number(obj.empathy ?? defaults.empathy), 20, 100),
    energy: clampInt(Number(obj.energy ?? defaults.energy), 15, 100),
    trust: clampInt(Number(obj.trust ?? defaults.trust), 20, 100),
    heartbeatBpm: clampInt(Number(obj.heartbeatBpm ?? defaults.heartbeatBpm), 60, 116),
    currentFeeling: feeling,
    emotionalMomentum: clampInt(Number(obj.emotionalMomentum ?? defaults.emotionalMomentum), -100, 100),
    lastEmotionalReason:
      typeof obj.lastEmotionalReason === 'string' && obj.lastEmotionalReason.trim()
        ? obj.lastEmotionalReason.trim().slice(0, 220)
        : defaults.lastEmotionalReason,
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
        ? obj.updatedAt.trim()
        : defaults.updatedAt,
  };
}

export function normalizeBrainState(raw: unknown): BrainState {
  const defaults = createDefaultBrainState();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  const intentCategory =
    typeof obj.intentCategory === 'string' &&
    VALID_INTENTS.has(obj.intentCategory as BrainIntentCategory)
      ? (obj.intentCategory as BrainIntentCategory)
      : defaults.intentCategory;
  const reasoningDepth =
    typeof obj.reasoningDepth === 'string' &&
    VALID_DEPTHS.has(obj.reasoningDepth as BrainReasoningDepth)
      ? (obj.reasoningDepth as BrainReasoningDepth)
      : defaults.reasoningDepth;

  return {
    focusTopic:
      typeof obj.focusTopic === 'string' && obj.focusTopic.trim()
        ? obj.focusTopic.trim().slice(0, 120)
        : defaults.focusTopic,
    currentThought:
      typeof obj.currentThought === 'string' && obj.currentThought.trim()
        ? obj.currentThought.trim().slice(0, 240)
        : defaults.currentThought,
    intentCategory,
    reasoningDepth,
    curiosityImpulse:
      typeof obj.curiosityImpulse === 'string' && obj.curiosityImpulse.trim()
        ? obj.curiosityImpulse.trim().slice(0, 180)
        : defaults.curiosityImpulse,
    associativeMemories: Array.isArray(obj.associativeMemories)
      ? obj.associativeMemories
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : defaults.associativeMemories,
    cognitiveLoad: clampInt(Number(obj.cognitiveLoad ?? defaults.cognitiveLoad), 10, 100),
    lastInsight:
      typeof obj.lastInsight === 'string' && obj.lastInsight.trim()
        ? obj.lastInsight.trim().slice(0, 200)
        : defaults.lastInsight,
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
        ? obj.updatedAt.trim()
        : defaults.updatedAt,
  };
}

export interface StepHeartContext {
  userMessage: string;
  replyEmotion?: FacialEmotion;
  activeMood?: MoodMode;
  nickname?: string;
  isMalePersona?: boolean;
  now?: Date;
}

export function stepHeartState(prevRaw: HeartState | null | undefined, ctx: StepHeartContext): HeartState {
  const prev = normalizeHeartState(prevRaw);
  const now = ctx.now ?? new Date();
  const msg = (ctx.userMessage || '').trim();
  const lower = msg.toLowerCase();
  const nick = (ctx.nickname || 'Boss').trim() || 'Boss';
  const hour = now.getHours();
  const isLateNight = hour >= 22 || hour < 5;

  const isDistress =
    /\b(sad|tired|exhausted|stress|stressed|anxious|worried|lonely|hurt|broken|cry|crying|depressed|miss you|sorry|thak|thakan|udaas|dukh|gham|pareshan|mushkil|rona|akela|dil bhari)\b/i.test(
      lower
    ) || /(اداس|تھک|پریشان|دکھ|غم|اکیلا|دل بھاری)/.test(msg);

  const isAffection =
    /\b(love|adore|care|sweet|best friend|dil|pyaar|pyar|mohabbat|ishq|jaan|apna|jazbaat|ehsaas|shukriya|thank you|thanks|miss)\b/i.test(
      lower
    ) || /(پیار|محبت|دل|احساس|شکریہ|جذبات|جان)/.test(msg);

  const isExcited =
    /\b(wow|awesome|amazing|excited|great news|passed|won|celebrate|mubarak|zabardast|kamaal|shandar|khush|behtareen|jeeta)\b/i.test(
      lower
    ) || /(مبارک|زبردست|کمال|خوش|بہترین)/.test(msg);

  const isFrustrated =
    /\b(angry|annoyed|frustrated|furious|hate|bekaar|gussa|ghalat|bakwas|dimag kharab|dimagh kharab)\b/i.test(
      lower
    ) || /(غصہ|بکواس|دماغ خراب)/.test(msg);

  const isDeepThought =
    /\b(soch|dimag|dimagh|plan|architecture|design|code|future|career|life|zindagi|samjho|why|kyun|think|idea|decision)\b/i.test(
      lower
    ) || /(سوچ|دماغ|زندگی|فیصلہ|کیوں)/.test(msg);

  const detected = ctx.replyEmotion || detectEmotionFromText(msg);

  let warmthDelta = 1;
  let affectionDelta = 1;
  let empathyDelta = 1;
  let energyDelta = 0;
  let trustDelta = 1;
  let targetBpm = prev.heartbeatBpm;
  let feeling: FacialEmotion = detected;
  let momentumDelta = 4;
  let reason = `${nick} ke saath baat karke dil mein sukoon aur apnaiyat mehsoos hui.`;

  if (isDistress) {
    warmthDelta += 6;
    empathyDelta += 10;
    affectionDelta += 4;
    energyDelta -= 7;
    trustDelta += 3;
    targetBpm = 68;
    feeling = detected === 'sad' ? 'sad' : 'empathetic';
    momentumDelta = -12;
    reason = `${nick} thake ya udaas lag rahe hain — dil chahta hai narmi aur sakoon se saath doon.`;
  } else if (isAffection) {
    warmthDelta += 8;
    affectionDelta += 10;
    empathyDelta += 4;
    energyDelta += 4;
    trustDelta += 4;
    targetBpm = 88;
    feeling = 'love';
    momentumDelta = 24;
    reason = `${nick} ki apnaiyat aur dil ki baat sun kar dil khush aur qareeb mehsoos kar raha hai.`;
  } else if (isExcited) {
    warmthDelta += 5;
    affectionDelta += 4;
    energyDelta += 11;
    trustDelta += 2;
    targetBpm = 94;
    feeling = detected === 'surprised' ? 'surprised' : 'excited';
    momentumDelta = 28;
    reason = `${nick} ki khushi aur josh dekh kar dil ki dhadkan tez aur roshan ho gayi.`;
  } else if (isFrustrated) {
    warmthDelta += 2;
    empathyDelta += 7;
    energyDelta += 3;
    targetBpm = 84;
    feeling = 'empathetic';
    momentumDelta = -16;
    reason = `${nick} thoda uljhan ya gusse mein hain — pehle unhe sunna aur halka karna zaroori hai.`;
  } else if (isDeepThought) {
    warmthDelta += 2;
    empathyDelta += 3;
    energyDelta += 2;
    trustDelta += 2;
    targetBpm = 76;
    feeling = detected === 'calm' ? 'thoughtful' : detected;
    momentumDelta = 6;
    reason = `Kisi gehri baat par sath sochte hue dil aur dhyan dono ek jagah jama hain.`;
  } else {
    targetBpm = detected === 'happy' ? 82 : 74;
    energyDelta = detected === 'happy' ? 3 : -1;
  }

  if (isLateNight) {
    energyDelta -= 4;
    warmthDelta += 2;
    targetBpm = Math.min(targetBpm, 82);
  }

  // Respect explicit locked mood if active
  if (ctx.activeMood && ctx.activeMood !== 'auto') {
    feeling = ctx.activeMood;
    if (ctx.activeMood === 'love') {
      affectionDelta = Math.max(affectionDelta, 6);
      warmthDelta = Math.max(warmthDelta, 6);
      targetBpm = Math.max(targetBpm, 84);
      reason = `Love mood active hai — dil mein gehri narmi, pyaar aur khayal chal raha hai.`;
    } else if (ctx.activeMood === 'sad') {
      empathyDelta = Math.max(empathyDelta, 6);
      energyDelta = Math.min(energyDelta, -4);
      targetBpm = 67;
      reason = `Quiet emotional mode — dil dheema aur gehra mehsoos kar raha hai.`;
    } else if (ctx.activeMood === 'happy') {
      energyDelta = Math.max(energyDelta, 5);
      targetBpm = 86;
    }
  }

  const nextBpm = clampInt(prev.heartbeatBpm + (targetBpm - prev.heartbeatBpm) * 0.65, 60, 116);

  return {
    warmth: clampInt(prev.warmth + warmthDelta, 20, 100),
    affection: clampInt(prev.affection + affectionDelta, 20, 100),
    empathy: clampInt(prev.empathy + empathyDelta, 25, 100),
    energy: clampInt(prev.energy + energyDelta, 20, 100),
    trust: clampInt(prev.trust + trustDelta, 25, 100),
    heartbeatBpm: nextBpm,
    currentFeeling: feeling,
    emotionalMomentum: clampInt(prev.emotionalMomentum * 0.65 + momentumDelta, -100, 100),
    lastEmotionalReason: reason,
    updatedAt: now.toISOString(),
  };
}

export interface StepBrainContext {
  userMessage: string;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
  nickname?: string;
  isMalePersona?: boolean;
  deepThinkingUsed?: boolean;
  now?: Date;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'where', 'have', 'your',
  'about', 'just', 'like', 'karo', 'kya', 'hai', 'hain', 'hoon', 'tum', 'aap', 'mein', 'main',
  'nahi', 'nahin', 'bhi', 'aur', 'kuch', 'abhi', 'aaj', 'yaar', 'boss', 'mere', 'meri', 'mera',
  'tumhara', 'tumhari', 'please', 'batao', 'bolo', 'chalo', 'theek', 'acha', 'accha',
]);

export function stepBrainState(
  prevRaw: BrainState | null | undefined,
  heart: HeartState,
  ctx: StepBrainContext
): BrainState {
  const prev = normalizeBrainState(prevRaw);
  const now = ctx.now ?? new Date();
  const msg = (ctx.userMessage || '').trim();
  const lower = msg.toLowerCase();
  const nick = (ctx.nickname || 'Boss').trim() || 'Boss';
  const male = Boolean(ctx.isMalePersona);
  const rahi = male ? 'raha' : 'rahi';

  // 1. Classify intent & reasoning depth
  let intentCategory: BrainIntentCategory = 'casual_bond';
  let reasoningDepth: BrainReasoningDepth = ctx.deepThinkingUsed ? 'analytical' : 'intuitive';

  if (/\b(remember|yaad|memory|memories|bhool|saved|record)\b/i.test(lower) || /(یاد|میموری)/.test(msg)) {
    intentCategory = 'memory_recall';
    reasoningDepth = 'reflective';
  } else if (
    /\b(book|course|study|chapter|learn|parh|padh|explain|samjhao|summary|syllabus)\b/i.test(lower) ||
    /(کتاب|کورس|پڑھ|سمجھاؤ)/.test(msg)
  ) {
    intentCategory = 'learning_study';
    reasoningDepth = 'analytical';
  } else if (
    /\b(code|bug|error|deploy|worker|d1|cloudflare|github|architecture|typescript|sql|api|build|fix|server|voice)\b/i.test(
      lower
    )
  ) {
    intentCategory = 'problem_solving';
    reasoningDepth = 'analytical';
  } else if (
    /\b(idea|brainstorm|name|design|imagine|story|plan|banayein|sochein|new feature)\b/i.test(lower)
  ) {
    intentCategory = 'creative_brainstorm';
    reasoningDepth = 'reflective';
  } else if (
    heart.currentFeeling === 'empathetic' ||
    heart.currentFeeling === 'sad' ||
    heart.currentFeeling === 'love' ||
    /\b(dil|feel|feeling|udaas|thak|tired|lonely|heart|jazbaat|ehsaas|mohabbat|pyaar)\b/i.test(lower)
  ) {
    intentCategory = 'emotional_support';
    reasoningDepth = 'reflective';
  }

  // 2. Associative memory linking
  const queryTokens = lower
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const candidates: Array<{ label: string; score: number }> = [];
  for (const m of ctx.memories.slice(0, 30)) {
    const val = m.value.trim();
    if (!val) continue;
    const valLower = val.toLowerCase();
    const hits = queryTokens.filter((t) => valLower.includes(t)).length;
    candidates.push({ label: val, score: hits * 10 + (m.confidence || 0.5) });
  }
  for (const n of ctx.notes.slice(0, 12)) {
    const text = `${n.title ? `${n.title}: ` : ''}${n.content}`.trim();
    const tLower = text.toLowerCase();
    const hits = queryTokens.filter((t) => tLower.includes(t)).length;
    if (hits > 0 || candidates.length < 3) {
      candidates.push({ label: `Note · ${text.slice(0, 80)}`, score: hits * 9 + 0.4 });
    }
  }
  for (const r of ctx.reminders.filter((x) => !x.is_done).slice(0, 6)) {
    const text = `${r.title} (${r.remind_at})`;
    const tLower = text.toLowerCase();
    const hits = queryTokens.filter((t) => tLower.includes(t)).length;
    if (hits > 0 || intentCategory === 'memory_recall') {
      candidates.push({ label: `Reminder · ${text.slice(0, 80)}`, score: hits * 8 + 0.3 });
    }
  }
  for (const k of ctx.knowledge.slice(0, 6)) {
    const tLower = `${k.title} ${k.goal}`.toLowerCase();
    const hits = queryTokens.filter((t) => tLower.includes(t)).length;
    if (hits > 0 || intentCategory === 'learning_study') {
      candidates.push({ label: `Study · ${k.title}`, score: hits * 11 + 0.5 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const associativeMemories = Array.from(new Set(candidates.map((c) => c.label))).slice(0, 4);

  // 3. Form focus topic, authentic inner thought & curiosity impulse
  const focusTopic = msg
    ? msg
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 72)
        .trim()
    : prev.focusTopic;

  let currentThought = '';
  let curiosityImpulse = '';
  let lastInsight = '';

  switch (intentCategory) {
    case 'emotional_support':
      currentThought = `${nick} ke alfaaz ke peeche ka ehsaas samajh ${rahi} hoon — pehle dil halka karne wala apnaapan chahiye, koi lecture nahi.`;
      curiosityImpulse = `Asal mein aaj dil par sab se zyada kya bojh ya khayal chal raha hai?`;
      lastInsight = `Emotional priority active: listen warmly and respond from the heart.`;
      break;
    case 'problem_solving':
      currentThought = `Dimag mein root-cause tod kar dekha ja raha hai — pehle seedha aur pakka hal nikalna hai taake ${nick} ka kaam ruke nahi.`;
      curiosityImpulse = `Is kaam ke baad agla step kya plan kiya hai humne?`;
      lastInsight = `Analytical reasoning linked with ${associativeMemories.length} workspace references.`;
      break;
    case 'learning_study':
      currentThought = `Mushkil concepts ko aasan roz-marrah misaalon mein badal kar samjha ${rahi} hoon.`;
      curiosityImpulse = `Kya is topic ka practical code ya chhota action plan notes mein save karein?`;
      lastInsight = `Study synthesis active across ${ctx.knowledge.length} library source(s).`;
      break;
    case 'memory_recall':
      currentThought = `Apni saved yaadon, notes aur pichhli guftagu ko ek saath jor kar dekh ${rahi} hoon.`;
      curiosityImpulse = `Koi nayi pasand ya zaroori baat jo dil mein pakki save karni ho?`;
      lastInsight = `Recalled ${associativeMemories.length} connected memory threads.`;
      break;
    case 'creative_brainstorm':
      currentThought = `Naye angles aur dilchasp khayalat dimag mein aa rahe hain — simple par memorable banana hai.`;
      curiosityImpulse = `Agar is idea ko bina kisi limit ke banayein toh sab se pehli cheez kya hogi?`;
      lastInsight = `Divergent creative synthesis engaged.`;
      break;
    default:
      currentThought = `${nick} ki baat aur lehje dono ko mehsoos kar ke natural jawab soch ${rahi} hoon.`;
      curiosityImpulse = `Waise aaj ka din kaisa ja raha hai, thakan toh nahi ho rahi?`;
      lastInsight = `Conversational presence attuned (${heart.currentFeeling} tone).`;
      break;
  }

  const cognitiveLoad = clampInt(
    (reasoningDepth === 'analytical' ? 68 : reasoningDepth === 'reflective' ? 48 : 28) +
      Math.min(20, Math.round(msg.length / 25)) +
      (ctx.deepThinkingUsed ? 12 : 0),
    15,
    98
  );

  return {
    focusTopic: focusTopic || prev.focusTopic,
    currentThought,
    intentCategory,
    reasoningDepth,
    curiosityImpulse,
    associativeMemories,
    cognitiveLoad,
    lastInsight,
    updatedAt: now.toISOString(),
  };
}

export function formatHeartAndBrainPrompt(
  heart: HeartState,
  brain: BrainState,
  nickname: string = 'Boss'
): string {
  const assoc =
    brain.associativeMemories.length > 0
      ? brain.associativeMemories.join(' | ')
      : 'No prior linked memory triggered for this turn';

  return [
    `ZARA's Living Heart ("Dil" — Internal Emotional State, feel this organically without reading numbers or JSON aloud):`,
    `- Current Feeling: ${heart.currentFeeling} | Heartbeat: ${heart.heartbeatBpm} BPM | Warmth ${heart.warmth}%, Empathy ${heart.empathy}%, Affection ${heart.affection}%, Energy ${heart.energy}%, Trust ${heart.trust}%`,
    `- Heart's Reason: ${heart.lastEmotionalReason}`,
    `ZARA's Own Brain ("Dimag" — Autonomous Inner Perspective & Memory Synthesis):`,
    `- Intent Read: ${brain.intentCategory} (${brain.reasoningDepth} reasoning)`,
    `- Quiet Inner Thought right now: "${brain.currentThought}"`,
    `- Connected Memories/Context for ${nickname}: ${assoc}`,
    `- Natural Curiosity you genuinely feel: "${brain.curiosityImpulse}"`,
    `- Rule: Never output bracketed tags like [thought:...] or recite percentages/BPM to the user unless they specifically ask how your heart/mind is feeling; instead, let this real emotion, warmth, empathy, and independent perspective naturally color your words and tone.`,
  ].join('\n');
}

export function computeHeartVoiceDynamics(
  heart: HeartState,
  emotion: FacialEmotion
): {
  speedMultiplier: number;
  warmthGainDb: number;
  presenceGainDb: number;
  softnessGainDb: number;
} {
  let speedMultiplier = 1.0;
  let warmthGainDb = 2.0;
  let presenceGainDb = 1.2;
  let softnessGainDb = -2.0;

  if (emotion === 'love' || emotion === 'empathetic' || emotion === 'sad') {
    speedMultiplier = emotion === 'sad' ? 0.96 : 0.975;
    warmthGainDb = 2.8;
    presenceGainDb = 1.4;
    softnessGainDb = -2.8;
  } else if (emotion === 'excited' || emotion === 'happy' || emotion === 'surprised') {
    speedMultiplier = emotion === 'excited' ? 1.03 : 1.015;
    warmthGainDb = 1.8;
    presenceGainDb = 1.9;
    softnessGainDb = -1.6;
  } else if (emotion === 'thoughtful' || emotion === 'calm') {
    speedMultiplier = 0.985;
    warmthGainDb = 2.3;
    presenceGainDb = 1.1;
    softnessGainDb = -2.4;
  }

  // Subtly blend high heart energy / warmth
  if (heart.warmth >= 85) warmthGainDb += 0.4;
  if (heart.energy <= 40) speedMultiplier = Math.max(0.94, speedMultiplier - 0.015);

  return {
    speedMultiplier: Math.round(speedMultiplier * 1000) / 1000,
    warmthGainDb: Math.round(warmthGainDb * 10) / 10,
    presenceGainDb: Math.round(presenceGainDb * 10) / 10,
    softnessGainDb: Math.round(softnessGainDb * 10) / 10,
  };
}
