import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_API_VERSION,
  buildGeminiTtsAttempts,
  buildNaturalPacedSsmlText,
  buildQuickUrduPhoneticScript,
  computeMoodAnimationParams,
  detectEmotionFromText,
  ensureWavPlayableBase64,
  extractEmotionAndCleanText,
  formatExpressiveSpeechPrompt,
  getHumanEdgeProsody,
  isRomanUrduText,
  normalizeMoodIntensity,
  prepareTextForNaturalSpeech,
  resolveActiveAiProvider,
  resolveAvatarGlowColor,
  resolveAvatarMoodKey,
  resolveEmotionPresetConfig,
  splitSpeechChunks,
} from './emotionAndSpeech';

test('extractEmotionAndCleanText strips explicit emotion tags and detects fallback emotions', () => {
  const tagged = extractEmotionAndCleanText('[emotion:surprised] Wah! Ye toh kamaal ho gaya!');
  assert.equal(tagged.emotion, 'surprised');
  assert.equal(tagged.cleanText, 'Wah! Ye toh kamaal ho gaya!');

  assert.equal(detectEmotionFromText('Assalamualaikum! Khushi hui aapse baat kar ke.'), 'happy');
  assert.equal(detectEmotionFromText('Mujhe afsos hai, ye task complete nahi ho saka.'), 'sad');
  assert.equal(detectEmotionFromText('Really?! That is unbelievable!'), 'surprised');
  assert.equal(detectEmotionFromText('The current time is 09:30 AM.'), 'calm');
  assert.equal(extractEmotionAndCleanText('[emotion:empathetic] I understand.').emotion, 'empathetic');
  assert.equal(extractEmotionAndCleanText('[emotion:curious] Tell me more.').emotion, 'curious');
  assert.equal(detectEmotionFromText('I am so excited, fantastic news!'), 'excited');
  assert.equal(detectEmotionFromText('Let me think about this carefully.'), 'thoughtful');
  assert.equal(detectEmotionFromText('Absolutely, you can count on me.'), 'confident');
  assert.equal(detectEmotionFromText('That is unacceptable.'), 'angry');
  assert.equal(detectEmotionFromText('Mujhe aapse bohat pyaar aur mohabbat hai, jaan.'), 'love');
  assert.equal(extractEmotionAndCleanText('[emotion:love] Always here for you with warmth.').emotion, 'love');
});

test('splitSpeechChunks splits bilingual Urdu and English text cleanly on sentence boundaries', () => {
  const input =
    'السلام علیکم! میں نووا ہوں۔ آج موسم بہت خوشگوار ہے، اور میں آپ کے تمام کاموں میں مدد کے لیے تیار ہوں۔ Let me know what you need next.';
  const chunks = splitSpeechChunks(input, 90);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((c) => c.length <= 90));
});

test('formatExpressiveSpeechPrompt embeds breathing pauses and Pakistani Urdu style direction', () => {
  const res = formatExpressiveSpeechPrompt(
    'Assalamualaikum! Mein NOVA hun. Aaj kya kaam karna hai?',
    'happy'
  );
  assert.ok(res.textWithBreaths.includes('<breath>'));
  assert.ok(/pakistani/i.test(res.styleInstruction));
  assert.ok(/urdu/i.test(res.styleInstruction));
});

test('resolveActiveAiProvider prioritizes Cloudflare binding automatically on Cloudflare deploy and Google AI Studio locally', () => {
  const onCloudflare = resolveActiveAiProvider({
    preference: 'auto',
    hasCloudflareBinding: true,
    hasCloudflareRest: false,
    hasGoogleAiKey: false,
  });
  assert.equal(onCloudflare.activeProvider, 'cloudflare-binding');
  assert.equal(onCloudflare.cloudflareBindingActive, true);

  const inAiStudio = resolveActiveAiProvider({
    preference: 'auto',
    hasCloudflareBinding: false,
    hasCloudflareRest: false,
    hasGoogleAiKey: true,
  });
  assert.equal(inAiStudio.activeProvider, 'google-ai-studio');

  const cloudflareOverride = resolveActiveAiProvider({
    preference: 'cloudflare',
    hasCloudflareBinding: false,
    hasCloudflareRest: true,
    hasGoogleAiKey: true,
  });
  assert.equal(cloudflareOverride.activeProvider, 'cloudflare-rest');

  const openAiFallback = resolveActiveAiProvider({
    preference: 'auto',
    hasCloudflareBinding: false,
    hasCloudflareRest: false,
    hasGoogleAiKey: false,
    hasOpenAiKey: true,
  });
  assert.equal(openAiFallback.activeProvider, 'openai');
  assert.equal(openAiFallback.openaiConfigured, true);

  const openAiPreferred = resolveActiveAiProvider({
    preference: 'openai',
    hasCloudflareBinding: false,
    hasCloudflareRest: false,
    hasGoogleAiKey: true,
    hasOpenAiKey: true,
  });
  assert.equal(openAiPreferred.activeProvider, 'openai');
});

test('isRomanUrduText identifies Roman Urdu phrases and rejects plain English', () => {
  assert.equal(isRomanUrduText('Arre Boss! Kya chal raha hai? Batao!'), true);
  assert.equal(isRomanUrduText('Raat ko jab sab so jate hain tab baat karte hain'), true);
  assert.equal(isRomanUrduText('Build a TypeScript parser for JSON configuration files.'), false);
});

test('buildQuickUrduPhoneticScript maps common Roman Urdu phrases into Urdu script instantly', () => {
  const res = buildQuickUrduPhoneticScript('Arre Boss! Kya chal raha hai? Batao!');
  assert.equal(res.matched, true);
  assert.ok(/[\u0600-\u06FF]/.test(res.converted));

  const greeting = buildQuickUrduPhoneticScript('Assalam-o-Alaikum Boss! Main ZARA hoon, bilkul tayar hoon.');
  assert.equal(greeting.matched, true);
  assert.ok(greeting.converted.includes('السلام علیکم'));
  assert.ok(greeting.converted.includes('زارا'));

  const chatLine = buildQuickUrduPhoneticScript('Sab theek hai Boss, chai pi li? Kya haal hai?');
  assert.equal(chatLine.matched, true);
  assert.equal(/[a-zA-Z]{2,}/.test(chatLine.converted), false);
});

test('prepareTextForNaturalSpeech and buildNaturalPacedSsmlText produce clean conversational pacing', () => {
  const cleaned = prepareTextForNaturalSpeech('[emotion:happy] **Sunno Boss**, check `https://example.com/path`... theek hai!');
  assert.equal(cleaned.includes('**'), false);
  assert.equal(cleaned.includes('https://'), false);
  assert.ok(cleaned.includes('example.com'));

  const ssml = buildNaturalPacedSsmlText('Arre Boss... chai pi li? Haan, bilkul!');
  assert.ok(ssml.includes('<break time="270ms"/>'));
  assert.ok(ssml.includes('<break time="115ms"/>'));
  assert.ok(ssml.includes('<break time="210ms"/>'));

  assert.equal(getHumanEdgeProsody('love').rate, '-5%');
  assert.equal(getHumanEdgeProsody('happy').pitch, '+2Hz');
});

test('GEMINI_API_VERSION is v1beta and buildGeminiTtsAttempts configures speechConfig and speechMetadata without leaking style text', () => {
  assert.equal(GEMINI_API_VERSION, 'v1beta');

  const { textWithBreaths, styleInstruction } = formatExpressiveSpeechPrompt(
    'السلام علیکم باس! کیا حال ہے؟',
    'happy',
    'female',
    'ur'
  );
  const attempts = buildGeminiTtsAttempts({
    textWithBreaths,
    plainText: 'السلام علیکم باس! کیا حال ہے؟',
    styleInstruction,
    geminiVoice: 'Zephyr',
  });

  assert.equal(attempts.length, 4);
  assert.equal(attempts[0].model, 'gemini-3.8-flash-tts');
  assert.equal(attempts[0].useSpeechMetadata, true);
  assert.equal(attempts[0].part.speechMetadata?.style, styleInstruction);
  assert.equal(attempts[0].speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Zephyr');
  assert.equal(attempts[0].part.text.includes(styleInstruction), false);

  assert.equal(attempts[1].model, 'gemini-3.8-flash-lite-tts');
  assert.equal(attempts[1].useSpeechMetadata, true);
  assert.equal(attempts[2].model, 'gemini-3.8-flash-lite-tts');
  assert.equal(attempts[2].useSpeechMetadata, false);
  assert.equal(attempts[2].part.speechMetadata, undefined);
});

test('resolveAvatarMoodKey prefers explicit active_mood and falls back to live emotion in auto mode', () => {
  assert.equal(resolveAvatarMoodKey('happy', 'calm'), 'happy');
  assert.equal(resolveAvatarMoodKey('empathetic', 'happy'), 'empathetic');
  assert.equal(resolveAvatarMoodKey('love', 'sad'), 'love');
  assert.equal(resolveAvatarMoodKey('auto', 'empathetic'), 'empathetic');
  assert.equal(resolveAvatarMoodKey('auto', 'surprised'), 'surprised');
  assert.equal(resolveAvatarMoodKey(undefined, undefined), 'calm');
});

test('resolveAvatarGlowColor maps happy, empathetic, sad, and love moods to cyan, teal, indigo, and rose', () => {
  assert.equal(resolveAvatarGlowColor('happy', 'calm'), '#22d3ee');
  assert.equal(resolveAvatarGlowColor('empathetic', 'calm'), '#14b8a6');
  assert.equal(resolveAvatarGlowColor('sad', 'calm'), '#6366f1');
  assert.equal(resolveAvatarGlowColor('love', 'calm'), '#f43f5e');
  assert.equal(resolveAvatarGlowColor('auto', 'empathetic'), '#14b8a6');
  assert.equal(resolveAvatarGlowColor('auto', 'sad'), '#6366f1');
});

test('normalizeMoodIntensity clamps to [0.5, 2.0] and handles invalid inputs', () => {
  assert.equal(normalizeMoodIntensity(undefined), 1);
  assert.equal(normalizeMoodIntensity('not-a-number'), 1);
  assert.equal(normalizeMoodIntensity(0.1), 0.5);
  assert.equal(normalizeMoodIntensity(3.5), 2);
  assert.equal(normalizeMoodIntensity('1.45'), 1.45);
});

test('computeMoodAnimationParams scales duration inversely and scales canvas/aura smoothly', () => {
  const baseline = computeMoodAnimationParams(1);
  assert.deepEqual(baseline, {
    intensity: 1,
    durationScale: 1,
    canvasScale: 1,
    auraScale: 1,
  });

  const gentle = computeMoodAnimationParams(0.5);
  assert.equal(gentle.intensity, 0.5);
  assert.equal(gentle.durationScale, 2);
  assert.equal(gentle.canvasScale, 0.96);
  assert.equal(gentle.auraScale, 0.92);

  const intense = computeMoodAnimationParams(2);
  assert.equal(intense.intensity, 2);
  assert.equal(intense.durationScale, 0.5);
  assert.equal(intense.canvasScale, 1.08);
  assert.equal(intense.auraScale, 1.16);
});

test('resolveEmotionPresetConfig adjusts baseColor and animation speed by mood when active, and stays neutral when off', () => {
  const offPreset = resolveEmotionPresetConfig({
    activeMood: 'happy',
    emotion: 'happy',
    moodIntensity: 1,
    presetsEnabled: false,
  });
  assert.equal(offPreset.baseColor, '#081426');
  assert.equal(offPreset.presetSpeedMultiplier, 1);
  assert.equal(offPreset.durationScale, 1);

  const happyPreset = resolveEmotionPresetConfig({
    activeMood: 'happy',
    emotion: 'calm',
    moodIntensity: 1,
    presetsEnabled: true,
  });
  const sadPreset = resolveEmotionPresetConfig({
    activeMood: 'sad',
    emotion: 'calm',
    moodIntensity: 1,
    presetsEnabled: true,
  });
  const lovePreset = resolveEmotionPresetConfig({
    activeMood: 'love',
    emotion: 'calm',
    moodIntensity: 1.5,
    presetsEnabled: true,
  });

  assert.equal(happyPreset.glowColor, '#22d3ee');
  assert.equal(sadPreset.glowColor, '#6366f1');
  assert.equal(lovePreset.glowColor, '#f43f5e');
  assert.notEqual(happyPreset.baseColor, sadPreset.baseColor);
  assert.notEqual(happyPreset.baseColor, lovePreset.baseColor);
  assert.ok(happyPreset.presetSpeedMultiplier > sadPreset.presetSpeedMultiplier);
  assert.ok(happyPreset.durationScale < sadPreset.durationScale);
  assert.ok(lovePreset.effectiveSpeedFactor > 1.5);
});

test('ensureWavPlayableBase64 wraps raw PCM and honors mimeType rate parameter', () => {
  const pcmBytes = new Uint8Array(64);
  const b64 = Buffer.from(pcmBytes).toString('base64');
  const wrapped = ensureWavPlayableBase64(b64, 'audio/L16;codec=pcm;rate=16000');
  assert.equal(wrapped.mimeType, 'audio/wav');
  const wavBuf = Buffer.from(wrapped.audioBase64, 'base64');
  assert.equal(wavBuf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuf.readUInt32LE(24), 16000);
});
