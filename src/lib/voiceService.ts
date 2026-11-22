import {
  applyVoiceIntonationToPlayback,
  computeSentencePitchCurveCents,
  resolveVoiceSpeechParameters,
  type VoiceIntonationProfile,
} from './voiceEmotionManager';
import { buildVoiceReplaySegments } from './voiceHistory';
import type { FacialEmotion, HeartState, TtsEngineMode, VoiceCommandLog } from '../types/nova';

// Client-side neural audio playback (Web Audio API with real-time FFT lip-sync),
// recorded mic clip cache, and SpeechRecognition helpers.

let sharedAudioCtx: AudioContext | null = null;
let activeSourceNode: AudioBufferSourceNode | null = null;
let activeAbortController: AbortController | null = null;
let activeBlobStopper: (() => void) | null = null;
let lipSyncRafId = 0;

const MAX_RECORDED_CLIPS = 40;
const recordedVoiceClips = new Map<number, Blob>();

export function saveRecordedVoiceClip(logId: number, blob: Blob): void {
  if (!Number.isFinite(logId) || logId <= 0 || !blob || blob.size < 256) return;
  if (recordedVoiceClips.has(logId)) {
    recordedVoiceClips.delete(logId);
  } else if (recordedVoiceClips.size >= MAX_RECORDED_CLIPS) {
    const oldestKey = recordedVoiceClips.keys().next().value;
    if (oldestKey !== undefined) recordedVoiceClips.delete(oldestKey);
  }
  recordedVoiceClips.set(logId, blob);
}

export function getRecordedVoiceClip(logId: number): Blob | null {
  return recordedVoiceClips.get(logId) ?? null;
}

export function deleteRecordedVoiceClip(logId: number): void {
  recordedVoiceClips.delete(logId);
}

export function clearRecordedVoiceClips(): void {
  recordedVoiceClips.clear();
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedAudioCtx = new Ctor();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

export function stopAllSpeech(): void {
  if (activeBlobStopper) {
    activeBlobStopper();
    activeBlobStopper = null;
  }
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (activeSourceNode) {
    try {
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {
      // already stopped
    }
    activeSourceNode = null;
  }
  if (lipSyncRafId) {
    cancelAnimationFrame(lipSyncRafId);
    lipSyncRafId = 0;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export interface SpeakResult {
  engine: string;
  voice?: string;
  blockedByAutoplay?: boolean;
  error?: string;
}

export async function speakText(params: {
  text: string;
  voiceName: string;
  language: 'en' | 'ur';
  emotion?: FacialEmotion;
  voiceSpeed?: number;
  voiceVolume?: number;
  ttsEngineMode?: TtsEngineMode;
  heart?: HeartState;
  voiceProfile?: VoiceIntonationProfile;
  onStart?: () => void;
  onLipSync?: (openness: number, width: number) => void;
  onEnd?: () => void;
}): Promise<SpeakResult> {
  stopAllSpeech();
  const cleanText = params.text.trim();
  if (!cleanText) {
    params.onLipSync?.(0, 0);
    params.onEnd?.();
    return { engine: 'none' };
  }

  const controller = new AbortController();
  activeAbortController = controller;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    params.onLipSync?.(0, 0);
    if (activeAbortController === controller) activeAbortController = null;
    params.onEnd?.();
  };
  params.onStart?.();

  try {
    let response: Response | null = null;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanText,
            voiceName: params.voiceName || 'ur-PK-UzmaNeural',
            ttsEngineMode: params.ttsEngineMode || 'auto',
            emotion: params.emotion || 'calm',
            language: params.language,
          }),
          signal: controller.signal,
        });
        if (response.ok) break;
        const body = await response.json().catch(() => ({})) as { error?: string };
        lastError = new Error(body.error || `Voice service returned HTTP ${response.status}.`);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        lastError = error instanceof Error ? error : new Error('Voice service unavailable.');
      }
      if (attempt === 0 && !controller.signal.aborted) await waitMs(350, controller.signal);
    }

    if (!response?.ok) throw lastError || new Error('Neural voice service is temporarily unavailable.');
    const data = await response.json() as {
      audioChunks?: Array<{ audioBase64: string; mimeType: string }>;
      engine?: string;
      voice?: string;
    };
    const chunks = data.audioChunks ?? [];
    if (!chunks.length) throw new Error('Neural voice provider returned no audio.');
    const speed = Math.min(1.6, Math.max(0.65, params.voiceSpeed ?? 1));
    const volume = Math.min(1.5, Math.max(0, params.voiceVolume ?? 1));
    const voiceProfile =
      params.voiceProfile ??
      resolveVoiceSpeechParameters({
        emotion: params.emotion,
        heart: params.heart,
      });

    for (let idx = 0; idx < chunks.length; idx += 1) {
      if (controller.signal.aborted) break;
      const chunk = chunks[idx];
      await playBufferWithLipSync({
        base64: chunk.audioBase64,
        mimeType: chunk.mimeType || 'audio/mpeg',
        speed,
        volume,
        emotion: params.emotion,
        heart: params.heart,
        voiceProfile,
        signal: controller.signal,
        onLipSync: params.onLipSync,
      });
      if (idx < chunks.length - 1 && !controller.signal.aborted && voiceProfile.pauseMsBetweenChunks > 0) {
        await waitMs(voiceProfile.pauseMsBetweenChunks, controller.signal);
      }
    }
    finish();
    return { engine: data.engine || 'edge-neural-v2', voice: data.voice };
  } catch (error) {
    finish();
    if (controller.signal.aborted) return { engine: 'aborted' };
    const message = error instanceof Error ? error.message : 'Neural voice playback failed.';
    const blockedByAutoplay = /blocked|notallowederror|user gesture|autoplay/i.test(message);
    console.error('[ZARA voice] Voice playback error:', error);
    return { engine: 'voice-unavailable', blockedByAutoplay, error: message };
  }
}

function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

async function playMp3Element(
  base64: string,
  mimeType: string,
  speed: number,
  volume: number,
  signal: AbortSignal,
): Promise<void> {
  if (typeof Audio === 'undefined' || signal.aborted) return;
  const audio = new Audio(`data:${mimeType || 'audio/mpeg'};base64,${base64}`);
  audio.preload = 'auto';
  audio.playbackRate = Math.min(1.6, Math.max(0.65, speed));
  audio.volume = Math.min(1, Math.max(0, volume));
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      audio.pause();
      audio.currentTime = 0;
      finish();
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('Audio playback failed.'));
    signal.addEventListener('abort', onAbort, { once: true });
    void audio.play().catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error('Audio playback is blocked.'));
    });
  });
}

async function playBufferWithLipSync(params: {
  base64: string;
  mimeType?: string;
  speed: number;
  volume: number;
  emotion?: FacialEmotion;
  heart?: HeartState;
  voiceProfile?: VoiceIntonationProfile;
  signal: AbortSignal;
  onLipSync?: (openness: number, width: number) => void;
}): Promise<void> {
  const mime = params.mimeType || 'audio/mpeg';
  const profile =
    params.voiceProfile ??
    resolveVoiceSpeechParameters({
      emotion: params.emotion,
      heart: params.heart,
    });
  const resolved = applyVoiceIntonationToPlayback({
    baseSpeed: params.speed,
    baseVolume: params.volume,
    profile,
  });
  const effectiveSpeed = resolved.effectiveSpeed;
  const effectiveVolume = resolved.effectiveVolume;
  const ctx = getAudioContext();
  if (!ctx) {
    await playMp3Element(params.base64, mime, effectiveSpeed, effectiveVolume, params.signal);
    return;
  }

  try {
    if (ctx.state === 'suspended') {
      await Promise.race([
        ctx.resume(),
        new Promise<void>((resolve) => setTimeout(resolve, 250)),
      ]);
    }
    if ((ctx.state as AudioContextState) !== 'running') {
      await playMp3Element(params.base64, mime, effectiveSpeed, effectiveVolume, params.signal);
      return;
    }
  } catch {
    await playMp3Element(params.base64, mime, effectiveSpeed, effectiveVolume, params.signal);
    return;
  }

  const binary = atob(params.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
  } catch {
    await playMp3Element(params.base64, mime, effectiveSpeed, effectiveVolume, params.signal);
    return;
  }

  if (params.signal.aborted) return;

  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = effectiveSpeed;
    if ('detune' in source && source.detune) {
      source.detune.value = resolved.detuneCents;
    }

    // 3-band intimate vocal studio shaping driven by ZARA's emotion & HeartState profile
    const warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowshelf';
    warmthFilter.frequency.value = 190;
    warmthFilter.gain.value = resolved.warmthGainDb;

    const presenceFilter = ctx.createBiquadFilter();
    presenceFilter.type = 'peaking';
    presenceFilter.frequency.value = 2750;
    presenceFilter.Q.value = 1.1;
    presenceFilter.gain.value = resolved.presenceGainDb;

    const softenFilter = ctx.createBiquadFilter();
    softenFilter.type = 'highshelf';
    softenFilter.frequency.value = 6200;
    softenFilter.gain.value = resolved.softnessGainDb;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -19;
    compressor.knee.value = 16;
    compressor.ratio.value = 2.4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.16;

    const gainNode = ctx.createGain();
    gainNode.gain.value = effectiveVolume;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;

    source.connect(analyser);
    analyser.connect(warmthFilter);
    warmthFilter.connect(presenceFilter);
    presenceFilter.connect(softenFilter);
    softenFilter.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(ctx.destination);

    activeSourceNode = source;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const playbackStartTime = ctx.currentTime;
    const expectedDuration = Math.max(0.25, audioBuffer.duration / effectiveSpeed);

    let smoothOpen = 0;
    let smoothWidth = 0;

    const tick = () => {
      if (params.signal.aborted || activeSourceNode !== source) {
        params.onLipSync?.(0, 0);
        return;
      }
      if ('detune' in source && source.detune) {
        const progress = Math.min(1, Math.max(0, (ctx.currentTime - playbackStartTime) / expectedDuration));
        source.detune.value = computeSentencePitchCurveCents(profile, progress);
      }
      analyser.getByteFrequencyData(freqData);
      // Low-mid vocal formant energy (bins 1..14)
      let lowSum = 0;
      for (let b = 1; b <= 14; b++) lowSum += freqData[b];
      const rawOpen = Math.min(1, lowSum / (14 * 125));

      // High-mid consonant/vowel articulation (bins 15..40)
      let highSum = 0;
      for (let b = 15; b <= 40; b++) highSum += freqData[b];
      const rawWidth = Math.min(1, highSum / (26 * 95));

      smoothOpen = smoothOpen * 0.45 + rawOpen * 0.55;
      smoothWidth = smoothWidth * 0.55 + rawWidth * 0.45;
      params.onLipSync?.(smoothOpen, smoothWidth);
      lipSyncRafId = requestAnimationFrame(tick);
    };

    const cleanup = () => {
      if (lipSyncRafId) {
        cancelAnimationFrame(lipSyncRafId);
        lipSyncRafId = 0;
      }
      if (activeSourceNode === source) {
        activeSourceNode = null;
      }
      params.onLipSync?.(0, 0);
      resolve();
    };

    source.onended = cleanup;
    params.signal.addEventListener('abort', cleanup, { once: true });

    try {
      source.start(0);
      tick();
    } catch {
      cleanup();
    }
  });
}

async function playAudioBlob(params: {
  blob: Blob;
  volume?: number;
  signal: AbortSignal;
}): Promise<void> {
  if (typeof Audio === 'undefined' || typeof URL === 'undefined' || params.signal.aborted) {
    return;
  }
  const objectUrl = URL.createObjectURL(params.blob);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';
  audio.volume = Math.min(1, Math.max(0, params.volume ?? 1));

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        params.signal.removeEventListener('abort', onAbort);
        if (activeBlobStopper === onAbort) activeBlobStopper = null;
        if (err) reject(err);
        else resolve();
      };
      const onAbort = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // ignore
        }
        finish();
      };
      activeBlobStopper = onAbort;
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error('Recorded voice clip could not be played.'));
      params.signal.addEventListener('abort', onAbort, { once: true });
      void audio.play().catch((err: unknown) => {
        finish(err instanceof Error ? err : new Error('Audio playback is blocked.'));
      });
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function replayVoiceInteraction(params: {
  log: VoiceCommandLog;
  voiceName: string;
  voiceSpeed?: number;
  voiceVolume?: number;
  signal: AbortSignal;
  onPhaseChange?: (phase: 'command' | 'response') => void;
}): Promise<{ ok: boolean; aborted?: boolean; usedRecordedClip: boolean; error?: string }> {
  stopAllSpeech();
  unlockAudioContext();

  const segments = buildVoiceReplaySegments(params.log);
  if (segments.length === 0) {
    return { ok: false, usedRecordedClip: false, error: 'No recorded command text to replay.' };
  }

  const onSignalAbort = () => stopAllSpeech();
  params.signal.addEventListener('abort', onSignalAbort, { once: true });

  let usedRecordedClip = false;
  try {
    for (const segment of segments) {
      if (params.signal.aborted) {
        return { ok: false, aborted: true, usedRecordedClip };
      }

      params.onPhaseChange?.(segment.kind);

      if (segment.kind === 'command') {
        const recordedClip = getRecordedVoiceClip(params.log.id);
        if (recordedClip) {
          try {
            await playAudioBlob({
              blob: recordedClip,
              volume: params.voiceVolume,
              signal: params.signal,
            });
            usedRecordedClip = true;
            continue;
          } catch {
            if (params.signal.aborted) {
              return { ok: false, aborted: true, usedRecordedClip };
            }
            // Fall through to neural TTS command replay if browser cannot decode local clip
          }
        }
      }

      const result = await speakText({
        text: segment.text,
        voiceName: params.voiceName,
        language: segment.language,
        emotion:
          segment.kind === 'response' && params.log.status === 'failed'
            ? 'sad'
            : segment.kind === 'response'
              ? 'happy'
              : 'calm',
        voiceSpeed: params.voiceSpeed,
        voiceVolume: params.voiceVolume,
      });

      if (params.signal.aborted || result.engine === 'aborted') {
        return { ok: false, aborted: true, usedRecordedClip };
      }

      if (result.engine === 'voice-unavailable') {
        return {
          ok: false,
          usedRecordedClip,
          error: result.error || 'Voice replay audio is currently unavailable.',
        };
      }
    }

    return { ok: true, usedRecordedClip };
  } finally {
    params.signal.removeEventListener('abort', onSignalAbort);
  }
}

export interface SpeechRecognitionHandle {
  stop: () => void;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startBrowserRecognition(opts: {
  lang?: string;
  continuous?: boolean;
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (err: string) => void;
  onEnd: () => void;
}): SpeechRecognitionHandle | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.continuous = Boolean(opts.continuous);
  rec.interimResults = true;
  rec.lang = opts.lang || 'en-US';

  rec.onresult = (event) => {
    let combined = '';
    let isFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      const resultItem = event.results[i] as unknown as {
        isFinal?: boolean;
        0?: { transcript?: string };
      };
      combined += resultItem[0]?.transcript || '';
      if (resultItem.isFinal) isFinal = true;
    }
    opts.onTranscript(combined.trim(), isFinal);
  };

  rec.onerror = (ev) => {
    opts.onError(ev.error || 'Speech recognition error');
  };

  rec.onend = () => {
    opts.onEnd();
  };

  try {
    rec.start();
  } catch (err) {
    opts.onError(err instanceof Error ? err.message : 'Unable to start speech recognition');
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        // ignore stop errors
      }
    },
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.replace(/^data:[^;]+;base64,/i, '');
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to encode recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAudioBlob(
  blob: Blob
): Promise<{ text: string; error?: string }> {
  try {
    if (!blob || blob.size < 256) {
      return { text: '', error: 'Recorded audio clip was too short.' };
    }
    const audioBase64 = await blobToBase64(blob);
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || 'audio/webm',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) {
      return { text: '', error: data.error || `Transcription failed (HTTP ${res.status}).` };
    }
    return { text: (data.text || '').trim() };
  } catch (err) {
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Audio transcription unavailable.',
    };
  }
}
