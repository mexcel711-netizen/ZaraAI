import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTRAIT_EYE_GEOMETRY,
  computeBlinkDurationMs,
  computeBlinkDurationMultiplier,
  createBlinkScheduler,
  evaluateBlinkEnvelope,
  getPortraitEyeGeometry,
  sampleNextBlinkIntervalMs,
  stepBlinkScheduler,
} from './avatarBlink';

test('computeBlinkDurationMultiplier scales inversely with active_mood intensity slider', () => {
  assert.equal(computeBlinkDurationMultiplier(1.0), 1);
  assert.equal(computeBlinkDurationMultiplier(0.5), 2);
  assert.equal(computeBlinkDurationMultiplier(2.0), 0.5);

  const slowSad = computeBlinkDurationMs(0.5, 'sad');
  const normalCalm = computeBlinkDurationMs(1.0, 'calm');
  const fastExcited = computeBlinkDurationMs(2.0, 'excited');

  assert.ok(slowSad > normalCalm);
  assert.ok(normalCalm > fastExcited);
  assert.ok(fastExcited >= 75 && slowSad <= 480);
});

test('sampleNextBlinkIntervalMs generates randomized intervals within mood-calibrated bounds', () => {
  const lowCalm = sampleNextBlinkIntervalMs('calm', () => 0);
  const highCalm = sampleNextBlinkIntervalMs('calm', () => 0.99);
  const lowExcited = sampleNextBlinkIntervalMs('excited', () => 0);
  const highSad = sampleNextBlinkIntervalMs('sad', () => 0.99);

  assert.ok(highCalm > lowCalm);
  assert.ok(lowExcited < lowCalm);
  assert.ok(highSad > highCalm);
});

test('evaluateBlinkEnvelope closes briskly, holds closed, and reopens smoothly', () => {
  assert.deepEqual(evaluateBlinkEnvelope(0), { amount: 0, phase: 'open' });
  const closing = evaluateBlinkEnvelope(0.2);
  assert.equal(closing.phase, 'closing');
  assert.ok(closing.amount > 0 && closing.amount < 1);

  const closed = evaluateBlinkEnvelope(0.42);
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.amount, 1);

  const opening = evaluateBlinkEnvelope(0.75);
  assert.equal(opening.phase, 'opening');
  assert.ok(opening.amount > 0 && opening.amount < 1);

  assert.deepEqual(evaluateBlinkEnvelope(1), { amount: 0, phase: 'open' });
});

test('stepBlinkScheduler transitions open -> closing -> closed -> opening -> open with randomized next interval', () => {
  let seed = 0.35;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let state = createBlinkScheduler({ nowMs: 1000, moodIntensity: 1.0, emotion: 'happy', rng });
  assert.equal(state.phase, 'open');
  assert.ok(state.nextBlinkAtMs > 1000);

  // Advance just past nextBlinkAtMs to initiate blink
  const startMs = state.nextBlinkAtMs + 5;
  state = stepBlinkScheduler(state, startMs, { moodIntensity: 1.0, emotion: 'happy', rng });
  assert.equal(state.isBlinking, true);
  assert.equal(state.phase, 'closing');

  // Midpoint of blink -> closed
  const midMs = startMs + Math.round(state.blinkDurationMs * 0.43);
  state = stepBlinkScheduler(state, midMs, { moodIntensity: 1.0, emotion: 'happy', rng });
  assert.equal(state.phase, 'closed');
  assert.equal(state.blinkAmount, 1);

  // End of blink -> back to open and rescheduled
  const endMs = startMs + state.blinkDurationMs + 20;
  state = stepBlinkScheduler(state, endMs, { moodIntensity: 1.0, emotion: 'happy', rng });
  assert.equal(state.isBlinking, false);
  assert.equal(state.phase, 'open');
  assert.ok(state.nextBlinkAtMs > endMs);
});

test('stepBlinkScheduler honors prefersReducedMotion by keeping eyes calmly open', () => {
  const initial = createBlinkScheduler({ nowMs: 0, moodIntensity: 1, emotion: 'calm' });
  const stepped = stepBlinkScheduler(initial, initial.nextBlinkAtMs + 10, {
    prefersReducedMotion: true,
  });
  assert.equal(stepped.isBlinking, false);
  assert.equal(stepped.blinkAmount, 0);
  assert.equal(stepped.phase, 'open');
});

test('PORTRAIT_EYE_GEOMETRY exposes calibrated eye boxes for all hairstyles', () => {
  for (const style of ['wavy', 'bob', 'straight'] as const) {
    const geom = getPortraitEyeGeometry(style);
    assert.ok(geom.left.x > 0.45 && geom.left.x < 0.6);
    assert.ok(geom.right.x > geom.left.x && geom.right.x < 0.7);
    assert.ok(geom.left.y > 0.2 && geom.left.y < 0.35);
    assert.ok(PORTRAIT_EYE_GEOMETRY[style]);
  }
});
