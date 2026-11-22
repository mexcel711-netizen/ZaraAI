import { randomBytes } from 'node:crypto';
import WebSocket from 'isomorphic-ws';

const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = '143';
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
  0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2,
];

const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
  0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
  0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
];

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_ADJUSTMENT = 0xc9dc06a7;
const SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14),
  SHA256_ADJUSTMENT,
  ...SHA256_ROUND_CONSTANTS.slice(15),
];
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

const CS64_COEFFICIENTS = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];

const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xf2f90b1a;
const CS64_ADJUSTMENT1 = 0x0b1a0000;

let clockSkewSeconds = 0;

function rotr32(val, n) {
  return ((val >>> n) | (val << (32 - n))) >>> 0;
}

function rol16(val) {
  return ((val << 16) | (val >>> 16)) >>> 0;
}

function sigma0(val) {
  return (rotr32(val, 7) ^ rotr32(val, 18) ^ (val >>> 3)) >>> 0;
}

function sigma1(val) {
  return (rotr32(val, 17) ^ rotr32(val, 19) ^ (val >>> 10)) >>> 0;
}

function expandSha256Schedule(words, firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    const x = words[i - 2];
    const y = words[i - 15];
    words[i] = (sigma1(x) + words[i - 7] + sigma0(y) + words[i - 16]) >>> 0;
  }
}

function sha256Rounds(state, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const t1 = (h + S1 + ch + constants[i] + words[i]) >>> 0;
    const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t2 = (S0 + maj) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function sha256Init(head) {
  const words = new Array(64).fill(0);
  words[14] = ((head[0] << 16) | (head[1] << 8) | head[2]) >>> 0;
  words[15] = ((head[3] << 24) | (head[4] << 16) | (head[5] << 8) | head[6]) >>> 0;
  for (let i = 16; i < 30; i++) {
    let v = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) {
      const s1 = sigma1(words[i - 2]);
      v = (v + (i === 16 ? (s1 ^ SHA256_SIGMA1_ADJUSTMENT) >>> 0 : s1)) >>> 0;
    }
    if (i - 7 >= 14) {
      v = (v + words[i - 7]) >>> 0;
    }
    if (i - 15 >= 14) {
      const s0 = sigma0(words[i - 15]);
      v = (v + (i === 29 ? (s0 ^ SHA256_SIGMA0_ADJUSTMENT) >>> 0 : s0)) >>> 0;
    }
    words[i] = v >>> 0;
  }
  words[30] =
    (sigma1(words[28]) +
      words[23] +
      sigma0(words[15]) +
      words[14] +
      SHA256_ADJUSTMENT -
      SHA256_ROUND_CONSTANTS[14]) >>>
    0;
  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((initVal, idx) => (initVal + working[idx]) >>> 0);
}

function sha256DigestCustom(data) {
  const length = 57 + data.length;
  const padZeros = (55 - (length % 64) + 64) % 64;
  const tail = Buffer.alloc(data.length - 7 + 1 + padZeros + 8);
  data.copy(tail, 0, 7);
  tail[data.length - 7] = 0x80;
  tail.writeBigUInt64BE(BigInt(length) * 8n, tail.length - 8);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < tail.length; offset += 64) {
    const words = new Array(64);
    for (let i = 0; i < 16; i++) {
      words[i] = tail.readUInt32BE(offset + i * 4);
    }
    expandSha256Schedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((s, idx) => (s + working[idx]) >>> 0);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    out.writeUInt32BE(state[i] >>> 0, i * 4);
  }
  return out;
}

function wordsLe4Even(data) {
  const padLen = (4 - (data.length % 4)) % 4;
  const buf = padLen ? Buffer.concat([data, Buffer.alloc(padLen)]) : data;
  const words = [];
  for (let i = 0; i < buf.length; i += 4) {
    words.push(buf.readUInt32LE(i));
  }
  if (words.length % 2 === 1) words.push(0);
  return words;
}

function cs64Digest(data, digest) {
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0;
  const factors = [Math.imul(keyA, CS64_FACTOR) >>> 0, Math.imul(keyB, CS64_FACTOR) >>> 0];

  const terms = CS64_COEFFICIENTS.map(([coeff], idx) => Math.imul(coeff, factors[idx % 2]) >>> 0);
  const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset >>> 0);

  const prefixed = Buffer.concat([Buffer.from([0]), data]);
  const leWords = wordsLe4Even(prefixed);
  for (let idx = 0; idx < leWords.length; idx++) {
    const word = leWords[idx];
    let term = Math.imul(word, idx % 2 === 0 ? keyA : keyB) >>> 0;
    let offset = Math.imul(rol16(word), idx % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
    if (idx === 0) {
      term = (term + (Math.imul(CS64_ADJUSTMENT0, factors[0]) >>> 0)) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  }

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    swapAcc = (swapAcc + ((Math.imul(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    swapLast = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (Math.imul(state, keyA) + x) >>> 0;
    state = Math.imul(rol16(state), 0xcf98b111) >>> 0;
    state = Math.imul(rol16(state), 0x87085b9f) >>> 0;
    state = Math.imul(rol16(state), 0x12ceb96d) >>> 0;
    state = Math.imul(rol16(state), 0x257e1d83) >>> 0;
    acc = (acc + state) >>> 0;

    t = (Math.imul(state, keyB) + y) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = Math.imul(rol16(t), 0xd38396ff) >>> 0;
    state = Math.imul(rol16(Math.imul(rol16(t), 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }

  return [(swapLast ^ state) >>> 0, (swapAcc ^ acc) >>> 0];
}

export function generateSecMsGecV2(unixSeconds) {
  const baseUnix = unixSeconds ?? Date.now() / 1000 + clockSkewSeconds;
  let ticks = baseUnix + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const input = Buffer.from(`${Math.round(ticks)}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const digest = sha256DigestCustom(input);
  const [w0, w1] = cs64Digest(input, digest);
  const cs64Buf = Buffer.alloc(8);
  cs64Buf.writeUInt32LE(w0 >>> 0, 0);
  cs64Buf.writeUInt32LE(w1 >>> 0, 4);
  return `${cs64Buf.toString('hex').toUpperCase()}-${digest.toString('hex').toUpperCase()}`;
}

function escapeXml(text) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isMaleEdgeVoice(voice) {
  return /(AsadNeural|GuyNeural|ChristopherNeural|EricNeural|SteffanNeural|RyanNeural)/i.test(
    String(voice || '')
  );
}

function getEmotionalProsody(emotion, voice) {
  const male = isMaleEdgeVoice(voice);
  if (male) {
    const maleMap = {
      happy: { rate: '+2%', pitch: '+0Hz' },
      excited: { rate: '+6%', pitch: '+2Hz' },
      love: { rate: '-4%', pitch: '-2Hz' },
      sad: { rate: '-7%', pitch: '-4Hz' },
      empathetic: { rate: '-4%', pitch: '-1Hz' },
      thoughtful: { rate: '-5%', pitch: '-2Hz' },
      confident: { rate: '+1%', pitch: '-1Hz' },
      calm: { rate: '+0%', pitch: '+0Hz' },
      angry: { rate: '+2%', pitch: '-3Hz' },
      surprised: { rate: '+5%', pitch: '+2Hz' },
      curious: { rate: '+1%', pitch: '+1Hz' },
    };
    return maleMap[emotion] || { rate: '+0%', pitch: '+0Hz' };
  }

  const femaleMap = {
    happy: { rate: '+3%', pitch: '+3Hz' },
    excited: { rate: '+7%', pitch: '+6Hz' },
    love: { rate: '-4%', pitch: '+2Hz' },
    sad: { rate: '-7%', pitch: '-4Hz' },
    empathetic: { rate: '-4%', pitch: '+1Hz' },
    thoughtful: { rate: '-5%', pitch: '-1Hz' },
    confident: { rate: '+1%', pitch: '+2Hz' },
    calm: { rate: '+0%', pitch: '+0Hz' },
    angry: { rate: '+2%', pitch: '-2Hz' },
    surprised: { rate: '+6%', pitch: '+5Hz' },
    curious: { rate: '+2%', pitch: '+3Hz' },
  };
  return femaleMap[emotion] || { rate: '+0%', pitch: '+1Hz' };
}

function connectId() {
  return randomBytes(16).toString('hex');
}

function buildSsml(text, voice, emotion) {
  const { rate, pitch } = getEmotionalProsody(emotion, voice);
  const langMatch = voice.match(/^([a-z]{2}-[A-Z]{2})-/);
  const xmlLang = langMatch ? langMatch[1] : 'ur-PK';
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>` +
    escapeXml(text) +
    `</prosody></voice></speak>`
  );
}

export async function synthesizeEdgeNeuralSpeech(params) {
  const cleanText = String(params?.text || '').trim();
  if (!cleanText) return [];

  const timeoutMs = params?.timeoutMs ?? 4800;
  const voiceName = String(params?.voiceName || 'ur-PK-UzmaNeural');
  const emotion = String(params?.emotion || 'calm');

  const attemptOnce = () =>
    new Promise((resolve, reject) => {
      const secMsGec = generateSecMsGecV2();
      const url = `${WSS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId()}`;
      const muid = randomBytes(16).toString('hex').toUpperCase();
      const ws = new WebSocket(url, {
        headers: {
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Sec-WebSocket-Version': '13',
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.9',
          Cookie: `muid=${muid};`,
        },
      });

      const audioBuffers = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error('Edge Neural TTS timed out'));
      }, timeoutMs);

      const done = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(Buffer.concat(audioBuffers));
      };

      ws.on('unexpected-response', (_req, res) => {
        const dateHeader = res.headers?.date;
        if (typeof dateHeader === 'string') {
          const serverMs = Date.parse(dateHeader);
          if (Number.isFinite(serverMs)) {
            clockSkewSeconds = serverMs / 1000 - Date.now() / 1000;
          }
        }
        done(new Error(`Edge TTS HTTP ${res.statusCode || 403}`));
      });

      ws.on('error', (err) => {
        done(err instanceof Error ? err : new Error(String(err)));
      });

      ws.on('open', () => {
        const timestamp = new Date().toUTCString().replace('GMT', 'UTC');
        ws.send(
          `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
            `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
        );
        const ssml = buildSsml(cleanText, voiceName, emotion);
        ws.send(
          `X-RequestId:${connectId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`
        );
      });

      ws.on('message', (data, isBinary) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (!isBinary) {
          const textMsg = buf.toString('utf8');
          if (textMsg.includes('Path:turn.end')) {
            try {
              ws.close();
            } catch {
              // ignore
            }
            done();
          }
          return;
        }
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        if (2 + headerLen > buf.length) return;
        const headerStr = buf.subarray(2, 2 + headerLen).toString('utf8');
        if (headerStr.includes('Path:audio') && headerStr.includes('Content-Type:audio/mpeg')) {
          const payload = buf.subarray(2 + headerLen);
          if (payload.length > 0) audioBuffers.push(payload);
        }
      });

      ws.on('close', () => {
        if (!settled) {
          if (audioBuffers.length > 0) done();
          else done(new Error('Edge TTS closed before audio'));
        }
      });
    });

  try {
    const mp3 = await attemptOnce();
    if (mp3.length > 0) return [{ audioBase64: mp3.toString('base64'), mimeType: 'audio/mpeg' }];
  } catch {
    // Retry once immediately for transient WS handshake / first-connect hiccups or calibrated clock skew
    try {
      const mp3 = await attemptOnce();
      if (mp3.length > 0) {
        return [{ audioBase64: mp3.toString('base64'), mimeType: 'audio/mpeg' }];
      }
    } catch {
      // Fall through cleanly to next TTS tier
    }
  }
  return [];
}
