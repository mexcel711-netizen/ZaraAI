-- Upgrade empty or broken legacy voices without overwriting customized user selections.
-- Safe to re-run: preserves user-selected voices like Zephyr, Kore, Asad, or Uzma.

UPDATE app_config
SET value = 'ur-PK-UzmaNeural', updated_at = CURRENT_TIMESTAMP
WHERE key = 'tts_voice'
  AND (TRIM(value) = '' OR value = 'en-US-AndrewNeural');

INSERT OR IGNORE INTO app_config(key, value)
VALUES ('tts_voice', 'ur-PK-UzmaNeural');

UPDATE characters
SET tts_voice = 'ur-PK-UzmaNeural', updated_at = CURRENT_TIMESTAMP
WHERE tts_voice IS NULL
   OR TRIM(tts_voice) = ''
   OR tts_voice = 'en-US-AndrewNeural';
