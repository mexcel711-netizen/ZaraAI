import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceReplaySegments,
  classifyVoiceExecution,
  computeVoiceFrequencyBars,
  computeVoiceHistoryStats,
  filterVoiceHistory,
  formatVoiceLogStatusLabel,
  formatVoiceReplayPhaseLabel,
  formatVolumePercent,
  getVolumeIntensityLabel,
  normalizeVoiceVolume,
  resolveSkillDisplayLabel,
} from './voiceHistory';
import type { VoiceCommandLog } from '../types/nova';

const sampleLogs: VoiceCommandLog[] = [
  {
    id: 3,
    transcript: 'open my git',
    matched_skill_name: 'open_github_1234',
    matched_display_name: 'Open GitHub',
    action_type: 'url',
    status: 'matched',
    response_summary: 'Opening Open GitHub now.',
    source: 'microphone',
    language: 'en',
    volume_level: 0.88,
    created_at: '2026-11-21T08:55:00Z',
  },
  {
    id: 2,
    transcript: 'kya haal hai zara',
    matched_skill_name: null,
    matched_display_name: null,
    action_type: 'ai',
    status: 'ai_fallback',
    response_summary: 'Main bilkul theek hoon Boss!',
    source: 'microphone',
    language: 'ur',
    volume_level: 0.52,
    created_at: '2026-11-21T08:50:00Z',
  },
  {
    id: 1,
    transcript: 'haath dekho',
    matched_skill_name: 'gesture_watch_99',
    matched_display_name: 'Gesture Watch Mode',
    action_type: 'vision',
    status: 'failed',
    response_summary: 'Camera permission denied.',
    source: 'retrigger',
    language: 'ur',
    volume_level: 0.18,
    created_at: '2026-11-21T08:45:00Z',
  },
];

test('classifyVoiceExecution classifies matched, ai_fallback, and failed runs', () => {
  assert.equal(classifyVoiceExecution({ ok: true, skillExecuted: 'app_launcher' }), 'matched');
  assert.equal(classifyVoiceExecution({ ok: true, skillExecuted: null }), 'ai_fallback');
  assert.equal(classifyVoiceExecution({ ok: false, skillExecuted: 'app_launcher' }), 'failed');
  assert.equal(formatVoiceLogStatusLabel('matched'), 'Executed');
  assert.equal(formatVoiceLogStatusLabel('ai_fallback'), 'AI Reply');
  assert.equal(formatVoiceLogStatusLabel('failed'), 'Failed');
});

test('computeVoiceHistoryStats summarizes total, matched, aiFallback, and failed counts', () => {
  const stats = computeVoiceHistoryStats(sampleLogs);
  assert.deepEqual(stats, {
    total: 3,
    matched: 1,
    aiFallback: 1,
    failed: 1,
  });
});

test('filterVoiceHistory filters by status and transcript/skill query', () => {
  assert.equal(filterVoiceHistory(sampleLogs, '', 'all').length, 3);
  assert.equal(filterVoiceHistory(sampleLogs, '', 'matched').length, 1);
  assert.equal(filterVoiceHistory(sampleLogs, '', 'failed')[0]?.id, 1);
  assert.equal(filterVoiceHistory(sampleLogs, 'GitHub', 'all')[0]?.id, 3);
  assert.equal(filterVoiceHistory(sampleLogs, 'bilkul', 'ai_fallback')[0]?.id, 2);
});

test('resolveSkillDisplayLabel resolves known skill display names and desktop companion', () => {
  const skills = [{ skill_name: 'app_launcher', display_name: 'App & Web Launcher' }];
  assert.equal(resolveSkillDisplayLabel('app_launcher', skills), 'App & Web Launcher');
  assert.equal(resolveSkillDisplayLabel('desktop_command', skills), 'Desktop Companion');
  assert.equal(resolveSkillDisplayLabel(null, skills), null);
});

test('normalizeVoiceVolume, formatVolumePercent, and getVolumeIntensityLabel clamp and classify volume cleanly', () => {
  assert.equal(normalizeVoiceVolume(0.7544), 0.754);
  assert.equal(normalizeVoiceVolume(-0.4), 0);
  assert.equal(normalizeVoiceVolume(1.8), 1);
  assert.equal(normalizeVoiceVolume('0.62'), 0.62);
  assert.equal(normalizeVoiceVolume(undefined, 0.45), 0.45);
  assert.equal(normalizeVoiceVolume(Number.NaN, 0.5), 0.5);
  assert.equal(formatVolumePercent(0.784), '78%');
  assert.equal(getVolumeIntensityLabel(0.18), 'Quiet');
  assert.equal(getVolumeIntensityLabel(0.52), 'Moderate');
  assert.equal(getVolumeIntensityLabel(0.88), 'Loud');
});

test('computeVoiceFrequencyBars scales amplitude and energy proportionally with volumeLevel', () => {
  const quietBars = computeVoiceFrequencyBars({ volumeLevel: 0.15, idSeed: 7, barCount: 14 });
  const loudBars = computeVoiceFrequencyBars({ volumeLevel: 0.92, idSeed: 7, barCount: 14 });

  assert.equal(quietBars.length, 14);
  assert.equal(loudBars.length, 14);

  const quietAvgMax = quietBars.reduce((acc, b) => acc + b.maxScale, 0) / quietBars.length;
  const loudAvgMax = loudBars.reduce((acc, b) => acc + b.maxScale, 0) / loudBars.length;
  const quietAvgDuration = quietBars.reduce((acc, b) => acc + b.durationMs, 0) / quietBars.length;
  const loudAvgDuration = loudBars.reduce((acc, b) => acc + b.durationMs, 0) / loudBars.length;

  assert.ok(loudAvgMax > quietAvgMax * 2, `expected loud (${loudAvgMax}) > 2x quiet (${quietAvgMax})`);
  assert.ok(loudAvgDuration < quietAvgDuration, 'expected louder commands to pulse faster');

  for (const bar of [...quietBars, ...loudBars]) {
    assert.ok(bar.minScale >= 0.08 && bar.minScale <= bar.maxScale);
    assert.ok(bar.maxScale <= 1);
    assert.ok(bar.opacity >= 0.4 && bar.opacity <= 1);
  }

  // Deterministic output for identical inputs
  assert.deepEqual(
    computeVoiceFrequencyBars({ volumeLevel: 0.64, idSeed: 12, barCount: 10 }),
    computeVoiceFrequencyBars({ volumeLevel: 0.64, idSeed: 12, barCount: 10 })
  );
});

test('buildVoiceReplaySegments builds ordered command + response segments and omits empty summary', () => {
  assert.deepEqual(buildVoiceReplaySegments(sampleLogs[0]), [
    { kind: 'command', text: 'open my git', language: 'en' },
    { kind: 'response', text: 'Opening Open GitHub now.', language: 'en' },
  ]);

  assert.deepEqual(
    buildVoiceReplaySegments({
      transcript: '  what time is it  ',
      response_summary: '   ',
      language: 'en',
    }),
    [{ kind: 'command', text: 'what time is it', language: 'en' }]
  );

  assert.equal(formatVoiceReplayPhaseLabel({ phase: 'command', hasRecordedClip: true }), 'Playing recorded voice');
  assert.equal(formatVoiceReplayPhaseLabel({ phase: 'command', hasRecordedClip: false }), 'Replaying command');
  assert.equal(formatVoiceReplayPhaseLabel({ phase: 'response' }), 'Replaying reply');
  assert.equal(formatVoiceReplayPhaseLabel({ phase: null }), 'Play');
});
