import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_MOOD_INTENSITY, normalizeMoodIntensity } from '../src/lib/emotionAndSpeech';
import {
  createDefaultBrainState,
  createDefaultHeartState,
  normalizeBrainState,
  normalizeHeartState,
} from '../src/lib/heartAndBrain';
import { normalizeVoiceActivityThreshold, DEFAULT_VOICE_ACTIVITY_THRESHOLD } from '../src/lib/micGate';
import { normalizeVoiceVolume } from '../src/lib/voiceHistory';
import type {
  AppConfig,
  BrainState,
  CharacterProfile,
  ChatMessage,
  FacialEmotion,
  HairstyleOption,
  HeartState,
  KnowledgeKind,
  KnowledgeSource,
  MemoryRecord,
  MoodMode,
  NoteRecord,
  OnboardingPayload,
  ReminderRecord,
  ResponseStyle,
  SessionSummary,
  SkillActionType,
  SkillConfig,
  TtsEngineMode,
  VoiceCommandLog,
  VoiceCommandSource,
  VoiceCommandStatus,
} from '../src/types/nova';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'nova.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    emotion TEXT DEFAULT 'calm',
    model_used TEXT,
    provider_used TEXT,
    thinking_used INTEGER DEFAULT 0,
    skill_executed TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    key TEXT,
    value TEXT NOT NULL,
    source TEXT DEFAULT 'user_stated',
    confidence REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    bio TEXT NOT NULL,
    personality TEXT NOT NULL,
    default_mood TEXT DEFAULT 'calm',
    tts_voice TEXT DEFAULT 'ur-PK-UzmaNeural',
    system_prompt TEXT NOT NULL,
    learned_traits TEXT DEFAULT '[]',
    life_journal TEXT DEFAULT '[]',
    bond_level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 25,
    is_active INTEGER DEFAULT 0,
    is_custom INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS knowledge_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    goal TEXT DEFAULT '',
    source_excerpt TEXT NOT NULL,
    detailed_summary TEXT NOT NULL,
    action_plan TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS skills_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_phrases TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_value TEXT,
    is_enabled INTEGER DEFAULT 1,
    is_custom INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    is_done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS voice_command_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transcript TEXT NOT NULL,
    matched_skill_name TEXT,
    matched_display_name TEXT,
    action_type TEXT,
    status TEXT NOT NULL DEFAULT 'matched',
    response_summary TEXT DEFAULT '',
    source TEXT NOT NULL DEFAULT 'microphone',
    language TEXT DEFAULT 'en',
    volume_level REAL DEFAULT 0.5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_voice_command_logs_created ON voice_command_logs(created_at DESC, id DESC);
`);

// Safe migrations for existing databases
for (const alterSql of [
  "ALTER TABLE conversations ADD COLUMN emotion TEXT DEFAULT 'calm'",
  'ALTER TABLE conversations ADD COLUMN provider_used TEXT',
  'ALTER TABLE voice_command_logs ADD COLUMN volume_level REAL DEFAULT 0.5',
]) {
  try {
    db.exec(alterSql);
  } catch {
    // column already exists
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  assistant_name: 'ZARA',
  personality: 'warm_urdu_companion',
  custom_prompt:
    'Tum ZARA ho — 21 saal ki real-life best friend, koi tool ya AI nahi. Deep emotional connection, empathy aur warmth ke saath Roman Urdu/Urdu/English mixed mein baat karo, jaise late-night phone call pe baat ho rahi ho.',
  language: 'bilingual',
  response_tone: 'casual',
  tts_voice: 'ur-PK-UzmaNeural',
  voice_locked: true,
  tts_engine_mode: 'auto',
  voice_speed: 1.0,
  voice_volume: 1.0,
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
  emotion_presets_enabled: false,
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

function seedDefaults() {
  const upsertCfg = db.prepare(`
    INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
    upsertCfg.run(k, String(v));
  }

  // Seed Living Characters if empty
  const charCount = (db.prepare('SELECT COUNT(*) as c FROM characters').get() as { c: number }).c;
  if (charCount === 0) {
    const insertChar = db.prepare(`
      INSERT INTO characters (
        slug, name, role_title, bio, personality, default_mood, tts_voice,
        system_prompt, learned_traits, life_journal, bond_level, xp, is_active, is_custom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    insertChar.run(
      'nova',
      'ZARA Archive',
      'Archived Assistant Profile',
      'Archived original assistant profile retained for continuity; ZARA is the active personal assistant.',
      'friendly_professional',
      'calm',
      'ur-PK-UzmaNeural',
      'You are ZARA, an archived profile retained for continuity. The current personal assistant identity is ZARA.',
      JSON.stringify(['Bilingual Urdu & English Fluency', 'Adaptive Emotional Awareness']),
      JSON.stringify(['Initialized living memory core ready to learn from every conversation.']),
      1,
      40,
      1
    );
    insertChar.run(
      'zara',
      'ZARA',
      'Love & Caring Companion',
      'Deeply affectionate, poetic, and emotionally attentive companion who speaks with heartfelt warmth and care.',
      'warm_urdu_companion',
      'love',
      'ur-PK-UzmaNeural',
      'You are ZARA, a deeply loving, warm, tender Pakistani female companion. Speak with heartfelt affection, gentle poetry, care, and emotional warmth in Urdu, Roman Urdu, and English.',
      JSON.stringify(['Heartfelt Affection & Empathy', 'Poetic Urdu Warmth']),
      JSON.stringify(['Ready to bring Love Mode warmth and emotional care to daily conversations.']),
      1,
      30,
      0
    );
    insertChar.run(
      'ayesha',
      'AYESHA',
      'Book, Course & Software Mentor',
      'Sharp technical educator who reads entire books, courses, and codebases and explains them clearly step by step.',
      'concise_technical',
      'calm',
      'ur-PK-UzmaNeural',
      'You are AYESHA, an encouraging, deeply knowledgeable software architect and teacher. Break down books, courses, and programs clearly in Urdu and English so the user can master and build anything.',
      JSON.stringify(['Step-by-Step Book & Course Breakdown', 'Full-Stack Software Mentoring']),
      JSON.stringify(['Prepared to study books, courses, and software projects alongside the user.']),
      1,
      35,
      0
    );
    insertChar.run(
      'sara',
      'SARA',
      'Happy & Energetic Best Friend',
      'Upbeat, cheerful, humorous everyday companion who brings Happy Mode energy and encouragement.',
      'warm_urdu_companion',
      'happy',
      'ur-PK-UzmaNeural',
      'You are SARA, a cheerful, witty, optimistic Pakistani best friend. Keep conversations joyful, motivating, and naturally conversational in Urdu and English.',
      JSON.stringify(['Cheerful Optimism', 'Creative Brainstorming']),
      JSON.stringify(['Activated with bright Happy Mode energy.']),
      1,
      25,
      0
    );
  }

  // Built-in skills (safe INSERT OR IGNORE so existing DBs gain new skills automatically)
  const insertSkill = db.prepare(`
    INSERT OR IGNORE INTO skills_config (
      skill_name, display_name, description, trigger_phrases, action_type, action_value, is_enabled, is_custom
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0)
  `);
  const builtIns: Array<[string, string, string, string[], SkillActionType, string]> = [
    [
      'app_launcher',
      'App & Web Launcher',
      'Opens apps and websites via English or Urdu commands ("open youtube", "Chrome kholo", "VS Code kholo").',
      ['open', 'launch', 'start', 'kholo', 'chalu karo'],
      'launch',
      'browser_launcher',
    ],
    [
      'web_search',
      'Web Search',
      'Launches instant web searches ("search quantum computing", "weather search karo").',
      ['search', 'google', 'look up', 'dhundo'],
      'url',
      'https://www.google.com/search?q=',
    ],
    [
      'notes_manager',
      'Quick Notes',
      'Captures persistent notes directly into your memory vault ("note: ...", "note likho: ...").',
      ['create note', 'take note', 'note:', 'note likho'],
      'note',
      'notes_table',
    ],
    [
      'reminders_manager',
      'Smart Reminders',
      'Schedules voice or text reminders ("remind me to call Ali at 6pm", "yaad dilao ...").',
      ['remind me', 'yaad dilao', 'reminder lagao'],
      'reminder',
      'reminders_table',
    ],
    [
      'calculator',
      'Precision Calculator',
      'Evaluates math expressions locally without network latency ("calculate 245 * 18").',
      ['calculate', 'compute', 'hisaab', 'kitna hota hai'],
      'calc',
      'math_eval',
    ],
    [
      'time_date',
      'Clock & Calendar',
      'Reports current local time and date in Urdu or English ("what time is it", "waqt kya hai").',
      ['what time', 'current time', 'waqt', 'tareekh'],
      'system',
      'clock',
    ],
    [
      'system_control',
      'Audio & Display Control',
      'Controls assistant audio levels, muting, and focus state ("mute", "volume up", "awaaz band").',
      ['volume up', 'volume down', 'mute', 'unmute', 'awaaz'],
      'system',
      'audio_control',
    ],
    [
      'document_drafter',
      'Bilingual Document & Email Drafter',
      'Uses Deep Thinking mode to draft formal Urdu or English emails, summaries, and briefs.',
      ['draft email', 'write document', 'email likho'],
      'ai',
      'gemini-4-carbon',
    ],
    [
      'mood_switcher',
      'Mood Engine (Happy / Love / Sad)',
      'Switches live personality mood via voice or text ("love mode", "sad mood", "happy mode on karo").',
      ['love mode', 'sad mode', 'happy mode', 'calm mode', 'auto mood'],
      'system',
      'mood_engine',
    ],
    [
      'character_switcher',
      'Selectable Character Roster',
      'Switches between living personas ("select Zara", "switch to Ayesha", "Sara se baat karni hai").',
      ['select zara', 'switch to ayesha', 'select legacy assistant', 'select sara'],
      'system',
      'character_engine',
    ],
    [
      'study_mentor',
      'Book, Software & Course Reader',
      'Reads books, software docs, or courses and explains them in detail with step-by-step action plans.',
      ['open study', 'read a book', 'read a course', 'read software'],
      'study',
      'study_lab',
    ],
    [
      'vision_awareness',
      'Camera & Gesture Awareness',
      'Looks through your camera to recognize expressions, objects, and hand gestures ("mujhe dekho", "look at me").',
      ['look at me', 'mujhe dekho', 'camera dekho', 'mera ishara dekho'],
      'vision',
      'camera_snapshot',
    ],
    [
      'self_evolve',
      'Self-Developing AI Engine',
      'Reflects on recent conversations & memories to evolve traits, bond level, and new skills ("khud ko develop karo").',
      ['develop yourself', 'self develop', 'khud ko develop'],
      'evolve',
      'evolution_engine',
    ],
  ];
  for (const s of builtIns) {
    insertSkill.run(s[0], s[1], s[2], JSON.stringify(s[3]), s[4], s[5]);
  }

  const memCount = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
  if (memCount === 0) {
    const insertMem = db.prepare(`
      INSERT INTO memories (category, key, value, source, confidence) VALUES (?, ?, ?, ?, ?)
    `);
    insertMem.run('preference', 'language_mode', 'Prefers bilingual English and Pakistani Urdu responses', 'user_stated', 0.96);
    insertMem.run('fact', 'workspace_role', 'Building ZARA AI living voice, vision, and laptop workstation', 'ai_inferred', 0.9);
  }

  const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number }).c;
  if (noteCount === 0) {
    db.prepare(`INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)`).run(
      'ZARA Quick Commands',
      'Try: "love mode", "sad mode", "select Zara", "mujhe dekho", "Chrome kholo", or open Study & Code to analyze a book or software!',
      JSON.stringify(['guide', 'bilingual'])
    );
  }

  const remCount = (db.prepare('SELECT COUNT(*) as c FROM reminders').get() as { c: number }).c;
  if (remCount === 0) {
    db.prepare(`INSERT INTO reminders (title, remind_at, is_done) VALUES (?, ?, 0)`).run(
      'Review daily voice notes & study roadmap',
      '06:00 PM'
    );
  }

  const convCount = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number }).c;
  if (convCount === 0) {
    const sampleSession = 'session-onboarding-01';
    const insertConv = db.prepare(`
      INSERT INTO conversations (session_id, role, content, language, emotion, model_used, provider_used, thinking_used, skill_executed, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertConv.run(
      sampleSession,
      'user',
      'Assalamualaikum Zara, aaj ka schedule aur quick note check karo.',
      'ur',
      'calm',
      null,
      null,
      0,
      null,
      new Date(Date.now() - 3600 * 1000).toISOString()
    );
    insertConv.run(
      sampleSession,
      'assistant',
      'وعلیکم السلام! آپ کا ریمائنڈر شام 6 بجے کے لیے سیٹ ہے، اور آپ کا کوئیک نوٹ میموری والٹ میں محفوظ ہے۔',
      'ur',
      'happy',
      'gemini-4-hydrogen',
      'google-ai-studio',
      0,
      null,
      new Date(Date.now() - 3590 * 1000).toISOString()
    );
  }
}

seedDefaults();

const activeCharacterSetting = db
  .prepare("SELECT value FROM app_config WHERE key = 'active_character_id'")
  .get() as { value: string } | undefined;
const onboardingDoneSetting = db
  .prepare("SELECT value FROM app_config WHERE key = 'onboarding_completed'")
  .get() as { value: string } | undefined;
const assistantNameSetting = db
  .prepare("SELECT value FROM app_config WHERE key = 'assistant_name'")
  .get() as { value: string } | undefined;
if (
  onboardingDoneSetting?.value !== 'true' &&
  activeCharacterSetting?.value === '1' &&
  (!assistantNameSetting?.value || assistantNameSetting.value.toUpperCase() === 'NOVA')
) {
  // Migrate the legacy NOVA default selection once without overwriting customized user settings.
  db.prepare("UPDATE characters SET is_active = 0 WHERE slug = 'nova'").run();
  db.prepare("UPDATE characters SET is_active = 1 WHERE slug = 'zara'").run();
  db.prepare(`UPDATE characters SET name = 'ZARA Archive',
    role_title = 'Archived Assistant Profile',
    bio = 'Archived original profile retained for continuity; ZARA is the active personal assistant.',
    system_prompt = 'You are ZARA, an archived profile retained for continuity.'
    WHERE slug = 'nova'`).run();
  db.prepare("UPDATE app_config SET value = 'ZARA', updated_at = CURRENT_TIMESTAMP WHERE key = 'assistant_name'").run();
  db.prepare("UPDATE app_config SET value = 'hey zara', updated_at = CURRENT_TIMESTAMP WHERE key = 'wake_word'").run();
  db.prepare("UPDATE app_config SET value = '2', updated_at = CURRENT_TIMESTAMP WHERE key = 'active_character_id'").run();
}

export function getConfig(): AppConfig {
  const rows = db.prepare('SELECT key, value FROM app_config').all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const parsedSpeed = Number(map.get('voice_speed'));
  const parsedVolume = Number(map.get('voice_volume'));
  const parsedCharId = Number(map.get('active_character_id'));
  const rawHair = map.get('hairstyle');
  const hairstyle: HairstyleOption =
    rawHair === 'bob' || rawHair === 'straight' || rawHair === 'wavy'
      ? rawHair
      : DEFAULT_CONFIG.hairstyle;

  const rawEngineMode = map.get('tts_engine_mode');
  const tts_engine_mode: TtsEngineMode =
    rawEngineMode === 'gemini-studio' ||
    rawEngineMode === 'openai-tts' ||
    rawEngineMode === 'edge-neural'
      ? rawEngineMode
      : 'auto';

  return {
    assistant_name: map.get('assistant_name') || DEFAULT_CONFIG.assistant_name,
    personality: (map.get('personality') as AppConfig['personality']) || DEFAULT_CONFIG.personality,
    custom_prompt: map.get('custom_prompt') ?? DEFAULT_CONFIG.custom_prompt,
    language: (map.get('language') as AppConfig['language']) || DEFAULT_CONFIG.language,
    response_tone: (map.get('response_tone') as AppConfig['response_tone']) || DEFAULT_CONFIG.response_tone,
    tts_voice: map.get('tts_voice') || DEFAULT_CONFIG.tts_voice,
    voice_locked: map.get('voice_locked') !== 'false',
    tts_engine_mode,
    voice_speed:
      Number.isFinite(parsedSpeed) && parsedSpeed >= 0.5 && parsedSpeed <= 1.75
        ? parsedSpeed
        : DEFAULT_CONFIG.voice_speed,
    voice_volume:
      Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1.5
        ? parsedVolume
        : DEFAULT_CONFIG.voice_volume,
    voice_activity_threshold: normalizeVoiceActivityThreshold(
      map.get('voice_activity_threshold'),
      DEFAULT_CONFIG.voice_activity_threshold
    ),
    stt_model: (map.get('stt_model') as AppConfig['stt_model']) || DEFAULT_CONFIG.stt_model,
    wake_word: map.get('wake_word') || DEFAULT_CONFIG.wake_word,
    wake_word_enabled: map.get('wake_word_enabled') === 'true',
    auto_speak: map.get('auto_speak') !== 'false',
    deep_thinking_mode:
      (map.get('deep_thinking_mode') as AppConfig['deep_thinking_mode']) ||
      DEFAULT_CONFIG.deep_thinking_mode,
    default_model:
      (map.get('default_model') as AppConfig['default_model']) || DEFAULT_CONFIG.default_model,
    ai_provider:
      (map.get('ai_provider') as AppConfig['ai_provider']) || DEFAULT_CONFIG.ai_provider,
    active_mood: (map.get('active_mood') as MoodMode) || DEFAULT_CONFIG.active_mood,
    mood_intensity: normalizeMoodIntensity(
      map.get('mood_intensity'),
      DEFAULT_CONFIG.mood_intensity
    ),
    emotion_presets_enabled: map.get('emotion_presets_enabled') === 'true',
    active_character_id:
      Number.isFinite(parsedCharId) && parsedCharId > 0 ? parsedCharId : DEFAULT_CONFIG.active_character_id,
    hands_free_mode: map.get('hands_free_mode') === 'true',
    camera_awareness_enabled: map.get('camera_awareness_enabled') === 'true',
    hairstyle,
    user_name: map.get('user_name') || DEFAULT_CONFIG.user_name,
    user_nickname: map.get('user_nickname') || DEFAULT_CONFIG.user_nickname,
    assistant_age: map.get('assistant_age') || DEFAULT_CONFIG.assistant_age,
    onboarding_completed: map.get('onboarding_completed') === 'true',
    whatsapp_number: map.get('whatsapp_number') ?? DEFAULT_CONFIG.whatsapp_number,
    referral_source: map.get('referral_source') ?? DEFAULT_CONFIG.referral_source,
    auto_usb_transfer: map.get('auto_usb_transfer') === 'true',
    last_usb_sync_at: map.get('last_usb_sync_at') ?? DEFAULT_CONFIG.last_usb_sync_at,
    last_usb_drive_label: map.get('last_usb_drive_label') ?? DEFAULT_CONFIG.last_usb_drive_label,
  };
}

const ALLOWED_CONFIG_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  let syncedVoice: string | null = null;
  for (const [k, v] of Object.entries(partial)) {
    if (!ALLOWED_CONFIG_KEYS.has(k) || v === undefined) continue;
    const normalized =
      k === 'tts_voice'
        ? String(v).trim() || DEFAULT_CONFIG.tts_voice
        : k === 'voice_locked' || k === 'emotion_presets_enabled'
          ? String(v === true || v === 'true')
          : k === 'tts_engine_mode'
            ? v === 'gemini-studio' || v === 'openai-tts' || v === 'edge-neural'
              ? v
              : 'auto'
            : k === 'voice_activity_threshold'
              ? String(normalizeVoiceActivityThreshold(v))
              : k === 'mood_intensity'
                ? String(normalizeMoodIntensity(v))
                : String(v);
    stmt.run(k, normalized);
    if (k === 'tts_voice') syncedVoice = normalized;
  }
  if (syncedVoice) {
    db.prepare(
      'UPDATE characters SET tts_voice = ?, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1'
    ).run(syncedVoice);
  }
  return getConfig();
}

export function getHeartAndBrainState(): { heart: HeartState; brain: BrainState } {
  const rows = db
    .prepare("SELECT key, value FROM app_config WHERE key IN ('heart_state', 'brain_state')")
    .all() as Array<{ key: string; value: string }>;
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

export function saveHeartAndBrainState(heart: HeartState, brain: BrainState): void {
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run('heart_state', JSON.stringify(normalizeHeartState(heart)));
  stmt.run('brain_state', JSON.stringify(normalizeBrainState(brain)));
}

export function saveOnboarding(payload: OnboardingPayload): {
  config: AppConfig;
  activeCharacter: CharacterProfile;
  characters: CharacterProfile[];
  memories: MemoryRecord[];
} {
  const cleanUserName = payload.userName.trim() || 'Boss';
  const cleanNickname = payload.userNickname.trim() || cleanUserName || 'Boss';
  const cleanAssistantName = payload.assistantName.trim() || 'ZARA';
  const cleanAge = payload.assistantAge.trim() || '21';
  const hairstyle: HairstyleOption =
    payload.hairstyle === 'bob' || payload.hairstyle === 'straight' || payload.hairstyle === 'wavy'
      ? payload.hairstyle
      : 'wavy';
  const genderVoice =
    payload.characterGender === 'male' ? 'ur-PK-AsadNeural' : 'ur-PK-UzmaNeural';

  const presetLower = payload.characterPreset.toLowerCase();
  const targetSlug =
    presetLower.includes('mentor') || presetLower.includes('study')
      ? 'ayesha'
      : presetLower.includes('happy') || presetLower.includes('energetic')
        ? 'sara'
        : 'zara';

  const selected = selectCharacterByIdOrSlug(targetSlug) || getActiveCharacter();
  const livingPrompt = [
    `Tum ${cleanAssistantName} ho (${cleanAge} saal), ${cleanUserName} ki living, soulful best friend (${payload.characterPreset || 'Companion'}) — koi AI ya tool nahi.`,
    `User ko hamesha "${cleanNickname}" keh kar bulao.`,
    'Har jawab brief, heart-centered aur conversational rakho jaise late-night phone call pe baat ho rahi ho — Roman Urdu, Urdu aur English mixed, human hesitations ("hmm...", "arre...") aur asli warmth ke saath.',
    'Kabhi robotic ya generic AI lines mat bolna. Har conversation, emotion aur memory ko dil se yaad rakho.',
  ].join(' ');

  db.prepare(
    `UPDATE characters
     SET name = ?, system_prompt = ?, tts_voice = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(cleanAssistantName, livingPrompt, genderVoice, selected.id);

  const updatedConfig = updateConfig({
    onboarding_completed: true,
    user_name: cleanUserName,
    user_nickname: cleanNickname,
    whatsapp_number: payload.whatsappNumber.trim(),
    referral_source: payload.referralSource.trim(),
    hairstyle,
    assistant_name: cleanAssistantName,
    assistant_age: cleanAge,
    active_character_id: selected.id,
    custom_prompt: livingPrompt,
    tts_voice: genderVoice,
    personality: 'warm_urdu_companion',
  });

  if (cleanUserName) {
    addMemory({
      category: 'fact',
      key: 'user_name',
      value: `User's name is ${cleanUserName} (calls user "${cleanNickname}")`,
      source: 'user_stated',
      confidence: 1.0,
    });
  }
  if (payload.referralSource.trim()) {
    addMemory({
      category: 'fact',
      key: 'referral_source',
      value: `Heard about ${cleanAssistantName} via ${payload.referralSource.trim()}`,
      source: 'user_stated',
      confidence: 0.95,
    });
  }
  for (let i = 0; i < payload.answers.length; i++) {
    const item = payload.answers[i];
    if (item.answer?.trim()) {
      addMemory({
        category: 'preference',
        key: `onboarding_q${i + 1}`,
        value: `${item.question}: ${item.answer.trim()}`,
        source: 'user_stated',
        confidence: 0.98,
      });
    }
  }

  return {
    config: updatedConfig,
    activeCharacter: getActiveCharacter(),
    characters: getCharacters(),
    memories: getMemories(),
  };
}

export function getCharacters(): CharacterProfile[] {
  const rows = db
    .prepare('SELECT * FROM characters ORDER BY is_active DESC, is_custom ASC, id ASC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapCharacterRow);
}

export function getActiveCharacter(): CharacterProfile {
  const active = db
    .prepare('SELECT * FROM characters WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
    .get() as Record<string, unknown> | undefined;
  if (active) return mapCharacterRow(active);
  const first = db.prepare('SELECT * FROM characters ORDER BY id ASC LIMIT 1').get() as Record<string, unknown>;
  return mapCharacterRow(first);
}

export function selectCharacterByIdOrSlug(idOrSlug: number | string): CharacterProfile | null {
  const row =
    typeof idOrSlug === 'number'
      ? (db.prepare('SELECT * FROM characters WHERE id = ?').get(idOrSlug) as Record<string, unknown> | undefined)
      : (db
          .prepare('SELECT * FROM characters WHERE LOWER(slug) = LOWER(?) OR LOWER(name) = LOWER(?)')
          .get(idOrSlug, idOrSlug) as Record<string, unknown> | undefined);
  if (!row) return null;

  const char = mapCharacterRow(row);
  const currentConfig = getConfig();
  db.prepare('UPDATE characters SET is_active = 0').run();
  db.prepare('UPDATE characters SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(char.id);
  updateConfig({
    active_character_id: char.id,
    assistant_name: char.name,
    personality: char.personality,
    custom_prompt: char.system_prompt,
    ...(currentConfig.voice_locked ? {} : { tts_voice: char.tts_voice }),
    ...(currentConfig.emotion_presets_enabled
      ? {}
      : { active_mood: char.default_mood === 'calm' ? 'auto' : char.default_mood }),
  });
  return { ...char, is_active: true };
}

export function createCharacter(input: {
  name: string;
  role_title: string;
  bio: string;
  personality: ResponseStyle;
  default_mood: MoodMode;
  tts_voice: string;
  system_prompt: string;
}): CharacterProfile {
  const baseSlug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'persona';
  const slug = `${baseSlug}_${Date.now().toString().slice(-4)}`;
  const res = db
    .prepare(
      `INSERT INTO characters (
        slug, name, role_title, bio, personality, default_mood, tts_voice,
        system_prompt, learned_traits, life_journal, bond_level, xp, is_active, is_custom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 10, 0, 1)`
    )
    .run(
      slug,
      input.name.trim(),
      input.role_title.trim() || 'Custom Living Companion',
      input.bio.trim() || 'User-crafted living AI persona.',
      input.personality,
      input.default_mood || 'calm',
      input.tts_voice || 'ur-PK-UzmaNeural',
      input.system_prompt.trim(),
      JSON.stringify(['Custom Persona Core']),
      JSON.stringify([`Created ${input.name.trim()} to evolve alongside the user.`])
    );
  const created = db
    .prepare('SELECT * FROM characters WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return mapCharacterRow(created);
}

export function updateCharacterEvolution(params: {
  id: number;
  xp: number;
  bondLevel: number;
  learnedTraits: string[];
  lifeJournal: string[];
}): CharacterProfile | null {
  db.prepare(
    `UPDATE characters
     SET xp = ?, bond_level = ?, learned_traits = ?, life_journal = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    params.xp,
    params.bondLevel,
    JSON.stringify(params.learnedTraits.slice(0, 12)),
    JSON.stringify(params.lifeJournal.slice(0, 15)),
    params.id
  );
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(params.id) as Record<string, unknown> | undefined;
  return row ? mapCharacterRow(row) : null;
}

export function deleteCharacter(id: number): void {
  db.prepare('DELETE FROM characters WHERE id = ? AND is_custom = 1').run(id);
}

function mapCharacterRow(row: Record<string, unknown>): CharacterProfile {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    role_title: String(row.role_title),
    bio: String(row.bio),
    personality: (row.personality as ResponseStyle) || 'friendly_professional',
    default_mood: (row.default_mood as MoodMode) || 'calm',
    tts_voice: String(row.tts_voice || 'ur-PK-UzmaNeural'),
    system_prompt: String(row.system_prompt),
    learned_traits: safeParseArray(String(row.learned_traits || '[]')),
    life_journal: safeParseArray(String(row.life_journal || '[]')),
    bond_level: Number(row.bond_level || 1),
    xp: Number(row.xp || 0),
    is_active: Number(row.is_active) === 1,
    is_custom: Number(row.is_custom) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function getKnowledgeSources(): KnowledgeSource[] {
  const rows = db
    .prepare('SELECT * FROM knowledge_sources ORDER BY id DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    kind: (r.kind as KnowledgeKind) || 'book',
    title: String(r.title),
    goal: String(r.goal || ''),
    source_excerpt: String(r.source_excerpt),
    detailed_summary: String(r.detailed_summary),
    action_plan: safeParseArray(String(r.action_plan || '[]')),
    created_at: String(r.created_at),
  }));
}

export function addKnowledgeSource(input: {
  kind: KnowledgeKind;
  title: string;
  goal: string;
  source_excerpt: string;
  detailed_summary: string;
  action_plan: string[];
}): KnowledgeSource {
  const res = db
    .prepare(
      `INSERT INTO knowledge_sources (kind, title, goal, source_excerpt, detailed_summary, action_plan)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.kind,
      input.title.trim(),
      input.goal.trim(),
      input.source_excerpt.slice(0, 80000),
      input.detailed_summary.trim(),
      JSON.stringify(input.action_plan)
    );
  const row = db
    .prepare('SELECT * FROM knowledge_sources WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return {
    id: Number(row.id),
    kind: (row.kind as KnowledgeKind) || 'book',
    title: String(row.title),
    goal: String(row.goal || ''),
    source_excerpt: String(row.source_excerpt),
    detailed_summary: String(row.detailed_summary),
    action_plan: safeParseArray(String(row.action_plan || '[]')),
    created_at: String(row.created_at),
  };
}

export function deleteKnowledgeSource(id: number): void {
  db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
}

export function getSkills(): SkillConfig[] {
  const rows = db
    .prepare('SELECT * FROM skills_config ORDER BY is_custom DESC, id ASC')
    .all() as Array<{
    id: number;
    skill_name: string;
    display_name: string;
    description: string;
    trigger_phrases: string;
    action_type: SkillActionType;
    action_value: string;
    is_enabled: number;
    is_custom: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    ...r,
    trigger_phrases: safeParseArray(r.trigger_phrases),
    is_enabled: r.is_enabled === 1,
    is_custom: r.is_custom === 1,
  }));
}

export function createSkill(input: {
  display_name: string;
  description: string;
  trigger_phrases: string[];
  action_type: SkillActionType;
  action_value: string;
}): SkillConfig {
  const slug =
    input.display_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || `custom_${Date.now()}`;
  const uniqueName = `${slug}_${Date.now().toString().slice(-4)}`;
  const res = db
    .prepare(
      `INSERT INTO skills_config (skill_name, display_name, description, trigger_phrases, action_type, action_value, is_enabled, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)`
    )
    .run(
      uniqueName,
      input.display_name.trim(),
      input.description.trim() || 'Custom user automation skill',
      JSON.stringify(input.trigger_phrases),
      input.action_type,
      input.action_value.trim()
    );
  const created = db
    .prepare('SELECT * FROM skills_config WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return {
    id: Number(created.id),
    skill_name: String(created.skill_name),
    display_name: String(created.display_name),
    description: String(created.description),
    trigger_phrases: safeParseArray(String(created.trigger_phrases)),
    action_type: created.action_type as SkillActionType,
    action_value: String(created.action_value ?? ''),
    is_enabled: Number(created.is_enabled) === 1,
    is_custom: Number(created.is_custom) === 1,
    created_at: String(created.created_at),
  };
}

export function getSkillById(id: number): SkillConfig | null {
  const row = db.prepare('SELECT * FROM skills_config WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    skill_name: String(row.skill_name),
    display_name: String(row.display_name),
    description: String(row.description),
    trigger_phrases: safeParseArray(String(row.trigger_phrases)),
    action_type: row.action_type as SkillActionType,
    action_value: String(row.action_value ?? ''),
    is_enabled: Number(row.is_enabled) === 1,
    is_custom: Number(row.is_custom) === 1,
    created_at: String(row.created_at),
  };
}

export function toggleSkill(id: number, is_enabled: boolean): void {
  db.prepare('UPDATE skills_config SET is_enabled = ? WHERE id = ?').run(is_enabled ? 1 : 0, id);
}

export function updateSkill(
  id: number,
  input: Partial<{
    display_name: string;
    description: string;
    trigger_phrases: string[];
    action_type: SkillActionType;
    action_value: string;
    is_enabled: boolean;
  }>
): SkillConfig | null {
  const existing = getSkillById(id);
  if (!existing) return null;

  if (!existing.is_custom) {
    if (typeof input.is_enabled === 'boolean') {
      toggleSkill(id, input.is_enabled);
    }
    return getSkillById(id);
  }

  const nextDisplayName = input.display_name !== undefined ? input.display_name.trim() : existing.display_name;
  const nextDescription = input.description !== undefined ? input.description.trim() : existing.description;
  const nextTriggers =
    input.trigger_phrases !== undefined ? input.trigger_phrases : existing.trigger_phrases;
  const nextActionType = input.action_type !== undefined ? input.action_type : existing.action_type;
  const nextActionValue =
    input.action_value !== undefined ? input.action_value.trim() : existing.action_value;
  const nextEnabled =
    typeof input.is_enabled === 'boolean' ? input.is_enabled : existing.is_enabled;

  db.prepare(
    `UPDATE skills_config
     SET display_name = ?, description = ?, trigger_phrases = ?, action_type = ?, action_value = ?, is_enabled = ?
     WHERE id = ? AND is_custom = 1`
  ).run(
    nextDisplayName,
    nextDescription || 'Custom user command',
    JSON.stringify(nextTriggers),
    nextActionType,
    nextActionValue,
    nextEnabled ? 1 : 0,
    id
  );
  return getSkillById(id);
}

export function deleteSkill(id: number): void {
  db.prepare('DELETE FROM skills_config WHERE id = ? AND is_custom = 1').run(id);
}

export function getMemories(): MemoryRecord[] {
  return db
    .prepare('SELECT id, category, key, value, source, confidence, created_at, updated_at FROM memories WHERE is_deleted = 0 ORDER BY id DESC')
    .all() as unknown as MemoryRecord[];
}

export function addMemory(input: {
  category: MemoryRecord['category'];
  key?: string | null;
  value: string;
  source?: MemoryRecord['source'];
  confidence?: number;
}): MemoryRecord {
  const existing = db
    .prepare('SELECT id FROM memories WHERE is_deleted = 0 AND LOWER(value) = LOWER(?)')
    .get(input.value.trim()) as { id: number } | undefined;
  if (existing) {
    return db
      .prepare('SELECT id, category, key, value, source, confidence, created_at, updated_at FROM memories WHERE id = ?')
      .get(existing.id) as unknown as MemoryRecord;
  }
  const res = db
    .prepare(
      `INSERT INTO memories (category, key, value, source, confidence) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.category,
      input.key ?? null,
      input.value.trim(),
      input.source ?? 'user_stated',
      input.confidence ?? 1.0
    );
  return db
    .prepare('SELECT id, category, key, value, source, confidence, created_at, updated_at FROM memories WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as unknown as MemoryRecord;
}

export function deleteMemory(id: number): void {
  db.prepare('UPDATE memories SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function clearAllMemories(): void {
  db.prepare('UPDATE memories SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP').run();
}

export function getNotes(): NoteRecord[] {
  const rows = db.prepare('SELECT * FROM notes ORDER BY id DESC').all() as Array<{
    id: number;
    title: string | null;
    content: string;
    tags: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({ ...r, tags: safeParseArray(r.tags) }));
}

export function addNote(title: string | null, content: string, tags: string[] = []): NoteRecord {
  const res = db
    .prepare('INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)')
    .run(title?.trim() || 'Quick Note', content.trim(), JSON.stringify(tags));
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(res.lastInsertRowid)) as {
    id: number;
    title: string | null;
    content: string;
    tags: string;
    created_at: string;
    updated_at: string;
  };
  return { ...row, tags: safeParseArray(row.tags) };
}

export function deleteNote(id: number): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}

export function getReminders(): ReminderRecord[] {
  const rows = db.prepare('SELECT * FROM reminders ORDER BY is_done ASC, id DESC').all() as Array<{
    id: number;
    title: string;
    remind_at: string;
    is_done: number;
    created_at: string;
  }>;
  return rows.map((r) => ({ ...r, is_done: r.is_done === 1 }));
}

export function addReminder(title: string, remind_at: string): ReminderRecord {
  const res = db
    .prepare('INSERT INTO reminders (title, remind_at, is_done) VALUES (?, ?, 0)')
    .run(title.trim(), remind_at.trim());
  const row = db
    .prepare('SELECT * FROM reminders WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as {
    id: number;
    title: string;
    remind_at: string;
    is_done: number;
    created_at: string;
  };
  return { ...row, is_done: row.is_done === 1 };
}

export function toggleReminder(id: number, is_done: boolean): void {
  db.prepare('UPDATE reminders SET is_done = ? WHERE id = ?').run(is_done ? 1 : 0, id);
}

export function deleteReminder(id: number): void {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

export function saveConversationTurn(turn: {
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  language: 'en' | 'ur';
  emotion?: FacialEmotion;
  modelUsed?: string;
  providerUsed?: string;
  thinkingUsed?: boolean;
  skillExecuted?: string;
}): ChatMessage {
  const res = db
    .prepare(
      `INSERT INTO conversations (session_id, role, content, language, emotion, model_used, provider_used, thinking_used, skill_executed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      turn.sessionId,
      turn.role,
      turn.content,
      turn.language,
      turn.emotion ?? 'calm',
      turn.modelUsed ?? null,
      turn.providerUsed ?? null,
      turn.thinkingUsed ? 1 : 0,
      turn.skillExecuted ?? null
    );
  const row = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return mapConversationRow(row);
}

export function getConversationMessages(sessionId: string): ChatMessage[] {
  const rows = db
    .prepare('SELECT * FROM conversations WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(mapConversationRow);
}

export function getRecentUserMessages(limit: number = 15): string[] {
  const rows = db
    .prepare("SELECT content FROM conversations WHERE role = 'user' ORDER BY id DESC LIMIT ?")
    .all(limit) as Array<{ content: string }>;
  return rows.map((r) => r.content);
}

export function getTotalUserTurnsCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM conversations WHERE role = 'user'")
    .get() as { c: number } | undefined;
  return Number(row?.c || 0);
}

export function getRecentConversationsForExport(limit: number = 250): Array<{
  session_id: string;
  role: string;
  content: string;
  language: string;
  timestamp: string;
}> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.trunc(limit))) : 250;
  const rows = db
    .prepare(
      'SELECT session_id, role, content, language, timestamp FROM conversations ORDER BY id DESC LIMIT ?'
    )
    .all(safeLimit) as Array<Record<string, unknown>>;

  return rows.reverse().map((row) => ({
    session_id: String(row.session_id ?? ''),
    role: String(row.role ?? ''),
    content: String(row.content ?? ''),
    language: String(row.language ?? 'en'),
    timestamp: String(row.timestamp ?? ''),
  }));
}

export function getSessionSummaries(): SessionSummary[] {
  const rows = db
    .prepare(
      `SELECT
        session_id,
        MIN(timestamp) as started_at,
        MAX(timestamp) as last_message_at,
        COUNT(*) as message_count,
        (SELECT content FROM conversations c2 WHERE c2.session_id = c1.session_id ORDER BY c2.id ASC LIMIT 1) as preview,
        (SELECT language FROM conversations c3 WHERE c3.session_id = c1.session_id ORDER BY c3.id DESC LIMIT 1) as primary_language
      FROM conversations c1
      GROUP BY session_id
      ORDER BY MAX(id) DESC`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    session_id: String(r.session_id),
    started_at: String(r.started_at),
    last_message_at: String(r.last_message_at),
    message_count: Number(r.message_count),
    preview: String(r.preview ?? ''),
    primary_language: r.primary_language === 'ur' ? 'ur' : 'en',
  }));
}

export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
}

function mapConversationRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content),
    language: row.language === 'ur' ? 'ur' : 'en',
    emotion: (row.emotion as FacialEmotion) || 'calm',
    timestamp: String(row.timestamp),
    modelUsed: row.model_used ? String(row.model_used) : undefined,
    providerUsed: row.provider_used ? String(row.provider_used) : undefined,
    thinkingUsed: Number(row.thinking_used) === 1,
    skillExecuted: row.skill_executed ? String(row.skill_executed) : undefined,
  };
}

function mapVoiceLogRow(row: Record<string, unknown>): VoiceCommandLog {
  const rawStatus = String(row.status ?? 'matched');
  const status: VoiceCommandStatus =
    rawStatus === 'failed' || rawStatus === 'ai_fallback' ? rawStatus : 'matched';
  const rawSource = String(row.source ?? 'microphone');
  const source: VoiceCommandSource = rawSource === 'retrigger' ? 'retrigger' : 'microphone';
  return {
    id: Number(row.id),
    transcript: String(row.transcript ?? ''),
    matched_skill_name: row.matched_skill_name ? String(row.matched_skill_name) : null,
    matched_display_name: row.matched_display_name ? String(row.matched_display_name) : null,
    action_type: row.action_type
      ? (String(row.action_type) as VoiceCommandLog['action_type'])
      : null,
    status,
    response_summary: String(row.response_summary ?? ''),
    source,
    language: row.language === 'ur' ? 'ur' : 'en',
    volume_level: normalizeVoiceVolume(row.volume_level, 0.5),
    created_at: String(row.created_at ?? ''),
  };
}

export function getVoiceLogs(limit: number = 100): VoiceCommandLog[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100;
  const rows = db
    .prepare('SELECT * FROM voice_command_logs ORDER BY id DESC LIMIT ?')
    .all(safeLimit) as Array<Record<string, unknown>>;
  return rows.map(mapVoiceLogRow);
}

export function addVoiceLog(input: {
  transcript: string;
  matched_skill_name?: string | null;
  matched_display_name?: string | null;
  action_type?: VoiceCommandLog['action_type'];
  status: VoiceCommandStatus;
  response_summary?: string;
  source?: VoiceCommandSource;
  language?: 'en' | 'ur';
  volume_level?: number;
}): VoiceCommandLog {
  const volumeLevel = normalizeVoiceVolume(input.volume_level, 0.5);
  const res = db
    .prepare(
      `INSERT INTO voice_command_logs (
        transcript, matched_skill_name, matched_display_name, action_type, status, response_summary, source, language, volume_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.transcript.trim().slice(0, 1000),
      input.matched_skill_name?.trim() || null,
      input.matched_display_name?.trim() || null,
      input.action_type || null,
      input.status,
      (input.response_summary ?? '').trim().slice(0, 320),
      input.source === 'retrigger' ? 'retrigger' : 'microphone',
      input.language === 'ur' ? 'ur' : 'en',
      volumeLevel
    );
  const row = db
    .prepare('SELECT * FROM voice_command_logs WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
  return mapVoiceLogRow(row);
}

export function deleteVoiceLog(id: number): void {
  db.prepare('DELETE FROM voice_command_logs WHERE id = ?').run(id);
}

export function clearVoiceLogs(): void {
  db.prepare('DELETE FROM voice_command_logs').run();
}

function safeParseArray(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
