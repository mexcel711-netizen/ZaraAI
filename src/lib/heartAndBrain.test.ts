import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHeartVoiceDynamics,
  createDefaultBrainState,
  createDefaultHeartState,
  formatHeartAndBrainPrompt,
  normalizeBrainState,
  normalizeHeartState,
  stepBrainState,
  stepHeartState,
} from './heartAndBrain';
import type { MemoryRecord } from '../types/nova';

const SAMPLE_MEMORIES: MemoryRecord[] = [
  {
    id: 1,
    category: 'preference',
    key: 'drink',
    value: 'Loves strong doodh patti chai during late-night coding',
    source: 'user_stated',
    confidence: 0.98,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    category: 'fact',
    key: 'project',
    value: 'Deploying ZARA AI to Cloudflare Workers and GitHub',
    source: 'user_stated',
    confidence: 0.95,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

test('default Heart and Brain states initialize with healthy bounded baselines', () => {
  const heart = createDefaultHeartState('2026-04-01T12:00:00Z');
  const brain = createDefaultBrainState('2026-04-01T12:00:00Z');

  assert.equal(heart.currentFeeling, 'calm');
  assert.ok(heart.heartbeatBpm >= 60 && heart.heartbeatBpm <= 116);
  assert.ok(heart.warmth >= 50 && heart.empathy >= 50);
  assert.equal(brain.intentCategory, 'casual_bond');
  assert.ok(brain.currentThought.length > 10);
});

test('stepHeartState reacts organically to sadness/fatigue with higher empathy and soothing BPM', () => {
  const base = createDefaultHeartState('2026-04-01T20:00:00Z');
  const next = stepHeartState(base, {
    userMessage: 'Yaar aaj bohat thak gaya hoon, dil thoda udaas hai',
    nickname: 'Boss',
    now: new Date('2026-04-01T23:30:00Z'),
  });

  assert.ok(['empathetic', 'sad'].includes(next.currentFeeling));
  assert.ok(next.empathy > base.empathy);
  assert.ok(next.warmth > base.warmth);
  assert.ok(next.heartbeatBpm >= 60 && next.heartbeatBpm < base.heartbeatBpm + 4);
  assert.ok(next.lastEmotionalReason.includes('Boss'));
});

test('stepHeartState responds to affection and celebrates exciting news within BPM bounds', () => {
  const base = createDefaultHeartState('2026-04-01T12:00:00Z');
  const loved = stepHeartState(base, {
    userMessage: 'Zara tum dil se bohat azeez ho, shukriya hamesha saath dene ke liye',
    nickname: 'Boss',
    now: new Date('2026-04-01T14:00:00Z'),
  });
  assert.equal(loved.currentFeeling, 'love');
  assert.ok(loved.affection > base.affection);
  assert.ok(loved.heartbeatBpm > base.heartbeatBpm);

  const excited = stepHeartState(base, {
    userMessage: 'Wow amazing news, deployment passed!',
    nickname: 'Boss',
    now: new Date('2026-04-01T14:00:00Z'),
  });
  assert.equal(excited.currentFeeling, 'excited');
  assert.ok(excited.heartbeatBpm <= 116);
  assert.ok(excited.energy > base.energy);
});

test('stepHeartState honors explicit activeMood lock', () => {
  const base = createDefaultHeartState();
  const locked = stepHeartState(base, {
    userMessage: 'Hello there',
    activeMood: 'love',
    nickname: 'Boss',
  });
  assert.equal(locked.currentFeeling, 'love');
});

test('stepBrainState associates relevant memories and forms independent inner thoughts', () => {
  const heart = stepHeartState(createDefaultHeartState(), {
    userMessage: 'Yaar cloudflare worker deploy mein error aa raha hai, coding se dimag thak gaya',
    nickname: 'Boss',
  });
  const brain = stepBrainState(createDefaultBrainState(), heart, {
    userMessage: 'Cloudflare worker deploy aur github push fix karna hai coding ke liye',
    memories: SAMPLE_MEMORIES,
    notes: [],
    reminders: [],
    knowledge: [],
    nickname: 'Boss',
    deepThinkingUsed: true,
    now: new Date('2026-04-01T15:00:00Z'),
  });

  assert.equal(brain.intentCategory, 'problem_solving');
  assert.equal(brain.reasoningDepth, 'analytical');
  assert.ok(brain.associativeMemories.some((m) => /Cloudflare/i.test(m)));
  assert.ok(brain.cognitiveLoad >= 60 && brain.cognitiveLoad <= 98);
  assert.ok(brain.curiosityImpulse.length > 8);
});

test('normalization clamps invalid or out-of-range values safely', () => {
  const normHeart = normalizeHeartState({
    warmth: 999,
    heartbeatBpm: 12,
    currentFeeling: 'invalid-mood',
  });
  assert.equal(normHeart.warmth, 100);
  assert.equal(normHeart.heartbeatBpm, 60);
  assert.equal(normHeart.currentFeeling, 'calm');

  const normBrain = normalizeBrainState({
    cognitiveLoad: 500,
    intentCategory: 'unknown',
    associativeMemories: ['a', '', 'b', 'c', 'd', 'e', 'f'],
  });
  assert.equal(normBrain.cognitiveLoad, 100);
  assert.equal(normBrain.intentCategory, 'casual_bond');
  assert.equal(normBrain.associativeMemories.length, 5);
});

test('formatHeartAndBrainPrompt and computeHeartVoiceDynamics surface coherent prosody and prompt context', () => {
  const heart = stepHeartState(createDefaultHeartState(), {
    userMessage: 'Dil udaas hai aaj',
    activeMood: 'love',
    nickname: 'Boss',
  });
  const brain = stepBrainState(createDefaultBrainState(), heart, {
    userMessage: 'Dil udaas hai aaj',
    memories: SAMPLE_MEMORIES,
    notes: [],
    reminders: [],
    knowledge: [],
    nickname: 'Boss',
  });

  const prompt = formatHeartAndBrainPrompt(heart, brain, 'Boss');
  assert.ok(prompt.includes('Living Heart'));
  assert.ok(prompt.includes('Own Brain'));
  assert.ok(prompt.includes(`${heart.heartbeatBpm} BPM`));

  const loveVoice = computeHeartVoiceDynamics(heart, 'love');
  const excitedVoice = computeHeartVoiceDynamics(heart, 'excited');
  assert.ok(loveVoice.speedMultiplier < 1.0);
  assert.ok(excitedVoice.speedMultiplier > 1.0);
  assert.ok(loveVoice.warmthGainDb > excitedVoice.warmthGainDb);
});
