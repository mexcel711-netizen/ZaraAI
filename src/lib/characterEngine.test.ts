import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBondLevel,
  computeEvolutionProgress,
  resolveCharacterSwitchCommand,
  resolveMoodSwitchCommand,
} from './characterEngine';
import type { CharacterProfile } from '../types/nova';

const sampleChar: CharacterProfile = {
  id: 1,
  slug: 'nova',
  name: 'NOVA',
  role_title: 'Executive Bilingual Companion',
  bio: 'Poised Pakistani companion',
  personality: 'friendly_professional',
  default_mood: 'calm',
  tts_voice: 'Kore',
  system_prompt: 'You are NOVA.',
  learned_traits: [],
  life_journal: [],
  bond_level: 1,
  xp: 80,
  is_active: true,
  is_custom: false,
  created_at: '2026-11-18T00:00:00Z',
  updated_at: '2026-11-18T00:00:00Z',
};

test('computeBondLevel increments cleanly every 100 XP', () => {
  assert.equal(computeBondLevel(0), 1);
  assert.equal(computeBondLevel(99), 1);
  assert.equal(computeBondLevel(100), 2);
  assert.equal(computeBondLevel(250), 3);
});

test('computeEvolutionProgress develops new traits and levels up organically', () => {
  const outcome = computeEvolutionProgress({
    character: sampleChar,
    xpGain: 30,
    recentUserMessages: [
      'I want to build a Python software app and read this book in Urdu',
      'Give me a daily briefing please',
    ],
    memories: [],
    knowledge: [],
  });

  assert.equal(outcome.nextXp, 110);
  assert.equal(outcome.nextBondLevel, 2);
  assert.equal(outcome.leveledUp, true);
  assert.ok(outcome.newTraits.includes('Technical Builder & Software Architect'));
  assert.ok(outcome.newTraits.includes('Patient Book & Course Mentor'));
  assert.ok(outcome.suggestedSkill?.display_name === 'Morning Briefing Mode');
});

test('resolveMoodSwitchCommand parses love, sad, happy, calm, surprised in Urdu & English', () => {
  assert.equal(resolveMoodSwitchCommand('Love mode on karo'), 'love');
  assert.equal(resolveMoodSwitchCommand('لو موڈ آن کرو'), 'love');
  assert.equal(resolveMoodSwitchCommand('switch to sad mood'), 'sad');
  assert.equal(resolveMoodSwitchCommand('ہیپی موڈ'), 'happy');
  assert.equal(resolveMoodSwitchCommand('calm mode'), 'calm');
  assert.equal(resolveMoodSwitchCommand('auto mood'), 'auto');
});

test('resolveCharacterSwitchCommand matches selectable characters cleanly', () => {
  const roster = [
    { slug: 'nova', name: 'NOVA' },
    { slug: 'zara', name: 'ZARA' },
    { slug: 'ayesha', name: 'AYESHA' },
  ];
  assert.equal(resolveCharacterSwitchCommand('Switch to Zara', roster)?.slug, 'zara');
  assert.equal(resolveCharacterSwitchCommand('Ayesha se baat karni hai', roster)?.slug, 'ayesha');
  assert.equal(resolveCharacterSwitchCommand('Hello how are you', roster), null);
});

test('computeEvolutionProgress triggers 5-turn Meta-Growth calibration and unlocks warmth trait', () => {
  const outcome5 = computeEvolutionProgress({
    character: { ...sampleChar, xp: 10, bond_level: 1 },
    xpGain: 15,
    recentUserMessages: ['React hooks state fix kar rahe hain'],
    memories: [],
    knowledge: [],
    totalUserInteractions: 5,
    nickname: 'Boss',
  });

  assert.equal(outcome5.metaGrowthTriggered, true);
  assert.ok(outcome5.newTraits.includes('Warmth & Support Meta-Calibrated'));
  assert.ok(outcome5.journalEntry.includes('Meta-Growth #5'));

  const outcome4 = computeEvolutionProgress({
    character: { ...sampleChar, xp: 10, bond_level: 1 },
    xpGain: 15,
    recentUserMessages: ['Hello'],
    memories: [],
    knowledge: [],
    totalUserInteractions: 4,
    nickname: 'Boss',
  });
  assert.equal(outcome4.metaGrowthTriggered, false);
  assert.equal(outcome4.newTraits.includes('Warmth & Support Meta-Calibrated'), false);
});

