CREATE TABLE IF NOT EXISTS conversations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
 language TEXT DEFAULT 'en', emotion TEXT DEFAULT 'calm', model_used TEXT, provider_used TEXT,
 thinking_used INTEGER DEFAULT 0, skill_executed TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, is_archived INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
CREATE TABLE IF NOT EXISTS memories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, key TEXT, value TEXT NOT NULL,
 source TEXT DEFAULT 'user_stated', confidence REAL DEFAULT 1.0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, is_deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE TABLE IF NOT EXISTS skills_config (
 id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 description TEXT NOT NULL, trigger_phrases TEXT NOT NULL, action_type TEXT NOT NULL, action_value TEXT,
 is_enabled INTEGER DEFAULT 1, is_custom INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reminders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, remind_at TEXT NOT NULL,
 is_done INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT NOT NULL, tags TEXT DEFAULT '[]',
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO app_config(key,value) VALUES
 ('assistant_name','NOVA'),('personality','friendly_professional'),
 ('custom_prompt','You are NOVA, a warm Pakistani female AI assistant fluent in Urdu, Roman Urdu and English.'),
 ('language','bilingual'),('response_tone','casual'),('tts_voice','ur-PK-UzmaNeural'),
 ('voice_speed','1'),('voice_volume','1'),('stt_model','base'),
 ('wake_word','hey nova'),('wake_word_enabled','false'),('auto_speak','true'),
 ('deep_thinking_mode','auto'),('default_model','gemini-4-hydrogen'),('ai_provider','auto');

INSERT OR IGNORE INTO skills_config(skill_name,display_name,description,trigger_phrases,action_type,action_value) VALUES
 ('app_launcher','App & Web Launcher','Opens known websites from commands.','["open","launch","start","kholo"]','launch','browser_launcher'),
 ('web_search','Web Search','Prepares a web search.','["search","google","look up","dhundo"]','url','https://www.google.com/search?q='),
 ('notes_manager','Quick Notes','Creates persistent notes.','["create note","take note","note:","note likho"]','note','notes_table'),
 ('reminders_manager','Smart Reminders','Creates reminders.','["remind me","yaad dilao","reminder lagao"]','reminder','reminders_table'),
 ('calculator','Precision Calculator','Evaluates arithmetic safely.','["calculate","compute","hisaab","kitna hota hai"]','calc','math_eval'),
 ('time_date','Clock & Calendar','Reports local time and date.','["what time","current time","waqt","tareekh"]','system','clock'),
 ('system_control','Audio & Display Control','Handles local audio commands.','["volume up","volume down","mute","unmute","awaaz"]','system','audio_control'),
 ('document_drafter','Bilingual Document Drafter','Drafts bilingual documents with AI.','["draft email","write document","email likho"]','ai','gemini-4-carbon');

INSERT OR IGNORE INTO notes(title,content,tags)
SELECT 'NOVA Quick Commands','Try: Chrome kholo, create note: review project, remind me to call Ali at 6pm, or ask a calculation.','["guide","bilingual"]'
WHERE NOT EXISTS (SELECT 1 FROM notes);
