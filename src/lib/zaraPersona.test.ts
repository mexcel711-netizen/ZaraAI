import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SOUL_MARKDOWN,
  META_GROWTH_INTERVAL,
  buildContextualFriendCheckIn,
  buildFallbackMetaGrowthJournal,
  buildMetaGrowthInstruction,
  buildProportionalReplyInstruction,
  classifyPromptScope,
  formatMemoryMarkdown,
  isEchoOfPreviousReply,
  isReminderDueAt,
  pickProactiveCheckIn,
  sanitizeBannedPhrases,
  shouldTriggerMetaGrowth,
  stripAndExtractReflectiveBlocks,
} from './zaraPersona';

test('sanitizeBannedPhrases strips strictly prohibited robotic and generic AI lines while preserving natural chat', () => {
  assert.equal(
    sanitizeBannedPhrases('ZARA hazir hai Boss! Kya haal hain aaj?'),
    'Kya haal hain aaj?'
  );
  assert.equal(
    sanitizeBannedPhrases('Hukum karein, main taiyar hoon. Khidmat ke liye tayyar! Aur kuch Boss?'),
    'Hmm... haan Boss, batao kya chal raha hai?'
  );
  assert.equal(
    sanitizeBannedPhrases('As an AI language model, I cannot feel tired. Chai pi li kya?'),
    'Chai pi li kya?'
  );
  assert.equal(
    sanitizeBannedPhrases('Arre Boss! Chai pi li kya?'),
    'Arre Boss! Chai pi li kya?'
  );
});

test('isEchoOfPreviousReply catches echoed speech and ignores genuine short replies', () => {
  const lastReply = 'Arre Boss! Kya chal raha hai? Chai pi li kya aaj?';
  assert.equal(isEchoOfPreviousReply('Arre Boss kya chal raha hai chai pi li kya aaj', lastReply), true);
  assert.equal(isEchoOfPreviousReply('Kya chal raha hai chai pi li', lastReply), true);
  assert.equal(isEchoOfPreviousReply('Haan', lastReply), false);
  assert.equal(isEchoOfPreviousReply('Mera laptop slow chal raha hai help karo', lastReply), false);
});

test('pickProactiveCheckIn rotates through natural idle friend prompts cleanly', () => {
  const first = pickProactiveCheckIn([]);
  assert.equal(first.message, 'Mood kaisa hai aaj?');

  const second = pickProactiveCheckIn([first.index]);
  assert.equal(second.message, 'Kuch pareshan ho kya?');

  const third = pickProactiveCheckIn([first.index, second.index]);
  assert.equal(third.message, 'Baat karo yaar, bore ho rahi hoon');

  const wrap = pickProactiveCheckIn([0, 1, 2]);
  assert.equal(wrap.index, 0);
});

test('DEFAULT_SOUL_MARKDOWN and formatMemoryMarkdown follow ZARA character and MEMORY.md structure', () => {
  assert.ok(DEFAULT_SOUL_MARKDOWN.includes('## YOUR CHARACTER: zara (female voice)'));
  assert.ok(DEFAULT_SOUL_MARKDOWN.includes('21-year-old female best friend'));
  assert.ok(DEFAULT_SOUL_MARKDOWN.includes('late-night phone call'));
  assert.ok(DEFAULT_SOUL_MARKDOWN.includes('The Evolution Rule'));
  assert.ok(DEFAULT_SOUL_MARKDOWN.includes('Arre Boss! Kya chal raha hai? Batao!'));

  const md = formatMemoryMarkdown({
    assistantName: 'ZARA',
    userName: 'Boss',
    memories: [
      {
        id: 1,
        category: 'preference',
        key: 'chai',
        value: 'Boss prefers late-night chai while coding',
        source: 'user_stated',
        confidence: 1,
        created_at: '2026-11-21T00:00:00Z',
        updated_at: '2026-11-21T00:00:00Z',
      },
    ],
    notes: [
      {
        id: 1,
        title: 'Goal',
        content: 'Ship ZARA cleanly',
        tags: [],
        created_at: '2026-11-21T00:00:00Z',
        updated_at: '2026-11-21T00:00:00Z',
      },
    ],
    reminders: [
      {
        id: 1,
        title: 'Evening check-in',
        remind_at: '08:00 PM',
        is_done: false,
        created_at: '2026-11-21T00:00:00Z',
      },
    ],
    knowledge: [],
    updatedAt: '2026-11-21T10:00:00Z',
  });

  assert.ok(md.includes('- [System] ZARA Memory System Initialized.'));
  assert.ok(md.includes('Boss prefers late-night chai while coding'));
  assert.ok(md.includes('**Goal**: Ship ZARA cleanly'));
  assert.ok(md.includes('[ ] Evening check-in (08:00 PM)'));
});

test('classifyPromptScope matches brief, standard, and deep requests proportionally', () => {
  assert.equal(classifyPromptScope('Salam'), 'brief');
  assert.equal(classifyPromptScope('haan theek hoon'), 'brief');
  assert.equal(classifyPromptScope('Aaj thoda kaam kar raha hoon'), 'brief');
  assert.equal(classifyPromptScope('Aaj weather kaisa lag raha hai?'), 'standard');
  assert.equal(
    classifyPromptScope('Explain step by step how React hydration works and debug errors'),
    'deep'
  );
  assert.equal(classifyPromptScope('Ye code tafseel se samjhao aur error fix karo'), 'deep');
});

test('buildProportionalReplyInstruction enforces late-night phone call cadence and friend curiosity', () => {
  const briefInst = buildProportionalReplyInstruction({
    scope: 'brief',
    nickname: 'Ali',
    isMalePersona: false,
  });
  assert.ok(briefInst.includes('LATE-NIGHT PHONE CALL CADENCE (BRIEF)'));
  assert.ok(briefInst.includes('1 to 2 brief, heart-centered, conversational sentences'));
  assert.ok(briefInst.includes('FRIEND CURIOSITY'));

  const deepInst = buildProportionalReplyInstruction({
    scope: 'deep',
    nickname: 'Ali',
    isMalePersona: true,
  });
  assert.ok(deepInst.includes('DEEP REQUEST'));
  assert.ok(deepInst.includes('bhai'));
});

test('buildContextualFriendCheckIn adapts to memories, topics, gender, and avoids repeats', () => {
  const topicCheck = buildContextualFriendCheckIn({
    nickname: 'Boss',
    recentUserMessages: ['React server components debug kar raha hoon'],
    recentCheckIns: [],
    isMalePersona: false,
    language: 'ur',
    now: new Date('2026-11-21T14:00:00'),
  });
  assert.equal(topicCheck.topicKey, 'recent_topic');
  assert.ok(topicCheck.message.includes('React server components debug kar raha hoon'));
  assert.ok(topicCheck.message.includes('kis wajah se kar rahe ho'));

  // Avoid repeating recentCheckIns
  const nextCheck = buildContextualFriendCheckIn({
    nickname: 'Boss',
    recentUserMessages: ['React server components debug kar raha hoon'],
    recentCheckIns: [topicCheck.message],
    reminders: [
      { id: 1, title: 'Chai break', remind_at: '05:00 PM', is_done: false, created_at: '' },
    ],
    isMalePersona: true,
    language: 'ur',
    now: new Date('2026-11-21T14:00:00'),
  });
  assert.equal(nextCheck.topicKey, 'active_reminder');
  assert.ok(nextCheck.message.includes('Chai break'));

  // Late-night fallback adapts grammar to male vs female persona
  const nightFemale = buildContextualFriendCheckIn({
    nickname: 'Boss',
    recentCheckIns: [],
    isMalePersona: false,
    language: 'ur',
    now: new Date('2026-11-21T23:30:00'),
  });
  assert.equal(nightFemale.topicKey, 'late_night');
  assert.ok(nightFemale.message.includes('jaag rahe ho'));
});

test('isReminderDueAt matches 12h, 24h, padded, and compact reminder formats accurately', () => {
  const sixPm = new Date('2026-11-21T18:00:00');
  assert.equal(isReminderDueAt('Call Ali at 06:00 PM', sixPm), true);
  assert.equal(isReminderDueAt('6:00 PM', sixPm), true);
  assert.equal(isReminderDueAt('18:00', sixPm), true);
  assert.equal(isReminderDueAt('Remind me at 6pm', sixPm), true);
  assert.equal(isReminderDueAt('06:00 AM', sixPm), false);
  assert.equal(isReminderDueAt('06:15 PM', sixPm), false);
});

test('shouldTriggerMetaGrowth triggers on every 5th interaction only', () => {
  assert.equal(META_GROWTH_INTERVAL, 5);
  assert.equal(shouldTriggerMetaGrowth(0), false);
  assert.equal(shouldTriggerMetaGrowth(1), false);
  assert.equal(shouldTriggerMetaGrowth(4), false);
  assert.equal(shouldTriggerMetaGrowth(5), true);
  assert.equal(shouldTriggerMetaGrowth(6), false);
  assert.equal(shouldTriggerMetaGrowth(10), true);
  assert.equal(shouldTriggerMetaGrowth(15), true);
});

test('buildMetaGrowthInstruction and buildFallbackMetaGrowthJournal encode support & warmth checks', () => {
  const instruction = buildMetaGrowthInstruction({
    interactionCount: 5,
    nickname: 'Jaani',
    recentMemories: [
      {
        id: 1,
        category: 'learning',
        key: 'user_learning',
        value: 'Learned React cleanup',
        source: 'ai_inferred',
        confidence: 0.9,
        created_at: '',
        updated_at: '',
      },
    ],
  });
  assert.ok(instruction.includes('META-GROWTH CHECKPOINT (Interaction #5)'));
  assert.ok(instruction.includes('Kya maine Jaani ko support kiya?'));
  assert.ok(instruction.includes('wahi warmth thi jo unhein pasand hai'));
  assert.ok(instruction.includes('Learned React cleanup'));

  const journal = buildFallbackMetaGrowthJournal({
    interactionCount: 10,
    nickname: 'Boss',
    recentUserMessages: ['Debugging hooks state'],
  });
  assert.ok(journal.includes('Meta-Growth #10'));
  assert.ok(journal.includes('Boss'));
  assert.ok(journal.includes('Debugging hooks state'));
});

test('stripAndExtractReflectiveBlocks strips hidden memory and reflection tags without leaking to chat text', () => {
  const raw =
    'Arre Boss, hmm... useEffect cleanup lagana best rehta hai! [memory:learning|Learned React useEffect cleanup prevents stale closures] [remember:fact|Boss builds React apps] [memory:preference|Boss prefers concise coding tips] [reflection:Warmth & support check — matched Boss vibe cleanly]';
  const parsed = stripAndExtractReflectiveBlocks(raw);

  assert.equal(parsed.text, 'Arre Boss, hmm... useEffect cleanup lagana best rehta hai!');
  assert.equal(parsed.aiMemories.length, 3);
  assert.deepEqual(parsed.aiMemories[0], {
    category: 'learning',
    value: 'Learned React useEffect cleanup prevents stale closures',
  });
  assert.deepEqual(parsed.aiMemories[1], {
    category: 'fact',
    value: 'Boss builds React apps',
  });
  assert.deepEqual(parsed.aiMemories[2], {
    category: 'preference',
    value: 'Boss prefers concise coding tips',
  });
  assert.deepEqual(parsed.aiReflections, ['Warmth & support check — matched Boss vibe cleanly']);
});


