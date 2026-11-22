import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Mic, Play, RotateCcw, Share2, Square, Trash2 } from 'lucide-react';
import {
  DEFAULT_VOICE_ACTIVITY_THRESHOLD,
  MAX_VOICE_ACTIVITY_THRESHOLD,
  MIN_VOICE_ACTIVITY_THRESHOLD,
  applyMicNoiseGate,
  describeVoiceActivitySensitivity,
  normalizeVoiceActivityThreshold,
} from '../../lib/micGate';
import {
  FEMALE_VOICE_OPTIONS,
  MALE_VOICE_OPTIONS,
  VOICE_ENGINE_OPTIONS,
  getVoicePersonaById,
  getVoicePreviewSample,
} from '../../lib/voiceCatalog';
import { speakText, stopAllSpeech } from '../../lib/voiceService';
import type {
  AiProviderPreference,
  AppConfig,
  HairstyleOption,
  HeartState,
  ProviderStatus,
  TtsEngineMode,
} from '../../types/nova';
import { ConfirmDialog } from '../ConfirmDialog';
import { DesktopBridgePanel } from '../DesktopBridgePanel';
import { PWAInstallButton } from '../PWAInstallButton';

interface SettingsViewProps {
  config: AppConfig;
  providerStatus: ProviderStatus;
  memoryCount: number;
  heart?: HeartState;
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
  onClearAllMemories: () => Promise<void>;
  onReplayOnboarding?: () => Promise<void>;
}

type SettingsTab = 'ai' | 'voice' | 'mic' | 'laptop' | 'privacy';

export function SettingsView({
  config,
  providerStatus,
  memoryCount,
  heart,
  onSaveConfig,
  onClearAllMemories,
  onReplayOnboarding,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [draft, setDraft] = useState<AppConfig>(config);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [voiceSavedNotice, setVoiceSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null);

  const [micTesting, setMicTesting] = useState(false);
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [micRawLevel, setMicRawLevel] = useState(0);
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const micThresholdRef = useRef<number>(
    normalizeVoiceActivityThreshold(config.voice_activity_threshold)
  );

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    micThresholdRef.current = normalizeVoiceActivityThreshold(draft.voice_activity_threshold);
  }, [draft.voice_activity_threshold]);

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const stopMicTest = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicTesting(false);
    setMicTestLevel(0);
    setMicRawLevel(0);
  };

  const startMicTest = async () => {
    if (micTesting) {
      stopMicTest();
      return;
    }
    setMicTestError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicTestError('Microphone capture is not available in this browser context.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      setMicTesting(true);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        const raw = Math.min(1, avg * 2.2);
        const gated = applyMicNoiseGate(raw, micThresholdRef.current);
        setMicRawLevel(Math.round(raw * 100));
        setMicTestLevel(Math.min(100, Math.round(gated * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      setMicTestError(
        err instanceof Error ? err.message : 'Microphone permission denied or device unavailable.'
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveConfig(draft);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const persistVoicePatch = async (partial: Partial<AppConfig>, message: string) => {
    setSaveError(null);
    try {
      await onSaveConfig(partial);
      setVoiceSavedNotice(message);
      setTimeout(() => setVoiceSavedNotice(null), 2600);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save voice selection.');
    }
  };

  const handleVoicePreview = async () => {
    if (previewPlaying) {
      stopAllSpeech();
      setPreviewPlaying(false);
      return;
    }
    setVoicePreviewError(null);
    setPreviewPlaying(true);
    const sample = getVoicePreviewSample(
      draft.tts_voice,
      draft.assistant_name,
      draft.user_nickname || 'Boss'
    );
    const result = await speakText({
      text: sample.text,
      voiceName: draft.tts_voice,
      ttsEngineMode: draft.tts_engine_mode,
      language: sample.language,
      emotion: 'happy',
      heart,
      voiceSpeed: draft.voice_speed,
      voiceVolume: draft.voice_volume,
      onEnd: () => setPreviewPlaying(false),
    });
    if (result.engine === 'voice-unavailable') {
      setPreviewPlaying(false);
      setVoicePreviewError(result.error || 'Neural voice playback failed.');
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const currentThreshold = normalizeVoiceActivityThreshold(
    draft.voice_activity_threshold,
    DEFAULT_VOICE_ACTIVITY_THRESHOLD
  );
  const sensitivityInfo = describeVoiceActivitySensitivity(currentThreshold);

  const copyShareUrl = async () => {
    if (!shareUrl || !navigator.clipboard) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col overflow-y-auto px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure AI provider routing, Pakistani Urdu neural voice, laptop installer, and privacy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveError && (
            <span role="alert" className="text-xs font-medium text-rose-400">
              {saveError}
            </span>
          )}
          {savedToast && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
              <Check className="h-4 w-4" />
              Settings saved
            </span>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-1 self-start rounded-lg border border-slate-800 bg-[#0D1117] p-1">
        {(
          [
            { id: 'ai', label: 'AI & Deployment' },
            { id: 'voice', label: 'Urdu Neural Voice' },
            { id: 'mic', label: 'Wake Word & Mic' },
            { id: 'laptop', label: 'Laptop & Installer' },
            { id: 'privacy', label: 'Privacy & Data' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6 space-y-5">
        {activeTab === 'ai' && (
          <div className="space-y-5 rounded-xl border border-slate-800 bg-[#0D1117] p-5">
            <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 text-xs text-slate-300">
              <p className="font-semibold text-white">Active Deployment &amp; AI Binding Status</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-slate-400">
                <span>
                  Active Backend:{' '}
                  <strong className="text-cyan-300">{providerStatus.activeProvider}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Google AI Studio:{' '}
                  {providerStatus.googleAiConfigured ? 'Connected' : 'Pending Server Env'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  OpenAI (ChatGPT Voice):{' '}
                  {providerStatus.openaiConfigured ? 'Connected' : 'Pending Server Env'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Cloudflare AI Binding:{' '}
                  {providerStatus.cloudflareBindingActive
                    ? 'Auto-Bound'
                    : providerStatus.cloudflareConfigured
                      ? 'REST Configured'
                      : 'Auto-activates on Cloudflare Deploy'}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="settings-ai-provider"
                className="block text-xs font-medium text-slate-300"
              >
                AI Provider Routing
              </label>
              <select
                id="settings-ai-provider"
                value={draft.ai_provider}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ai_provider: e.target.value as AiProviderPreference,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="auto">
                  Auto — Cloudflare Workers AI Binding on deploy, Google AI Studio / OpenAI locally
                </option>
                <option value="google-ai-studio">Google AI Studio (Gemini 4)</option>
                <option value="openai">OpenAI (ChatGPT &amp; Expressive Voice)</option>
                <option value="cloudflare">Cloudflare Workers AI</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-default-model"
                className="block text-xs font-medium text-slate-300"
              >
                Primary Conversational Model
              </label>
              <select
                id="settings-default-model"
                value={draft.default_model}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    default_model: e.target.value as AppConfig['default_model'],
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="gemini-4-hydrogen">
                  Gemini 4 Hydrogen — Low-latency daily voice &amp; chat
                </option>
                <option value="gemini-4-carbon">
                  Gemini 4 Carbon — High Thinking reasoning (paid tier)
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-thinking-mode"
                className="block text-xs font-medium text-slate-300"
              >
                Deep Thinking Routing (ThinkingLevel.HIGH on Gemini 4 Carbon)
              </label>
              <select
                id="settings-thinking-mode"
                value={draft.deep_thinking_mode}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    deep_thinking_mode: e.target.value as AppConfig['deep_thinking_mode'],
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="auto">
                  Auto — Route complex architecture, debugging &amp; multi-step queries to High Thinking
                </option>
                <option value="always">Always — Use High Thinking on every AI query</option>
                <option value="manual">Manual — Only when High Thinking toggle is enabled</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="space-y-5 rounded-xl border border-slate-800 bg-[#0D1117] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">Auto-Speak Every Response</p>
                <p className="text-xs text-slate-400">
                  Automatically speak ZARA&apos;s Urdu and English replies with synchronized lip movement.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.auto_speak}
                aria-label="Toggle auto-speak responses"
                onClick={() => setDraft({ ...draft, auto_speak: !draft.auto_speak })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                  draft.auto_speak
                    ? 'border-cyan-400 bg-cyan-400/20'
                    : 'border-slate-700 bg-slate-900'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                    draft.auto_speak
                      ? 'translate-x-5 bg-cyan-400'
                      : 'translate-x-1 bg-slate-500'
                  }`}
                />
              </button>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="settings-tts-voice"
                  className="block text-xs font-medium text-slate-300"
                >
                  Neural Voice Persona (Gemini 3.8 Expressive Studio &amp; Edge Neural)
                </label>
                {voiceSavedNotice && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    {voiceSavedNotice}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-cyan-200/75">
                Any voice you select is saved and locked immediately—character switches and restarts will never reset it.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <select
                  aria-label="Neural voice persona"
                  id="settings-tts-voice"
                  value={draft.tts_voice}
                  onChange={(e) => {
                    const nextVoice = e.target.value;
                    setDraft((prev) => ({ ...prev, tts_voice: nextVoice, voice_locked: true }));
                    const meta = getVoicePersonaById(nextVoice);
                    void persistVoicePatch(
                      { tts_voice: nextVoice, voice_locked: true },
                      `Saved & Locked: ${meta ? meta.label : nextVoice}`
                    );
                  }}
                  className="flex-1 rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
                >
                  <optgroup label="Realistic Female Voices (Gemini Studio &amp; Edge Neural)">
                    {FEMALE_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Realistic Male Voices (Gemini Studio &amp; Edge Neural)">
                    {MALE_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <button
                  type="button"
                  onClick={handleVoicePreview}
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 whitespace-nowrap shrink-0"
                >
                  {previewPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{previewPlaying ? 'Stop Preview' : 'Preview Voice'}</span>
                </button>
              </div>
              {voicePreviewError && (
                <p role="alert" className="mt-2 text-xs text-rose-300">
                  Voice preview failed: {voicePreviewError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-tts-engine"
                  className="block text-xs font-medium text-slate-300"
                >
                  Voice Synthesis Engine
                </label>
                <select
                  id="settings-tts-engine"
                  value={draft.tts_engine_mode || 'auto'}
                  onChange={(e) => {
                    const nextMode = e.target.value as TtsEngineMode;
                    setDraft((prev) => ({ ...prev, tts_engine_mode: nextMode }));
                    void persistVoicePatch(
                      { tts_engine_mode: nextMode },
                      `Engine: ${nextMode}`
                    );
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
                >
                  {VOICE_ENGINE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-medium text-white">Lock Selected Voice</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Keep your chosen voice even if you switch characters.
                  </p>
                </div>
                <button
                  id="settings-voice-locked"
                  type="button"
                  role="switch"
                  aria-checked={draft.voice_locked}
                  aria-label="Lock selected voice across character switches"
                  onClick={() => {
                    const nextLocked = !draft.voice_locked;
                    setDraft((prev) => ({ ...prev, voice_locked: nextLocked }));
                    void persistVoicePatch(
                      { voice_locked: nextLocked },
                      nextLocked ? 'Voice locked' : 'Voice unlocked'
                    );
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                    draft.voice_locked
                      ? 'border-emerald-400 bg-emerald-400/20'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                      draft.voice_locked
                        ? 'translate-x-5 bg-emerald-400'
                        : 'translate-x-1 bg-slate-500'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-user-nickname" className="block text-xs font-medium text-slate-300">
                  What {draft.assistant_name} Calls You
                </label>
                <input
                  id="settings-user-nickname"
                  type="text"
                  value={draft.user_nickname || 'Boss'}
                  onChange={(e) => setDraft({ ...draft, user_nickname: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="settings-hairstyle" className="block text-xs font-medium text-slate-300">
                  Hologram Hairstyle
                </label>
                <select
                  id="settings-hairstyle"
                  value={draft.hairstyle || 'wavy'}
                  onChange={(e) =>
                    setDraft({ ...draft, hairstyle: e.target.value as HairstyleOption })
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
                >
                  <option value="bob">Short bob</option>
                  <option value="wavy">Wavy hair</option>
                  <option value="straight">Straight hair</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 border-t border-slate-800/80 pt-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="settings-voice-speed" className="font-medium text-slate-300">
                    Voice Speed
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {draft.voice_speed.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="settings-voice-speed"
                  type="range"
                  min="0.75"
                  max="1.40"
                  step="0.05"
                  value={draft.voice_speed}
                  onChange={(e) =>
                    setDraft({ ...draft, voice_speed: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="settings-voice-volume" className="font-medium text-slate-300">
                    Voice Volume
                  </label>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {Math.round(draft.voice_volume * 100)}%
                  </span>
                </div>
                <input
                  id="settings-voice-volume"
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={draft.voice_volume}
                  onChange={(e) =>
                    setDraft({ ...draft, voice_volume: Number(e.target.value) })
                  }
                  className="mt-2 w-full accent-cyan-400"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mic' && (
          <div className="space-y-5 rounded-xl border border-slate-800 bg-[#0D1117] p-5">
            <div>
              <label
                htmlFor="settings-wake-word"
                className="block text-xs font-medium text-slate-300"
              >
                Wake Word Phrase
              </label>
              <input
                id="settings-wake-word"
                type="text"
                value={draft.wake_word}
                onChange={(e) => setDraft({ ...draft, wake_word: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-800/80 pt-4">
              <div>
                <p className="text-sm font-medium text-white">Hands-Free Continuous Voice Loop</p>
                <p className="text-xs text-slate-400">
                  Automatically resume listening right after ZARA finishes speaking a response.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.hands_free_mode}
                aria-label="Toggle hands-free voice loop"
                onClick={() => setDraft({ ...draft, hands_free_mode: !draft.hands_free_mode })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                  draft.hands_free_mode
                    ? 'border-cyan-400 bg-cyan-400/20'
                    : 'border-slate-700 bg-slate-900'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                    draft.hands_free_mode
                      ? 'translate-x-5 bg-cyan-400'
                      : 'translate-x-1 bg-slate-500'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-3 border-t border-slate-800/80 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="settings-voice-activity-sensitivity"
                    className="block text-sm font-medium text-white"
                  >
                    Voice Activity Sensitivity
                  </label>
                  <p className="text-xs text-slate-400">
                    {sensitivityInfo.hint}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                    {sensitivityInfo.label}
                  </span>
                  <span
                    data-testid="voice-activity-threshold-value"
                    className="font-mono text-xs tabular-nums text-cyan-300"
                  >
                    {currentThreshold.toFixed(3)}
                  </span>
                </div>
              </div>

              <input
                id="settings-voice-activity-sensitivity"
                type="range"
                min={MIN_VOICE_ACTIVITY_THRESHOLD}
                max={MAX_VOICE_ACTIVITY_THRESHOLD}
                step="0.005"
                value={currentThreshold}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    voice_activity_threshold: normalizeVoiceActivityThreshold(e.target.value),
                  })
                }
                className="w-full accent-cyan-400"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>More Sensitive (Quiet Room · 0.020)</span>
                <span>Strict Noise Gate (Busy Room · 0.250)</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { label: 'Quiet Room (0.035)', value: 0.035 },
                  { label: 'Balanced (0.065)', value: 0.065 },
                  { label: 'Noisy Room (0.130)', value: 0.13 },
                ].map((preset) => {
                  const active = Math.abs(currentThreshold - preset.value) < 0.001;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          voice_activity_threshold: preset.value,
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                          : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-800/80 pt-4">
              <div>
                <p className="text-sm font-medium text-white">Microphone Input Test</p>
                <p className="text-xs text-slate-400">
                  Verify your browser microphone signal level against the noise gate in real time.
                </p>
              </div>
              <button
                type="button"
                onClick={startMicTest}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  micTesting
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/40'
                }`}
              >
                <Mic className="h-3.5 w-3.5" />
                <span>{micTesting ? 'Stop Test' : 'Test Microphone'}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 tabular-nums">
                <span>
                  Input Signal Level{' '}
                  {micTesting && micRawLevel > 0 && micTestLevel === 0 && (
                    <span className="ml-1.5 text-amber-300">(Below noise gate — ignored)</span>
                  )}
                  {micTesting && micTestLevel > 0 && (
                    <span className="ml-1.5 text-emerald-400">(Voice detected)</span>
                  )}
                </span>
                <span>{micTestLevel}%</span>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${micTestLevel}%` }}
                />
                <div
                  title={`Noise gate threshold: ${currentThreshold.toFixed(3)}`}
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-300/90"
                  style={{ left: `${Math.min(98, Math.round(currentThreshold * 100))}%` }}
                />
              </div>
              {micTestError && <p className="text-xs text-rose-400">{micTestError}</p>}
            </div>
          </div>
        )}

        {activeTab === 'laptop' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-800 bg-[#0D1117] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Installable App &amp; Shareable Laptop Package
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Install ZARA directly onto your laptop/desktop, or share the link &amp; setup script so anyone can run it on their own computer.
                  </p>
                </div>
                <PWAInstallButton />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-[#111827] p-3">
                <Share2 className="h-4 w-4 text-cyan-400 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">
                  {shareUrl || 'https://your-zara-app-url'}
                </span>
                <button
                  type="button"
                  onClick={() => void copyShareUrl()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 whitespace-nowrap shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedUrl ? 'Link Copied' : 'Copy Share Link'}</span>
                </button>
              </div>

              <div className="mt-4 border-t border-slate-800/80 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  1-Click Laptop Companion Installers (Full Local OS Control)
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Download and run the installer on any Windows, macOS, or Linux laptop (requires Node.js 18+) to unlock VS Code, Terminal, Chrome tabs, Downloads/Desktop folder access, and local speech.
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <a
                    href="/api/desktop/installer?os=win"
                    download="ZARA-Desktop-Setup.bat"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Windows Installer (.bat)</span>
                  </a>
                  <a
                    href="/api/desktop/installer?os=unix"
                    download="zara-desktop-setup.sh"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Mac / Linux Installer (.sh)</span>
                  </a>
                  <a
                    href="/api/desktop/installer?os=agent"
                    download="zara-agent.mjs"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Direct Agent (.mjs)</span>
                  </a>
                </div>
              </div>
            </div>

            <DesktopBridgePanel />
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-5 rounded-xl border border-slate-800 bg-[#0D1117] p-5">
            {onReplayOnboarding && (
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
                <div>
                  <h2 className="text-sm font-semibold text-white">Intro &amp; Voice Setup Flow</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Replay the talking step-by-step setup to change hairstyle, name, age, or relationship mode.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onReplayOnboarding()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Replay Intro &amp; Setup</span>
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Local SQLite Memory Storage</h2>
                <p className="mt-1 text-xs text-slate-400 tabular-nums">
                  Currently storing {memoryCount} long-term memory entries locally on your server.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear All Memory</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear all stored memories?"
        description="Kya aap saari memories delete karna chahte hain? This action removes all saved facts and preferences."
        confirmLabel="Clear All"
        onConfirm={async () => {
          await onClearAllMemories();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
