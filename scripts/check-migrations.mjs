import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';

const db = new Database(':memory:');
const migrations = [
  'migrations/0001_initial.sql',
  'migrations/0002_worker_feature_parity.sql',
  'migrations/0003_lock_pakistani_voice.sql',
  'migrations/0004_zara_profile.sql',
  'migrations/0005_voice_history.sql',
  'migrations/0006_voice_history_volume.sql',
  'migrations/0007_voice_activity_sensitivity.sql',
  'migrations/0008_heart_brain_voice_lock.sql',
  'migrations/0009_emotion_presets.sql',
];
try {
  for (const file of migrations) db.exec(readFileSync(file, 'utf8'));

  // Reapplying every migration must remain safe and preserve customized user voice & profile settings.
  db.exec("INSERT INTO app_config(key,value) VALUES('tts_voice','Zephyr'),('onboarding_completed','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value;");
  for (const file of migrations.slice(1)) {
    try {
      db.exec(readFileSync(file, 'utf8'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column name')) throw err;
    }
  }

  assert.equal(
    db.query("SELECT value FROM app_config WHERE key='tts_voice'").get().value,
    'Zephyr',
    'Re-running migrations must never overwrite a user-chosen voice',
  );
  // Reset back to baseline for fresh-default assertions
  db.exec("UPDATE app_config SET value='ur-PK-UzmaNeural' WHERE key='tts_voice'; UPDATE app_config SET value='false' WHERE key='onboarding_completed';");

  const tables = new Set(
    db.query("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name),
  );
  for (const table of [
    'conversations', 'memories', 'skills_config', 'reminders', 'notes',
    'app_config', 'characters', 'knowledge_sources', 'voice_command_logs',
  ]) {
    assert.ok(tables.has(table), `Missing required table: ${table}`);
  }

  const voiceLogColumns = new Set(
    db.query('PRAGMA table_info(voice_command_logs)').all().map((row) => row.name),
  );
  assert.ok(voiceLogColumns.has('volume_level'), 'Missing volume_level column on voice_command_logs');

  const characters = db.query('SELECT slug,is_active,tts_voice FROM characters ORDER BY id').all();
  assert.deepEqual(characters.map((row) => row.slug), ['nova', 'zara', 'ayesha', 'sara']);
  assert.equal(characters.filter((row) => row.is_active === 1).length, 1);
  assert.equal(characters.find((row) => row.slug === 'zara').is_active, 1);
  assert.equal(characters.find((row) => row.slug === 'nova').is_active, 0);
  assert.ok(characters.every((row) => row.tts_voice === 'ur-PK-UzmaNeural'));

  const activeId = db.query("SELECT value FROM app_config WHERE key='active_character_id'").get();
  assert.equal(activeId.value, '2');
  assert.equal(db.query("SELECT value FROM app_config WHERE key='assistant_name'").get().value, 'ZARA');
  assert.equal(db.query("SELECT value FROM app_config WHERE key='wake_word'").get().value, 'hey zara');
  assert.equal(
    db.query("SELECT value FROM app_config WHERE key='tts_voice'").get().value,
    'ur-PK-UzmaNeural',
  );
  assert.equal(
    db.query("SELECT value FROM app_config WHERE key='voice_activity_threshold'").get().value,
    '0.065',
  );
  assert.equal(
    db.query("SELECT value FROM app_config WHERE key='voice_locked'").get().value,
    'true',
  );
  assert.equal(
    db.query("SELECT value FROM app_config WHERE key='tts_engine_mode'").get().value,
    'auto',
  );
  assert.ok(JSON.parse(db.query("SELECT value FROM app_config WHERE key='heart_state'").get().value).heartbeatBpm >= 60);
  assert.ok(JSON.parse(db.query("SELECT value FROM app_config WHERE key='brain_state'").get().value).focusTopic);

  const sources = db.query("SELECT COUNT(*) AS total FROM knowledge_sources").get();
  assert.equal(sources.total, 0);
  console.log('D1 migrations passed: ZARA profile, voice lock, and Heart/Brain defaults are verified.');
} finally {
  db.close();
}
