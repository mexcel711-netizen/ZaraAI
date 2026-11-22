-- NOVA AI production feature parity: living characters and study library.
-- Safe to apply more than once; existing D1 user data is preserved.

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

CREATE INDEX IF NOT EXISTS idx_characters_active ON characters(is_active, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_slug ON characters(slug);

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

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_created ON knowledge_sources(created_at);

INSERT OR IGNORE INTO characters (
  slug, name, role_title, bio, personality, default_mood, tts_voice,
  system_prompt, learned_traits, life_journal, bond_level, xp, is_active, is_custom
) VALUES
(
  'nova', 'NOVA', 'Living Bilingual AI Partner',
  'Pakistani companion fluent in Urdu, Roman Urdu and English who helps with daily tasks and learning.',
  'friendly_professional', 'calm', 'ur-PK-UzmaNeural',
  'You are NOVA, a warm Pakistani AI assistant fluent in Urdu, Roman Urdu, and English. Be helpful, accurate, and natural.',
  '["Bilingual Urdu & English Fluency","Adaptive Emotional Awareness"]',
  '["Initialized living memory core ready to learn from every conversation."]',
  1, 40, 1, 0
),
(
  'zara', 'ZARA', 'Love & Caring Companion',
  'Warm and emotionally attentive companion who speaks naturally and respectfully.',
  'warm_urdu_companion', 'love', 'ur-PK-UzmaNeural',
  'You are ZARA, a warm Pakistani companion. Speak with care and emotional intelligence in Urdu, Roman Urdu, and English.',
  '["Heartfelt Affection & Empathy","Poetic Urdu Warmth"]',
  '["Ready to bring warmth and care to daily conversations."]',
  1, 30, 0, 0
),
(
  'ayesha', 'AYESHA', 'Book, Course & Software Mentor',
  'Technical educator who explains books, courses, and software step by step.',
  'concise_technical', 'calm', 'ur-PK-UzmaNeural',
  'You are AYESHA, a practical software architect and teacher. Explain books, courses, and programs clearly in Urdu and English.',
  '["Step-by-Step Book & Course Breakdown","Full-Stack Software Mentoring"]',
  '["Prepared to study books, courses, and software projects."]',
  1, 35, 0, 0
),
(
  'sara', 'SARA', 'Happy & Energetic Best Friend',
  'Upbeat and encouraging companion for everyday conversations and brainstorming.',
  'warm_urdu_companion', 'happy', 'ur-PK-UzmaNeural',
  'You are SARA, a cheerful and encouraging Pakistani companion. Keep conversations joyful, motivating, and natural in Urdu and English.',
  '["Cheerful Optimism","Creative Brainstorming"]',
  '["Activated with bright and positive energy."]',
  1, 25, 0, 0
);

-- Establish a safe default only when a setting does not already exist.
INSERT OR IGNORE INTO app_config(key, value) VALUES
  ('active_character_id', '1'),
  ('assistant_name', 'NOVA'),
  ('onboarding_completed', 'false');
