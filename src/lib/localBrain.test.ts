import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureWavPlayableBase64, formatExpressiveSpeechPrompt } from './emotionAndSpeech';
import { buildLocalConversationalReply } from './localBrain';
import type { AppConfig } from '../types/nova';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    assistant_name: 'ZARA',
    personality: 'warm_urdu_companion',
    custom_prompt: '',
    language: 'bilingual',
    response_tone: 'casual',
    tts_voice: 'ur-PK-UzmaNeural',
    voice_locked: true,
    tts_engine_mode: 'auto',
    voice_speed: 1,
    voice_volume: 1,
    voice_activity_threshold: 0.065,
    stt_model: 'base',
    wake_word: 'hey zara',
    wake_word_enabled: false,
    auto_speak: true,
    deep_thinking_mode: 'auto',
    default_model: 'gemini-4-hydrogen',
    ai_provider: 'auto',
    active_mood: 'auto',
    mood_intensity: 1,
    active_character_id: 2,
    hands_free_mode: false,
    camera_awareness_enabled: false,
    hairstyle: 'wavy',
    user_name: 'Boss',
    user_nickname: 'Boss',
    assistant_age: '21',
    onboarding_completed: true,
    whatsapp_number: '',
    referral_source: '',
    auto_usb_transfer: false,
    last_usb_sync_at: '',
    last_usb_drive_label: '',
    ...overrides,
  };
}

test('ensureWavPlayableBase64 wraps raw PCM in a valid 44-byte RIFF WAV header and keeps complete WAV/MP3 intact', () => {
  // Raw 4-byte PCM sample
  const rawPcm = Buffer.from([0x00, 0x01, 0xff, 0x7f]).toString('base64');
  const wrapped = ensureWavPlayableBase64(rawPcm, 'audio/L16;rate=24000');
  assert.equal(wrapped.mimeType, 'audio/wav');
  const wavBuf = Buffer.from(wrapped.audioBase64, 'base64');
  assert.equal(wavBuf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuf.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wavBuf.length, 48);

  // Already complete RIFF WAV passes through untouched
  const alreadyWav = wavBuf.toString('base64');
  const untouchedWav = ensureWavPlayableBase64(alreadyWav, 'audio/wav');
  assert.equal(untouchedWav.mimeType, 'audio/wav');
  assert.equal(untouchedWav.audioBase64, alreadyWav);

  // MP3 with ID3 header passes through untouched
  const mp3Buf = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
  const untouchedMp3 = ensureWavPlayableBase64(mp3Buf.toString('base64'), 'audio/mpeg');
  assert.equal(untouchedMp3.mimeType, 'audio/mpeg');
  assert.equal(untouchedMp3.audioBase64, mp3Buf.toString('base64'));
});

test('formatExpressiveSpeechPrompt adapts language and gender accurately', () => {
  const enMale = formatExpressiveSpeechPrompt('Hey friend, how is it going?', 'happy', 'male', 'en');
  assert.ok(enMale.styleInstruction.includes('conversational man'));
  assert.ok(enMale.styleInstruction.includes('conversational English'));

  const urFemale = formatExpressiveSpeechPrompt('Kya chal raha hai?', 'curious', 'female', 'ur');
  assert.ok(urFemale.styleInstruction.includes('Pakistani woman'));
  assert.ok(urFemale.styleInstruction.includes('Pakistani Urdu'));
});

test('buildLocalConversationalReply calibrates length, gender grammar, and friend curiosity', () => {
  const shortFemale = buildLocalConversationalReply({
    userMessage: 'Salam',
    config: makeConfig({ tts_voice: 'ur-PK-UzmaNeural' }),
    memories: [],
    notes: [],
    reminders: [],
    knowledge: [],
    extractedMemoriesCount: 0,
  });
  assert.equal(shortFemale.language, 'ur');
  assert.ok(shortFemale.reply.split(/\s+/).length < 32);
  assert.ok(/hmm|arre/i.test(shortFemale.reply));

  const maleCaps = buildLocalConversationalReply({
    userMessage: 'kya kar sakte ho',
    config: makeConfig({ tts_voice: 'ur-PK-AsadNeural' }),
    memories: [],
    notes: [],
    reminders: [],
    knowledge: [],
    extractedMemoriesCount: 0,
  });
  assert.ok(maleCaps.reply.includes('sakta hoon'));

  const briefRemark = buildLocalConversationalReply({
    userMessage: 'Haan bas baitha hoon',
    config: makeConfig({ tts_voice: 'ur-PK-AsadNeural' }),
    memories: [],
    notes: [],
    reminders: [],
    knowledge: [],
    extractedMemoriesCount: 0,
  });
  assert.ok(briefRemark.reply.includes('sun raha hoon'));
});
