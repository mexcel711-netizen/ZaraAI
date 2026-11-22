-- Add user-configurable microphone Voice Activity Sensitivity noise-gate threshold (default 0.065).
INSERT OR IGNORE INTO app_config(key, value)
VALUES ('voice_activity_threshold', '0.065');
