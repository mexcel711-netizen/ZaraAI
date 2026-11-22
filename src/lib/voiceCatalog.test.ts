import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEMALE_VOICE_OPTIONS,
  MALE_VOICE_OPTIONS,
  VOICE_ENGINE_OPTIONS,
  getVoiceGender,
  getVoicePreviewSample,
  isExplicitEdgeNeuralVoice,
  isGeminiStudioVoiceId,
  isMaleVoice,
  resolveEdgeVoiceForSelection,
  resolveEffectiveTtsEngine,
  resolveGeminiVoiceForSelection,
  resolveOpenAiVoiceForSelection,
} from './voiceCatalog';

test('voice catalog provides both female and male realistic neural options', () => {
  assert.ok(FEMALE_VOICE_OPTIONS.some((v) => v.id === 'ur-PK-UzmaNeural'));
  assert.ok(FEMALE_VOICE_OPTIONS.some((v) => v.id === 'Zephyr'));
  assert.ok(MALE_VOICE_OPTIONS.some((v) => v.id === 'ur-PK-AsadNeural'));
  assert.ok(MALE_VOICE_OPTIONS.some((v) => v.id === 'Puck'));
  assert.ok(MALE_VOICE_OPTIONS.some((v) => v.id === 'en-US-GuyNeural'));
  // Ensure AndrewNeural (returns empty from Edge TTS) is never listed
  assert.equal(
    MALE_VOICE_OPTIONS.some((v) => v.id === 'en-US-AndrewNeural'),
    false
  );
  assert.equal(VOICE_ENGINE_OPTIONS.length, 4);
});

test('getVoiceGender and isMaleVoice classify female and male voices accurately', () => {
  assert.equal(getVoiceGender('ur-PK-UzmaNeural'), 'female');
  assert.equal(getVoiceGender('Zephyr'), 'female');
  assert.equal(getVoiceGender('Kore'), 'female');
  assert.equal(getVoiceGender('ur-PK-AsadNeural'), 'male');
  assert.equal(getVoiceGender('Puck'), 'male');
  assert.equal(getVoiceGender('Charon'), 'male');
  assert.equal(getVoiceGender('Fenrir'), 'male');
  assert.equal(isMaleVoice('en-US-GuyNeural'), true);
  assert.equal(isMaleVoice('en-US-JennyNeural'), false);
});

test('resolveEdgeVoiceForSelection honors explicit voices and routes Urdu cleanly by gender', () => {
  assert.equal(resolveEdgeVoiceForSelection('ur-PK-UzmaNeural', true, true), 'ur-PK-UzmaNeural');
  assert.equal(resolveEdgeVoiceForSelection('ur-PK-AsadNeural', true, true), 'ur-PK-AsadNeural');
  assert.equal(resolveEdgeVoiceForSelection('Zephyr', true, false), 'ur-PK-UzmaNeural');
  assert.equal(resolveEdgeVoiceForSelection('Puck', true, false), 'ur-PK-AsadNeural');
  assert.equal(resolveEdgeVoiceForSelection('Charon', false, false), 'en-US-ChristopherNeural');
  assert.equal(resolveEdgeVoiceForSelection('en-US-JennyNeural', false, false), 'en-US-JennyNeural');
  // English-only neural voice safely routes Urdu script to Urdu speaker matching gender
  assert.equal(resolveEdgeVoiceForSelection('en-US-GuyNeural', true, true), 'ur-PK-AsadNeural');
  // Legacy broken Andrew voice upgrades seamlessly
  assert.equal(resolveEdgeVoiceForSelection('en-US-AndrewNeural', false, false), 'en-US-GuyNeural');
  assert.equal(isExplicitEdgeNeuralVoice('ur-PK-AsadNeural'), true);
  assert.equal(isExplicitEdgeNeuralVoice('Zephyr'), false);
});

test('resolveGeminiVoiceForSelection maps Edge neural choices to matching Gemini studio speakers', () => {
  assert.equal(resolveGeminiVoiceForSelection('ur-PK-UzmaNeural'), 'Zephyr');
  assert.equal(resolveGeminiVoiceForSelection('ur-PK-AsadNeural'), 'Puck');
  assert.equal(resolveGeminiVoiceForSelection('en-US-ChristopherNeural'), 'Charon');
  assert.equal(resolveGeminiVoiceForSelection('Fenrir'), 'Fenrir');
});

test('resolveEffectiveTtsEngine prioritizes Gemini Studio -> OpenAI -> Edge Neural while keeping speaker gender locked', () => {
  assert.equal(isGeminiStudioVoiceId('Zephyr'), true);
  assert.equal(isGeminiStudioVoiceId('ur-PK-UzmaNeural'), false);
  // Auto uses realistic model voice whenever API key is configured
  assert.equal(resolveEffectiveTtsEngine('Zephyr', 'auto', true, false), 'gemini-studio');
  assert.equal(resolveEffectiveTtsEngine('ur-PK-UzmaNeural', 'auto', true, false), 'gemini-studio');
  assert.equal(resolveEffectiveTtsEngine('ur-PK-UzmaNeural', 'auto', false, true), 'openai-tts');
  assert.equal(resolveEffectiveTtsEngine('ur-PK-UzmaNeural', 'auto', false, false), 'edge-neural');
  // Explicit mode overrides predictably
  assert.equal(resolveEffectiveTtsEngine('ur-PK-UzmaNeural', 'gemini-studio', true, true), 'gemini-studio');
  assert.equal(resolveEffectiveTtsEngine('ur-PK-UzmaNeural', 'openai-tts', true, true), 'openai-tts');
  assert.equal(resolveEffectiveTtsEngine('Zephyr', 'edge-neural', true, true), 'edge-neural');
  // Falls back cleanly when requested key is absent
  assert.equal(resolveEffectiveTtsEngine('Zephyr', 'gemini-studio', false, true), 'openai-tts');
  assert.equal(resolveEffectiveTtsEngine('Zephyr', 'gemini-studio', false, false), 'edge-neural');

  // OpenAI voice persona mapping respects female vs male timbre
  assert.equal(resolveOpenAiVoiceForSelection('ur-PK-UzmaNeural'), 'marin');
  assert.equal(resolveOpenAiVoiceForSelection('Kore'), 'coral');
  assert.equal(resolveOpenAiVoiceForSelection('ur-PK-AsadNeural'), 'ash');
  assert.equal(resolveOpenAiVoiceForSelection('Charon'), 'onyx');
});

test('getVoicePreviewSample adapts grammar and language to selected female or male voice', () => {
  const femaleSample = getVoicePreviewSample('ur-PK-UzmaNeural', 'ZARA', 'Boss');
  assert.equal(femaleSample.language, 'ur');
  assert.ok(femaleSample.text.includes('بات کر رہی ہوں'));

  const maleSample = getVoicePreviewSample('ur-PK-AsadNeural', 'ASAD', 'Boss');
  assert.equal(maleSample.language, 'ur');
  assert.ok(maleSample.text.includes('بات کر رہا ہوں'));

  const englishMale = getVoicePreviewSample('en-US-GuyNeural', 'ATLAS', 'Boss');
  assert.equal(englishMale.language, 'en');
  assert.ok(englishMale.text.includes('ATLAS'));
});
