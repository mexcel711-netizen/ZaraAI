import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultHeartState } from './heartAndBrain';
import {
  applyVoiceIntonationToPlayback,
  computeSentencePitchCurveCents,
  resolveVoiceSpeechParameters,
} from './voiceEmotionManager';

test('resolveVoiceSpeechParameters produces distinct pitch, cadence, and pauses across emotions', () => {
  const heart = createDefaultHeartState();
  const sad = resolveVoiceSpeechParameters({ emotion: 'sad', heart });
  const love = resolveVoiceSpeechParameters({ emotion: 'love', heart });
  const excited = resolveVoiceSpeechParameters({ emotion: 'excited', heart });
  const curious = resolveVoiceSpeechParameters({ emotion: 'curious', heart });

  assert.ok(sad.pitchShiftCents < love.pitchShiftCents);
  assert.ok(love.pitchShiftCents < excited.pitchShiftCents);
  assert.ok(sad.cadenceMultiplier < excited.cadenceMultiplier);
  assert.ok(sad.pauseMsBetweenChunks > excited.pauseMsBetweenChunks);
  assert.equal(curious.intonationContour, 'rising');
  assert.equal(love.intonationContour, 'warm-arc');
  assert.equal(sad.intonationContour, 'gentle-fall');
});

test('HeartState warmth and fatigue energy shift EQ warmth and pause cadence safely', () => {
  const calmHeart = { ...createDefaultHeartState(), warmth: 70, energy: 75, heartbeatBpm: 72 };
  const tiredTenderHeart = {
    ...createDefaultHeartState(),
    warmth: 94,
    affection: 90,
    energy: 30,
    heartbeatBpm: 66,
  };

  const baseline = resolveVoiceSpeechParameters({ emotion: 'empathetic', heart: calmHeart });
  const tired = resolveVoiceSpeechParameters({ emotion: 'empathetic', heart: tiredTenderHeart });

  assert.ok(tired.warmthGainDb > baseline.warmthGainDb);
  assert.ok(tired.pauseMsBetweenChunks > baseline.pauseMsBetweenChunks);
  assert.ok(tired.cadenceMultiplier < baseline.cadenceMultiplier);
});

test('moodIntensity scales modulation cleanly while preserving strict playback bounds', () => {
  const heart = { ...createDefaultHeartState(), heartbeatBpm: 112, energy: 95 };
  const gentle = resolveVoiceSpeechParameters({ emotion: 'excited', heart, moodIntensity: 0.5 });
  const intense = resolveVoiceSpeechParameters({ emotion: 'excited', heart, moodIntensity: 2.0 });

  assert.ok(intense.pitchShiftCents >= gentle.pitchShiftCents);
  assert.ok(intense.pitchShiftCents <= 140);
  assert.ok(intense.cadenceMultiplier <= 1.18);

  const playback = applyVoiceIntonationToPlayback({
    baseSpeed: 1.5,
    baseVolume: 1.45,
    profile: intense,
  });
  assert.ok(playback.effectiveSpeed <= 1.6 && playback.effectiveSpeed >= 0.65);
  assert.ok(playback.effectiveVolume <= 1.5 && playback.effectiveVolume >= 0.05);
});

test('computeSentencePitchCurveCents follows rising vs gentle-fall phrase contours', () => {
  const heart = createDefaultHeartState();
  const curious = resolveVoiceSpeechParameters({ emotion: 'curious', heart });
  const sad = resolveVoiceSpeechParameters({ emotion: 'sad', heart });

  assert.ok(
    computeSentencePitchCurveCents(curious, 0.95) > computeSentencePitchCurveCents(curious, 0.05)
  );
  assert.ok(
    computeSentencePitchCurveCents(sad, 0.95) < computeSentencePitchCurveCents(sad, 0.05)
  );
});
