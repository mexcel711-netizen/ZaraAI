import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMemoriesFromUtterance,
  filterMemories,
  isTodayIso,
} from './memoryExtractor';
import type { MemoryRecord } from '../types/nova';

test('extractMemoriesFromUtterance extracts English and Roman Urdu facts', () => {
  const en = extractMemoriesFromUtterance('My name is Inam and I live in Lahore.');
  assert.equal(en.some((m) => m.key === 'user_name' && m.value.includes('Inam')), true);
  assert.equal(en.some((m) => m.key === 'user_location' && m.value.includes('Lahore')), true);

  const compound = extractMemoriesFromUtterance('My name is Inam and calculate 25 * 14');
  assert.equal(compound.find((m) => m.key === 'user_name')?.value, "User's name is Inam");

  const ur = extractMemoriesFromUtterance('Mera naam Sara hai aur mujhe Urdu poetry pasand hai');
  assert.equal(ur.some((m) => m.key === 'user_name' && m.value.includes('Sara')), true);
  assert.equal(
    ur.some((m) => m.category === 'preference' && m.value.includes('Urdu poetry')),
    true
  );

  const goals = extractMemoriesFromUtterance('I am a software engineer and I want to build a voice app.');
  assert.equal(goals.some((m) => m.key === 'user_role' && m.value.includes('software engineer')), true);
  assert.equal(goals.some((m) => m.key === 'user_goal' && m.value.includes('a voice app')), true);

  const habits = extractMemoriesFromUtterance(
    'Mujhe raat ko coding karte hue chai pasand hai aur main React course parh raha hoon.'
  );
  assert.equal(habits.some((m) => m.key === 'daily_habit' && m.value.includes('raat ko')), true);
  assert.equal(habits.some((m) => m.key === 'study_focus' && m.value.includes('React course')), true);
});

test('filterMemories filters by category and search query', () => {
  const sample: MemoryRecord[] = [
    {
      id: 1,
      category: 'fact',
      key: 'user_name',
      value: "User's name is Inam",
      source: 'user_stated',
      confidence: 1,
      created_at: '2026-11-17T10:00:00Z',
      updated_at: '2026-11-17T10:00:00Z',
    },
    {
      id: 2,
      category: 'preference',
      key: 'voice',
      value: 'Prefers Urdu neural voice',
      source: 'user_stated',
      confidence: 0.9,
      created_at: '2026-11-17T10:00:00Z',
      updated_at: '2026-11-17T10:00:00Z',
    },
  ];

  assert.equal(filterMemories(sample, '', 'all').length, 2);
  assert.equal(filterMemories(sample, '', 'preference').length, 1);
  assert.equal(filterMemories(sample, 'Inam', 'all').length, 1);
  assert.equal(filterMemories(sample, 'Inam', 'preference').length, 0);
});

test('isTodayIso accurately identifies same-day timestamps', () => {
  const ref = new Date(2026, 10, 17, 15, 0, 0);
  const sameDay = new Date(2026, 10, 17, 9, 30, 0).toISOString();
  const prevDay = new Date(2026, 10, 16, 23, 59, 0).toISOString();
  assert.equal(isTodayIso(sameDay, ref), true);
  assert.equal(isTodayIso(prevDay, ref), false);
});

test('extractMemoriesFromUtterance handles Urdu script continuous memory statements', () => {
  const urFact = extractMemoriesFromUtterance('میرا نام علی ہے اور میں لاہور میں رہتا ہوں');
  assert.equal(urFact.some((m) => m.key === 'user_name' && m.value.includes('علی')), true);
  assert.equal(urFact.some((m) => m.key === 'user_location' && m.value.includes('لاہور')), true);

  const urExplicit = extractMemoriesFromUtterance('میموری میں محفوظ کرو: کل صبح 9 بجے میٹنگ ہے');
  assert.equal(
    urExplicit.some((m) => m.key === 'remembered_fact' && m.value.includes('میٹنگ')),
    true
  );

  const urPref = extractMemoriesFromUtterance('مجھے سبز چائے پسند ہے');
  assert.equal(urPref.some((m) => m.key === 'user_preference' && m.value.includes('سبز چائے')), true);
});

test('extractMemoriesFromUtterance extracts learning memories in English, Roman Urdu, and Urdu script', () => {
  const enLearn = extractMemoriesFromUtterance(
    'Today I learned how React useEffect cleanup prevents race conditions.'
  );
  assert.equal(
    enLearn.some(
      (m) => m.category === 'learning' && m.value.includes('React useEffect cleanup prevents race conditions')
    ),
    true
  );

  const romanLearn = extractMemoriesFromUtterance('Aaj maine ye seekha ke async await try catch mein rakhna chahiye.');
  assert.equal(
    romanLearn.some(
      (m) => m.category === 'learning' && m.value.includes('async await try catch')
    ),
    true
  );

  const urLearn = extractMemoriesFromUtterance('آج میں نے سیکھا کہ ٹائپ اسکرپٹ سے بگز کم ہوتے ہیں');
  assert.equal(
    urLearn.some((m) => m.category === 'learning' && m.value.includes('ٹائپ اسکرپٹ')),
    true
  );
});


