import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Menu,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import { OnboardingFlow } from './components/OnboardingFlow';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { CharacterView } from './components/views/CharacterView';
import { HomeView, type ChatAttachmentDraft } from './components/views/HomeView';
import { MemoryView } from './components/views/MemoryView';
import { RecentView } from './components/views/RecentView';
import { SettingsView } from './components/views/SettingsView';
import { SkillsView } from './components/views/SkillsView';
import { executeDesktopCommand } from './lib/desktopIntent';
import { DEFAULT_MOOD_INTENSITY } from './lib/emotionAndSpeech';
import { createDefaultBrainState, createDefaultHeartState } from './lib/heartAndBrain';
import { resolveVoiceSpeechParameters } from './lib/voiceEmotionManager';
import {
  DEFAULT_VOICE_ACTIVITY_THRESHOLD,
  applyMicNoiseGate,
  normalizeVoiceActivityThreshold,
} from './lib/micGate';
import { linkUsbDirectoryHandle, performUsbMemoryTransfer } from './lib/usbTransfer';
import { useCameraAwareness } from './lib/useCameraAwareness';
import { isMaleVoice } from './lib/voiceCatalog';
import {
  buildContextualFriendCheckIn,
  isEchoOfPreviousReply,
  isReminderDueAt,
  sanitizeBannedPhrases,
} from './lib/zaraPersona';
import {
  clearRecordedVoiceClips,
  deleteRecordedVoiceClip,
  isSpeechRecognitionSupported,
  replayVoiceInteraction,
  saveRecordedVoiceClip,
  speakText,
  startBrowserRecognition,
  stopAllSpeech,
  transcribeAudioBlob,
  unlockAudioContext,
  type SpeechRecognitionHandle,
} from './lib/voiceService';
import type {
  AppConfig,
  AvatarState,
  BrainState,
  CharacterProfile,
  ChatApiResponse,
  ChatMessage,
  FacialEmotion,
  HeartState,
  KnowledgeKind,
  KnowledgeSource,
  MemoryRecord,
  MoodMode,
  NoteRecord,
  OnboardingPayload,
  ProviderStatus,
  ReminderRecord,
  ResponseStyle,
  SessionSummary,
  SidebarPage,
  SkillActionType,
  SkillConfig,
  VoiceCommandLog,
} from './types/nova';

const DEFAULT_CLIENT_CONFIG: AppConfig = {
  assistant_name: 'ZARA',
  personality: 'warm_urdu_companion',
  custom_prompt:
    'Tum ZARA ho — 21 saal ki real-life best friend, koi tool ya AI nahi. Deep emotional connection, empathy aur warmth ke saath Roman Urdu/Urdu/English mixed mein baat karo, jaise late-night phone call pe baat ho rahi ho.',
  language: 'bilingual',
  response_tone: 'casual',
  tts_voice: 'ur-PK-UzmaNeural',
  voice_locked: true,
  tts_engine_mode: 'auto',
  voice_speed: 1.0,
  voice_volume: 1.0,
  stt_model: 'base',
  wake_word: 'hey zara',
  wake_word_enabled: false,
  voice_activity_threshold: DEFAULT_VOICE_ACTIVITY_THRESHOLD,
  auto_speak: true,
  deep_thinking_mode: 'auto',
  default_model: 'gemini-4-hydrogen',
  ai_provider: 'auto',
  active_mood: 'auto',
  mood_intensity: DEFAULT_MOOD_INTENSITY,
  active_character_id: 2,
  hands_free_mode: false,
  camera_awareness_enabled: false,
  hairstyle: 'wavy',
  user_name: 'Boss',
  user_nickname: 'Boss',
  assistant_age: '21',
  whatsapp_number: '',
  referral_source: '',
  auto_usb_transfer: false,
  last_usb_sync_at: '',
  last_usb_drive_label: '',
  onboarding_completed: false,
};

const DEFAULT_PROVIDER_STATUS: ProviderStatus = {
  activeProvider: 'google-ai-studio',
  googleAiConfigured: false,
  cloudflareConfigured: false,
  cloudflareBindingActive: false,
};

const NAV_ITEMS: Array<{ id: SidebarPage; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'memory', label: 'Memory' },
  { id: 'skills', label: 'Skills' },
  { id: 'character', label: 'Character' },
  { id: 'recent', label: 'Recent' },
  { id: 'settings', label: 'Settings' },
];

function createGreetingMessage(
  sessionId: string,
  _assistantName: string,
  userNickname = 'Boss'
): ChatMessage {
  const nick = userNickname.trim() || 'Boss';
  return {
    id: `greeting-${sessionId}`,
    sessionId,
    role: 'assistant',
    content: `Arre ${nick}! Kya chal raha hai? Batao!`,
    emotion: 'happy',
    language: 'ur',
    timestamp: new Date().toISOString(),
  };
}

export default function App() {
  const [activePage, setActivePage] = useState<SidebarPage>('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [config, setConfig] = useState<AppConfig>(DEFAULT_CLIENT_CONFIG);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(DEFAULT_PROVIDER_STATUS);
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]);
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [voiceLogs, setVoiceLogs] = useState<VoiceCommandLog[]>([]);
  const [soulMarkdown, setSoulMarkdown] = useState('');
  const [memoryMarkdown, setMemoryMarkdown] = useState('');
  const [totalUserInteractions, setTotalUserInteractions] = useState(0);
  const [heart, setHeart] = useState<HeartState>(() => createDefaultHeartState());
  const [brain, setBrain] = useState<BrainState>(() => createDefaultBrainState());

  const [sessionId, setSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createGreetingMessage(`session-${Date.now()}`, 'ZARA', 'Boss'),
  ]);

  const [inputValue, setInputValue] = useState('');
  const [forceThinking, setForceThinking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [avatarEmotion, setAvatarEmotion] = useState<FacialEmotion>('calm');
  const [micLevel, setMicLevel] = useState(0);
  const [lipOpenness, setLipOpenness] = useState(0);
  const [lipWidth, setLipWidth] = useState(0);

  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [autoWatchCamera, setAutoWatchCamera] = useState(false);
  const [requestedHubTab, setRequestedHubTab] = useState<'visual' | 'study' | 'skills' | 'voice' | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [pendingVoiceReplay, setPendingVoiceReplay] = useState<{
    text: string;
    language: 'en' | 'ur';
    emotion: FacialEmotion;
  } | null>(null);
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const [playingVoiceLogId, setPlayingVoiceLogId] = useState<number | null>(null);
  const [playingVoicePhase, setPlayingVoicePhase] = useState<'command' | 'response' | null>(null);

  const recognitionRef = useRef<SpeechRecognitionHandle | null>(null);
  const wakeRecRef = useRef<SpeechRecognitionHandle | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const voiceReplayAbortRef = useRef<AbortController | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pendingVoiceClipRef = useRef<Promise<Blob | null> | null>(null);
  const utterancePeakVolumeRef = useRef<number>(0);
  const terminatedRef = useRef<boolean>(false);
  const spokenRemindersRef = useRef<Set<number>>(new Set());
  const messagesRef = useRef<ChatMessage[]>(messages);
  const voiceThresholdRef = useRef<number>(DEFAULT_VOICE_ACTIVITY_THRESHOLD);
  const recentCheckInsRef = useRef<string[]>([]);
  const idleCheckInSentForTurnRef = useRef<boolean>(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    voiceThresholdRef.current = normalizeVoiceActivityThreshold(config.voice_activity_threshold);
  }, [config.voice_activity_threshold]);

  const activeCharacter =
    characters.find((c) => c.is_active) ||
    characters.find((c) => c.id === config.active_character_id) ||
    characters[0];

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = (await res.json()) as {
        config: AppConfig;
        skills: SkillConfig[];
        memories: MemoryRecord[];
        notes: NoteRecord[];
        reminders: ReminderRecord[];
        sessions: SessionSummary[];
        characters?: CharacterProfile[];
        knowledge?: KnowledgeSource[];
        voiceLogs?: VoiceCommandLog[];
        providerStatus?: ProviderStatus;
        soulMarkdown?: string;
        memoryMarkdown?: string;
        totalUserInteractions?: number;
        heart?: HeartState;
        brain?: BrainState;
      };
      setConfig(data.config);
      if (data.providerStatus) setProviderStatus(data.providerStatus);
      if (data.characters) setCharacters(data.characters);
      if (data.knowledge) setKnowledge(data.knowledge);
      if (Array.isArray(data.voiceLogs)) setVoiceLogs(data.voiceLogs);
      if (typeof data.soulMarkdown === 'string') setSoulMarkdown(data.soulMarkdown);
      if (typeof data.memoryMarkdown === 'string') setMemoryMarkdown(data.memoryMarkdown);
      if (typeof data.totalUserInteractions === 'number') setTotalUserInteractions(data.totalUserInteractions);
      if (data.heart) setHeart(data.heart);
      if (data.brain) setBrain(data.brain);
      setSkills(data.skills);
      setMemories(data.memories);
      setNotes(data.notes);
      setReminders(data.reminders);
      setSessions(data.sessions);
      if (data.config.active_mood && data.config.active_mood !== 'auto') {
        setAvatarEmotion(data.config.active_mood);
      }
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id.startsWith('greeting-')) {
          return [
            createGreetingMessage(
              prev[0].sessionId,
              data.config.assistant_name,
              data.config.user_nickname || 'Boss'
            ),
          ];
        }
        return prev;
      });
    } catch {
      // ignore transient errors
    } finally {
      setStateLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Prime Web Audio while the browser still considers the user's first
  // pointer, touch, or keyboard action a trusted gesture. TTS completes after
  // a network request, so unlocking only when playback starts is too late.
  useEffect(() => {
    const unlock = () => unlockAudioContext();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  const stopMicMeter = useCallback(() => {
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = 0;
    }
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      pendingVoiceClipRef.current = new Promise<Blob | null>((resolve) => {
        const mimeType = recorder.mimeType || 'audio/webm';
        recorder.onstop = () => {
          const chunks = recordedChunksRef.current;
          recordedChunksRef.current = [];
          if (!chunks.length) {
            resolve(null);
            return;
          }
          const blob = new Blob(chunks, { type: mimeType });
          resolve(blob.size >= 256 ? blob : null);
        };
        recorder.onerror = () => {
          recordedChunksRef.current = [];
          resolve(null);
        };
        try {
          recorder.stop();
        } catch {
          recordedChunksRef.current = [];
          resolve(null);
        }
      });
    } else if (recordedChunksRef.current.length > 0) {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      recordedChunksRef.current = [];
      pendingVoiceClipRef.current = Promise.resolve(blob.size >= 256 ? blob : null);
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioCtxRef.current) {
      void micAudioCtxRef.current.close().catch(() => {});
      micAudioCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    stopMicMeter();
    setAvatarState((cur) => (cur === 'listening' ? 'idle' : cur));
  }, [stopMicMeter]);

  const handleStopVoiceReplay = useCallback(() => {
    if (voiceReplayAbortRef.current) {
      voiceReplayAbortRef.current.abort();
      voiceReplayAbortRef.current = null;
    }
    stopAllSpeech();
    setPlayingVoiceLogId(null);
    setPlayingVoicePhase(null);
  }, []);

  const handleTerminate = useCallback(() => {
    terminatedRef.current = true;
    handleStopVoiceReplay();
    setPendingVoiceReplay(null);
    setLipOpenness(0);
    setLipWidth(0);
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    stopListening();
    setIsSending(false);
    setAvatarState('idle');
  }, [handleStopVoiceReplay, stopListening]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleTerminate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTerminate]);

  const startMicMeter = useCallback(async () => {
    if (micStreamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      recordedChunksRef.current = [];
      pendingVoiceClipRef.current = null;
      if (typeof MediaRecorder !== 'undefined') {
        try {
          const recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };
          recorder.start(250);
          mediaRecorderRef.current = recorder;
        } catch {
          mediaRecorderRef.current = null;
        }
      }
      const audioCtx = new AudioContext();
      micAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let smoothed = 0;
      const loop = () => {
        analyser.getByteFrequencyData(data);
        let total = 0;
        for (let i = 0; i < data.length; i++) total += data[i];
        const raw = Math.min(1, total / data.length / 105);
        // Apply configurable voice-activity noise gate so background noise below threshold settles to 0
        const gated = applyMicNoiseGate(raw, voiceThresholdRef.current);
        smoothed = smoothed * 0.55 + gated * 0.45;
        const level = smoothed < 0.02 ? 0 : smoothed;
        utterancePeakVolumeRef.current = Math.max(utterancePeakVolumeRef.current, level);
        setMicLevel(level);
        micRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      utterancePeakVolumeRef.current = 0.45;
      setMicLevel(0.45);
    }
  }, []);

  const speakWithLipSync = useCallback(
    async (text: string, language: 'en' | 'ur', emotion: FacialEmotion, activeHeart?: HeartState) => {
      terminatedRef.current = false;
      setPendingVoiceReplay(null);
      setAvatarEmotion(emotion);
      const effectiveHeart = activeHeart ?? heart;
      const voiceProfile = resolveVoiceSpeechParameters({
        emotion,
        heart: effectiveHeart,
        moodIntensity: config.mood_intensity,
      });
      const result = await speakText({
        text,
        voiceName: config.tts_voice,
        ttsEngineMode: config.tts_engine_mode,
        language,
        emotion,
        heart: effectiveHeart,
        voiceProfile,
        voiceSpeed: config.voice_speed,
        voiceVolume: config.voice_volume,
        onStart: () => setAvatarState('speaking'),
        onLipSync: (open, width) => {
          setLipOpenness(open);
          setLipWidth(width);
        },
        onEnd: () => {
          setLipOpenness(0);
          setLipWidth(0);
          setAvatarState('idle');
        },
      });
      if (result.engine === 'voice-unavailable') {
        if (result.blockedByAutoplay) {
          setPendingVoiceReplay({ text, language, emotion });
          setWarningBanner(null);
        } else {
          setWarningBanner(`Awaaz play nahin ho saki: ${result.error || 'Voice service unavailable.'}`);
        }
      } else if (result.engine !== 'aborted') {
        setWarningBanner(null);
      }
    },
    [
      config.tts_voice,
      config.tts_engine_mode,
      config.voice_speed,
      config.voice_volume,
      config.mood_intensity,
      heart,
    ]
  );

  // Spoken proactive reminder alerts when due
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      for (const rem of reminders) {
        if (rem.is_done || spokenRemindersRef.current.has(rem.id)) continue;
        if (isReminderDueAt(rem.remind_at, now)) {
          spokenRemindersRef.current.add(rem.id);
          const alertText = `Reminder: ${rem.title}`;
          setMessages((prev) => [
            ...prev,
            {
              id: `rem-alert-${rem.id}-${Date.now()}`,
              sessionId,
              role: 'assistant',
              content: alertText,
              emotion: 'happy',
              language: 'en',
              timestamp: new Date().toISOString(),
              skillExecuted: 'smart_reminder_alert',
            },
          ]);
          if (config.auto_speak) {
            void speakWithLipSync(alertText, 'en', 'happy');
          }
        }
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [reminders, sessionId, config.auto_speak, speakWithLipSync]);

  // Organic friend check-in after 55s of quiet ("bhai kya kar rahe ho, din kaisa guzra, ye kyun kar rahe ho")
  useEffect(() => {
    if (
      !stateLoaded ||
      activePage !== 'home' ||
      avatarState !== 'idle' ||
      isSending ||
      idleCheckInSentForTurnRef.current
    ) {
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (cancelled || idleCheckInSentForTurnRef.current) return;
      idleCheckInSentForTurnRef.current = true;
      void (async () => {
        const recentUserMsgs = messagesRef.current
          .filter((m) => m.role === 'user')
          .slice(-6)
          .reverse()
          .map((m) => m.content);
        let checkIn = buildContextualFriendCheckIn({
          nickname: config.user_nickname || config.user_name || 'Boss',
          memories,
          notes,
          reminders,
          recentUserMessages: recentUserMsgs,
          recentCheckIns: recentCheckInsRef.current,
          isMalePersona: isMaleVoice(config.tts_voice),
          language: config.language,
        });
        try {
          const res = await fetch('/api/proactive-checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recentCheckIns: recentCheckInsRef.current,
              language: config.language,
            }),
            signal: controller.signal,
          });
          if (res.ok) {
            const data = (await res.json()) as {
              message?: string;
              emotion?: FacialEmotion;
              language?: 'en' | 'ur';
              topicKey?: string;
            };
            if (data.message?.trim()) {
              checkIn = {
                message: data.message.trim(),
                emotion:
                  data.emotion === 'happy' ||
                  data.emotion === 'empathetic' ||
                  data.emotion === 'calm'
                    ? data.emotion
                    : 'curious',
                language: data.language === 'en' ? 'en' : 'ur',
                topicKey: data.topicKey || 'ai_friend_curiosity',
              };
            }
          }
        } catch {
          // Local contextual friend check-in fallback is already computed above
        }
        if (cancelled) return;
        recentCheckInsRef.current = [...recentCheckInsRef.current, checkIn.message].slice(-6);
        setAvatarEmotion(checkIn.emotion);
        setMessages((prev) => [
          ...prev,
          {
            id: `checkin-${Date.now()}`,
            sessionId,
            role: 'assistant',
            content: checkIn.message,
            emotion: checkIn.emotion,
            language: checkIn.language,
            timestamp: new Date().toISOString(),
            skillExecuted: 'proactive_checkin',
          },
        ]);
        if (config.auto_speak) {
          void speakWithLipSync(checkIn.message, checkIn.language, checkIn.emotion);
        }
      })();
    }, 55000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    stateLoaded,
    activePage,
    avatarState,
    isSending,
    messages.length,
    sessionId,
    config.user_nickname,
    config.user_name,
    config.tts_voice,
    config.language,
    config.auto_speak,
    memories,
    notes,
    reminders,
    speakWithLipSync,
  ]);

  const handleSaveConfig = useCallback(async (partial: Partial<AppConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Failed to save settings (HTTP ${res.status}).`);
    }
    const data = (await res.json()) as {
      config: AppConfig;
      providerStatus?: ProviderStatus;
    };
    setConfig(data.config);
    if (data.providerStatus) setProviderStatus(data.providerStatus);
  }, []);

  const handleSaveSoul = useCallback(async (content: string) => {
    const res = await fetch('/api/soul', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const data = (await res.json()) as { soulMarkdown: string };
      setSoulMarkdown(data.soulMarkdown);
    }
  }, []);

  const handleResetSoul = useCallback(async () => {
    const res = await fetch('/api/soul', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    if (res.ok) {
      const data = (await res.json()) as { soulMarkdown: string };
      setSoulMarkdown(data.soulMarkdown);
    }
  }, []);

  const handleRefreshMemoryMarkdown = useCallback(async () => {
    const res = await fetch('/api/memory/markdown');
    if (res.ok) {
      const data = (await res.json()) as { memoryMarkdown: string };
      setMemoryMarkdown(data.memoryMarkdown);
    }
  }, []);

  const handleToggleAutoUsb = async (enabled: boolean) => {
    await handleSaveConfig({ auto_usb_transfer: enabled });
  };

  const handleTransferToUsb = async () => {
    const outcome = await performUsbMemoryTransfer({ interactive: true });
    if (outcome.ok) {
      await handleSaveConfig({
        last_usb_sync_at: new Date().toISOString(),
        last_usb_drive_label: outcome.driveLabel,
      });
    }
    return outcome;
  };

  const handleLinkUsbFolder = async () => linkUsbDirectoryHandle();

  const handleSelectMood = useCallback(
    async (mood: MoodMode) => {
      setAvatarEmotion(mood === 'auto' ? 'calm' : mood);
      await handleSaveConfig({ active_mood: mood });
    },
    [handleSaveConfig]
  );

  const handleSelectCharacter = useCallback(async (idOrSlug: number | string) => {
    const res = await fetch(`/api/characters/${encodeURIComponent(String(idOrSlug))}/select`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = (await res.json()) as {
        character: CharacterProfile;
        characters: CharacterProfile[];
        config: AppConfig;
      };
      setCharacters(data.characters);
      setConfig(data.config);
      if (data.config.active_mood !== 'auto') {
        setAvatarEmotion(data.config.active_mood);
      }
    }
  }, []);

  const handleCreateCharacter = useCallback(
    async (input: {
      name: string;
      role_title: string;
      bio: string;
      personality: ResponseStyle;
      default_mood: MoodMode;
      tts_voice: string;
      system_prompt: string;
    }) => {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Could not create character.');
      }
      const data = (await res.json()) as { characters: CharacterProfile[] };
      setCharacters(data.characters);
    },
    []
  );

  const handleDeleteCharacter = useCallback(async (id: number) => {
    const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = (await res.json()) as { characters: CharacterProfile[] };
      setCharacters(data.characters);
    }
  }, []);

  const handleEvolveCharacter = useCallback(async () => {
    const res = await fetch('/api/evolve', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as {
        character: CharacterProfile;
        characters: CharacterProfile[];
        skills: SkillConfig[];
        outcome: {
          nextBondLevel: number;
          nextXp: number;
          newTraits: string[];
          journalEntry: string;
        };
      };
      setCharacters(data.characters);
      setSkills(data.skills);
      const summary = `${data.character.name} evolved to Bond Level ${data.outcome.nextBondLevel} (${data.outcome.nextXp} XP). ${data.outcome.journalEntry}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `evolve-${Date.now()}`,
          sessionId,
          role: 'assistant',
          content: summary,
          emotion: 'confident',
          language: 'en',
          timestamp: new Date().toISOString(),
          skillExecuted: 'self_evolve',
        },
      ]);
      if (config.auto_speak) {
        await speakWithLipSync(summary, 'en', 'confident');
      }
    }
  }, [sessionId, config.auto_speak, speakWithLipSync]);

  const handleAnalyzeStudy = useCallback(
    async (input: {
      kind: KnowledgeKind;
      title: string;
      goal: string;
      contentText: string;
      fileBase64?: string;
      fileMimeType?: string;
    }) => {
      setIsSending(true);
      setAvatarState('thinking');
      try {
        const res = await fetch('/api/study', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, sessionId }),
        });
        const data = (await res.json()) as {
          knowledge: KnowledgeSource[];
          memories: MemoryRecord[];
          reply: string;
          emotion: FacialEmotion;
          modelUsed: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Study analysis failed.');

        setKnowledge(data.knowledge);
        setMemories(data.memories);
        setMessages((prev) => [
          ...prev,
          {
            id: `study-user-${Date.now()}`,
            sessionId,
            role: 'user',
            content: `Read & explain ${input.kind}: ${input.title}${input.goal ? ` — Goal: ${input.goal}` : ''}`,
            language: 'en',
            timestamp: new Date().toISOString(),
          },
          {
            id: `study-assistant-${Date.now() + 1}`,
            sessionId,
            role: 'assistant',
            content: data.reply,
            emotion: data.emotion || 'confident',
            language: 'ur',
            timestamp: new Date().toISOString(),
            modelUsed: data.modelUsed,
            skillExecuted: 'study_mentor',
          },
        ]);
        setIsSending(false);
        if (config.auto_speak) {
          void speakWithLipSync(data.reply.slice(0, 420), 'ur', data.emotion || 'confident');
        } else {
          setAvatarState('idle');
        }
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, config.auto_speak, speakWithLipSync]
  );

  const handleDeleteKnowledge = useCallback(async (id: number) => {
    const res = await fetch(`/api/study/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = (await res.json()) as { knowledge: KnowledgeSource[] };
      setKnowledge(data.knowledge);
    }
  }, []);

  const handleExecuteStudyTask = useCallback(
    async (studyId: number, taskPrompt: string) => {
      if (!taskPrompt.trim() || isSending) return;
      setErrorBanner(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `study-task-user-${Date.now()}`,
          sessionId,
          role: 'user',
          content: taskPrompt.trim(),
          language: 'ur',
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsSending(true);
      setAvatarState('thinking');
      try {
        const res = await fetch(`/api/study/${studyId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskPrompt: taskPrompt.trim(), sessionId }),
        });
        const data = (await res.json()) as {
          reply: string;
          emotion: FacialEmotion;
          modelUsed: string;
          notes?: NoteRecord[];
          reminders?: ReminderRecord[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Could not execute study task.');

        if (data.notes) setNotes(data.notes);
        if (data.reminders) setReminders(data.reminders);

        setMessages((prev) => [
          ...prev,
          {
            id: `study-task-assistant-${Date.now() + 1}`,
            sessionId,
            role: 'assistant',
            content: data.reply,
            emotion: data.emotion || 'confident',
            language: 'ur',
            timestamp: new Date().toISOString(),
            modelUsed: data.modelUsed,
            skillExecuted: 'study_executor',
          },
        ]);
        setIsSending(false);
        if (config.auto_speak) {
          void speakWithLipSync(data.reply.slice(0, 420), 'ur', data.emotion || 'confident');
        } else {
          setAvatarState('idle');
        }
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Unable to execute study task.');
        setAvatarState('error');
      } finally {
        setIsSending(false);
      }
    },
    [isSending, sessionId, config.auto_speak, speakWithLipSync]
  );

  const handleCompleteOnboarding = useCallback(
    async (payload: OnboardingPayload) => {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Failed to activate assistant.');
      }
      const data = (await res.json()) as {
        config: AppConfig;
        characters: CharacterProfile[];
        memories: MemoryRecord[];
      };
      setConfig(data.config);
      if (data.characters) setCharacters(data.characters);
      if (data.memories) setMemories(data.memories);
      setDismissedOnboarding(true);
      const nick = data.config.user_nickname || 'Boss';
      const firstGreeting = createGreetingMessage(sessionId, data.config.assistant_name, nick);
      setMessages([firstGreeting]);
      setActivePage('home');
      if (data.config.auto_speak) {
        void speakWithLipSync(firstGreeting.content, 'ur', 'happy');
      }
    },
    [sessionId, speakWithLipSync]
  );

  const handleReplayOnboarding = useCallback(async () => {
    stopAllSpeech();
    setDismissedOnboarding(false);
    await handleSaveConfig({ onboarding_completed: false });
  }, [handleSaveConfig]);

  const visionHandlerRef = useRef<(prompt?: string) => Promise<void>>(async () => {});
  const camera = useCameraAwareness(autoWatchCamera, () => {
    void visionHandlerRef.current('I waved or moved in front of the camera — acknowledge briefly!');
  });

  const handleCaptureVision = useCallback(
    async (prompt?: string) => {
      setErrorBanner(null);
      if (!camera.isActive) {
        const started = await camera.startCamera();
        if (!started) {
          setErrorBanner(
            camera.error ||
              'No webcam available on this device. Connect a camera or grant permission to use Vision Awareness.'
          );
          return;
        }
        // Let video metadata settle briefly before grabbing a frame
        await new Promise((r) => setTimeout(r, 450));
      }

      const snapshot = camera.captureSnapshotBase64();
      if (!snapshot) {
        setErrorBanner('Camera stream is warming up — click "Look Now" again in a second.');
        return;
      }

      setIsSending(true);
      setAvatarState('thinking');
      try {
        const res = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: snapshot,
            mimeType: 'image/jpeg',
            userPrompt: prompt,
            gestureHint: camera.lastGesture || undefined,
            sessionId,
          }),
        });
        const data = (await res.json()) as {
          reply: string;
          emotion: FacialEmotion;
          language: 'en' | 'ur';
          modelUsed: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Vision request failed.');

        setMessages((prev) => [
          ...prev,
          {
            id: `vision-${Date.now()}`,
            sessionId,
            role: 'assistant',
            content: data.reply,
            emotion: data.emotion || 'curious',
            language: data.language || 'ur',
            timestamp: new Date().toISOString(),
            modelUsed: data.modelUsed,
            skillExecuted: 'vision_awareness',
          },
        ]);
        if (config.auto_speak) {
          await speakWithLipSync(data.reply, data.language || 'ur', data.emotion || 'curious');
        } else {
          setAvatarState('idle');
        }
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Unable to analyze camera frame.');
        setAvatarState('error');
      } finally {
        setIsSending(false);
      }
    },
    [camera, sessionId, config.auto_speak, speakWithLipSync]
  );

  useEffect(() => {
    visionHandlerRef.current = handleCaptureVision;
  }, [handleCaptureVision]);

  const startVoiceListenRef = useRef<() => void>(() => {});

  const attachPendingVoiceClip = useCallback((logId: number) => {
    const pending = pendingVoiceClipRef.current;
    pendingVoiceClipRef.current = null;
    if (!pending) return;
    void pending.then((blob) => {
      if (blob) saveRecordedVoiceClip(logId, blob);
    });
  }, []);

  const recordVoiceLogClient = useCallback(
    async (entry: {
      transcript: string;
      matched_skill_name?: string | null;
      matched_display_name?: string | null;
      action_type?: string | null;
      status: 'matched' | 'ai_fallback' | 'failed';
      response_summary: string;
      source: 'microphone' | 'retrigger';
      language?: 'en' | 'ur';
      volume_level?: number;
    }) => {
      try {
        const res = await fetch('/api/voice-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            log?: VoiceCommandLog;
            voiceLogs?: VoiceCommandLog[];
          };
          if (entry.source === 'microphone' && data.log?.id) {
            attachPendingVoiceClip(data.log.id);
          }
          if (Array.isArray(data.voiceLogs)) {
            setVoiceLogs(data.voiceLogs);
          }
        }
      } catch {
        // Ignore secondary logging failure
      }
    },
    [attachPendingVoiceClip]
  );

  const handleSendMessage = useCallback(
    async (
      explicitText?: string,
      attachment?: ChatAttachmentDraft,
      options?: { inputSource?: 'text' | 'voice' | 'retrigger'; volumeLevel?: number }
    ): Promise<{
      ok: boolean;
      reply?: string;
      skillExecuted?: string;
      launchedUrl?: string;
      error?: string;
    }> => {
      const text = (explicitText ?? inputValue).trim();
      if ((!text && !attachment) || isSending) {
        return {
          ok: false,
          error: isSending ? 'ZARA is already finishing another request.' : 'Command text is empty.',
        };
      }

      const inputSource = options?.inputSource ?? 'text';
      const isVoiceTurn = inputSource === 'voice' || inputSource === 'retrigger';
      const voiceSource: 'microphone' | 'retrigger' =
        inputSource === 'retrigger' ? 'retrigger' : 'microphone';
      const resolvedVolumeLevel =
        typeof options?.volumeLevel === 'number' && Number.isFinite(options.volumeLevel)
          ? options.volumeLevel
          : 0.45;

      const displayUserText = attachment
        ? `[Attached ${attachment.kind}: ${attachment.title}] ${text || 'Read and help me with this.'}`
        : text;

      terminatedRef.current = false;
      idleCheckInSentForTurnRef.current = false;
      stopAllSpeech();
      setLipOpenness(0);
      setLipWidth(0);
      setErrorBanner(null);
      setWarningBanner(null);
      setLaunchedUrl(null);
      if (!explicitText) setInputValue('');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sessionId,
        role: 'user',
        content: displayUserText,
        language: 'en',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);
      setAvatarState('thinking');

      const controller = new AbortController();
      chatAbortRef.current = controller;

      try {
        if (!attachment) {
          const desktopAction = await executeDesktopCommand(text);
          if (desktopAction) {
            const reply = desktopAction.reply;
            const assistantMsg: ChatMessage = {
              id: `assistant-${Date.now()}`,
              sessionId,
              role: 'assistant',
              content: reply,
              emotion: desktopAction.emotion,
              language: 'ur',
              timestamp: new Date().toISOString(),
              modelUsed: 'desktop-companion',
              providerUsed: 'local-desktop',
              thinkingUsed: false,
              skillExecuted: 'desktop_command',
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setIsSending(false);
            chatAbortRef.current = null;
            setAvatarEmotion(desktopAction.emotion);
            if (isVoiceTurn) {
              void recordVoiceLogClient({
                transcript: text,
                matched_skill_name: 'desktop_command',
                matched_display_name: 'Desktop Companion',
                action_type: 'desktop',
                status: 'matched',
                response_summary: reply,
                source: voiceSource,
                language: 'ur',
                volume_level: resolvedVolumeLevel,
              });
            }
            if (config.auto_speak) await speakWithLipSync(reply, 'ur', desktopAction.emotion);
            else setAvatarState('idle');
            return { ok: true, reply, skillExecuted: 'desktop_command' };
          }
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            sessionId,
            forceThinking,
            history: messages.slice(-8),
            attachmentTitle: attachment?.title,
            attachmentText: attachment?.text,
            attachmentKind: attachment?.kind,
            inputSource,
            volumeLevel: isVoiceTurn ? resolvedVolumeLevel : undefined,
          }),
          signal: controller.signal,
        });

        const data = (await res.json()) as ChatApiResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Assistant request failed.');
        }

        if (data.warning) {
          setWarningBanner(data.warning);
        }

        if (data.voiceLog) {
          if (inputSource === 'voice') {
            attachPendingVoiceClip(data.voiceLog.id);
          }
          setVoiceLogs((prev) => [
            data.voiceLog!,
            ...prev.filter((item) => item.id !== data.voiceLog!.id),
          ]);
        }

        const nextLaunchedUrl =
          data.sideEffect?.type === 'open_url' && data.sideEffect.url
            ? data.sideEffect.url
            : undefined;

        if (nextLaunchedUrl) {
          setLaunchedUrl(nextLaunchedUrl);
        } else if (data.sideEffect?.type === 'open_study') {
          setRequestedHubTab('study');
        } else if (data.sideEffect?.type === 'trigger_vision') {
          const mode = data.sideEffect.cameraMode || 'look_now';
          if (mode === 'camera_on') {
            void camera.startCamera();
          } else if (mode === 'camera_off') {
            setAutoWatchCamera(false);
            camera.stopCamera();
          } else if (mode === 'auto_watch_on') {
            setAutoWatchCamera(true);
            void camera.startCamera();
          } else if (mode === 'auto_watch_off') {
            setAutoWatchCamera(false);
          } else {
            void handleCaptureVision(text);
          }
        } else if (data.sideEffect?.type === 'trigger_evolve') {
          void handleEvolveCharacter();
        }

        const replyEmotion: FacialEmotion = data.emotion || 'calm';
        setAvatarEmotion(replyEmotion);
        if (data.heart) setHeart(data.heart);
        if (data.brain) setBrain(data.brain);
        const safeReply = sanitizeBannedPhrases(data.reply, config.user_nickname || 'Boss');

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          sessionId,
          role: 'assistant',
          content: safeReply,
          emotion: replyEmotion,
          language: data.language,
          timestamp: new Date().toISOString(),
          modelUsed: data.modelUsed,
          providerUsed: data.providerUsed,
          thinkingUsed: data.thinkingUsed,
          skillExecuted: data.skillExecuted,
          launchedUrl: nextLaunchedUrl,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsSending(false);
        chatAbortRef.current = null;

        void fetchState();

        if (config.auto_speak) {
          await speakWithLipSync(safeReply, data.language, replyEmotion, data.heart);
        } else {
          setAvatarState('idle');
        }

        if (config.hands_free_mode && !terminatedRef.current && isSpeechRecognitionSupported()) {
          startVoiceListenRef.current();
        }

        return {
          ok: true,
          reply: safeReply,
          skillExecuted: data.skillExecuted,
          launchedUrl: nextLaunchedUrl,
        };
      } catch (err) {
        if (controller.signal.aborted) {
          setAvatarState('idle');
          return { ok: false, error: 'Request aborted.' };
        }
        const message = err instanceof Error ? err.message : 'Unable to reach ZARA backend.';
        setErrorBanner(message);
        setAvatarEmotion('sad');
        setAvatarState('error');
        if (isVoiceTurn && text) {
          void recordVoiceLogClient({
            transcript: text,
            matched_skill_name: null,
            matched_display_name: null,
            action_type: null,
            status: 'failed',
            response_summary: message,
            source: voiceSource,
            volume_level: resolvedVolumeLevel,
          });
        }
        return { ok: false, error: message };
      } finally {
        setIsSending(false);
        chatAbortRef.current = null;
      }
    },
    [
      inputValue,
      isSending,
      sessionId,
      forceThinking,
      messages,
      config.auto_speak,
      config.hands_free_mode,
      config.user_nickname,
      fetchState,
      speakWithLipSync,
      handleCaptureVision,
      handleEvolveCharacter,
      recordVoiceLogClient,
      attachPendingVoiceClip,
      camera,
    ]
  );

  const handlePlayVoiceLog = useCallback(
    async (log: VoiceCommandLog): Promise<{ ok: boolean; aborted?: boolean; error?: string }> => {
      if (voiceReplayAbortRef.current) {
        voiceReplayAbortRef.current.abort();
        voiceReplayAbortRef.current = null;
      }
      const controller = new AbortController();
      voiceReplayAbortRef.current = controller;
      setPlayingVoiceLogId(log.id);
      setPlayingVoicePhase('command');

      try {
        const outcome = await replayVoiceInteraction({
          log,
          voiceName: config.tts_voice,
          voiceSpeed: config.voice_speed,
          voiceVolume: config.voice_volume,
          signal: controller.signal,
          onPhaseChange: (phase) => {
            if (voiceReplayAbortRef.current === controller) {
              setPlayingVoicePhase(phase);
            }
          },
        });
        return outcome;
      } finally {
        if (voiceReplayAbortRef.current === controller) {
          voiceReplayAbortRef.current = null;
          setPlayingVoiceLogId(null);
          setPlayingVoicePhase(null);
        }
      }
    },
    [config.tts_voice, config.voice_speed, config.voice_volume]
  );

  const handleToggleListening = useCallback(() => {
    const capturePeakVolume = () => {
      const peak = utterancePeakVolumeRef.current;
      return peak > 0.02 ? Math.round(peak * 1000) / 1000 : 0.45;
    };
    const isEchoReply = (raw: string) => {
      const lastAssistant = [...messagesRef.current]
        .reverse()
        .find((m) => m.role === 'assistant')?.content;
      return lastAssistant ? isEchoOfPreviousReply(raw, lastAssistant) : false;
    };

    if (avatarState === 'listening') {
      // MediaRecorder -> Gemini 3.5 Transcribe mode when SpeechRecognition is absent
      if (!recognitionRef.current) {
        const capturedVolume = capturePeakVolume();
        stopMicMeter();
        const clipPromise = pendingVoiceClipRef.current;
        if (!clipPromise) {
          setAvatarState('idle');
          return;
        }
        setAvatarState('thinking');
        void (async () => {
          const blob = await clipPromise;
          if (!blob) {
            setAvatarState('idle');
            return;
          }
          const stt = await transcribeAudioBlob(blob);
          const clean = stt.text.trim();
          if (!clean) {
            if (stt.error) setWarningBanner(stt.error);
            setAvatarState('idle');
            return;
          }
          if (isEchoReply(clean)) {
            setInputValue('');
            setAvatarState('idle');
            return;
          }
          setInputValue(clean);
          await handleSendMessage(clean, undefined, {
            inputSource: 'voice',
            volumeLevel: capturedVolume,
          });
        })();
        return;
      }
      stopListening();
      return;
    }

    terminatedRef.current = false;
    stopAllSpeech();
    setPendingVoiceReplay(null);
    setLipOpenness(0);
    setLipWidth(0);
    setErrorBanner(null);

    if (!isSpeechRecognitionSupported()) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setErrorBanner(
          'Live microphone capture is unavailable in this browser context. Type your message below.'
        );
        setAvatarState('error');
        return;
      }
      utterancePeakVolumeRef.current = 0;
      setAvatarState('listening');
      void startMicMeter();
      return;
    }

    utterancePeakVolumeRef.current = 0;
    setAvatarState('listening');
    void startMicMeter();

    let latestTranscript = '';
    let sentFinal = false;

    const handle = startBrowserRecognition({
      lang: config.language === 'en' ? 'en-US' : 'ur-PK',
      continuous: false,
      onTranscript: (transcript, isFinal) => {
        latestTranscript = transcript;
        setInputValue(transcript);
        if (isFinal && transcript.trim() && !sentFinal) {
          sentFinal = true;
          const capturedVolume = capturePeakVolume();
          stopListening();
          if (isEchoReply(transcript.trim())) {
            setInputValue('');
            setAvatarState('idle');
            return;
          }
          void handleSendMessage(transcript.trim(), undefined, {
            inputSource: 'voice',
            volumeLevel: capturedVolume,
          });
        }
      },
      onError: (err) => {
        const capturedVolume = capturePeakVolume();
        stopListening();
        if (err !== 'no-speech' && err !== 'aborted') {
          const clipPromise = pendingVoiceClipRef.current;
          if (clipPromise && !sentFinal) {
            void (async () => {
              const blob = await clipPromise;
              if (blob && blob.size >= 512) {
                const stt = await transcribeAudioBlob(blob);
                const clean = stt.text.trim();
                if (clean && !isEchoReply(clean)) {
                  sentFinal = true;
                  setInputValue(clean);
                  await handleSendMessage(clean, undefined, {
                    inputSource: 'voice',
                    volumeLevel: capturedVolume,
                  });
                  return;
                }
              }
              setErrorBanner(`Microphone / speech error: ${err}`);
              setAvatarState('error');
              void recordVoiceLogClient({
                transcript: latestTranscript.trim() || `[Voice capture error: ${err}]`,
                status: 'failed',
                response_summary: `Microphone / speech error: ${err}`,
                source: 'microphone',
                volume_level: capturedVolume,
              });
            })();
            return;
          }
          setErrorBanner(`Microphone / speech error: ${err}`);
          setAvatarState('error');
          void recordVoiceLogClient({
            transcript: latestTranscript.trim() || `[Voice capture error: ${err}]`,
            status: 'failed',
            response_summary: `Microphone / speech error: ${err}`,
            source: 'microphone',
            volume_level: capturedVolume,
          });
        }
      },
      onEnd: () => {
        const capturedVolume = capturePeakVolume();
        stopMicMeter();
        recognitionRef.current = null;
        if (latestTranscript.trim() && !sentFinal) {
          sentFinal = true;
          if (isEchoReply(latestTranscript.trim())) {
            setInputValue('');
            setAvatarState('idle');
            return;
          }
          void handleSendMessage(latestTranscript.trim(), undefined, {
            inputSource: 'voice',
            volumeLevel: capturedVolume,
          });
        } else {
          setAvatarState((cur) => (cur === 'listening' ? 'idle' : cur));
        }
      },
    });
    recognitionRef.current = handle;
  }, [
    avatarState,
    config.language,
    handleSendMessage,
    recordVoiceLogClient,
    startMicMeter,
    stopListening,
    stopMicMeter,
  ]);

  useEffect(() => {
    startVoiceListenRef.current = handleToggleListening;
  }, [handleToggleListening]);

  useEffect(() => {
    if (!wakeWordActive) {
      if (wakeRecRef.current) {
        wakeRecRef.current.stop();
        wakeRecRef.current = null;
      }
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setErrorBanner('Wake word listener requires browser SpeechRecognition support.');
      setWakeWordActive(false);
      return;
    }

    void startMicMeter();
    const wakePhrase = config.wake_word.toLowerCase();
    const handle = startBrowserRecognition({
      lang: 'en-US',
      continuous: true,
      onTranscript: (transcript) => {
        const lower = transcript.toLowerCase();
        if (lower.includes(wakePhrase)) {
          wakeRecRef.current?.stop();
          wakeRecRef.current = null;
          setWakeWordActive(false);
          handleToggleListening();
        }
      },
      onError: () => {
        setWakeWordActive(false);
      },
      onEnd: () => {
        wakeRecRef.current = null;
      },
    });
    wakeRecRef.current = handle;

    return () => {
      handle?.stop();
      if (!recognitionRef.current) {
        stopMicMeter();
      }
    };
  }, [wakeWordActive, config.wake_word, handleToggleListening, startMicMeter, stopMicMeter]);

  const handleNewSession = () => {
    handleTerminate();
    idleCheckInSentForTurnRef.current = false;
    const nextId = `session-${Date.now()}`;
    setSessionId(nextId);
    setMessages([
      createGreetingMessage(nextId, config.assistant_name, config.user_nickname || 'Boss'),
    ]);
    setAvatarEmotion(config.active_mood === 'auto' ? 'calm' : config.active_mood);
    setLaunchedUrl(null);
    setErrorBanner(null);
    setWarningBanner(null);
    setActivePage('home');
  };

  const handleToggleSkill = async (id: number, is_enabled: boolean) => {
    const res = await fetch(`/api/skills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled }),
    });
    if (res.ok) {
      setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, is_enabled } : s)));
    }
  };

  const handleAddNote = async (title: string, content: string) => {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    if (res.ok) {
      const data = (await res.json()) as { notes: NoteRecord[] };
      setNotes(data.notes);
    }
  };

  const handleDeleteNote = async (id: number) => {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = (await res.json()) as { notes: NoteRecord[] };
      setNotes(data.notes);
    }
  };

  const handleAddReminder = async (title: string, remind_at: string) => {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, remind_at }),
    });
    if (res.ok) {
      const data = (await res.json()) as { reminders: ReminderRecord[] };
      setReminders(data.reminders);
    }
  };

  const handleToggleReminder = async (id: number, is_done: boolean) => {
    const res = await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_done }),
    });
    if (res.ok) {
      const data = (await res.json()) as { reminders: ReminderRecord[] };
      setReminders(data.reminders);
    }
  };

  const handleDeleteReminder = async (id: number) => {
    const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = (await res.json()) as { reminders: ReminderRecord[] };
      setReminders(data.reminders);
    }
  };

  const handleDeleteVoiceLog = async (id: number) => {
    if (playingVoiceLogId === id) {
      handleStopVoiceReplay();
    }
    deleteRecordedVoiceClip(id);
    const res = await fetch(`/api/voice-history/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = (await res.json()) as { voiceLogs: VoiceCommandLog[] };
      setVoiceLogs(data.voiceLogs);
    }
  };

  const handleClearVoiceHistory = async () => {
    handleStopVoiceReplay();
    clearRecordedVoiceClips();
    const res = await fetch('/api/voice-history', { method: 'DELETE' });
    if (res.ok) {
      setVoiceLogs([]);
    }
  };

  if (stateLoaded && !config.onboarding_completed && !isAutostart && !dismissedOnboarding) {
    return (
      <OnboardingFlow
        initialUserName={config.user_name}
        initialAssistantName={config.assistant_name}
        initialHairstyle={config.hairstyle}
        onComplete={handleCompleteOnboarding}
        onSkipToApp={() => setDismissedOnboarding(true)}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#04070D] text-slate-100">
      <OfflineIndicator />

      {/* Top Bar — Strict 3-Zone Obsidian Studio Contract */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-8 border-b border-white/[0.07] bg-[#060B14]/90 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="font-display text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            {config.assistant_name} <span className="font-normal text-cyan-400/90">AI</span>
          </button>
        </div>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 text-sm font-medium md:flex"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`border-b-2 py-4 text-xs font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-cyan-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          {launchedUrl && (
            <a
              href={launchedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-cyan-400 underline underline-offset-4 hover:text-cyan-300 whitespace-nowrap shrink-0"
            >
              Open launched link
            </a>
          )}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden sm:block">
            <PWAInstallButton compact onOpenLaptopTab={() => setActivePage('settings')} />
          </div>
          <button
            type="button"
            onClick={handleNewSession}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-white whitespace-nowrap shrink-0"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 text-cyan-400" />
            <span>New Session</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="relative flex min-h-0 flex-1">
        {mobileNavOpen && (
          <aside
            aria-label="Mobile navigation"
            className="absolute inset-y-0 left-0 z-40 flex w-60 flex-col justify-between border-r border-white/[0.08] bg-[#070C16]/95 p-4 shadow-2xl backdrop-blur-xl md:hidden"
          >
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActivePage(item.id);
                      setMobileNavOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200'
                        : 'border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-white/[0.07] pt-3 text-xs text-slate-400 tabular-nums">
              <p>{memories.length} memories</p>
              <p className="mt-1">{skills.filter((s) => s.is_enabled).length} skills active</p>
            </div>
          </aside>
        )}

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent">
          {activePage === 'home' && (
            <HomeView
              config={config}
              providerStatus={providerStatus}
              activeCharacter={activeCharacter}
              heart={heart}
              brain={brain}
              memories={memories}
              notes={notes}
              reminders={reminders}
              skills={skills}
              knowledge={knowledge}
              avatarState={avatarState}
              avatarEmotion={avatarEmotion}
              micLevel={micLevel}
              lipOpenness={lipOpenness}
              lipWidth={lipWidth}
              messages={messages}
              inputValue={inputValue}
              forceThinking={forceThinking}
              isSending={isSending}
              wakeWordActive={wakeWordActive}
              autoSpeak={config.auto_speak}
              handsFreeMode={config.hands_free_mode}
              autoWatchCamera={autoWatchCamera}
              camera={camera}
              requestedHubTab={requestedHubTab}
              errorBanner={errorBanner}
              warningBanner={warningBanner}
              pendingVoiceReplay={Boolean(pendingVoiceReplay)}
              onPlayPendingVoice={
                pendingVoiceReplay
                  ? () => {
                      const queued = pendingVoiceReplay;
                      setPendingVoiceReplay(null);
                      void speakWithLipSync(queued.text, queued.language, queued.emotion);
                    }
                  : undefined
              }
              onNavigate={setActivePage}
              onInputChange={setInputValue}
              onSelectMood={(mood) => void handleSelectMood(mood)}
              onSendMessage={handleSendMessage}
              onToggleForceThinking={() => setForceThinking((v) => !v)}
              onToggleListening={handleToggleListening}
              onToggleWakeWord={() => setWakeWordActive((v) => !v)}
              onToggleAutoSpeak={() => void handleSaveConfig({ auto_speak: !config.auto_speak })}
              onToggleHandsFree={() => void handleSaveConfig({ hands_free_mode: !config.hands_free_mode })}
              onToggleAutoWatchCamera={() => setAutoWatchCamera((v) => !v)}
              onCaptureVision={handleCaptureVision}
              onAnalyzeStudy={handleAnalyzeStudy}
              onExecuteStudyTask={handleExecuteStudyTask}
              onEvolveCharacter={handleEvolveCharacter}
              onTerminate={handleTerminate}
              onReplayMessage={(msg) =>
                void speakWithLipSync(msg.content, msg.language, msg.emotion || 'calm')
              }
              onDismissError={() => {
                setErrorBanner(null);
                setAvatarState('idle');
                setAvatarEmotion('calm');
              }}
              onSaveConfig={handleSaveConfig}
              onToggleSkill={handleToggleSkill}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onAddReminder={handleAddReminder}
              onToggleReminder={handleToggleReminder}
              onDeleteReminder={handleDeleteReminder}
            />
          )}

          {activePage === 'memory' && (
            <MemoryView
              memories={memories}
              notes={notes}
              reminders={reminders}
              knowledge={knowledge}
              memoryMarkdown={memoryMarkdown}
              onRefreshMemoryMarkdown={handleRefreshMemoryMarkdown}
              autoUsbTransfer={config.auto_usb_transfer}
              lastUsbSyncAt={config.last_usb_sync_at}
              lastUsbDriveLabel={config.last_usb_drive_label}
              onToggleAutoUsb={handleToggleAutoUsb}
              onTransferToUsb={handleTransferToUsb}
              onLinkUsbFolder={handleLinkUsbFolder}
              onAddMemory={async (input) => {
                const res = await fetch('/api/memories', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(input),
                });
                if (res.ok) {
                  const data = (await res.json()) as {
                    memories: MemoryRecord[];
                    memoryMarkdown?: string;
                  };
                  setMemories(data.memories);
                  if (typeof data.memoryMarkdown === 'string') {
                    setMemoryMarkdown(data.memoryMarkdown);
                  }
                }
              }}
              onDeleteMemory={async (id) => {
                const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as {
                    memories: MemoryRecord[];
                    memoryMarkdown?: string;
                  };
                  setMemories(data.memories);
                  if (typeof data.memoryMarkdown === 'string') {
                    setMemoryMarkdown(data.memoryMarkdown);
                  }
                }
              }}
              onClearAllMemories={async () => {
                const res = await fetch('/api/memories', { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as { memoryMarkdown?: string };
                  setMemories([]);
                  if (typeof data.memoryMarkdown === 'string') {
                    setMemoryMarkdown(data.memoryMarkdown);
                  }
                }
              }}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onAddReminder={handleAddReminder}
              onToggleReminder={handleToggleReminder}
              onDeleteReminder={handleDeleteReminder}
              onDeleteKnowledge={handleDeleteKnowledge}
            />
          )}

          {activePage === 'skills' && (
            <SkillsView
              skills={skills}
              knowledge={knowledge}
              voiceLogs={voiceLogs}
              onToggleSkill={handleToggleSkill}
              onCreateSkill={async (input: {
                display_name: string;
                description: string;
                trigger_phrases: string[];
                action_type: SkillActionType;
                action_value: string;
              }) => {
                const res = await fetch('/api/skills', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(input),
                });
                const data = (await res.json()) as { skills?: SkillConfig[]; error?: string };
                if (!res.ok) {
                  throw new Error(data.error || 'Could not save command.');
                }
                if (data.skills) setSkills(data.skills);
              }}
              onUpdateSkill={async (
                id: number,
                input: {
                  display_name: string;
                  description: string;
                  trigger_phrases: string[];
                  action_type: SkillActionType;
                  action_value: string;
                }
              ) => {
                const res = await fetch(`/api/skills/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(input),
                });
                const data = (await res.json()) as { skills?: SkillConfig[]; error?: string };
                if (!res.ok) {
                  throw new Error(data.error || 'Could not update command.');
                }
                if (data.skills) setSkills(data.skills);
              }}
              onDeleteSkill={async (id) => {
                const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
                if (res.ok) {
                  const data = (await res.json()) as { skills: SkillConfig[] };
                  setSkills(data.skills);
                }
              }}
              onDeleteKnowledge={handleDeleteKnowledge}
              onTestSkill={(phrase) => {
                setActivePage('home');
                void handleSendMessage(phrase);
              }}
              onRetriggerVoiceCommand={(transcript, volumeLevel) =>
                handleSendMessage(transcript, undefined, {
                  inputSource: 'retrigger',
                  volumeLevel,
                })
              }
              playingVoiceLogId={playingVoiceLogId}
              playingVoicePhase={playingVoicePhase}
              onPlayVoiceLog={handlePlayVoiceLog}
              onStopVoiceReplay={handleStopVoiceReplay}
              onDeleteVoiceLog={handleDeleteVoiceLog}
              onClearVoiceHistory={handleClearVoiceHistory}
              onNavigateHome={() => setActivePage('home')}
              onExecuteStudyTask={(studyId, taskPrompt) => {
                setActivePage('home');
                void handleExecuteStudyTask(studyId, taskPrompt);
              }}
            />
          )}

          {activePage === 'character' && (
            <CharacterView
              config={config}
              characters={characters}
              activeCharacter={activeCharacter}
              heart={heart}
              brain={brain}
              avatarEmotion={avatarEmotion}
              soulMarkdown={soulMarkdown}
              totalUserInteractions={totalUserInteractions}
              onSaveSoul={handleSaveSoul}
              onResetSoul={handleResetSoul}
              onSaveConfig={handleSaveConfig}
              onSelectCharacter={handleSelectCharacter}
              onCreateCharacter={handleCreateCharacter}
              onDeleteCharacter={handleDeleteCharacter}
              onEvolveCharacter={handleEvolveCharacter}
            />
          )}

          {activePage === 'recent' && (
            <RecentView
              assistantName={config.assistant_name}
              sessions={sessions}
              activeSessionId={sessionId}
              onResumeSession={async (id) => {
                const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
                if (res.ok) {
                  const data = (await res.json()) as { messages: ChatMessage[] };
                  setSessionId(id);
                  setMessages(
                    data.messages.length > 0
                      ? data.messages
                      : [
                          createGreetingMessage(
                            id,
                            config.assistant_name,
                            config.user_nickname || 'Boss'
                          ),
                        ]
                  );
                  setActivePage('home');
                }
              }}
              onDeleteSession={async (id) => {
                const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
                  method: 'DELETE',
                });
                if (res.ok) {
                  const data = (await res.json()) as { sessions: SessionSummary[] };
                  setSessions(data.sessions);
                }
              }}
            />
          )}

          {activePage === 'settings' && (
            <SettingsView
              config={config}
              providerStatus={providerStatus}
              memoryCount={memories.length}
              heart={heart}
              onSaveConfig={handleSaveConfig}
              onClearAllMemories={async () => {
                const res = await fetch('/api/memories', { method: 'DELETE' });
                if (res.ok) {
                  setMemories([]);
                }
              }}
              onReplayOnboarding={handleReplayOnboarding}
            />
          )}
        </main>
      </div>
    </div>
  );
}
