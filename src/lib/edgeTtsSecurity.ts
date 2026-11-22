/**
 * Microsoft Edge Read Aloud Sec-MS-GEC v2 (CS64-SHA256) token generation.
 * Ported from the MIT-licensed node-edge-tts implementation (SchneeHertz).
 * This stays dependency-free so the same implementation works in Node and Workers.
 */
const WIN_EPOCH_SECONDS = 11644473600n;
export const EDGE_TTS_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const EDGE_TTS_CHROMIUM_VERSION = '143.0.3650.75';

const PREFIX = 'Copyright (C) Microsoft Corporation. All rights reserved.';
const COEFFICIENTS: ReadonlyArray<readonly [number, number]> = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167],
];

const imul = Math.imul;
const rol16 = (value: number) => ((value << 16) | (value >>> 16)) >>> 0;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();

function cs64Digest(data: Uint8Array, shaDigest: Uint8Array): Uint8Array {
  const digestView = new DataView(shaDigest.buffer, shaDigest.byteOffset, shaDigest.byteLength);
  const keyA = (digestView.getUint32(0, true) | 1) >>> 0;
  const keyB = (digestView.getUint32(4, true) | 1) >>> 0;
  const factors = [imul(keyA, 0x82893933) >>> 0, imul(keyB, 0x82893933) >>> 0];
  const terms = COEFFICIENTS.map(([coefficient], index) =>
    imul(coefficient, factors[index % 2]) >>> 0,
  );
  const offsets = COEFFICIENTS.map(([, offset]) => offset >>> 0);

  const padded = new Uint8Array(Math.ceil((data.length + 1) / 8) * 8);
  padded.set(data, 1);
  const paddedView = new DataView(padded.buffer);
  for (let index = 0; index < padded.length / 4; index += 1) {
    const word = paddedView.getUint32(index * 4, true);
    let term = imul(word, index % 2 === 0 ? keyA : keyB);
    let offset = imul(rol16(word), index % 2 === 0 ? 0xef0569fb : 0xc31713db);
    if (index === 0) {
      term = (term + imul(0xf2f90b1a, factors[0])) >>> 0;
      offset = (offset + 0x0b1a0000) >>> 0;
    }
    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index];
    const y = terms[index + 1];
    let t = rol16((offsets[index] + x) >>> 0);
    let q = imul(t, 0x76f50f34);
    swapAcc = (swapAcc + imul(rol16(q), 0xc3efea97) + q) >>> 0;
    t = rol16((offsets[index + 1] + y) >>> 0);
    q = imul(t, 0x1881ce3c);
    swapLast = (imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (imul(state, keyA) + x) >>> 0;
    for (const multiplier of [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]) {
      state = imul(rol16(state), multiplier) >>> 0;
    }
    acc = (acc + state) >>> 0;

    t = (imul(state, keyB) + y) >>> 0;
    t = imul(rol16(t), 0xa27416f5) >>> 0;
    t = imul(rol16(t), 0xd38396ff) >>> 0;
    state = imul(rol16(imul(rol16(t), 0x7c932b89)), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }

  const result = new Uint8Array(8);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, (swapLast ^ state) >>> 0, true);
  resultView.setUint32(4, (swapAcc ^ acc) >>> 0, true);
  return result;
}

export async function hashSecMsGecPayload(
  payload: string,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const prefix = encoder.encode(PREFIX);
  const input = new Uint8Array(prefix.length + data.length);
  input.set(prefix);
  input.set(data, prefix.length);
  const digest = new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', input));
  const checksum = cs64Digest(data, digest);
  return `${hex(checksum)}-${hex(digest)}`;
}

export async function generateSecMsGec(
  trustedClientToken = EDGE_TTS_TRUSTED_CLIENT_TOKEN,
  unixSeconds = Date.now() / 1000,
  cryptoProvider: Crypto = globalThis.crypto,
): Promise<string> {
  if (!Number.isFinite(unixSeconds)) {
    throw new TypeError('unixSeconds must be a finite number');
  }
  const epochSeconds = BigInt(Math.floor(unixSeconds)) + WIN_EPOCH_SECONDS;
  const roundedSeconds = epochSeconds - (epochSeconds % 300n);
  const ticks = roundedSeconds * 10000000n;
  return hashSecMsGecPayload(`${ticks}${trustedClientToken}`, cryptoProvider);
}
