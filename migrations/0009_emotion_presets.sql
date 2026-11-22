-- Add Emotion Presets toggle default without overwriting customized config
INSERT OR IGNORE INTO app_config (key, value) VALUES ('emotion_presets_enabled', 'false');
