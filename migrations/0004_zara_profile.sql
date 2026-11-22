-- Switch the built-in default assistant identity from the legacy NOVA profile to ZARA
-- only when the user has not yet completed onboarding or customized their assistant.
UPDATE characters SET
  name = 'ZARA Archive',
  role_title = 'Archived Assistant Profile',
  bio = 'Archived original profile retained for continuity; ZARA is the active personal assistant.',
  system_prompt = 'You are ZARA, an archived profile retained for continuity.',
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'nova';

UPDATE characters
SET is_active = 0, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'nova'
  AND COALESCE((SELECT value FROM app_config WHERE key = 'onboarding_completed'), 'false') <> 'true';

UPDATE characters
SET is_active = 1, updated_at = CURRENT_TIMESTAMP
WHERE slug = 'zara'
  AND COALESCE((SELECT value FROM app_config WHERE key = 'onboarding_completed'), 'false') <> 'true'
  AND NOT EXISTS (SELECT 1 FROM characters WHERE is_active = 1 AND slug <> 'nova');

INSERT INTO app_config (key, value, updated_at) VALUES
  ('assistant_name', 'ZARA', CURRENT_TIMESTAMP),
  ('wake_word', 'hey zara', CURRENT_TIMESTAMP),
  ('active_character_id', '2', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP
WHERE COALESCE((SELECT value FROM app_config WHERE key = 'onboarding_completed'), 'false') <> 'true'
  AND (
    app_config.key = 'assistant_name' AND UPPER(app_config.value) = 'NOVA'
    OR app_config.key = 'wake_word' AND LOWER(app_config.value) = 'hey nova'
    OR app_config.key = 'active_character_id' AND app_config.value = '1'
  );
