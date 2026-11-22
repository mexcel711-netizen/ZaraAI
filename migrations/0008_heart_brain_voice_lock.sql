-- Persist voice lock, deterministic TTS engine mode, and ZARA's Living Heart & Own Brain state.
INSERT OR IGNORE INTO app_config(key, value) VALUES
  ('voice_locked', 'true'),
  ('tts_engine_mode', 'auto'),
  ('heart_state', '{"warmth":74,"affection":72,"empathy":78,"energy":76,"trust":68,"heartbeatBpm":74,"currentFeeling":"calm","emotionalMomentum":0.25,"lastEmotionalReason":"Awake and genuinely tuned in to you.","updatedAt":"2026-01-01T00:00:00.000Z"}'),
  ('brain_state', '{"focusTopic":"Daily Life & Companion Presence","currentThought":"Listening closely so I can remember what matters to you.","intentCategory":"companion","reasoningDepth":"intuitive","curiosityImpulse":62,"associativeMemories":[],"cognitiveLoad":28,"lastInsight":"Ready to think alongside you naturally.","updatedAt":"2026-01-01T00:00:00.000Z"}');
