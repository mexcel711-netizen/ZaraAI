-- Persist captured microphone volume level (0.0 - 1.0) on voice command logs for frequency bar visualization.
ALTER TABLE voice_command_logs ADD COLUMN volume_level REAL DEFAULT 0.5;
