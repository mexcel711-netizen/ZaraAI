import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOICE_ACTIVITY_THRESHOLD,
  applyMicNoiseGate,
  describeVoiceActivitySensitivity,
  normalizeVoiceActivityThreshold,
} from './micGate';

test('normalizeVoiceActivityThreshold clamps bounds and preserves 0.065 default', () => {
  assert.equal(normalizeVoiceActivityThreshold(undefined), DEFAULT_VOICE_ACTIVITY_THRESHOLD);
  assert.equal(normalizeVoiceActivityThreshold('bad'), DEFAULT_VOICE_ACTIVITY_THRESHOLD);
  assert.equal(normalizeVoiceActivityThreshold(0.001), 0.02);
  assert.equal(normalizeVoiceActivityThreshold(0.9), 0.25);
  assert.equal(normalizeVoiceActivityThreshold(0.12), 0.12);
});

test('applyMicNoiseGate suppresses background noise below configurable threshold', () => {
  assert.equal(applyMicNoiseGate(0.05, 0.065), 0);
  assert.equal(applyMicNoiseGate(0.08, 0.12), 0);
  assert.ok(applyMicNoiseGate(0.08, 0.04) > 0);
  assert.equal(applyMicNoiseGate(0.95, 0.065), 1);
});

test('describeVoiceActivitySensitivity labels quiet, balanced, and noisy thresholds', () => {
  assert.equal(describeVoiceActivitySensitivity(0.035).label, 'High Sensitivity');
  assert.equal(describeVoiceActivitySensitivity(0.065).label, 'Balanced (Default)');
  assert.equal(describeVoiceActivitySensitivity(0.15).label, 'Noise-Filtered');
});
