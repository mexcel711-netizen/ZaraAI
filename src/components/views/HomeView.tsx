import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  Camera,
  CameraOff,
  CheckCircle2,
  Circle,
  Cpu,
  Database,
  Eye,
  Heart,
  Laptop,
  Mic,
  MicOff,
  Paperclip,
  Play,
  Plus,
  Power,
  Radio,
  Repeat,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { CameraAwarenessState } from '../../lib/useCameraAwareness';
import {
  FEMALE_VOICE_OPTIONS,
  MALE_VOICE_OPTIONS,
  VOICE_ENGINE_OPTIONS,
  getVoicePreviewSample,
} from '../../lib/voiceCatalog';
import { speakText, stopAllSpeech, unlockAudioContext } from '../../lib/voiceService';
import type {
  AppConfig,
  AvatarState,
  BrainState,
  CharacterProfile,
  ChatMessage,
  FacialEmotion,
  HeartState,
  KnowledgeKind,
  KnowledgeSource,
  MemoryRecord,
  MoodMode,
  NoteRecord,
  ProviderStatus,
  ReminderRecord,
  SidebarPage,
  SkillConfig,
  TtsEngineMode,
} from '../../types/nova';
import { HolographicAvatar } from '../HolographicAvatar';

export interface ChatAttachmentDraft {
  title: string;
  text: string;
  kind: KnowledgeKind;
}

interface HomeViewProps {
  config: AppConfig;
  providerStatus: ProviderStatus;
  activeCharacter?: CharacterProfile;
  heart?: HeartState;
  brain?: BrainState;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  skills: SkillConfig[];
  knowledge: KnowledgeSource[];
  avatarState: AvatarState;
  avatarEmotion: FacialEmotion;
  micLevel: number;
  lipOpenness: number;
  lipWidth: number;
  messages: ChatMessage[];
  inputValue: string;
  forceThinking: boolean;
  isSending: boolean;
  wakeWordActive: boolean;
  autoSpeak: boolean;
  handsFreeMode: boolean;
  autoWatchCamera: boolean;
  camera: CameraAwarenessState;
  requestedHubTab?: 'visual' | 'study' | 'skills' | 'voice' | null;
  errorBanner: string | null;
  warningBanner: string | null;
  pendingVoiceReplay?: boolean;
  onPlayPendingVoice?: () => void;
  onNavigate: (page: SidebarPage) => void;
  onInputChange: (val: string) => void;
  onSelectMood: (mood: MoodMode) => void;
  onSendMessage: (text?: string, attachment?: ChatAttachmentDraft) => void;
  onToggleForceThinking: () => void;
  onToggleListening: () => void;
  onToggleWakeWord: () => void;
  onToggleAutoSpeak: () => void;
  onToggleHandsFree: () => void;
  onToggleAutoWatchCamera: () => void;
  onCaptureVision: (prompt?: string) => Promise<void>;
  onAnalyzeStudy: (input: {
    kind: KnowledgeKind;
    title: string;
    goal: string;
    contentText: string;
    fileBase64?: string;
    fileMimeType?: string;
  }) => Promise<void>;
  onExecuteStudyTask: (studyId: number, taskPrompt: string) => Promise<void>;
  onEvolveCharacter: () => Promise<void>;
  onTerminate: () => void;
  onReplayMessage: (msg: ChatMessage) => void;
  onDismissError: () => void;
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
  onToggleSkill: (id: number, isEnabled: boolean) => Promise<void>;
  onAddNote: (title: string, content: string) => Promise<void>;
  onDeleteNote: (id: number) => Promise<void>;
  onAddReminder: (title: string, remindAt: string) => Promise<void>;
  onToggleReminder: (id: number, isDone: boolean) => Promise<void>;
  onDeleteReminder: (id: number) => Promise<void>;
}

type CenterHubTab = 'visual' | 'study' | 'skills' | 'voice';
type RightPanelTab = 'chat' | 'notes' | 'reminders';

const QUICK_VISUAL_PROMPTS = [
  { label: 'Baat karo (Kya chal raha hai aaj?)', text: 'Mood kaisa hai aaj? Chai pi li?' },
  { label: 'Remember something about me', text: 'Yaad rakhna mujhe raat ko coding karte hue chai pasand hai' },
  { label: 'Create a quick bilingual note', text: 'create note: Prepare daily study checklist' },
  {
    label: 'Deep Thinking architecture blueprint',
    text: 'Design a resilient event-driven architecture for an offline-first voice assistant and explain trade-offs step by step.',
  },
];

const MOOD_OPTIONS: Array<{ id: MoodMode; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'calm', label: 'Calm' },
  { id: 'happy', label: 'Happy' },
  { id: 'empathetic', label: 'Empathetic' },
  { id: 'love', label: 'Love' },
  { id: 'sad', label: 'Sad' },
  { id: 'surprised', label: 'Surprised' },
];

const MAP_GRID_DOTS: Array<[number, number]> = [
  [36, 36], [46, 34], [56, 36], [66, 38], [40, 44], [52, 46], [64, 46], [74, 46], [58, 56], [68, 66], [76, 78], [80, 90],
  [120, 32], [130, 32], [140, 34], [126, 42], [136, 42], [146, 42], [132, 54], [142, 64], [146, 78], [138, 88],
  [158, 36], [168, 38], [178, 36], [188, 36], [198, 40], [208, 44], [164, 48], [174, 52], [184, 52], [194, 54], [204, 56],
  [182, 64], [192, 66], [208, 72], [218, 86], [228, 92], [216, 98],
];

export function HomeView({
  config,
  providerStatus,
  activeCharacter,
  heart,
  brain,
  memories,
  notes,
  reminders,
  skills,
  knowledge,
  avatarState,
  avatarEmotion,
  micLevel,
  lipOpenness,
  lipWidth,
  messages,
  inputValue,
  forceThinking,
  isSending,
  wakeWordActive,
  autoSpeak,
  handsFreeMode,
  autoWatchCamera,
  camera,
  requestedHubTab,
  errorBanner,
  warningBanner,
  pendingVoiceReplay = false,
  onPlayPendingVoice,
  onNavigate,
  onInputChange,
  onSelectMood,
  onSendMessage,
  onToggleForceThinking,
  onToggleListening,
  onToggleWakeWord,
  onToggleAutoSpeak,
  onToggleHandsFree,
  onToggleAutoWatchCamera,
  onCaptureVision,
  onAnalyzeStudy,
  onExecuteStudyTask,
  onEvolveCharacter,
  onTerminate,
  onReplayMessage,
  onDismissError,
  onSaveConfig,
  onToggleSkill,
  onAddNote,
  onDeleteNote,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
}: HomeViewProps) {
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const [speechLang, setSpeechLang] = useState<'en-US' | 'ur-PK'>('ur-PK');
  const [centerTab, setCenterTab] = useState<CenterHubTab>('visual');
  const [rightTab, setRightTab] = useState<RightPanelTab>('chat');

  // Study & Code Lab form state
  const [studyKind, setStudyKind] = useState<KnowledgeKind>('book');
  const [studyTitle, setStudyTitle] = useState('');
  const [studyGoal, setStudyGoal] = useState('');
  const [studyContent, setStudyContent] = useState('');
  const [studyFileBase64, setStudyFileBase64] = useState<string | undefined>(undefined);
  const [studyFileMime, setStudyFileMime] = useState<string | undefined>(undefined);
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [selectedStudyId, setSelectedStudyId] = useState<number>(0);
  const [studyTaskPrompt, setStudyTaskPrompt] = useState('');
  const [chatAttachment, setChatAttachment] = useState<ChatAttachmentDraft | null>(null);

  // Inline Note & Reminder quick forms in Right Panel
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickRemText, setQuickRemText] = useState('');
  const [quickRemTime, setQuickRemTime] = useState('06:00 PM');
  const [hubVoiceTesting, setHubVoiceTesting] = useState(false);

  useEffect(() => {
    if (knowledge.length > 0 && !knowledge.some((k) => k.id === selectedStudyId)) {
      setSelectedStudyId(knowledge[0].id);
    }
  }, [knowledge, selectedStudyId]);

  useEffect(() => {
    if (requestedHubTab) {
      setCenterTab(requestedHubTab);
    }
  }, [requestedHubTab]);

  useEffect(() => {
    const el = chatListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isSending, rightTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setRightTab('chat');
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const stateDescription =
    avatarState === 'listening'
      ? 'Listening for voice command...'
      : avatarState === 'thinking'
        ? 'Reasoning with deep context...'
        : avatarState === 'speaking'
          ? `${config.assistant_name} is speaking (${avatarEmotion})`
          : avatarState === 'error'
            ? 'Attention required'
            : wakeWordActive
              ? `Ready · Say "${config.wake_word}"`
              : `Ready · Mood: ${config.active_mood === 'auto' ? `Auto (${avatarEmotion})` : config.active_mood}`;

  const providerLabel =
    providerStatus.activeProvider === 'cloudflare-binding'
      ? 'Cloudflare AI Binding'
      : providerStatus.activeProvider === 'cloudflare-rest'
        ? 'Cloudflare Workers AI'
        : providerStatus.activeProvider === 'google-ai-studio'
          ? 'Google AI Studio'
          : 'Local Companion Mode';

  const activeSkillsCount = skills.filter((s) => s.is_enabled).length;
  const pendingRemindersCount = reminders.filter((r) => !r.is_done).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && !chatAttachment) || isSending) return;
    const text = inputValue.trim() || `Read "${chatAttachment?.title}" and tell me key takeaways + next task.`;
    const att = chatAttachment || undefined;
    setChatAttachment(null);
    onInputChange('');
    onSendMessage(text, att);
  };

  const handleChatFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const kind: KnowledgeKind = /\.(ts|tsx|js|jsx|py|sql|json)$/i.test(file.name)
      ? 'software'
      : /course|syllabus|lesson|module/i.test(file.name)
        ? 'course'
        : 'book';
    setChatAttachment({
      title: file.name.replace(/\.[^.]+$/, ''),
      text: text.slice(0, 75000),
      kind,
    });
    e.target.value = '';
  };

  const handleStudyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setStudyError('File must be under 8 MB.');
      e.target.value = '';
      return;
    }
    setStudyError(null);
    if (!studyTitle.trim()) {
      setStudyTitle(file.name.replace(/\.[^.]+$/, ''));
    }
    const isTextLike =
      file.type.startsWith('text/') ||
      /\.(md|txt|json|ts|tsx|js|jsx|py|csv|html|css|yml|yaml|sql)$/i.test(file.name);
    if (isTextLike) {
      const text = await file.text();
      setStudyContent(text.slice(0, 24000));
      setStudyFileBase64(undefined);
      setStudyFileMime(undefined);
    } else {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += 0x8000) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
      }
      setStudyFileBase64(btoa(chunks.join('')));
      setStudyFileMime(file.type || 'application/pdf');
      if (!studyContent.trim()) {
        setStudyContent(`Uploaded ${file.name} (${Math.round(file.size / 1024)} KB)`);
      }
    }
  };

  const handleStudySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyContent.trim() && !studyFileBase64) {
      setStudyError('Paste book/course/code text or upload a file first.');
      return;
    }
    setStudyError(null);
    setStudyBusy(true);
    try {
      await onAnalyzeStudy({
        kind: studyKind,
        title: studyTitle.trim() || `${studyKind.toUpperCase()} Study`,
        goal: studyGoal.trim(),
        contentText: studyContent.trim(),
        fileBase64: studyFileBase64,
        fileMimeType: studyFileMime,
      });
      setRightTab('chat');
      setStudyContent('');
      setStudyFileBase64(undefined);
      setStudyFileMime(undefined);
    } catch (err) {
      setStudyError(err instanceof Error ? err.message : 'Study analysis failed.');
    } finally {
      setStudyBusy(false);
    }
  };

  const handleQuickNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteText.trim()) return;
    await onAddNote('Quick Note', quickNoteText.trim());
    setQuickNoteText('');
  };

  const handleQuickRemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRemText.trim()) return;
    await onAddReminder(quickRemText.trim(), quickRemTime.trim() || 'Today');
    setQuickRemText('');
  };

  return (
    <div className="grid h-full content-start gap-3.5 overflow-y-auto bg-transparent p-3.5 grid-cols-1 lg:min-h-0 lg:content-stretch lg:grid-cols-[252px_minmax(0,1fr)_344px] xl:grid-cols-[276px_minmax(0,1fr)_384px] lg:overflow-hidden">
      {/* FAR LEFT COLUMN: Living Character Bond + Camera Awareness + AI Topology + Stored Intelligence */}
      <aside
        aria-label="Core context and live intelligence"
        className="order-2 flex flex-col gap-3 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5"
      >
        {/* Top Living Character & Live Feed Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#080E1A] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-cyan-300">
              {activeCharacter ? activeCharacter.name : config.assistant_name} Core
            </h3>
            <button
              type="button"
              onClick={() => setSpeechLang((prev) => (prev === 'en-US' ? 'ur-PK' : 'en-US'))}
              className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-400/45 hover:text-white whitespace-nowrap shrink-0"
            >
              {speechLang === 'ur-PK' ? 'Urdu (PK)' : 'English'}
            </button>
          </div>
          <p className="mt-1.5 text-xs font-medium text-slate-100 truncate">{providerLabel}</p>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-300/95 tabular-nums">
            <span>
              Bond Lv {activeCharacter?.bond_level ?? 1} · {activeCharacter?.xp ?? 0} XP
            </span>
            <button
              type="button"
              onClick={() => void onEvolveCharacter()}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/20 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-2.5 w-2.5" />
              <span>Develop</span>
            </button>
          </div>

          {heart && brain && (
            <div
              data-testid="home-heart-brain-readout"
              className="mt-2.5 space-y-2 border-t border-white/[0.07] pt-2.5"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                <span className="inline-flex items-center gap-1.5 font-medium text-rose-300">
                  <Heart className="h-3 w-3 shrink-0" />
                  <span className="capitalize">{heart.currentFeeling}</span>
                </span>
                <span data-testid="home-heartbeat-bpm" className="font-mono text-slate-300">
                  {heart.heartbeatBpm} BPM · {heart.warmth}%
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full bg-rose-400/85 transition-all duration-300"
                  style={{ width: `${Math.max(10, Math.min(100, heart.warmth))}%` }}
                />
              </div>
              <div className="flex items-start gap-1.5 text-[11px] text-slate-300">
                <Brain className="mt-0.5 h-3 w-3 shrink-0 text-cyan-400" />
                <p
                  data-testid="home-brain-thought"
                  className="line-clamp-2 leading-snug text-slate-300"
                  dir="auto"
                >
                  {brain.currentThought}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Camera & Gesture Awareness Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#080E1A] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
              Vision &amp; Gesture
            </h3>
            <button
              type="button"
              onClick={() => (camera.isActive ? camera.stopCamera() : void camera.startCamera())}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                camera.isActive
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/[0.1] bg-white/[0.04] text-slate-300 hover:border-cyan-400/45 hover:text-white'
              }`}
            >
              {camera.isActive ? <CameraOff className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
              <span>{camera.isActive ? 'Cam Off' : 'Cam On'}</span>
            </button>
          </div>

          {camera.isActive && (
            <div className="relative mt-2.5 overflow-hidden rounded-lg border border-white/[0.08] bg-black">
              <video
                ref={camera.videoRef}
                muted
                playsInline
                className="h-24 w-full object-cover"
              />
              <div className="flex items-center justify-between bg-slate-950/90 px-2 py-1 text-[10px] text-slate-300 tabular-nums">
                <span>{camera.lastGesture || 'Watching...'}</span>
                <span>Motion {camera.motionLevel}%</span>
              </div>
            </div>
          )}

          {camera.error && (
            <p className="mt-1.5 text-[11px] leading-snug text-amber-300">{camera.error}</p>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSending}
              onClick={() => void onCaptureVision()}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
            >
              <Eye className="h-3 w-3" />
              <span>Look Now</span>
            </button>
            <button
              type="button"
              aria-pressed={autoWatchCamera}
              onClick={onToggleAutoWatchCamera}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                autoWatchCamera
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white'
              }`}
            >
              Auto-Watch
            </button>
          </div>
        </div>

        {/* YOUR WORLD: Circular Glowing 3D Cyan Earth Globe */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#080E1A] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
              Your World
            </h3>
            <span className="text-[11px] font-mono text-cyan-400/90 tabular-nums">
              {providerStatus.cloudflareBindingActive ? 'CF-Edge' : 'Live'}
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-center py-0.5">
            <svg viewBox="0 0 180 124" className="h-[104px] w-full" aria-label="Glowing global intelligence globe">
              <defs>
                <radialGradient id="globeGlow" cx="50%" cy="46%" r="50%">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.34" />
                  <stop offset="68%" stopColor="#0891B2" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#030A13" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="globeSphere" cx="42%" cy="34%" r="62%">
                  <stop offset="0%" stopColor="#0E3A53" stopOpacity="0.95" />
                  <stop offset="55%" stopColor="#061D30" stopOpacity="0.96" />
                  <stop offset="100%" stopColor="#030C17" stopOpacity="1" />
                </radialGradient>
              </defs>
              {/* Atmospheric Halo */}
              <circle cx="90" cy="62" r="56" fill="url(#globeGlow)" />
              <circle cx="90" cy="62" r="46" fill="url(#globeSphere)" stroke="#22D3EE" strokeOpacity="0.45" strokeWidth="1.2" />
              {/* Latitude & Longitude Wireframes */}
              <ellipse cx="90" cy="62" rx="46" ry="16" fill="none" stroke="#22D3EE" strokeOpacity="0.18" strokeWidth="0.8" />
              <ellipse cx="90" cy="62" rx="42" ry="31" fill="none" stroke="#22D3EE" strokeOpacity="0.14" strokeWidth="0.8" />
              <ellipse cx="90" cy="62" rx="18" ry="46" fill="none" stroke="#22D3EE" strokeOpacity="0.18" strokeWidth="0.8" />
              <ellipse cx="90" cy="62" rx="34" ry="46" fill="none" stroke="#22D3EE" strokeOpacity="0.12" strokeWidth="0.8" />
              {/* Dotted Continents */}
              {MAP_GRID_DOTS.map(([dx, dy], idx) => {
                const gx = 48 + ((dx - 30) / 210) * 84;
                const gy = 26 + ((dy - 25) / 80) * 72;
                const dist = Math.hypot(gx - 90, gy - 62);
                if (dist > 42) return null;
                return <circle key={idx} cx={gx} cy={gy} r="1.45" fill="#67E8F9" fillOpacity="0.85" />;
              })}
              {/* Active Region Pulses */}
              <circle cx="108" cy="54" r="5.5" fill="#22D3EE" fillOpacity="0.22" />
              <circle cx="108" cy="54" r="2.2" fill="#67E8F9" />
              <circle cx="72" cy="48" r="4.5" fill="#10B981" fillOpacity="0.22" />
              <circle cx="72" cy="48" r="2" fill="#34D399" />
              {/* Orbital Ring */}
              <ellipse
                cx="90"
                cy="62"
                rx="54"
                ry="19"
                transform="rotate(-14 90 62)"
                fill="none"
                stroke="#38BDF8"
                strokeOpacity="0.24"
                strokeWidth="0.9"
                strokeDasharray="3 3"
              />
            </svg>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>{activeSkillsCount} skills active</span>
            <span>{memories.length} memories</span>
          </div>
        </div>

        {/* Bottom Stored Intelligence / Memories List */}
        <div className="flex flex-1 flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#080E1A] p-3.5 lg:min-h-[160px]">
          <div className="min-h-0 overflow-y-auto pr-0.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                Stored Intelligence
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('memory')}
                className="text-[11px] font-medium text-cyan-400 transition-colors hover:text-cyan-300 whitespace-nowrap shrink-0"
              >
                Manage
              </button>
            </div>

            {memories.length === 0 ? (
              <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                No long-term facts stored yet. Share preferences in chat or add one in Memory.
              </p>
            ) : (
              <ul className="mt-2.5 divide-y divide-white/[0.05]">
                {memories.slice(0, 4).map((mem) => (
                  <li key={mem.id} className="py-2 first:pt-0 last:pb-0 text-xs">
                    <p className="line-clamp-2 leading-snug text-slate-200" dir="auto">{mem.value}</p>
                    <p className="mt-0.5 text-[11px] capitalize text-slate-500">{mem.category}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-2.5 text-[11px] text-slate-400 tabular-nums">
            <div className="flex items-center gap-1.5">
              <span>{notes.length} notes</span>
              <span aria-hidden="true">·</span>
              <span>{pendingRemindersCount} reminders</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('recent')}
              className="text-cyan-400 transition-colors hover:text-cyan-300 whitespace-nowrap"
            >
              History
            </button>
          </div>
        </div>
      </aside>

      {/* CENTER COLUMN: 4-Node Circuit Bus + Holographic Portrait Chamber + Neural Hub */}
      <section
        aria-label="Assistant command stage"
        className="order-1 flex flex-col gap-3 lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5"
      >
        {/* TOP STAGE: Sleek Studio 4-Node Bus + Living Holographic Portrait Chamber */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#080E1A] p-3.5">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            {/* 4 Stacked Module Nodes with Refined Hairline Glass + Subtle Multi-Tone Signal Traces */}
            <div className="relative grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-[180px] sm:flex-col sm:gap-2">
              <svg
                viewBox="0 0 68 228"
                className="pointer-events-none absolute -right-11 top-2 hidden h-[204px] w-14 sm:block"
                aria-hidden="true"
              >
                {/* MEMORY -> Cyan */}
                <path d="M0 24 L26 24 L42 84 L66 84" fill="none" stroke="#22D3EE" strokeOpacity="0.6" strokeWidth="1.4" />
                <circle cx="64" cy="84" r="2.2" fill="#22D3EE" />
                {/* SKILLS -> Emerald */}
                <path d="M0 82 L22 82 L40 104 L66 104" fill="none" stroke="#10B981" strokeOpacity="0.6" strokeWidth="1.4" />
                <circle cx="64" cy="104" r="2.2" fill="#10B981" />
                {/* CHARACTER -> Crimson */}
                <path d="M0 144 L22 144 L40 124 L66 124" fill="none" stroke="#EF4444" strokeOpacity="0.62" strokeWidth="1.4" />
                <circle cx="64" cy="124" r="2.2" fill="#EF4444" />
                {/* SETTING -> Silver Slate */}
                <path d="M0 202 L26 202 L42 144 L66 144" fill="none" stroke="#94A3B8" strokeOpacity="0.55" strokeWidth="1.4" />
                <circle cx="64" cy="144" r="2.2" fill="#94A3B8" />
              </svg>

              <button
                type="button"
                onClick={() => onNavigate('memory')}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#0B1220]/90 px-2.5 py-2 text-left transition-colors hover:border-cyan-400/40 hover:bg-[#0F192B]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-500/10 text-cyan-300">
                  <Database className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-xs font-semibold tracking-wide text-white whitespace-nowrap">
                    MEMORY
                  </span>
                  <span className="block text-[11px] text-slate-400 tabular-nums">
                    {memories.length} stored
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('skills')}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#0B1220]/90 px-2.5 py-2 text-left transition-colors hover:border-emerald-400/40 hover:bg-[#0F192B]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
                  <Cpu className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-xs font-semibold tracking-wide text-white whitespace-nowrap">
                    SKILLS
                  </span>
                  <span className="block text-[11px] text-slate-400 tabular-nums">
                    {activeSkillsCount} active
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('character')}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#0B1220]/90 px-2.5 py-2 text-left transition-colors hover:border-rose-400/40 hover:bg-[#0F192B]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-500/10 text-rose-300">
                  <UserCheck className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-xs font-semibold tracking-wide text-white whitespace-nowrap">
                    CHARACTER
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {config.assistant_name} · Lv {activeCharacter?.bond_level ?? 1}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#0B1220]/90 px-2.5 py-2 text-left transition-colors hover:border-white/25 hover:bg-[#0F192B]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.06] text-slate-200">
                  <SettingsIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-xs font-semibold tracking-wide text-white whitespace-nowrap">
                    SETTING
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Voice &amp; AI
                  </span>
                </span>
              </button>
            </div>

            {/* Right-Hand Seamless Studio Holographic Portrait Chamber */}
            <div className="relative flex flex-1 flex-col items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.09),rgba(4,8,16,0.96)_72%)] px-3 pb-3 pt-2 sm:ml-6">
              <HolographicAvatar
                state={avatarState}
                emotion={avatarEmotion}
                activeMood={config.active_mood}
                moodIntensity={config.mood_intensity}
                emotionPresetsEnabled={config.emotion_presets_enabled}
                assistantName={config.assistant_name}
                hairstyle={config.hairstyle}
                heart={heart}
                variant="stage"
                micLevel={micLevel}
                lipOpenness={lipOpenness}
                lipWidth={lipWidth}
                deepThinking={forceThinking || config.deep_thinking_mode === 'always'}
              />

              {/* Sleek Frosted Voice & Power Dock */}
              <div className="mt-1.5 flex items-center gap-2 rounded-full border border-white/[0.1] bg-[#060C17]/90 px-2.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-md">
                <button
                  type="button"
                  onClick={onToggleListening}
                  aria-label={avatarState === 'listening' ? 'Stop microphone' : 'Activate microphone'}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors shrink-0 ${
                    avatarState === 'listening'
                      ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                      : 'border-white/[0.12] bg-white/[0.05] text-cyan-300 hover:border-cyan-400/60'
                  }`}
                >
                  {avatarState === 'listening' ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                </button>

                <span
                  className="max-w-[210px] truncate px-1 text-xs font-medium text-slate-200"
                  data-testid="avatar-status-text"
                >
                  {stateDescription}
                </span>

                <button
                  type="button"
                  onClick={onTerminate}
                  aria-label="Terminate active speech or processing"
                  title="Stop speaking / processing"
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-rose-400/35 bg-rose-500/10 px-2.5 text-[11px] font-medium text-rose-200 transition-colors hover:bg-rose-500/25 hover:text-white whitespace-nowrap shrink-0"
                >
                  <Power className="h-3 w-3" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              </div>
            </div>
          </div>

          {/* Unified Voice & Mood Control Strip (Auto / Calm / Happy / Love / Sad / Surprised) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
            <div
              className="flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#050A13] p-0.5"
              role="group"
              aria-label="Assistant mood mode"
            >
              {MOOD_OPTIONS.map((opt) => {
                const isSelected =
                  config.active_mood === opt.id ||
                  (config.active_mood === 'auto' && opt.id === 'auto');
                const isLove = opt.id === 'love';
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectMood(opt.id)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 sm:px-2.5 sm:text-xs ${
                      isSelected
                        ? isLove
                          ? 'bg-rose-500/20 text-rose-200'
                          : 'bg-cyan-500/18 text-cyan-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isLove && <Heart className="h-3 w-3 text-rose-400" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleListening}
                aria-label={avatarState === 'listening' ? 'Stop listening' : 'Start listening'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  avatarState === 'listening'
                    ? 'bg-rose-500 text-white hover:bg-rose-400'
                    : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                }`}
              >
                {avatarState === 'listening' ? (
                  <>
                    <MicOff className="h-3.5 w-3.5" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleHandsFree}
                aria-pressed={handsFreeMode}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  handsFreeMode
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-white/[0.09] bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                <span>{handsFreeMode ? 'Hands-Free On' : 'Hands-Free'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleWakeWord}
                aria-pressed={wakeWordActive}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  wakeWordActive
                    ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200'
                    : 'border-white/[0.09] bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>{wakeWordActive ? 'Wake On' : 'Wake Off'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleAutoSpeak}
                aria-pressed={autoSpeak}
                aria-label={autoSpeak ? 'Mute voice replies' : 'Enable voice replies'}
                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
              >
                {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span>{autoSpeak ? 'Auto Voice' : 'Muted'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM CENTER CARD: Visual Hub (Isometric 3D Bars + Layers | Study & Code | Quick Skills | Voice Tuning) */}
        <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#080E1A] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
              Visual Hub
            </h3>
            <div
              className="flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#050A13] p-0.5"
              role="tablist"
              aria-label="Neural hub modes"
            >
              {(
                [
                  { id: 'visual', label: 'Visual Hub' },
                  { id: 'study', label: 'Study & Code' },
                  { id: 'skills', label: 'Quick Skills' },
                  { id: 'voice', label: 'Voice Tuning' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={centerTab === tab.id}
                  onClick={() => setCenterTab(tab.id)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 sm:px-2.5 sm:text-xs ${
                    centerTab === tab.id
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Visual Hub */}
          {centerTab === 'visual' && (
            <div className="mt-2 grid grid-cols-1 items-center gap-3 sm:grid-cols-12">
              <div className="flex flex-col items-center justify-center sm:col-span-5">
                <svg
                  viewBox="0 0 210 156"
                  className="h-32 w-48"
                  aria-label="Interactive 3D isometric holographic stack with data pillars"
                >
                  <line x1="105" y1="16" x2="105" y2="144" stroke="#22D3EE" strokeOpacity="0.16" strokeDasharray="3 3" />
                  {/* Bottom Layer: Memory */}
                  <g onClick={() => onNavigate('memory')} className="cursor-pointer opacity-90 hover:opacity-100">
                    <polygon points="105,102 175,124 105,146 35,124" fill="rgba(14, 165, 233, 0.14)" stroke="#0284C7" strokeWidth="1.3" />
                    <polygon points="35,124 105,146 105,152 35,130" fill="rgba(2, 132, 199, 0.24)" stroke="#0284C7" strokeWidth="0.9" />
                    <polygon points="175,124 105,146 105,152 175,130" fill="rgba(14, 165, 233, 0.12)" stroke="#0284C7" strokeWidth="0.9" />
                  </g>
                  {/* Middle Layer: Skills */}
                  <g onClick={() => onNavigate('skills')} className="cursor-pointer opacity-95 hover:opacity-100">
                    <polygon points="105,72 175,94 105,116 35,94" fill="rgba(0, 245, 255, 0.12)" stroke="#22D3EE" strokeWidth="1.4" />
                    <polygon points="35,94 105,116 105,122 35,100" fill="rgba(34, 211, 238, 0.2)" stroke="#22D3EE" strokeWidth="0.9" />
                    <polygon points="175,94 105,116 105,122 175,100" fill="rgba(34, 211, 238, 0.1)" stroke="#22D3EE" strokeWidth="0.9" />
                  </g>
                  {/* Top Layer: Character Core + Isometric 3D Glowing Bar Pillars */}
                  <g onClick={() => onNavigate('character')} className="cursor-pointer hover:opacity-100">
                    <polygon points="105,40 175,62 105,84 35,62" fill="rgba(34, 211, 238, 0.22)" stroke="#38BDF8" strokeWidth="1.6" />
                    <polygon points="35,62 105,84 105,90 35,68" fill="rgba(34, 211, 238, 0.28)" stroke="#38BDF8" strokeWidth="1" />
                    <polygon points="175,62 105,84 105,90 175,68" fill="rgba(34, 211, 238, 0.16)" stroke="#38BDF8" strokeWidth="1" />
                    {/* 3D Isometric Data Pillars rising from Top Layer (matching Screenshot 2) */}
                    <polygon points="82,54 92,58 92,38 82,34" fill="rgba(56,189,248,0.45)" stroke="#67E8F9" strokeWidth="0.9" />
                    <polygon points="92,58 102,54 102,34 92,38" fill="rgba(14,165,233,0.3)" stroke="#67E8F9" strokeWidth="0.9" />
                    <polygon points="105,60 115,64 115,24 105,20" fill="rgba(34,211,238,0.55)" stroke="#A5F3FC" strokeWidth="1" />
                    <polygon points="115,64 125,60 125,20 115,24" fill="rgba(6,182,212,0.35)" stroke="#A5F3FC" strokeWidth="1" />
                    <polygon points="128,56 138,60 138,42 128,38" fill="rgba(56,189,248,0.4)" stroke="#67E8F9" strokeWidth="0.9" />
                    <polygon points="138,60 148,56 148,38 138,42" fill="rgba(14,165,233,0.28)" stroke="#67E8F9" strokeWidth="0.9" />
                  </g>
                </svg>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <button type="button" onClick={() => onNavigate('character')} className="hover:text-cyan-300">Persona</button>
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={() => onNavigate('skills')} className="hover:text-cyan-300">Skills</button>
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={() => onNavigate('memory')} className="hover:text-cyan-300">Memory</button>
                </div>
              </div>

              <div className="flex flex-col justify-center sm:col-span-7">
                <h4 className="font-display text-sm font-semibold text-white">
                  What do you want to see?
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Ask out loud. {config.assistant_name} draws &amp; explains it right here.
                </p>
                <div className="mt-2 space-y-1">
                  {QUICK_VISUAL_PROMPTS.map((item, idx) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={isSending}
                      onClick={() => {
                        setRightTab('chat');
                        onSendMessage(item.text);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-left text-xs text-slate-200 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/[0.07] hover:text-white disabled:opacity-50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[10px] text-cyan-400/80 tabular-nums">
                          0{idx + 1}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Universal Book / Software / Course Reader & Task Executor */}
          {centerTab === 'study' && (
            <div className="mt-3 space-y-3">
              <form onSubmit={handleStudySubmit} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-lg border border-slate-800 bg-[#050A14] p-0.5">
                    {(['book', 'software', 'course'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setStudyKind(k)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                          studyKind === k ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0A1322] px-3 py-1 text-xs font-medium text-slate-200 hover:border-cyan-500/50">
                    <Upload className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Upload File (.txt, .md, .pdf, code)</span>
                    <input
                      type="file"
                      accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.csv,.pdf"
                      onChange={(e) => void handleStudyFileChange(e)}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    aria-label="Book, software, or course title"
                    value={studyTitle}
                    onChange={(e) => setStudyTitle(e.target.value)}
                    placeholder="Title (e.g. Clean Architecture / FastAPI Course)"
                    className="rounded-lg border border-slate-800 bg-[#0B1424] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                  />
                  <input
                    type="text"
                    aria-label="What do you want to build or achieve"
                    value={studyGoal}
                    onChange={(e) => setStudyGoal(e.target.value)}
                    placeholder="Goal: Is course mein se kya karwana hai?"
                    className="rounded-lg border border-slate-800 bg-[#0B1424] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                  />
                </div>

                <textarea
                  rows={3}
                  aria-label="Paste book chapter, software code, or course notes"
                  value={studyContent}
                  onChange={(e) => setStudyContent(e.target.value)}
                  placeholder={`Paste chapter text, software source code, or course syllabus — ${config.assistant_name} will read it in full & store it permanently so you can ask her to execute tasks from it...`}
                  className="w-full rounded-lg border border-slate-800 bg-[#0B1424] p-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />

                {studyError && <p className="text-xs text-rose-400">{studyError}</p>}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    Saved permanently to Studied Knowledge &amp; Memory
                  </span>
                  <button
                    type="submit"
                    disabled={studyBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{studyBusy ? 'Reading...' : 'Read & Store'}</span>
                  </button>
                </div>
              </form>

              {knowledge.length > 0 && (() => {
                const activeStudyId = knowledge.some((k) => k.id === selectedStudyId)
                  ? selectedStudyId
                  : knowledge[0].id;
                return (
                <div className="rounded-lg border border-cyan-500/25 bg-[#081221] p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                    Do Task from Studied Book / Course ({knowledge.length})
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label="Select studied book or course"
                      value={activeStudyId}
                      onChange={(e) => setSelectedStudyId(Number(e.target.value))}
                      className="rounded-lg border border-slate-800 bg-[#0B1424] px-2.5 py-1.5 text-xs text-white focus:border-cyan-500/60 focus:outline-none sm:w-44"
                    >
                      {knowledge.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.title} ({k.kind})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label="Task to execute from studied material"
                      value={studyTaskPrompt}
                      onChange={(e) => setStudyTaskPrompt(e.target.value)}
                      placeholder="e.g. Create a 5-step execution checklist + reminder for Chapter 1"
                      className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1424] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isSending || studyBusy || !activeStudyId || !studyTaskPrompt.trim()}
                      onClick={() => {
                        const prompt = studyTaskPrompt.trim();
                        if (!prompt || !activeStudyId) return;
                        setStudyTaskPrompt('');
                        setRightTab('chat');
                        void onExecuteStudyTask(activeStudyId, prompt);
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-300 disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3 w-3" />
                      <span>Do Task</span>
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {/* Tab 3: Live Skill Toggles */}
          {centerTab === 'skills' && (
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {skills.slice(0, 5).map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/90 bg-[#0A1322] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white">{skill.display_name}</p>
                    <p className="truncate text-[11px] text-slate-400">{skill.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={skill.is_enabled}
                    aria-label={`Toggle ${skill.display_name}`}
                    onClick={() => void onToggleSkill(skill.id, !skill.is_enabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                      skill.is_enabled ? 'border-cyan-400 bg-cyan-400/20' : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                        skill.is_enabled ? 'translate-x-4 bg-cyan-400' : 'translate-x-1 bg-slate-500'
                      }`}
                    />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onNavigate('skills')}
                className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                <span>Open all {skills.length} skills &amp; studied library</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Tab 4: Live Voice Tuning */}
          {centerTab === 'voice' && (
            <div className="mt-3 flex flex-col justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/90 bg-[#0A1322] p-2.5">
                <label htmlFor="hub-voice-persona" className="text-xs font-medium text-slate-300 shrink-0">
                  Voice (Female / Male):
                </label>
                <select
                  id="hub-voice-persona"
                  value={config.tts_voice}
                  onChange={(e) => {
                    unlockAudioContext();
                    void onSaveConfig({ tts_voice: e.target.value, voice_locked: true });
                  }}
                  className="min-w-0 flex-1 rounded-md border border-slate-700/80 bg-[#0F1A2E] px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                >
                  <optgroup label="Female Voices (Realistic)">
                    {FEMALE_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Male Voices (Realistic)">
                    {MALE_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    unlockAudioContext();
                    if (hubVoiceTesting) {
                      stopAllSpeech();
                      setHubVoiceTesting(false);
                      return;
                    }
                    setHubVoiceTesting(true);
                    const sample = getVoicePreviewSample(
                      config.tts_voice,
                      config.assistant_name,
                      config.user_nickname || 'Boss'
                    );
                    void speakText({
                      text: sample.text,
                      voiceName: config.tts_voice,
                      ttsEngineMode: config.tts_engine_mode,
                      language: sample.language,
                      emotion: 'happy',
                      heart,
                      voiceSpeed: config.voice_speed,
                      voiceVolume: config.voice_volume,
                      onEnd: () => setHubVoiceTesting(false),
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 whitespace-nowrap shrink-0"
                >
                  {hubVoiceTesting ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  <span>{hubVoiceTesting ? 'Stop' : 'Test Voice'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-[#0A1322] p-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label htmlFor="hub-voice-engine" className="text-xs font-medium text-slate-300 shrink-0">
                    Engine:
                  </label>
                  <select
                    id="hub-voice-engine"
                    value={config.tts_engine_mode || 'auto'}
                    onChange={(e) =>
                      void onSaveConfig({ tts_engine_mode: e.target.value as TtsEngineMode })
                    }
                    className="min-w-0 flex-1 rounded-md border border-slate-700/80 bg-[#0F1A2E] px-2.5 py-1 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  >
                    {VOICE_ENGINE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.voice_locked}
                  onClick={() => void onSaveConfig({ voice_locked: !config.voice_locked })}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    config.voice_locked
                      ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {config.voice_locked ? 'Voice Locked' : 'Voice Unlocked'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-800/90 bg-[#0A1322] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="hub-voice-speed" className="font-medium text-slate-200">
                      Voice Speed
                    </label>
                    <span className="font-mono text-cyan-300 tabular-nums">
                      {config.voice_speed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="hub-voice-speed"
                    type="range"
                    min="0.75"
                    max="1.40"
                    step="0.05"
                    value={config.voice_speed}
                    onChange={(e) => void onSaveConfig({ voice_speed: Number(e.target.value) })}
                    className="mt-2.5 w-full accent-cyan-400"
                  />
                </div>

                <div className="rounded-lg border border-slate-800/90 bg-[#0A1322] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="hub-voice-volume" className="font-medium text-slate-200">
                      Voice Volume
                    </label>
                    <span className="font-mono text-cyan-300 tabular-nums">
                      {Math.round(config.voice_volume * 100)}%
                    </span>
                  </div>
                  <input
                    id="hub-voice-volume"
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    value={config.voice_volume}
                    onChange={(e) => void onSaveConfig({ voice_volume: Number(e.target.value) })}
                    className="mt-2.5 w-full accent-cyan-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>
                  Auto-Speak: {autoSpeak ? 'ON' : 'Muted'} · Neural Engine Ready
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="inline-flex items-center gap-1 font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                >
                  <span>Full Voice &amp; Laptop Settings</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Compact Laptop Bridge & Desktop App Strip (full bridge lives in Settings -> Laptop & Installer) */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#080E1A] px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Laptop className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="font-display font-semibold uppercase tracking-wider text-slate-200 whitespace-nowrap">
              Laptop Control &amp; Installer
            </span>
            <span className="truncate text-slate-400 hidden xl:inline">
              · PC bridge, VS Code &amp; .bat/.sh installer
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400/45 hover:text-white whitespace-nowrap shrink-0"
          >
            <span>Open Laptop Controls</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* FAR RIGHT COLUMN: Segmented Chat | Notes | Reminders Panel */}
      <section
        aria-label="Assistant transcript and workspace"
        className="order-3 flex min-h-[440px] flex-col rounded-2xl border border-white/[0.08] bg-[#080E1A] lg:order-3 lg:min-h-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
          <div
            className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#050A13] p-0.5"
            role="tablist"
            aria-label="Transcript workspace tabs"
          >
            {(
              [
                { id: 'chat', label: 'Chat' },
                { id: 'notes', label: `Notes (${notes.length})` },
                { id: 'reminders', label: `Reminders (${reminders.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={rightTab === tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  rightTab === tab.id ? 'bg-cyan-500/18 text-cyan-200' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleForceThinking}
            aria-pressed={forceThinking}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              forceThinking
                ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200'
                : 'border-white/[0.09] bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            <span>{forceThinking ? 'High Thinking' : 'Auto Think'}</span>
          </button>
        </div>

        {(errorBanner || warningBanner || pendingVoiceReplay) && (
          <div className="space-y-1.5 border-b border-white/[0.07] px-3.5 py-2 text-xs">
            {errorBanner && (
              <div
                role="alert"
                className="flex items-start justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200"
              >
                <span>{errorBanner}</span>
                <button
                  type="button"
                  onClick={onDismissError}
                  className="font-medium text-rose-300 hover:text-white whitespace-nowrap shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            {warningBanner && !errorBanner && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                {warningBanner}
              </div>
            )}
            {pendingVoiceReplay && onPlayPendingVoice && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-cyan-100">
                <span>Browser paused auto-audio playback.</span>
                <button
                  type="button"
                  onClick={onPlayPendingVoice}
                  className="inline-flex items-center gap-1 rounded-md bg-cyan-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-cyan-300 whitespace-nowrap shrink-0"
                >
                  <Volume2 className="h-3 w-3" />
                  <span>Play Voice Reply</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB: LIVE CHAT */}
        {rightTab === 'chat' && (
          <>
            <div
              ref={chatListRef}
              className="flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3.5"
              data-testid="chat-messages-list"
            >
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const timeLabel = formatMessageTime(msg.timestamp);
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? 'border border-cyan-400/25 bg-cyan-500/[0.09] text-slate-100'
                          : 'border border-white/[0.07] bg-[#0D1524] text-slate-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap" dir="auto">
                        {msg.content}
                      </p>
                      {msg.launchedUrl && (
                        <a
                          href={msg.launchedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/12 px-2.5 py-1 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 hover:text-white"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                          <span className="truncate">{msg.launchedUrl}</span>
                        </a>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-500 tabular-nums">
                      <span>{isUser ? 'You' : config.assistant_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{timeLabel}</span>
                      {msg.emotion && !isUser && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{msg.emotion}</span>
                        </>
                      )}
                      {msg.skillExecuted && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-400">Skill: {msg.skillExecuted}</span>
                        </>
                      )}
                      {msg.thinkingUsed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-sky-400">High Thinking</span>
                        </>
                      )}
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => onReplayMessage(msg)}
                          aria-label={`Read aloud response from ${timeLabel}`}
                          className="ml-1 inline-flex items-center text-slate-400 transition-colors hover:text-cyan-300"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex flex-col items-start">
                  <div className="rounded-2xl border border-white/[0.07] bg-[#0D1524] px-3.5 py-2.5 text-sm text-slate-400">
                    {forceThinking
                      ? `${config.assistant_name} is reasoning deeply...`
                      : `${config.assistant_name} is thinking...`}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-white/[0.07] bg-[#060B14] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setCenterTab('study')}
                  className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-white"
                >
                  <BookOpen className="h-3 w-3 text-cyan-400" />
                  <span>Read Book / Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-white"
                >
                  <Paperclip className="h-3 w-3 text-cyan-400" />
                  <span>Attach File</span>
                </button>
                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.csv"
                  onChange={(e) => void handleChatFileAttach(e)}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => void onCaptureVision(inputValue.trim() || undefined)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-white disabled:opacity-50"
                >
                  <Eye className="h-3 w-3 text-cyan-400" />
                  <span>Look at Me</span>
                </button>
              </div>

              {chatAttachment && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200">
                  <span className="truncate">
                    Attached {chatAttachment.kind}: <strong>{chatAttachment.title}</strong> ({Math.round(chatAttachment.text.length / 100) / 10}k chars)
                  </span>
                  <button
                    type="button"
                    aria-label="Remove attached study file"
                    onClick={() => setChatAttachment(null)}
                    className="rounded p-0.5 text-cyan-300 hover:bg-cyan-500/20 hover:text-white shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label htmlFor="zara-chat-input" className="sr-only">
                  Message {config.assistant_name}
                </label>
                <input
                  ref={inputRef}
                  id="zara-chat-input"
                  type="text"
                  dir="auto"
                  value={inputValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  placeholder={`Talk to ${config.assistant_name} (Roman Urdu / اردو / EN)...`}
                  className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#0B1220] px-3.5 py-2 text-sm text-white placeholder-slate-500 transition-colors focus:border-cyan-400/55 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onToggleListening}
                  aria-label={avatarState === 'listening' ? 'Stop microphone' : 'Use microphone'}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors shrink-0 ${
                    avatarState === 'listening'
                      ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                      : 'border-white/[0.1] bg-white/[0.04] text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  disabled={isSending || (!inputValue.trim() && !chatAttachment)}
                  aria-label="Send message"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </>
        )}

        {/* TAB: QUICK NOTES */}
        {rightTab === 'notes' && (
          <div className="flex flex-1 flex-col justify-between p-3.5 min-h-0">
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  No notes yet. Add a quick note below.
                </p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-slate-800 bg-[#0C1628] p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">{note.title || 'Quick Note'}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{note.content}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete note "${note.title || note.content}"`}
                      onClick={() => void onDeleteNote(note.id)}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleQuickNoteSubmit}
              className="mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-3"
            >
              <label htmlFor="quick-note-input" className="sr-only">
                Quick note content
              </label>
              <input
                id="quick-note-input"
                type="text"
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder="Save a quick note..."
                className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1424] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!quickNoteText.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB: QUICK REMINDERS */}
        {rightTab === 'reminders' && (
          <div className="flex flex-1 flex-col justify-between p-3.5 min-h-0">
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {reminders.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  No reminders scheduled. Add one below.
                </p>
              ) : (
                reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0C1628] px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => void onToggleReminder(rem.id, !rem.is_done)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      {rem.is_done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`truncate text-xs ${
                            rem.is_done ? 'text-slate-500 line-through' : 'text-slate-100'
                          }`}
                        >
                          {rem.title}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{rem.remind_at}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete reminder "${rem.title}"`}
                      onClick={() => void onDeleteReminder(rem.id)}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleQuickRemSubmit}
              className="mt-3 flex items-center gap-1.5 border-t border-slate-800/80 pt-3"
            >
              <label htmlFor="quick-rem-input" className="sr-only">
                Reminder title
              </label>
              <input
                id="quick-rem-input"
                type="text"
                value={quickRemText}
                onChange={(e) => setQuickRemText(e.target.value)}
                placeholder="Reminder..."
                className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#0B1424] px-2.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
              <label htmlFor="quick-rem-time" className="sr-only">
                Reminder time
              </label>
              <input
                id="quick-rem-time"
                type="text"
                value={quickRemTime}
                onChange={(e) => setQuickRemTime(e.target.value)}
                className="w-20 rounded-lg border border-slate-800 bg-[#0B1424] px-2 py-2 text-xs text-slate-200 focus:border-cyan-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!quickRemText.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-cyan-400 px-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

function formatMessageTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
