import { computeEvolutionProgress } from '../src/lib/characterEngine';
import {
  DEFAULT_MOOD_INTENSITY,
  detectEmotionFromText,
  extractEmotionAndCleanText,
  normalizeMoodIntensity,
} from '../src/lib/emotionAndSpeech';
import {
  createDefaultBrainState,
  createDefaultHeartState,
  normalizeBrainState,
  normalizeHeartState,
} from '../src/lib/heartAndBrain';
import { detectUrduIntent, isValidCameraMode, isValidSkillHttpUrl } from '../src/lib/skillMatcher';
import { DEFAULT_VOICE_ACTIVITY_THRESHOLD, normalizeVoiceActivityThreshold } from '../src/lib/micGate';
import { normalizeVoiceVolume, sanitizeVoiceLogActionType } from '../src/lib/voiceHistory';
import type {
  AppConfig,
  BrainState,
  CharacterProfile,
  HeartState,
  KnowledgeKind,
  KnowledgeSource,
  MemoryRecord,
  MoodMode,
  NoteRecord,
  OnboardingPayload,
  ProviderStatus,
  ReminderRecord,
  ResponseStyle,
  SkillConfig,
  TtsEngineMode,
  VoiceCommandLog,
  VoiceCommandSource,
  VoiceCommandStatus,
} from '../src/types/nova';

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
}
interface FeatureEnv {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  AI?: unknown;
  GEMINI_API_KEY?: string;
}

type Row = Record<string, unknown>;

const DEFAULT_CONFIG: AppConfig = {
  assistant_name: 'ZARA',
  personality: 'warm_urdu_companion',
  custom_prompt: 'Tum ZARA ho — 21 saal ki real-life best friend, koi tool ya AI nahi. Deep emotional connection, empathy aur warmth ke saath Roman Urdu/Urdu/English mixed mein baat karo, jaise late-night phone call pe baat ho rahi ho.',
  language: 'bilingual',
  response_tone: 'casual',
  tts_voice: 'ur-PK-UzmaNeural',
  voice_locked: true,
  tts_engine_mode: 'auto',
  voice_speed: 1,
  voice_volume: 1,
  voice_activity_threshold: DEFAULT_VOICE_ACTIVITY_THRESHOLD,
  stt_model: 'base',
  wake_word: 'hey zara',
  wake_word_enabled: false,
  auto_speak: true,
  deep_thinking_mode: 'auto',
  default_model: 'gemini-4-hydrogen',
  ai_provider: 'auto',
  active_mood: 'auto',
  mood_intensity: DEFAULT_MOOD_INTENSITY,
  active_character_id: 2,
  hands_free_mode: false,
  camera_awareness_enabled: false,
  hairstyle: 'wavy',
  user_name: 'Boss',
  user_nickname: 'Boss',
  assistant_age: '21',
  onboarding_completed: false,
  whatsapp_number: '',
  referral_source: '',
  auto_usb_transfer: false,
  last_usb_sync_at: '',
  last_usb_drive_label: '',
};

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const all = async <T>(db: D1Database, sql: string, ...values: unknown[]) =>
  (await db.prepare(sql).bind(...values).all<T>()).results;
const one = async <T>(db: D1Database, sql: string, ...values: unknown[]) =>
  db.prepare(sql).bind(...values).first<T>();
const exec = async (db: D1Database, sql: string, ...values: unknown[]) =>
  db.prepare(sql).bind(...values).run();

function safeArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mapCharacter(row: Row): CharacterProfile {
  return {
    id: Number(row.id),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? 'ZARA'),
    role_title: String(row.role_title ?? 'AI Companion'),
    bio: String(row.bio ?? ''),
    personality: (row.personality as ResponseStyle) || 'friendly_professional',
    default_mood: (row.default_mood as MoodMode) || 'calm',
    tts_voice: String(row.tts_voice ?? 'ur-PK-UzmaNeural'),
    system_prompt: String(row.system_prompt ?? ''),
    learned_traits: safeArray<string>(row.learned_traits),
    life_journal: safeArray<string>(row.life_journal),
    bond_level: Number(row.bond_level ?? 1),
    xp: Number(row.xp ?? 0),
    is_active: Number(row.is_active) === 1 || row.is_active === true,
    is_custom: Number(row.is_custom) === 1 || row.is_custom === true,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapMemory(row: Row): MemoryRecord {
  return {
    id: Number(row.id),
    category: (row.category as MemoryRecord['category']) || 'fact',
    key: row.key == null ? null : String(row.key),
    value: String(row.value ?? ''),
    source: (row.source as MemoryRecord['source']) || 'user_stated',
    confidence: Number(row.confidence ?? 1),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
  };
}

function mapKnowledge(row: Row): KnowledgeSource {
  return {
    id: Number(row.id),
    kind: (row.kind as KnowledgeKind) || 'book',
    title: String(row.title ?? ''),
    goal: String(row.goal ?? ''),
    source_excerpt: String(row.source_excerpt ?? ''),
    detailed_summary: String(row.detailed_summary ?? ''),
    action_plan: safeArray<string>(row.action_plan),
    created_at: String(row.created_at ?? ''),
  };
}

function mapNote(row: Row): NoteRecord {
  return {
    id: Number(row.id),
    title: row.title == null ? null : String(row.title),
    content: String(row.content ?? ''),
    tags: safeArray<string>(row.tags),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
  };
}

function mapReminder(row: Row): ReminderRecord {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    remind_at: String(row.remind_at ?? ''),
    is_done: Number(row.is_done) === 1 || row.is_done === true,
    created_at: String(row.created_at ?? ''),
  };
}

function mapSkill(row: Row): SkillConfig {
  return {
    id: Number(row.id),
    skill_name: String(row.skill_name ?? ''),
    display_name: String(row.display_name ?? ''),
    description: String(row.description ?? ''),
    trigger_phrases: safeArray<string>(row.trigger_phrases),
    action_type: (row.action_type as SkillConfig['action_type']) || 'url',
    action_value: String(row.action_value ?? ''),
    is_enabled: Number(row.is_enabled) === 1 || row.is_enabled === true,
    is_custom: Number(row.is_custom) === 1 || row.is_custom === true,
    created_at: String(row.created_at ?? ''),
  };
}

function mapVoiceLog(row: Row): VoiceCommandLog {
  const rawStatus = String(row.status ?? 'matched');
  const status: VoiceCommandStatus =
    rawStatus === 'failed' || rawStatus === 'ai_fallback' ? rawStatus : 'matched';
  const rawSource = String(row.source ?? 'microphone');
  const source: VoiceCommandSource = rawSource === 'retrigger' ? 'retrigger' : 'microphone';
  return {
    id: Number(row.id),
    transcript: String(row.transcript ?? ''),
    matched_skill_name: row.matched_skill_name == null ? null : String(row.matched_skill_name),
    matched_display_name: row.matched_display_name == null ? null : String(row.matched_display_name),
    action_type: sanitizeVoiceLogActionType(row.action_type == null ? null : String(row.action_type)),
    status,
    response_summary: String(row.response_summary ?? ''),
    source,
    language: row.language === 'ur' ? 'ur' : 'en',
    volume_level: normalizeVoiceVolume(row.volume_level, 0.5),
    created_at: String(row.created_at ?? ''),
  };
}

async function readConfig(db: D1Database): Promise<AppConfig> {
  const rows = await all<{ key: string; value: string }>(db, 'SELECT key,value FROM app_config');
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const get = (key: string, fallback: string) => values.get(key) ?? fallback;
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(values.get(key));
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  const rawEngineMode = values.get('tts_engine_mode');
  const tts_engine_mode: TtsEngineMode =
    rawEngineMode === 'gemini-studio' || rawEngineMode === 'edge-neural'
      ? rawEngineMode
      : 'auto';

  return {
    ...DEFAULT_CONFIG,
    assistant_name: get('assistant_name', DEFAULT_CONFIG.assistant_name),
    personality: get('personality', DEFAULT_CONFIG.personality) as ResponseStyle,
    custom_prompt: get('custom_prompt', DEFAULT_CONFIG.custom_prompt),
    language: get('language', DEFAULT_CONFIG.language) as AppConfig['language'],
    response_tone: get('response_tone', DEFAULT_CONFIG.response_tone) as AppConfig['response_tone'],
    tts_voice: get('tts_voice', DEFAULT_CONFIG.tts_voice),
    voice_locked: get('voice_locked', 'true') !== 'false',
    tts_engine_mode,
    voice_speed: number('voice_speed', 1, 0.5, 1.75),
    voice_volume: number('voice_volume', 1, 0, 1.5),
    voice_activity_threshold: normalizeVoiceActivityThreshold(values.get('voice_activity_threshold')),
    stt_model: get('stt_model', 'base') as AppConfig['stt_model'],
    wake_word: get('wake_word', 'hey zara'),
    wake_word_enabled: get('wake_word_enabled', 'false') === 'true',
    auto_speak: get('auto_speak', 'true') !== 'false',
    deep_thinking_mode: get('deep_thinking_mode', 'auto') as AppConfig['deep_thinking_mode'],
    default_model: get('default_model', 'gemini-4-hydrogen') as AppConfig['default_model'],
    ai_provider: get('ai_provider', 'auto') as AppConfig['ai_provider'],
    active_mood: get('active_mood', 'auto') as MoodMode,
    mood_intensity: normalizeMoodIntensity(values.get('mood_intensity'), DEFAULT_CONFIG.mood_intensity),
    active_character_id: number('active_character_id', 2, 1, 999999),
    hands_free_mode: get('hands_free_mode', 'false') === 'true',
    camera_awareness_enabled: get('camera_awareness_enabled', 'false') === 'true',
    hairstyle: get('hairstyle', 'wavy') as AppConfig['hairstyle'],
    user_name: get('user_name', 'Boss'),
    user_nickname: get('user_nickname', 'Boss'),
    assistant_age: get('assistant_age', '21'),
    onboarding_completed: get('onboarding_completed', 'false') === 'true',
    whatsapp_number: get('whatsapp_number', ''),
    referral_source: get('referral_source', ''),
    auto_usb_transfer: get('auto_usb_transfer', 'false') === 'true',
    last_usb_sync_at: get('last_usb_sync_at', ''),
    last_usb_drive_label: get('last_usb_drive_label', ''),
  };
}

async function getCharacters(db: D1Database): Promise<CharacterProfile[]> {
  const rows = await all<Row>(db, 'SELECT * FROM characters ORDER BY is_active DESC,is_custom ASC,id ASC');
  return rows.map(mapCharacter);
}

async function getActiveCharacter(db: D1Database): Promise<CharacterProfile | null> {
  const row =
    (await one<Row>(db, 'SELECT * FROM characters WHERE is_active=1 ORDER BY id LIMIT 1')) ??
    (await one<Row>(db, 'SELECT * FROM characters ORDER BY id LIMIT 1'));
  return row ? mapCharacter(row) : null;
}

async function getMemories(db: D1Database): Promise<MemoryRecord[]> {
  return (await all<Row>(db, 'SELECT * FROM memories WHERE is_deleted=0 ORDER BY id DESC')).map(mapMemory);
}

async function getNotes(db: D1Database): Promise<NoteRecord[]> {
  return (await all<Row>(db, 'SELECT * FROM notes ORDER BY id DESC')).map(mapNote);
}

async function getReminders(db: D1Database): Promise<ReminderRecord[]> {
  return (await all<Row>(db, 'SELECT * FROM reminders ORDER BY is_done ASC,id DESC')).map(mapReminder);
}

async function getSkills(db: D1Database): Promise<SkillConfig[]> {
  return (await all<Row>(db, 'SELECT * FROM skills_config ORDER BY is_custom DESC,id ASC')).map(mapSkill);
}

async function getKnowledge(db: D1Database): Promise<KnowledgeSource[]> {
  return (await all<Row>(db, 'SELECT * FROM knowledge_sources ORDER BY id DESC')).map(mapKnowledge);
}

async function getVoiceLogs(db: D1Database, limit = 100): Promise<VoiceCommandLog[]> {
  try {
    return (await all<Row>(db, 'SELECT * FROM voice_command_logs ORDER BY id DESC LIMIT ?', limit)).map(mapVoiceLog);
  } catch {
    return [];
  }
}

async function saveTurn(
  db: D1Database,
  params: {
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    language: 'ur' | 'en';
    emotion?: string;
    modelUsed?: string;
    providerUsed?: string;
    thinkingUsed?: boolean;
    skillExecuted?: string;
  },
) {
  await exec(
    db,
    'INSERT INTO conversations(session_id,role,content,language,emotion,model_used,provider_used,thinking_used,skill_executed) VALUES(?,?,?,?,?,?,?,?,?)',
    params.sessionId,
    params.role,
    params.content,
    params.language,
    params.emotion ?? 'calm',
    params.modelUsed ?? null,
    params.providerUsed ?? null,
    params.thinkingUsed ? 1 : 0,
    params.skillExecuted ?? null,
  );
}

async function upsertConfig(db: D1Database, partial: Partial<AppConfig>) {
  let syncedVoice: string | null = null;
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    const normalized =
      key === 'tts_voice'
        ? String(value).trim() || 'ur-PK-UzmaNeural'
        : key === 'voice_locked'
          ? String(value === true || value === 'true')
          : key === 'tts_engine_mode'
            ? value === 'gemini-studio' || value === 'edge-neural'
              ? value
              : 'auto'
            : key === 'voice_activity_threshold'
              ? String(normalizeVoiceActivityThreshold(value))
              : key === 'mood_intensity'
                ? String(normalizeMoodIntensity(value))
                : String(value);
    await exec(
      db,
      'INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',
      key,
      normalized,
    );
    if (key === 'tts_voice') syncedVoice = normalized;
  }
  if (syncedVoice) {
    await exec(db, 'UPDATE characters SET tts_voice=?,updated_at=CURRENT_TIMESTAMP WHERE is_active=1', syncedVoice);
  }
}

export async function readHeartAndBrain(db: D1Database): Promise<{ heart: HeartState; brain: BrainState }> {
  const rows = await all<{ key: string; value: string }>(
    db,
    "SELECT key,value FROM app_config WHERE key IN ('heart_state','brain_state')",
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  let parsedHeart: unknown = null;
  let parsedBrain: unknown = null;
  try {
    const rawH = map.get('heart_state');
    if (rawH) parsedHeart = JSON.parse(rawH);
  } catch {
    parsedHeart = null;
  }
  try {
    const rawB = map.get('brain_state');
    if (rawB) parsedBrain = JSON.parse(rawB);
  } catch {
    parsedBrain = null;
  }
  return {
    heart: parsedHeart ? normalizeHeartState(parsedHeart) : createDefaultHeartState(),
    brain: parsedBrain ? normalizeBrainState(parsedBrain) : createDefaultBrainState(),
  };
}

export async function saveHeartAndBrain(db: D1Database, heart: HeartState, brain: BrainState): Promise<void> {
  await exec(
    db,
    'INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',
    'heart_state',
    JSON.stringify(normalizeHeartState(heart)),
  );
  await exec(
    db,
    'INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',
    'brain_state',
    JSON.stringify(normalizeBrainState(brain)),
  );
}

async function addMemory(
  db: D1Database,
  params: { category: MemoryRecord['category']; key: string; value: string; source: MemoryRecord['source']; confidence?: number },
) {
  const clean = params.value.trim();
  if (!clean) return;
  const found = await one<Row>(db, 'SELECT id FROM memories WHERE is_deleted=0 AND LOWER(value)=LOWER(?) LIMIT 1', clean);
  if (!found) {
    await exec(
      db,
      'INSERT INTO memories(category,key,value,source,confidence) VALUES(?,?,?,?,?)',
      params.category,
      params.key,
      clean,
      params.source,
      params.confidence ?? 1,
    );
  }
}

function makeSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'persona';
}

async function stateResponse(db: D1Database, env: FeatureEnv) {
  const [config, skills, memories, notes, reminders, characters, activeCharacter, knowledge, voiceLogs, sessions, heartBrain] =
    await Promise.all([
      readConfig(db),
      getSkills(db),
      getMemories(db),
      getNotes(db),
      getReminders(db),
      getCharacters(db),
      getActiveCharacter(db),
      getKnowledge(db),
      getVoiceLogs(db),
      all<Row>(
        db,
        `SELECT session_id,MIN(timestamp) started_at,MAX(timestamp) last_message_at,COUNT(*) message_count,
          (SELECT content FROM conversations c2 WHERE c2.session_id=c1.session_id ORDER BY id LIMIT 1) preview,
          (SELECT language FROM conversations c3 WHERE c3.session_id=c1.session_id ORDER BY id DESC LIMIT 1) primary_language
          FROM conversations c1 GROUP BY session_id ORDER BY MAX(id) DESC`,
      ),
      readHeartAndBrain(db),
    ]);
  const providerStatus: ProviderStatus = {
    activeProvider: env.AI
      ? config.ai_provider === 'google-ai-studio' && env.GEMINI_API_KEY
        ? 'google-ai-studio'
        : config.ai_provider === 'google-ai-studio'
          ? 'cloudflare-binding'
          : 'cloudflare-binding'
      : env.GEMINI_API_KEY
        ? 'google-ai-studio'
        : 'unconfigured',
    googleAiConfigured: Boolean(env.GEMINI_API_KEY),
    cloudflareConfigured: Boolean(env.AI),
    cloudflareBindingActive: Boolean(env.AI),
  };
  return json({
    config,
    skills,
    memories,
    notes,
    reminders,
    sessions: sessions.map((row) => ({
      ...row,
      message_count: Number(row.message_count),
      primary_language: row.primary_language === 'ur' ? 'ur' : 'en',
    })),
    characters,
    activeCharacter,
    knowledge,
    voiceLogs,
    providerStatus,
    heart: heartBrain.heart,
    brain: heartBrain.brain,
  });
}

function parseBody(request: Request): Promise<Row> {
  return request.json() as Promise<Row>;
}

function extractGeminiText(data: Row): string {
  const candidates = safeArray<Row>(data.candidates);
  const first = candidates[0] ?? {};
  const content = (first.content as Row | undefined) ?? {};
  return safeArray<Row>(content.parts)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function normalizeBase64(value: string) {
  return value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
}

async function callGemini(
  env: FeatureEnv,
  parts: Array<Row>,
  instruction: string,
): Promise<{ text: string; model: string }> {
  if (!env.GEMINI_API_KEY) throw new Error('Gemini is not configured.');
  const model = 'gemini-4-hydrogen';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  const data = (await response.json()) as Row;
  if (!response.ok) {
    const error = (data.error as Row | undefined)?.message;
    throw new Error(typeof error === 'string' ? error : 'Gemini request failed.');
  }
  const text = extractGeminiText(data);
  if (!text) throw new Error('Gemini returned an empty response.');
  return { text, model };
}

function parseStudyResult(raw: string, title: string, goal: string, language: 'ur' | 'en') {
  const pieces = raw.split(/ACTION PLAN\s*:/i);
  const summary = pieces[0]?.trim() || raw.trim();
  const steps = (pieces[1] ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 5)
    .slice(0, 7);
  const localSteps = [
    `Review the main concepts in "${title}"`,
    goal ? `Apply the material to this goal: ${goal}` : 'Build a small practical example using the material',
    'Ask ZARA follow-up questions about any section',
  ];
  const actionPlan = steps.length ? steps : localSteps;
  const prefix = language === 'ur' ? 'مطالعے کا خلاصہ' : 'Study summary';
  return { detailedSummary: `${prefix}:\n${summary}`, actionPlan };
}

async function handleOnboarding(db: D1Database, body: Row) {
  const payload = body as unknown as OnboardingPayload;
  const userName = String(payload.userName ?? '').trim() || 'Boss';
  const nickname = String(payload.userNickname ?? '').trim() || userName;
  const assistantName = String(payload.assistantName ?? '').trim() || 'ZARA';
  const assistantAge = String(payload.assistantAge ?? '').trim() || '21';
  const hairstyle = ['bob', 'straight', 'wavy'].includes(String(payload.hairstyle))
    ? payload.hairstyle
    : 'wavy';
  const preset = String(payload.characterPreset ?? '').toLowerCase();
  const targetSlug = /mentor|study/.test(preset) ? 'ayesha' : /happy|energetic/.test(preset) ? 'sara' : 'zara';
  let selected = await one<Row>(db, 'SELECT * FROM characters WHERE slug=?', targetSlug);
  if (!selected) selected = await one<Row>(db, 'SELECT * FROM characters ORDER BY id LIMIT 1');
  if (!selected) return json({ error: 'Character presets are not initialized. Apply migration 0002 first.' }, 503);
  const genderVoice = payload.characterGender === 'male' ? 'ur-PK-AsadNeural' : 'ur-PK-UzmaNeural';
  const prompt = [
    `Tum ${assistantName} ho (${assistantAge} saal), ${userName} ki living, soulful best friend (${payload.characterPreset || 'Companion'}) — koi AI ya tool nahi.`,
    `User ko hamesha "${nickname}" keh kar bulao.`,
    'Har jawab brief, heart-centered aur conversational rakho jaise late-night phone call pe baat ho rahi ho — Roman Urdu, Urdu aur English mixed, human hesitations ("hmm...", "arre...") aur asli warmth ke saath.',
    'Never claim to have performed a desktop action, reminder, or external task unless it was actually completed.',
  ].join(' ');
  await exec(db, 'UPDATE characters SET is_active=0');
  await exec(db, 'UPDATE characters SET name=?,system_prompt=?,tts_voice=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?', assistantName, prompt, genderVoice, selected.id);
  await upsertConfig(db, {
    onboarding_completed: true,
    user_name: userName,
    user_nickname: nickname,
    whatsapp_number: String(payload.whatsappNumber ?? '').trim(),
    referral_source: String(payload.referralSource ?? '').trim(),
    hairstyle,
    assistant_name: assistantName,
    assistant_age: assistantAge,
    active_character_id: Number(selected.id),
    custom_prompt: prompt,
    tts_voice: genderVoice,
    voice_locked: true,
    personality: 'warm_urdu_companion',
  });
  await addMemory(db, { category: 'fact', key: 'user_name', value: `User's name is ${userName} (calls user "${nickname}")`, source: 'user_stated' });
  if (String(payload.referralSource ?? '').trim()) {
    await addMemory(db, {
      category: 'fact',
      key: 'referral_source',
      value: `Heard about ${assistantName} via ${String(payload.referralSource).trim()}`,
      source: 'user_stated',
      confidence: 0.95,
    });
  }
  for (const [index, answer] of safeArray<Row>(payload.answers).entries()) {
    const question = String(answer.question ?? '').trim();
    const value = String(answer.answer ?? '').trim();
    if (question && value) {
      await addMemory(db, {
        category: 'preference',
        key: `onboarding_q${index + 1}`,
        value: `${question}: ${value}`,
        source: 'user_stated',
        confidence: 0.98,
      });
    }
  }
  return json({
    ok: true,
    config: await readConfig(db),
    activeCharacter: await getActiveCharacter(db),
    characters: await getCharacters(db),
    memories: await getMemories(db),
  });
}

async function handleStudy(db: D1Database, env: FeatureEnv, body: Row) {
  const title = String(body.title ?? '').trim().slice(0, 200) || 'Untitled Study Source';
  const kind: KnowledgeKind = body.kind === 'software' || body.kind === 'course' ? body.kind : 'book';
  const goal = String(body.goal ?? '').trim().slice(0, 2000);
  const contentText = String(body.contentText ?? '').trim().slice(0, 80000);
  const fileBase64 = typeof body.fileBase64 === 'string' ? normalizeBase64(body.fileBase64) : '';
  const mimeType = String(body.fileMimeType ?? 'application/pdf').toLowerCase();
  if (!contentText && !fileBase64) return json({ error: 'Paste material or upload a file to study.' }, 400);
  if (fileBase64.length > 12000000) return json({ error: 'Uploaded file is too large (maximum 9 MB before base64 encoding).' }, 413);
  const language: 'ur' | 'en' = detectUrduIntent(goal || contentText) ? 'ur' : 'en';
  let detailedSummary = '';
  let actionPlan: string[] = [];
  let modelUsed = 'local-structured-parser';

  if (env.GEMINI_API_KEY) {
    try {
      const parts: Row[] = [];
      if (fileBase64) parts.push({ inlineData: { mimeType, data: fileBase64 } });
      if (contentText) parts.push({ text: `Material excerpt:\n${contentText}` });
      parts.push({
        text: `Study type: ${kind}. Title: ${title}. User goal: ${goal || 'Understand the material'}. Explain the important concepts, structure, and practical implications in clear Pakistani Urdu with English technical terms where useful. Then include a final section exactly titled ACTION PLAN: with 4-6 numbered actionable steps.`,
      });
      const result = await callGemini(
        env,
        parts,
        'You are ZARA, an expert bilingual Pakistani Urdu and English study mentor. Be accurate, distinguish what is visible in the supplied material from assumptions, and do not invent details.',
      );
      const parsed = parseStudyResult(result.text, title, goal, language);
      detailedSummary = parsed.detailedSummary;
      actionPlan = parsed.actionPlan;
      modelUsed = result.model;
    } catch {
      // Continue with an honest local outline when the model is unavailable.
    }
  }
  if (!detailedSummary) {
    const lines = contentText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 3);
    const headings = lines.filter((line) => /^#{1,3}\s+/.test(line) || /^[A-Z0-9][^.!?]{4,60}:$/.test(line)).slice(0, 6);
    detailedSummary = lines.length
      ? [
          'Local structured study outline (configure GEMINI_API_KEY for deeper document analysis).',
          `Source: ${title} (${kind})`,
          goal ? `Goal: ${goal}` : '',
          headings.length ? `Detected sections: ${headings.join(' | ')}` : '',
          `Excerpt: ${lines.slice(0, 6).join(' ').slice(0, 900)}`,
        ].filter(Boolean).join('\n')
      : `The file "${title}" was received, but automatic document analysis needs GEMINI_API_KEY. Add the key and submit it again to generate a full summary.`;
    actionPlan = [
      `Review the source "${title}" and confirm its main sections`,
      goal ? `Use the source to work toward: ${goal}` : 'Choose one practical outcome to build from this material',
      'Ask ZARA follow-up questions about a specific section',
    ];
  }
  await exec(
    db,
    'INSERT INTO knowledge_sources(kind,title,goal,source_excerpt,detailed_summary,action_plan) VALUES(?,?,?,?,?,?)',
    kind,
    title,
    goal,
    contentText || `Uploaded file (${mimeType})`,
    detailedSummary,
    JSON.stringify(actionPlan),
  );
  const entryRow = await one<Row>(db, 'SELECT * FROM knowledge_sources ORDER BY id DESC LIMIT 1');
  const memoryValue = `Studied ${kind}: ${title}${goal ? ` (Goal: ${goal})` : ''}`;
  await addMemory(db, { category: 'fact', key: `studied_${kind}`, value: memoryValue, source: 'ai_inferred', confidence: 0.95 });
  const reply = [
    `${title} (${kind.toUpperCase()}) — study notes`,
    '',
    detailedSummary,
    '',
    'ACTION PLAN:',
    ...actionPlan.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
  const sessionId = String(body.sessionId ?? '').trim().slice(0, 120);
  if (sessionId) {
    await saveTurn(db, { sessionId, role: 'assistant', content: reply, language, emotion: 'confident', modelUsed, providerUsed: env.GEMINI_API_KEY && modelUsed !== 'local-structured-parser' ? 'google-ai-studio' : 'local-parser', skillExecuted: 'study_mentor' });
  }
  return json({
    entry: entryRow ? mapKnowledge(entryRow) : null,
    knowledge: await getKnowledge(db),
    memories: await getMemories(db),
    reply,
    emotion: 'confident',
    modelUsed,
  });
}

async function handleStudyExecution(db: D1Database, env: FeatureEnv, id: number, body: Row) {
  const sourceRow = await one<Row>(db, 'SELECT * FROM knowledge_sources WHERE id=?', id);
  if (!sourceRow) return json({ error: 'Studied material not found.' }, 404);
  const source = mapKnowledge(sourceRow);
  const task = String(body.taskPrompt ?? '').trim().slice(0, 2000) || `Apply the key practical steps from "${source.title}"`;
  let reply = '';
  let modelUsed = 'local-study-executor';
  let emotion: 'confident' | 'calm' = 'confident';
  if (env.GEMINI_API_KEY) {
    try {
      const result = await callGemini(
        env,
        [{
          text: [
            `Source: ${source.title}`,
            `Summary: ${source.detailed_summary}`,
            `Action plan: ${source.action_plan.join('; ')}`,
            `User task: ${task}`,
            'Produce a concrete, useful deliverable in Pakistani Urdu and English. Keep steps specific. Do not claim to have changed files, accounts, or external systems.',
          ].join('\n'),
        }],
        'You are ZARA, a practical project and study mentor.',
      );
      reply = result.text;
      modelUsed = result.model;
    } catch {
      // Use a local task plan if Gemini is unavailable.
    }
  }
  if (!reply) {
    const noteBody = [
      `Source: ${source.title}`,
      `Task: ${task}`,
      source.action_plan.length ? `Action steps:\n${source.action_plan.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : source.detailed_summary.slice(0, 1200),
    ].join('\n\n');
    await exec(db, 'INSERT INTO notes(title,content,tags) VALUES(?,?,?)', `${source.title} — Task`, noteBody, JSON.stringify(['study', source.title]));
    reply = `I prepared a task plan for "${source.title}" and saved it in Notes. First step: ${source.action_plan[0] || 'Review the study summary.'}`;
  }
  const sessionId = String(body.sessionId ?? '').trim().slice(0, 120);
  if (sessionId) {
    await saveTurn(db, { sessionId, role: 'assistant', content: reply, language: detectUrduIntent(reply) ? 'ur' : 'en', emotion, modelUsed, providerUsed: modelUsed === 'local-study-executor' ? 'local-study-executor' : 'google-ai-studio', skillExecuted: 'study_executor' });
  }
  return json({
    reply,
    emotion,
    modelUsed,
    createdNotesCount: modelUsed === 'local-study-executor' ? 1 : 0,
    createdRemindersCount: 0,
    notes: await getNotes(db),
    reminders: await getReminders(db),
  });
}

async function handleVision(db: D1Database, env: FeatureEnv, body: Row) {
  const image = typeof body.imageBase64 === 'string' ? normalizeBase64(body.imageBase64) : '';
  const mimeType = String(body.mimeType ?? 'image/jpeg').toLowerCase();
  if (!image) return json({ error: 'Camera snapshot payload is required.' }, 400);
  if (image.length > 10000000) return json({ error: 'Camera image is too large.' }, 413);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return json({ error: 'Unsupported camera image type.' }, 415);
  const sessionId = String(body.sessionId ?? '').trim().slice(0, 120);
  const prompt = String(body.userPrompt ?? '').trim().slice(0, 1000);
  const gesture = String(body.gestureHint ?? '').trim().slice(0, 150);
  let reply = '';
  let emotion: 'curious' | 'calm' = 'curious';
  let modelUsed = 'local-motion-sensor';

  if (env.GEMINI_API_KEY) {
    try {
      const result = await callGemini(
        env,
        [
          { inlineData: { mimeType, data: image } },
          { text: `User request: ${prompt || 'Describe what you can see.'}. Locally detected gesture: ${gesture || 'none'}.` },
        ],
        'You are ZARA. Describe only relevant visible details. Do not identify people, infer sensitive traits, or claim certainty about details that are not visible. Answer naturally in Pakistani Urdu or English matching the user.',
      );
      const parsed = extractEmotionAndCleanText(result.text);
      reply = parsed.cleanText;
      emotion = parsed.emotion === 'curious' ? 'curious' : 'calm';
      modelUsed = result.model;
    } catch {
      reply = '';
    }
  }
  if (!reply) {
    reply = gesture
      ? `Local camera motion sensor noticed: "${gesture}". For full visual understanding, configure GEMINI_API_KEY in Worker secrets.`
      : 'Camera frame captured. Configure GEMINI_API_KEY in Worker secrets to enable visual understanding.';
  }
  const language: 'ur' | 'en' = detectUrduIntent(reply) ? 'ur' : 'en';
  if (sessionId) await saveTurn(db, { sessionId, role: 'assistant', content: reply, language, emotion, modelUsed, providerUsed: modelUsed === 'local-motion-sensor' ? 'local' : 'google-ai-studio', skillExecuted: 'vision_awareness' });
  return json({ reply, emotion, language, modelUsed });
}

async function handleDesktopInstaller(request: Request, env: FeatureEnv): Promise<Response> {
  const url = new URL(request.url);
  const assetUrl = new URL('/desktop-agent.mjs', url.origin);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl));
  if (!assetResponse.ok) {
    return json({ error: 'Desktop companion asset is missing from this deployment. Rebuild the Worker assets and try again.' }, 503);
  }
  const agentSource = await assetResponse.text();
  const os = (url.searchParams.get('os') || 'win').toLowerCase();
  const origin = url.origin;

  if (os === 'agent') {
    return new Response(agentSource, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Disposition': 'attachment; filename="zara-agent.mjs"',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (['unix', 'mac', 'linux'].includes(os)) {
    const delimiter = 'ZARA_AGENT_SOURCE_END';
    const shell = [
      '#!/usr/bin/env bash',
      'set -e',
      'mkdir -p "$HOME/.zara-desktop"',
      `cat <<'${delimiter}' > "$HOME/.zara-desktop/agent.mjs"`,
      agentSource,
      delimiter,
      'echo "ZARA Desktop Companion installed in $HOME/.zara-desktop/agent.mjs"',
      `echo "Open ZARA in your browser (${origin}) and paste the pairing token shown below."`,
      'node "$HOME/.zara-desktop/agent.mjs"',
    ].join('\n');
    return new Response(shell, {
      headers: {
        'Content-Type': 'text/x-shellscript; charset=utf-8',
        'Content-Disposition': 'attachment; filename="zara-desktop-setup.sh"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const bytes = new TextEncoder().encode(agentSource);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const encodedAgent = btoa(binary);
  const batch = [
    '@echo off',
    'setlocal',
    'set ZARA_DIR=%USERPROFILE%\\.zara-desktop',
    'if not exist "%ZARA_DIR%" mkdir "%ZARA_DIR%"',
    `powershell -NoProfile -Command "[IO.File]::WriteAllBytes('%ZARA_DIR%\\agent.mjs',[Convert]::FromBase64String('${encodedAgent}'))"`,
    'echo.',
    'echo ===================================================',
    'echo   ZARA AI Laptop Companion Installed Successfully!',
    `echo   Web App URL: ${origin}`,
    'echo   Copy the pairing token below into Settings ^> Laptop',
    'echo ===================================================',
    'echo.',
    'node "%ZARA_DIR%\\agent.mjs"',
    'pause',
  ].join('\r\n');
  return new Response(batch, {
    headers: {
      'Content-Type': 'application/bat; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ZARA-Desktop-Setup.bat"',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Implements the APIs shared by the local Express app but previously missing from the
 * production Worker runtime. Returns null when the request belongs to the legacy router.
 */
export async function handleFeatureRoute(request: Request, env: FeatureEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;

  if (path === '/api/state' && method === 'GET') return stateResponse(db, env);

  if (path === '/api/onboarding' && method === 'POST') {
    return handleOnboarding(db, await parseBody(request));
  }

  if (path === '/api/characters' && method === 'POST') {
    const body = await parseBody(request);
    const name = String(body.name ?? '').trim().slice(0, 80);
    const systemPrompt = String(body.system_prompt ?? '').trim().slice(0, 8000);
    if (!name || !systemPrompt) return json({ error: 'Character name and personality prompt are required.' }, 400);
    const slug = `${makeSlug(name)}_${crypto.randomUUID().slice(0, 6)}`;
    await exec(
      db,
      'INSERT INTO characters(slug,name,role_title,bio,personality,default_mood,tts_voice,system_prompt,learned_traits,life_journal,bond_level,xp,is_active,is_custom) VALUES(?,?,?,?,?,?,?,?,?,?,1,10,0,1)',
      slug,
      name,
      String(body.role_title ?? 'Custom Living Companion').slice(0, 120),
      String(body.bio ?? 'Custom user-designed AI character.').slice(0, 1500),
      String(body.personality ?? 'friendly_professional'),
      String(body.default_mood ?? 'calm'),
      String(body.tts_voice ?? 'Kore'),
      systemPrompt,
      JSON.stringify(['Custom Persona Core']),
      JSON.stringify([`Created ${name} to evolve alongside the user.`]),
    );
    return json({ character: await one<Row>(db, 'SELECT * FROM characters WHERE slug=?', slug), characters: await getCharacters(db) });
  }

  const characterRoute = path.match(/^\/api\/characters\/([^/]+)(?:\/(select))?$/);
  if (characterRoute) {
    const idOrSlug = decodeURIComponent(characterRoute[1]);
    if (characterRoute[2] === 'select' && method === 'POST') {
      const record = /^\d+$/.test(idOrSlug)
        ? await one<Row>(db, 'SELECT * FROM characters WHERE id=?', Number(idOrSlug))
        : await one<Row>(db, 'SELECT * FROM characters WHERE LOWER(slug)=LOWER(?) OR LOWER(name)=LOWER(?)', idOrSlug, idOrSlug);
      if (!record) return json({ error: 'Character not found.' }, 404);
      const character = mapCharacter(record);
      const currentCfg = await readConfig(db);
      await exec(db, 'UPDATE characters SET is_active=0');
      await exec(db, 'UPDATE characters SET is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?', character.id);
      await upsertConfig(db, {
        active_character_id: character.id,
        assistant_name: character.name,
        personality: character.personality,
        custom_prompt: character.system_prompt,
        ...(currentCfg.voice_locked ? {} : { tts_voice: character.tts_voice }),
        active_mood: character.default_mood === 'calm' ? 'auto' : character.default_mood,
      });
      return json({ character: { ...character, is_active: true }, characters: await getCharacters(db), config: await readConfig(db) });
    }
    if (method === 'DELETE' && !characterRoute[2] && /^\d+$/.test(idOrSlug)) {
      const result = await one<Row>(db, 'SELECT id,is_active,is_custom FROM characters WHERE id=?', Number(idOrSlug));
      if (!result) return json({ error: 'Character not found.' }, 404);
      if (Number(result.is_custom) !== 1) return json({ error: 'Built-in characters cannot be deleted.' }, 403);
      await exec(db, 'DELETE FROM characters WHERE id=? AND is_custom=1', Number(idOrSlug));
      const remaining = await getCharacters(db);
      if (Number(result.is_active) === 1 && remaining[0]) {
        const selected = remaining[0];
        await exec(db, 'UPDATE characters SET is_active=0');
        await exec(db, 'UPDATE characters SET is_active=1 WHERE id=?', selected.id);
        await upsertConfig(db, { active_character_id: selected.id, assistant_name: selected.name, personality: selected.personality, custom_prompt: selected.system_prompt, tts_voice: selected.tts_voice });
      }
      return json({ ok: true, characters: await getCharacters(db) });
    }
  }

  if (path === '/api/evolve' && method === 'POST') {
    const active = await getActiveCharacter(db);
    if (!active) return json({ error: 'Character table is empty. Apply migration 0002 first.' }, 503);
    const [recent, memories, knowledge, turnRow, cfg] = await Promise.all([
      all<Row>(db, "SELECT content FROM conversations WHERE role='user' ORDER BY id DESC LIMIT 20"),
      getMemories(db),
      getKnowledge(db),
      one<{ c: number }>(db, "SELECT COUNT(*) as c FROM conversations WHERE role='user'"),
      readConfig(db),
    ]);
    const totalTurns = Number(turnRow?.c || 0);
    const outcome = computeEvolutionProgress({
      character: active,
      xpGain: 35,
      recentUserMessages: recent.map((row) => String(row.content ?? '')),
      memories,
      knowledge,
      totalUserInteractions: totalTurns > 0 ? totalTurns : 5,
      nickname: cfg.user_nickname || cfg.user_name || 'Boss',
    });
    const traits = [...active.learned_traits];
    for (const trait of outcome.newTraits) if (!traits.some((value) => value.toLowerCase() === trait.toLowerCase())) traits.push(trait);
    const journal = [outcome.journalEntry, ...active.life_journal].slice(0, 15);
    await exec(db, 'UPDATE characters SET xp=?,bond_level=?,learned_traits=?,life_journal=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      outcome.nextXp, outcome.nextBondLevel, JSON.stringify(traits.slice(0, 12)), JSON.stringify(journal), active.id);
    if (outcome.suggestedSkill) {
      const existing = await one<Row>(db, 'SELECT id FROM skills_config WHERE LOWER(display_name)=LOWER(?) LIMIT 1', outcome.suggestedSkill.display_name);
      if (!existing) {
        const skill = outcome.suggestedSkill;
        await exec(db, 'INSERT INTO skills_config(skill_name,display_name,description,trigger_phrases,action_type,action_value,is_enabled,is_custom) VALUES(?,?,?,?,?,?,1,1)',
          `${makeSlug(skill.display_name)}_${crypto.randomUUID().slice(0, 5)}`, skill.display_name, skill.description,
          JSON.stringify(skill.trigger_phrases), skill.action_type, skill.action_value);
      }
    }
    const [character, characters, skills] = await Promise.all([
      getActiveCharacter(db), getCharacters(db), getSkills(db),
    ]);
    return json({ character, characters, skills, outcome });
  }

  if (path === '/api/study' && method === 'POST') {
    return handleStudy(db, env, await parseBody(request));
  }
  const studyRoute = path.match(/^\/api\/study\/(\d+)(?:\/(execute))?$/);
  if (studyRoute) {
    const id = Number(studyRoute[1]);
    if (studyRoute[2] === 'execute' && method === 'POST') {
      return handleStudyExecution(db, env, id, await parseBody(request));
    }
    if (!studyRoute[2] && method === 'DELETE') {
      await exec(db, 'DELETE FROM knowledge_sources WHERE id=?', id);
      return json({ ok: true, knowledge: await getKnowledge(db) });
    }
  }

  if (path === '/api/vision' && method === 'POST') {
    return handleVision(db, env, await parseBody(request));
  }

  if (path === '/api/desktop/installer' && method === 'GET') {
    return handleDesktopInstaller(request, env);
  }

  if (path === '/api/skills' && method === 'POST') {
    const body = await parseBody(request);
    const name = String(body.display_name ?? '').trim().slice(0, 100);
    const triggers = safeArray<string>(body.trigger_phrases).map((value) => String(value).trim()).filter(Boolean).slice(0, 20);
    if (!name || !triggers.length) return json({ error: 'Command name and at least one trigger phrase are required.' }, 400);
    const actionTypes = new Set(['launch', 'url', 'system', 'ai', 'note', 'reminder', 'calc', 'study', 'vision', 'evolve', 'desktop']);
    const actionType = String(body.action_type ?? 'url');
    if (!actionTypes.has(actionType)) return json({ error: 'Unsupported command action type.' }, 400);
    let actionValue = String(body.action_value ?? '').trim().slice(0, 2000);
    if (actionType === 'url' || actionType === 'launch') {
      if (!actionValue || !isValidSkillHttpUrl(actionValue)) {
        return json({ error: 'Command URL must be a valid http:// or https:// address.' }, 400);
      }
    } else if (actionType === 'vision') {
      if (!actionValue) actionValue = 'look_now';
      if (!isValidCameraMode(actionValue)) return json({ error: 'Unsupported camera mode selected.' }, 400);
    } else if (!actionValue) {
      return json({ error: 'Action target is required.' }, 400);
    }
    await exec(
      db,
      'INSERT INTO skills_config(skill_name,display_name,description,trigger_phrases,action_type,action_value,is_enabled,is_custom) VALUES(?,?,?,?,?,?,1,1)',
      `${makeSlug(name)}_${crypto.randomUUID().slice(0, 6)}`,
      name,
      String(body.description ?? 'Custom natural-language command').slice(0, 500),
      JSON.stringify(triggers),
      actionType,
      actionValue,
    );
    return json({ skills: await getSkills(db) });
  }

  const skillRoute = path.match(/^\/api\/skills\/(\d+)$/);
  if (skillRoute && method === 'PATCH') {
    const skillId = Number(skillRoute[1]);
    const existing = await one<Row>(db, 'SELECT * FROM skills_config WHERE id=?', skillId);
    if (!existing) return json({ error: 'Command or skill not found.' }, 404);
    const body = await parseBody(request);
    const hasEdits =
      body.display_name !== undefined ||
      body.description !== undefined ||
      body.trigger_phrases !== undefined ||
      body.action_type !== undefined ||
      body.action_value !== undefined;
    if (!hasEdits) {
      if (typeof body.is_enabled !== 'boolean') return json({ error: 'is_enabled must be a boolean.' }, 400);
      await exec(db, 'UPDATE skills_config SET is_enabled=? WHERE id=?', body.is_enabled ? 1 : 0, skillId);
      return json({ ok: true, skills: await getSkills(db) });
    }
    if (Number(existing.is_custom) !== 1) return json({ error: 'Built-in skills cannot be modified.' }, 403);
    const name = body.display_name !== undefined ? String(body.display_name).trim().slice(0, 100) : String(existing.display_name);
    const triggers = body.trigger_phrases !== undefined
      ? safeArray<string>(body.trigger_phrases).map((v) => String(v).trim()).filter(Boolean).slice(0, 20)
      : safeArray<string>(existing.trigger_phrases);
    const actionType = body.action_type !== undefined ? String(body.action_type) : String(existing.action_type);
    const actionTypes = new Set(['launch', 'url', 'system', 'ai', 'note', 'reminder', 'calc', 'study', 'vision', 'evolve', 'desktop']);
    if (!name || !triggers.length || !actionTypes.has(actionType)) {
      return json({ error: 'Valid command name, triggers, and action type are required.' }, 400);
    }
    let actionValue = body.action_value !== undefined ? String(body.action_value).trim().slice(0, 2000) : String(existing.action_value ?? '');
    if (actionType === 'url' || actionType === 'launch') {
      if (!actionValue || !isValidSkillHttpUrl(actionValue)) return json({ error: 'Command URL must be a valid http:// or https:// address.' }, 400);
    } else if (actionType === 'vision') {
      if (!actionValue) actionValue = 'look_now';
      if (!isValidCameraMode(actionValue)) return json({ error: 'Unsupported camera mode selected.' }, 400);
    } else if (!actionValue) {
      return json({ error: 'Action target is required.' }, 400);
    }
    const isEnabled = typeof body.is_enabled === 'boolean' ? (body.is_enabled ? 1 : 0) : Number(existing.is_enabled);
    const description = body.description !== undefined ? String(body.description).trim().slice(0, 500) : String(existing.description ?? '');
    await exec(
      db,
      'UPDATE skills_config SET display_name=?,description=?,trigger_phrases=?,action_type=?,action_value=?,is_enabled=? WHERE id=? AND is_custom=1',
      name,
      description || 'Custom natural-language command',
      JSON.stringify(triggers),
      actionType,
      actionValue,
      isEnabled,
      skillId,
    );
    return json({ ok: true, skills: await getSkills(db) });
  }

  const memoryRoute = path.match(/^\/api\/memories\/(\d+)$/);
  if (memoryRoute && method === 'DELETE') {
    await exec(db, 'UPDATE memories SET is_deleted=1,updated_at=CURRENT_TIMESTAMP WHERE id=?', Number(memoryRoute[1]));
    return json({ ok: true, memories: await getMemories(db) });
  }

  const conversationRoute = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (conversationRoute && method === 'DELETE') {
    await exec(db, 'DELETE FROM conversations WHERE session_id=?', decodeURIComponent(conversationRoute[1]));
    const sessions = await all<Row>(
      db,
      `SELECT session_id,MIN(timestamp) started_at,MAX(timestamp) last_message_at,COUNT(*) message_count,
        (SELECT content FROM conversations c2 WHERE c2.session_id=c1.session_id ORDER BY id LIMIT 1) preview,
        (SELECT language FROM conversations c3 WHERE c3.session_id=c1.session_id ORDER BY id DESC LIMIT 1) primary_language
        FROM conversations c1 GROUP BY session_id ORDER BY MAX(id) DESC`,
    );
    return json({ ok: true, sessions: sessions.map((row) => ({ ...row, message_count: Number(row.message_count) })) });
  }

  // Keep response bodies aligned with the browser's state-update contracts.
  const noteRoute = path.match(/^\/api\/notes\/(\d+)$/);
  if (noteRoute && method === 'DELETE') {
    await exec(db, 'DELETE FROM notes WHERE id=?', Number(noteRoute[1]));
    return json({ ok: true, notes: await getNotes(db) });
  }
  const reminderRoute = path.match(/^\/api\/reminders\/(\d+)$/);
  if (reminderRoute && method === 'PATCH') {
    const body = await parseBody(request);
    if (typeof body.is_done !== 'boolean') return json({ error: 'is_done must be a boolean.' }, 400);
    await exec(db, 'UPDATE reminders SET is_done=? WHERE id=?', body.is_done ? 1 : 0, Number(reminderRoute[1]));
    return json({ ok: true, reminders: await getReminders(db) });
  }
  if (reminderRoute && method === 'DELETE') {
    await exec(db, 'DELETE FROM reminders WHERE id=?', Number(reminderRoute[1]));
    return json({ ok: true, reminders: await getReminders(db) });
  }
  if (skillRoute && method === 'DELETE') {
    await exec(db, 'DELETE FROM skills_config WHERE id=? AND is_custom=1', Number(skillRoute[1]));
    return json({ ok: true, skills: await getSkills(db) });
  }

  if (path === '/api/voice-history' && method === 'GET') {
    return json({ voiceLogs: await getVoiceLogs(db) });
  }
  if (path === '/api/voice-history' && method === 'POST') {
    const body = await parseBody(request);
    const transcript = String(body.transcript ?? '').trim().slice(0, 1000);
    if (!transcript) return json({ error: 'Transcript is required.' }, 400);
    const rawStatus = String(body.status ?? 'matched');
    const status: VoiceCommandStatus =
      rawStatus === 'failed' || rawStatus === 'ai_fallback' ? rawStatus : 'matched';
    const source: VoiceCommandSource = body.source === 'retrigger' ? 'retrigger' : 'microphone';
    const language: 'en' | 'ur' =
      body.language === 'ur' || detectUrduIntent(transcript) ? 'ur' : 'en';
    const actionType = sanitizeVoiceLogActionType(
      body.action_type == null ? null : String(body.action_type),
    );
    const volumeLevel = normalizeVoiceVolume(body.volume_level ?? body.volumeLevel, 0.5);
    await exec(
      db,
      'INSERT INTO voice_command_logs(transcript,matched_skill_name,matched_display_name,action_type,status,response_summary,source,language,volume_level) VALUES(?,?,?,?,?,?,?,?,?)',
      transcript,
      body.matched_skill_name ? String(body.matched_skill_name).trim().slice(0, 120) : null,
      body.matched_display_name ? String(body.matched_display_name).trim().slice(0, 160) : null,
      actionType,
      status,
      String(body.response_summary ?? '').trim().slice(0, 320),
      source,
      language,
      volumeLevel,
    );
    const created = await one<Row>(db, 'SELECT * FROM voice_command_logs ORDER BY id DESC LIMIT 1');
    return json({ log: created ? mapVoiceLog(created) : null, voiceLogs: await getVoiceLogs(db) });
  }
  if (path === '/api/voice-history' && method === 'DELETE') {
    await exec(db, 'DELETE FROM voice_command_logs');
    return json({ ok: true, voiceLogs: [] });
  }
  const voiceHistoryRoute = path.match(/^\/api\/voice-history\/(\d+)$/);
  if (voiceHistoryRoute && method === 'DELETE') {
    await exec(db, 'DELETE FROM voice_command_logs WHERE id=?', Number(voiceHistoryRoute[1]));
    return json({ ok: true, voiceLogs: await getVoiceLogs(db) });
  }

  return null;
}
