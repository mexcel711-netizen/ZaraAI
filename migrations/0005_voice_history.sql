-- Voice Command History logs for recognized voice commands, execution status, and 1-click re-triggering.
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_command_logs_created ON voice_command_logs(created_at DESC, id DESC);
