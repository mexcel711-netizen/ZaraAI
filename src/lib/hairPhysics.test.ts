import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENT_BREEZE_WIND,
  computeHairAirWisps,
  computeHairMeshOffset,
  computeHairRegionMask,
  computeTargetHairWind,
  computeVoiceWaveBars,
  stepHairWind,
} from './hairPhysics';

test('maintains steady ambient wind and stays invariant when talking or listening', () => {
  assert.equal(computeTargetHairWind({ state: 'idle', micLevel: 0, lipOpenness: 0 }), AMBIENT_BREEZE_WIND);
  assert.equal(
    computeTargetHairWind({ state: 'idle', micLevel: 0, lipOpenness: 0, ambientBreeze: false }),
    0
  );
  assert.equal(
    computeTargetHairWind({ state: 'listening', micLevel: 0.85, lipOpenness: 0 }),
    AMBIENT_BREEZE_WIND
  );
  assert.equal(
    computeTargetHairWind({ state: 'speaking', micLevel: 0, lipOpenness: 0.9 }),
    AMBIENT_BREEZE_WIND
  );
  assert.equal(
    computeTargetHairWind({ state: 'thinking', micLevel: 0.5, lipOpenness: 0.4 }),
    AMBIENT_BREEZE_WIND
  );
});

test('stepHairWind converges smoothly toward target and settles cleanly to zero', () => {
  let wind = 0;
  for (let i = 0; i < 20; i++) {
    wind = stepHairWind(wind, AMBIENT_BREEZE_WIND);
  }
  assert.ok(Math.abs(wind - AMBIENT_BREEZE_WIND) < 0.02, `Expected wind near ${AMBIENT_BREEZE_WIND}, got ${wind}`);

  for (let i = 0; i < 120; i++) {
    wind = stepHairWind(wind, 0);
  }
  assert.equal(wind, 0, 'Hair wind must damp cleanly back to exact 0 when target is 0');
});

test('portrait bitmap mesh offset stays strictly zero everywhere so image never distorts or crooks', () => {
  const faceMask = computeHairRegionMask(0.55, 0.31);
  const leftHairMask = computeHairRegionMask(0.28, 0.36);
  assert.equal(faceMask, 0, 'Inner face anchor must remain masked out');
  assert.ok(leftHairMask > 0.6, `Left wavy hair region should be recognized, got ${leftHairMask}`);

  for (const style of ['wavy', 'bob', 'straight'] as const) {
    for (const [colNorm, rowNorm] of [
      [0.28, 0.36],
      [0.55, 0.31],
      [0.74, 0.38],
      [0.52, 0.66],
      [0.22, 0.64],
    ]) {
      const offset = computeHairMeshOffset({
        colNorm,
        rowNorm,
        wind: 1,
        phase: 2.4,
        hairstyle: style,
      });
      assert.equal(offset.dx, 0, `${style} portrait dx must stay 0`);
      assert.equal(offset.dy, 0, `${style} portrait dy must stay 0`);
    }
  }
});

test('computeHairAirWisps produces gentle floating glowing strands for all hairstyles', () => {
  for (const style of ['wavy', 'bob', 'straight'] as const) {
    const wispsT0 = computeHairAirWisps({
      hairstyle: style,
      phase: 0.5,
      drawX: 20,
      drawY: 22,
      drawSize: 235,
      intensity: 1,
    });
    const wispsT1 = computeHairAirWisps({
      hairstyle: style,
      phase: 2.1,
      drawX: 20,
      drawY: 22,
      drawSize: 235,
      intensity: 1,
    });

    assert.ok(wispsT0.length >= 6, `${style} should generate rich layered glowing hair wisps`);
    assert.equal(wispsT0.length, wispsT1.length);

    // Roots stay anchored to the head while hair tips flow gently in the breeze
    for (let i = 0; i < wispsT0.length; i++) {
      assert.equal(wispsT0[i].x0, wispsT1[i].x0, `${style} wisp root x0 must stay anchored`);
      assert.equal(wispsT0[i].y0, wispsT1[i].y0, `${style} wisp root y0 must stay anchored`);
    }

    const moved = wispsT0.some(
      (w, idx) =>
        Math.abs(w.x1 - wispsT1[idx].x1) > 0.4 || Math.abs(w.y1 - wispsT1[idx].y1) > 0.3
    );
    assert.ok(moved, `${style} wisps should drift smoothly in the air over time`);

    for (const w of wispsT0) {
      assert.ok(w.alpha > 0 && w.alpha <= 0.4, `Expected subtle glowing alpha, got ${w.alpha}`);
      assert.ok(w.lineWidth >= 0.8 && w.lineWidth <= 3, `Unexpected wisp width ${w.lineWidth}`);
    }
  }
});

test('computeVoiceWaveBars stays completely steady at idle silence and rises when talking', () => {
  const idleA = computeVoiceWaveBars({
    state: 'idle',
    micLevel: 0,
    lipOpenness: 0,
    phase: 1.2,
    barCount: 15,
  });
  const idleB = computeVoiceWaveBars({
    state: 'idle',
    micLevel: 0,
    lipOpenness: 0,
    phase: 3.9,
    barCount: 15,
  });
  assert.equal(idleA.active, false);
  assert.equal(idleA.energy, 0);
  assert.equal(idleA.bars.length, 15);
  assert.deepEqual(idleA.bars, idleB.bars, 'Idle voice bars must remain completely calm with zero idle motion');
  assert.ok(Math.max(...idleA.bars) <= 0.25, `Idle waves should stay low, got ${Math.max(...idleA.bars)}`);

  const speaking = computeVoiceWaveBars({
    state: 'speaking',
    micLevel: 0,
    lipOpenness: 0.72,
    lipWidth: 0.45,
    phase: 2.4,
    barCount: 15,
  });
  assert.equal(speaking.active, true);
  assert.ok(speaking.energy > 0.7);
  assert.ok(Math.max(...speaking.bars) > 0.5, `Speaking waves should rise, got ${Math.max(...speaking.bars)}`);

  const listening = computeVoiceWaveBars({
    state: 'listening',
    micLevel: 0.55,
    lipOpenness: 0,
    phase: 3.1,
    barCount: 15,
  });
  assert.equal(listening.active, true);
  assert.ok(Math.max(...listening.bars) > 0.4, `Listening voice waves should rise, got ${Math.max(...listening.bars)}`);
});
