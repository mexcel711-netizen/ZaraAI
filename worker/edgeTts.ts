import {
  EDGE_TTS_CHROMIUM_VERSION,
  EDGE_TTS_TRUSTED_CLIENT_TOKEN,
  generateSecMsGec,
} from '../src/lib/edgeTtsSecurity';
import { getHumanEdgeProsody } from '../src/lib/emotionAndSpeech';
import type { FacialEmotion } from '../src/types/nova';

export const NOVA_VOICE = 'ur-PK-UzmaNeural';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const EDGE_URL = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';

type EdgeWorkerWebSocket = WebSocket & { accept(): void };
type UpgradeResponse = Response & { webSocket?: EdgeWorkerWebSocket };

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character] || character);
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('Edge TTS returned an unsupported WebSocket frame.');
}

function readPath(message: string): string {
  const header = message.split('\r\n\r\n', 1)[0] || message;
  return header.split('\r\n').find((line) => line.startsWith('Path:'))?.slice(5).trim() || '';
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}

function speechConfigMessage(): string {
  return [
    'Content-Type: application/json; charset=utf-8',
    'Path: speech.config',
    `X-Timestamp: ${new Date().toISOString()}`,
    '',
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
            outputFormat: OUTPUT_FORMAT,
          },
        },
      },
    }),
  ].join('\r\n');
}

function ssmlMessage(
  text: string,
  requestId: string,
  emotion?: FacialEmotion,
  voiceName: string = NOVA_VOICE
): string {
  const safeText = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  const { rate, pitch } = getHumanEdgeProsody(emotion);
  const escapedText = escapeXml(safeText);
  const resolvedVoice = voiceName.trim() || NOVA_VOICE;
  const xmlLang = resolvedVoice.startsWith('en-') ? 'en-US' : 'ur-PK';
  return [
    `X-RequestId: ${requestId}`,
    `X-Timestamp: ${new Date().toISOString()}`,
    'Content-Type: application/ssml+xml',
    'Path: ssml',
    '',
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}"><voice name="${resolvedVoice}"><prosody rate="${rate}" pitch="${pitch}" volume="+0%">${escapedText}</prosody></voice></speak>`,
  ].join('\r\n');
}

/** Worker-native Edge Read Aloud client using the current Sec-MS-GEC v2 handshake. */
export async function synthesizeEdgeSpeechInWorker(
  text: string,
  timeoutMs = 30000,
  emotion: string = 'calm',
  voiceName: string = NOVA_VOICE
): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Speech text is empty.');
  if (cleanText.length > 6000) throw new Error('Speech text exceeds the 6000-character safe limit.');

  const secMsGec = await generateSecMsGec(EDGE_TTS_TRUSTED_CLIENT_TOKEN);
  const url = new URL(EDGE_URL);
  url.searchParams.set('Ocp-Apim-Subscription-Key', EDGE_TTS_TRUSTED_CLIENT_TOKEN);
  url.searchParams.set('Sec-MS-GEC', secMsGec);
  const connectionId = crypto.randomUUID().replace(/-/g, '').toLowerCase();
  const requestId = crypto.randomUUID().replace(/-/g, '').toLowerCase();
  url.searchParams.set('ConnectionId', connectionId);
  url.searchParams.set('Sec-MS-GEC-Version', `2-${EDGE_TTS_CHROMIUM_VERSION}`);

  const major = EDGE_TTS_CHROMIUM_VERSION.split('.')[0];
  // Cloudflare Workers' fetch API performs WebSocket upgrades over HTTPS URLs.
  // The upstream endpoint is advertised as WSS, so translate the scheme for
  // the HTTP Upgrade handshake; passing a wss:// URL directly to fetch fails.
  url.protocol = 'https:';
  const response = (await fetch(url.toString(), {
    headers: {
      Upgrade: 'websocket',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': `muid=${crypto.randomUUID().replace(/-/g, '').toUpperCase()};`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })) as UpgradeResponse;

  if (response.status !== 101 || !response.webSocket) {
    throw new Error(`Urdu voice provider rejected the connection (HTTP ${response.status}).`);
  }

  const socket = response.webSocket;
  // Workers defaults binary WebSocket messages to Blob on modern compatibility dates.
  // This parser consumes ArrayBuffer frames, so request that representation explicitly.
  socket.binaryType = 'arraybuffer';
  const audio: Uint8Array[] = [];
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const timer = setTimeout(() => finish(new Error('Urdu voice synthesis timed out.')), timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      socket.removeEventListener('error', onError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.close(error ? 1011 : 1000, error ? 'synthesis failed' : 'complete'); } catch { /* closed */ }
      if (error) {
        reject(error);
        return;
      }
      if (!audio.length) {
        reject(new Error('Urdu voice provider returned no audio data.'));
        return;
      }
      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of audio) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(base64(merged));
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      try {
        if (typeof event.data === 'string') {
          const path = readPath(event.data);
          if (path === 'turn.end') {
            finish();
          } else if (path && !['response', 'turn.start', 'audio.metadata'].includes(path)) {
            finish(new Error(`Urdu voice provider returned ${path}.`));
          }
          return;
        }
        const frame = toBytes(event.data);
        if (frame.length < 2) throw new Error('Urdu voice provider returned a truncated frame.');
        const headerLength = (frame[0] << 8) | frame[1];
        const bodyOffset = headerLength + 2;
        if (bodyOffset > frame.length) throw new Error('Urdu voice provider returned an invalid audio frame.');
        const header = new TextDecoder().decode(frame.subarray(2, bodyOffset));
        if (!header.includes('Path:audio') || !header.includes('Content-Type:audio/mpeg')) return;
        const body = frame.subarray(bodyOffset);
        if (body.length) {
          audio.push(body);
          totalBytes += body.length;
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Failed to read Urdu voice audio.'));
      }
    };
    const onClose = (event: CloseEvent) => {
      if (!settled) finish(new Error(`Urdu voice connection closed before completion (${event.code}).`));
    };
    const onError = () => finish(new Error('Urdu voice network connection failed.'));

    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', onError);
    socket.accept();
    try {
      socket.send(speechConfigMessage());
      socket.send(ssmlMessage(cleanText, requestId, emotion as FacialEmotion, voiceName));
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Unable to start neural voice synthesis.'));
    }
  });
}

export async function synthesizeUzmaInWorker(
  text: string,
  timeoutMs = 30000,
  emotion: string = 'calm'
): Promise<string> {
  return synthesizeEdgeSpeechInWorker(text, timeoutMs, emotion, NOVA_VOICE);
}
