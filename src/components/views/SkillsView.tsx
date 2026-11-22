import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Camera,
  CheckCircle2,
  Globe,
  MessageSquare,
  Mic,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import {
  CAMERA_MODE_OPTIONS,
  getCameraModeLabel,
  isValidCameraMode,
  isValidSkillHttpUrl,
} from '../../lib/skillMatcher';
import {
  computeVoiceHistoryStats,
  filterVoiceHistory,
  formatVoiceLogStatusLabel,
  formatVoiceReplayPhaseLabel,
  type VoiceStatusFilter,
} from '../../lib/voiceHistory';
import { VoiceFrequencyBars } from '../VoiceFrequencyBars';
import type {
  CameraCommandMode,
  KnowledgeSource,
  SkillActionType,
  SkillConfig,
  VoiceCommandLog,
} from '../../types/nova';

interface RetriggerOutcome {
  ok: boolean;
  reply?: string;
  skillExecuted?: string;
  launchedUrl?: string;
  error?: string;
}

interface SkillsViewProps {
  skills: SkillConfig[];
  knowledge: KnowledgeSource[];
  voiceLogs: VoiceCommandLog[];
  onToggleSkill: (id: number, isEnabled: boolean) => Promise<void>;
  onCreateSkill: (input: {
    display_name: string;
    description: string;
    trigger_phrases: string[];
    action_type: SkillActionType;
    action_value: string;
  }) => Promise<void>;
  onUpdateSkill: (
    id: number,
    input: {
      display_name: string;
      description: string;
      trigger_phrases: string[];
      action_type: SkillActionType;
      action_value: string;
    }
  ) => Promise<void>;
  onDeleteSkill: (id: number) => Promise<void>;
  onDeleteKnowledge: (id: number) => Promise<void>;
  onTestSkill: (phrase: string) => void;
  onRetriggerVoiceCommand: (transcript: string, volumeLevel: number) => Promise<RetriggerOutcome>;
  playingVoiceLogId: number | null;
  playingVoicePhase: 'command' | 'response' | null;
  onPlayVoiceLog: (log: VoiceCommandLog) => Promise<{ ok: boolean; aborted?: boolean; error?: string }>;
  onStopVoiceReplay: () => void;
  onDeleteVoiceLog: (id: number) => Promise<void>;
  onClearVoiceHistory: () => Promise<void>;
  onNavigateHome: () => void;
  onExecuteStudyTask?: (studyId: number, taskPrompt: string) => void;
}

type SkillsViewTab = 'skills' | 'voice-history';
type CommandFilterType = 'all' | 'url' | 'vision' | 'note' | 'system';

const ACTION_TYPE_OPTIONS: Array<{ value: SkillActionType; label: string }> = [
  { value: 'url', label: 'Open Website URL' },
  { value: 'vision', label: 'Trigger Camera Mode' },
  { value: 'note', label: 'Save Note Template' },
  { value: 'system', label: 'Custom Reply / System Action' },
];

function parseTriggerDraft(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeUniqueTriggers(existing: string[], draft: string): string[] {
  const seen = new Set(existing.map((p) => p.toLowerCase()));
  const merged = [...existing];
  for (const phrase of parseTriggerDraft(draft)) {
    if (!seen.has(phrase.toLowerCase())) {
      seen.add(phrase.toLowerCase());
      merged.push(phrase);
    }
  }
  return merged;
}

function getActionCategory(type: SkillActionType): Exclude<CommandFilterType, 'all'> {
  if (type === 'url' || type === 'launch') return 'url';
  if (type === 'vision') return 'vision';
  if (type === 'note') return 'note';
  return 'system';
}

function formatVoiceTimestamp(raw: string): string {
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SkillsView({
  skills,
  knowledge,
  voiceLogs,
  onToggleSkill,
  onCreateSkill,
  onUpdateSkill,
  onDeleteSkill,
  onDeleteKnowledge,
  onTestSkill,
  onRetriggerVoiceCommand,
  playingVoiceLogId,
  playingVoicePhase,
  onPlayVoiceLog,
  onStopVoiceReplay,
  onDeleteVoiceLog,
  onClearVoiceHistory,
  onNavigateHome,
  onExecuteStudyTask,
}: SkillsViewProps) {
  const [activeTab, setActiveTab] = useState<SkillsViewTab>('skills');
  const [studyTaskDrafts, setStudyTaskDrafts] = useState<Record<number, string>>({});

  // Command List filter & search state
  const [commandSearch, setCommandSearch] = useState('');
  const [commandFilter, setCommandFilter] = useState<CommandFilterType>('all');

  // Voice History filter, search, and re-trigger state
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceStatusFilter, setVoiceStatusFilter] = useState<VoiceStatusFilter>('all');
  const [retriggeringId, setRetriggeringId] = useState<number | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [retriggerNotice, setRetriggerNotice] = useState<{
    transcript: string;
    ok: boolean;
    summary: string;
    launchedUrl?: string;
  } | null>(null);

  // Create / Edit Command Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerList, setTriggerList] = useState<string[]>([]);
  const [triggerInput, setTriggerInput] = useState('');
  const [actionType, setActionType] = useState<SkillActionType>('url');
  const [actionValue, setActionValue] = useState('');
  const [cameraMode, setCameraMode] = useState<CameraCommandMode>('look_now');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customCommands = useMemo(() => skills.filter((s) => s.is_custom), [skills]);
  const builtInSkills = useMemo(() => skills.filter((s) => !s.is_custom), [skills]);

  const filteredCommands = useMemo(() => {
    const q = commandSearch.trim().toLowerCase();
    return customCommands.filter((cmd) => {
      if (commandFilter !== 'all' && getActionCategory(cmd.action_type) !== commandFilter) {
        return false;
      }
      if (!q) return true;
      return (
        cmd.display_name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.action_value.toLowerCase().includes(q) ||
        cmd.trigger_phrases.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [customCommands, commandFilter, commandSearch]);

  const voiceStats = useMemo(() => computeVoiceHistoryStats(voiceLogs), [voiceLogs]);
  const filteredVoiceLogs = useMemo(
    () => filterVoiceHistory(voiceLogs, voiceSearch, voiceStatusFilter),
    [voiceLogs, voiceSearch, voiceStatusFilter]
  );

  const resetForm = () => {
    setEditingId(null);
    setDisplayName('');
    setDescription('');
    setTriggerList([]);
    setTriggerInput('');
    setActionType('url');
    setActionValue('');
    setCameraMode('look_now');
    setFormError(null);
  };

  const openCreateForm = (presetType: SkillActionType = 'url') => {
    resetForm();
    setActionType(presetType);
    setActiveTab('skills');
    setShowForm(true);
  };

  const openEditForm = (cmd: SkillConfig) => {
    setEditingId(cmd.id);
    setDisplayName(cmd.display_name);
    setDescription(cmd.description);
    setTriggerList(cmd.trigger_phrases);
    setTriggerInput('');
    const normalizedType: SkillActionType =
      cmd.action_type === 'launch' ? 'url' : cmd.action_type;
    setActionType(normalizedType);
    if (normalizedType === 'vision') {
      setCameraMode(isValidCameraMode(cmd.action_value) ? cmd.action_value : 'look_now');
      setActionValue('');
    } else {
      setActionValue(cmd.action_value);
      setCameraMode('look_now');
    }
    setFormError(null);
    setActiveTab('skills');
    setShowForm(true);
  };

  const handleAddTriggerChip = () => {
    if (!triggerInput.trim()) return;
    setTriggerList((prev) => mergeUniqueTriggers(prev, triggerInput));
    setTriggerInput('');
    setFormError(null);
  };

  const handleRemoveTriggerChip = (phrase: string) => {
    setTriggerList((prev) => prev.filter((p) => p !== phrase));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const triggers = mergeUniqueTriggers(triggerList, triggerInput);

    if (!displayName.trim()) {
      setFormError('Command name is required.');
      return;
    }
    if (triggers.length === 0) {
      setFormError('Add at least one natural language trigger phrase (e.g. "open portfolio").');
      return;
    }

    let resolvedValue = actionValue.trim();
    if (actionType === 'url' || actionType === 'launch') {
      if (!resolvedValue || !isValidSkillHttpUrl(resolvedValue)) {
        setFormError('Enter a valid website URL starting with http:// or https://.');
        return;
      }
    } else if (actionType === 'vision') {
      resolvedValue = cameraMode;
    } else if (!resolvedValue) {
      setFormError('Action target is required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        display_name: displayName.trim(),
        description:
          description.trim() ||
          (actionType === 'vision'
            ? `Triggers camera mode: ${getCameraModeLabel(resolvedValue)}`
            : actionType === 'url'
              ? `Opens ${resolvedValue}`
              : 'Custom natural-language command'),
        trigger_phrases: triggers,
        action_type: actionType,
        action_value: resolvedValue,
      };
      if (editingId !== null) {
        await onUpdateSkill(editingId, payload);
      } else {
        await onCreateSkill(payload);
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save command.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetrigger = async (log: VoiceCommandLog) => {
    if (retriggeringId !== null) return;
    onStopVoiceReplay();
    setReplayError(null);
    setRetriggeringId(log.id);
    setRetriggerNotice(null);
    try {
      const result = await onRetriggerVoiceCommand(log.transcript, log.volume_level);
      setRetriggerNotice({
        transcript: log.transcript,
        ok: result.ok,
        summary: result.ok
          ? result.reply || 'Command executed again.'
          : result.error || 'Could not re-trigger voice command.',
        launchedUrl: result.launchedUrl,
      });
    } finally {
      setRetriggeringId(null);
    }
  };

  const handleTogglePlay = async (log: VoiceCommandLog) => {
    setReplayError(null);
    if (playingVoiceLogId === log.id) {
      onStopVoiceReplay();
      return;
    }
    const result = await onPlayVoiceLog(log);
    if (!result.ok && !result.aborted && result.error) {
      setReplayError(result.error);
    }
  };

  const selectedCameraOption =
    CAMERA_MODE_OPTIONS.find((opt) => opt.id === cameraMode) ?? CAMERA_MODE_OPTIONS[0];

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="border-b border-slate-800/80 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">
              Skills &amp; Command List
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Map custom natural-language triggers to URLs, camera modes, or replies and review recognized voice commands.
            </p>
          </div>
          {activeTab === 'skills' ? (
            <button
              type="button"
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  resetForm();
                } else {
                  openCreateForm('url');
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{showForm ? 'Close Form' : 'New Command'}</span>
            </button>
          ) : (
            voiceLogs.length > 0 && (
              <button
                type="button"
                onClick={() => void onClearVoiceHistory()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/20 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear History</span>
              </button>
            )
          )}
        </div>

        {/* Top-level Tabs */}
        <div role="tablist" aria-label="Skills workspace sections" className="flex items-center gap-6">
          <button
            type="button"
            role="tab"
            id="tab-skills-commands"
            aria-selected={activeTab === 'skills'}
            aria-controls="panel-skills-commands"
            onClick={() => setActiveTab('skills')}
            className={`border-b-2 pb-3 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'skills'
                ? 'border-cyan-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            Skills &amp; Commands <span className="ml-1 font-mono text-slate-500 tabular-nums">{skills.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-voice-history"
            aria-selected={activeTab === 'voice-history'}
            aria-controls="panel-voice-history"
            onClick={() => setActiveTab('voice-history')}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-3 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'voice-history'
                ? 'border-cyan-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            <Mic className="h-3.5 w-3.5 text-cyan-400" />
            <span>Voice History</span>
            <span className="font-mono text-slate-500 tabular-nums">{voiceLogs.length}</span>
          </button>
        </div>
      </div>

      {activeTab === 'voice-history' ? (
        <div
          id="panel-voice-history"
          role="tabpanel"
          aria-labelledby="tab-voice-history"
          className="mt-6 flex flex-col pb-6"
        >
          {/* Summary Strip */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800/80 sm:grid-cols-4">
            <div className="bg-[#0D1117] px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Total Voice Runs
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
                {voiceStats.total}
              </p>
            </div>
            <div className="bg-[#0D1117] px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Executed
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-emerald-400 tabular-nums">
                {voiceStats.matched}
              </p>
            </div>
            <div className="bg-[#0D1117] px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                AI Reply
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-cyan-300 tabular-nums">
                {voiceStats.aiFallback}
              </p>
            </div>
            <div className="bg-[#0D1117] px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Failed
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-rose-400 tabular-nums">
                {voiceStats.failed}
              </p>
            </div>
          </div>

          {/* Search & Status Filters */}
          {voiceLogs.length > 0 && (
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  aria-label="Search voice history"
                  value={voiceSearch}
                  onChange={(e) => setVoiceSearch(e.target.value)}
                  placeholder="Search transcript or skill..."
                  className="w-full rounded-lg border border-slate-800 bg-[#0D1117] py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />
              </div>

              <div
                className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-800 bg-[#080E1A] p-0.5"
                role="group"
                aria-label="Filter voice history by status"
              >
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'matched', label: 'Executed' },
                    { id: 'ai_fallback', label: 'AI Reply' },
                    { id: 'failed', label: 'Failed' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVoiceStatusFilter(item.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      voiceStatusFilter === item.id
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Audio Replay Error Banner */}
          {replayError && (
            <div
              role="alert"
              className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/35 bg-rose-950/25 px-4 py-2.5 text-xs text-rose-100"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span className="truncate">{replayError}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss audio replay error"
                onClick={() => setReplayError(null)}
                className="rounded p-1 text-rose-300 hover:text-white shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Live Re-trigger Confirmation Banner */}
          {retriggerNotice && (
            <div
              role="status"
              className={`mt-4 flex flex-col justify-between gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${
                retriggerNotice.ok
                  ? 'border-emerald-500/35 bg-emerald-950/25 text-emerald-100'
                  : 'border-rose-500/35 bg-rose-950/25 text-rose-100'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {retriggerNotice.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <span className="truncate" dir="auto">
                    Re-triggered: &ldquo;{retriggerNotice.transcript}&rdquo;
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300" dir="auto">
                  {retriggerNotice.summary}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {retriggerNotice.launchedUrl && (
                  <a
                    href={retriggerNotice.launchedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap shrink-0"
                  >
                    <span>Open URL</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap shrink-0"
                >
                  Open Home Chat
                </button>
                <button
                  type="button"
                  aria-label="Dismiss re-trigger notice"
                  onClick={() => setRetriggerNotice(null)}
                  className="rounded p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Log List / Empty State */}
          {voiceLogs.length === 0 ? (
            <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-800 bg-[#0D1117] p-6 sm:flex-row sm:items-center">
              <div className="max-w-xl">
                <p className="text-sm font-semibold text-white">
                  No voice commands recorded yet.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Every command spoken via the microphone on Home — whether it triggers a custom shortcut, a built-in skill, or an AI reply — is logged here for one-click re-triggering.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateHome}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Open Home to Speak</span>
              </button>
            </div>
          ) : filteredVoiceLogs.length === 0 ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1117] px-4 py-4">
              <p className="text-xs text-slate-400">No voice logs match your current search or filter.</p>
              <button
                type="button"
                onClick={() => {
                  setVoiceSearch('');
                  setVoiceStatusFilter('all');
                }}
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-[#0D1117]">
              {filteredVoiceLogs.map((log) => {
                const isRunning = retriggeringId === log.id;
                const isPlaying = playingVoiceLogId === log.id;
                const statusLabel = formatVoiceLogStatusLabel(log.status);
                const skillLabel =
                  log.matched_display_name ||
                  (log.status === 'ai_fallback' ? 'Conversational AI' : 'Unmatched');
                const replayLabel = isPlaying
                  ? formatVoiceReplayPhaseLabel({ phase: playingVoicePhase })
                  : 'Play';

                return (
                  <div
                    key={log.id}
                    data-testid={`voice-log-row-${log.id}`}
                    className="group flex flex-col justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-900/40 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap shrink-0 ${
                            log.status === 'matched'
                              ? 'text-emerald-400'
                              : log.status === 'failed'
                                ? 'text-rose-400'
                                : 'text-cyan-300'
                          }`}
                        >
                          {log.status === 'matched' ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : log.status === 'failed' ? (
                            <AlertCircle className="h-3.5 w-3.5" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          <span>{statusLabel}</span>
                        </span>

                        <p className="min-w-0 truncate text-sm font-semibold text-white" dir="auto">
                          &ldquo;{log.transcript}&rdquo;
                        </p>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        <span className="font-medium text-slate-300">{skillLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{log.source === 'retrigger' ? 'Re-triggered' : 'Microphone'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{log.language === 'ur' ? 'Urdu' : 'English'}</span>
                        {log.created_at && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {formatVoiceTimestamp(log.created_at)}
                            </span>
                          </>
                        )}
                        {isPlaying && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-300 font-medium">{replayLabel}...</span>
                          </>
                        )}
                      </div>

                      {log.response_summary && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-slate-400" dir="auto">
                          {log.response_summary}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 sm:flex-nowrap sm:justify-end sm:pt-0 shrink-0">
                      <VoiceFrequencyBars
                        volumeLevel={log.volume_level}
                        status={log.status}
                        idSeed={log.id}
                        isRunning={isRunning || isPlaying}
                      />

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={retriggeringId !== null}
                          data-testid={`voice-play-btn-${log.id}`}
                          aria-pressed={isPlaying}
                          aria-label={
                            isPlaying
                              ? `Stop audio replay for "${log.transcript}"`
                              : `Play recorded interaction "${log.transcript}"`
                          }
                          onClick={() => void handleTogglePlay(log)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 ${
                            isPlaying
                              ? 'border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 hover:text-white'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:text-white'
                          }`}
                        >
                          {isPlaying ? (
                            <Square className="h-3 w-3 fill-current" />
                          ) : (
                            <Play className="h-3 w-3 fill-current" />
                          )}
                          <span>{isPlaying ? 'Stop' : 'Play'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={retriggeringId !== null}
                          aria-label={`Re-trigger command "${log.transcript}"`}
                          onClick={() => void handleRetrigger(log)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 hover:text-white disabled:opacity-45 whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                          <span>{isRunning ? 'Running...' : 'Re-trigger'}</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Delete voice log "${log.transcript}"`}
                          onClick={() => void onDeleteVoiceLog(log.id)}
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          id="panel-skills-commands"
          role="tabpanel"
          aria-labelledby="tab-skills-commands"
        >
          {showForm && (
            <form
              id="command-list-form"
              onSubmit={handleSubmit}
              className="mt-5 rounded-xl border border-cyan-500/35 bg-[#0D1117] p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">
                  {editingId !== null ? 'Edit Custom Command' : 'Add Custom Command'}
                </h2>
                <span className="text-xs text-slate-400">
                  Natural language voice or chat trigger
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cmd-name-input" className="block text-xs font-medium text-slate-300">
                    Command Name
                  </label>
                  <input
                    id="cmd-name-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Open GitHub or Gesture Watch"
                    className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cmd-action-type" className="block text-xs font-medium text-slate-300">
                    Action
                  </label>
                  <select
                    id="cmd-action-type"
                    value={actionType}
                    onChange={(e) => {
                      const nextType = e.target.value as SkillActionType;
                      setActionType(nextType);
                      setFormError(null);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
                  >
                    {ACTION_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  {actionType === 'vision' ? (
                    <div>
                      <label htmlFor="cmd-camera-mode" className="block text-xs font-medium text-slate-300">
                        Camera Mode
                      </label>
                      <select
                        id="cmd-camera-mode"
                        value={cameraMode}
                        onChange={(e) => setCameraMode(e.target.value as CameraCommandMode)}
                        className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
                      >
                        {CAMERA_MODE_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-slate-400">{selectedCameraOption.description}</p>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="cmd-action-value" className="block text-xs font-medium text-slate-300">
                        {actionType === 'url'
                          ? 'Target URL (https://...)'
                          : actionType === 'note'
                            ? 'Note Text Template'
                            : 'Instant Reply / System Action'}
                      </label>
                      <input
                        id="cmd-action-value"
                        type={actionType === 'url' ? 'url' : 'text'}
                        value={actionValue}
                        onChange={(e) => setActionValue(e.target.value)}
                        placeholder={
                          actionType === 'url'
                            ? 'https://github.com'
                            : actionType === 'note'
                              ? 'Saved daily standup summary'
                              : 'Acha Boss, abhi check karti hoon!'
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="cmd-triggers-input" className="block text-xs font-medium text-slate-300">
                    Natural Language Triggers (English, Roman Urdu, or Urdu — comma-separated or press Add)
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      id="cmd-triggers-input"
                      type="text"
                      dir="auto"
                      value={triggerInput}
                      onChange={(e) => setTriggerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTriggerChip();
                        }
                      }}
                      placeholder="e.g. open my git, git kholo, check my repository"
                      className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddTriggerChip}
                      disabled={!triggerInput.trim()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Trigger</span>
                    </button>
                  </div>
                  {triggerList.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Configured triggers">
                      {triggerList.map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => handleRemoveTriggerChip(phrase)}
                          aria-label={`Remove trigger "${phrase}"`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200 transition-colors hover:border-rose-400/50 hover:bg-rose-500/15 hover:text-rose-200"
                        >
                          <span dir="auto">{phrase}</span>
                          <X className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="cmd-desc-input" className="block text-xs font-medium text-slate-300">
                    Description (optional)
                  </label>
                  <input
                    id="cmd-desc-input"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Briefly describe when this command should fire"
                    className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                  />
                </div>
              </div>

              {formError && (
                <p role="alert" className="mt-3 text-xs text-rose-400">
                  {formError}
                </p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : editingId !== null
                      ? 'Update Command'
                      : 'Save Command'}
                </button>
              </div>
            </form>
          )}

          {/* SECTION 1: COMMAND LIST */}
          <section className="mt-6" aria-label="Custom Command List">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-2.5">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-cyan-300">
                  Command List
                </h2>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {customCommands.length} {customCommands.length === 1 ? 'command' : 'commands'}
                </span>
              </div>

              {customCommands.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="search"
                      aria-label="Filter custom commands"
                      value={commandSearch}
                      onChange={(e) => setCommandSearch(e.target.value)}
                      placeholder="Filter triggers or URLs..."
                      className="w-48 rounded-lg border border-slate-800 bg-[#0D1117] py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none sm:w-56"
                    />
                  </div>
                  <div
                    className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-[#080E1A] p-0.5"
                    role="group"
                    aria-label="Filter commands by action type"
                  >
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'url', label: 'URL' },
                        { id: 'vision', label: 'Camera' },
                        { id: 'note', label: 'Note' },
                        { id: 'system', label: 'Reply' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCommandFilter(tab.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          commandFilter === tab.id
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {customCommands.length === 0 ? (
              <div className="mt-3 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-800 bg-[#0D1117] p-5 sm:flex-row sm:items-center">
                <div className="max-w-xl">
                  <p className="text-sm font-medium text-white">
                    No custom voice or chat commands defined yet.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Teach ZARA natural-language shortcuts like &ldquo;open my dashboard&rdquo; for a specific URL or &ldquo;gesture mode on&rdquo; to trigger a camera mode automatically.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openCreateForm('url')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 whitespace-nowrap shrink-0"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Add URL Command</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateForm('vision')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white whitespace-nowrap shrink-0"
                  >
                    <Camera className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Add Camera Command</span>
                  </button>
                </div>
              </div>
            ) : filteredCommands.length === 0 ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1117] px-4 py-4">
                <p className="text-xs text-slate-400">No commands match your current filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCommandSearch('');
                    setCommandFilter('all');
                  }}
                  className="text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-[#0D1117]">
                {filteredCommands.map((cmd) => {
                  const cat = getActionCategory(cmd.action_type);
                  const sampleTrigger = cmd.trigger_phrases[0] || cmd.display_name;
                  const targetSummary =
                    cat === 'vision'
                      ? `Camera Mode · ${getCameraModeLabel(cmd.action_value)}`
                      : cat === 'url'
                        ? `Open URL · ${cmd.action_value}`
                        : cat === 'note'
                          ? `Save Note · ${cmd.action_value}`
                          : `Custom Reply · ${cmd.action_value}`;

                  return (
                    <div
                      key={cmd.id}
                      data-testid={`command-row-${cmd.id}`}
                      className="flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {cat === 'vision' ? (
                            <Camera className="h-4 w-4 text-cyan-400 shrink-0" />
                          ) : cat === 'url' ? (
                            <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
                          ) : cat === 'note' ? (
                            <StickyNote className="h-4 w-4 text-cyan-400 shrink-0" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-cyan-400 shrink-0" />
                          )}
                          <h3 className="truncate text-sm font-semibold text-white">
                            {cmd.display_name}
                          </h3>
                          {!cmd.is_enabled && (
                            <span className="text-xs text-slate-500">· Disabled</span>
                          )}
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-300" dir="auto">
                          {targetSummary}
                        </p>

                        <p className="mt-1 truncate text-xs text-slate-500" dir="auto">
                          Triggers: {cmd.trigger_phrases.map((t) => `"${t}"`).join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 shrink-0">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={cmd.is_enabled}
                          aria-label={`Toggle command "${cmd.display_name}"`}
                          onClick={() => void onToggleSkill(cmd.id, !cmd.is_enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                            cmd.is_enabled
                              ? 'border-cyan-400 bg-cyan-400/20'
                              : 'border-slate-700 bg-slate-900'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                              cmd.is_enabled
                                ? 'translate-x-5 bg-cyan-400'
                                : 'translate-x-1 bg-slate-500'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          disabled={!cmd.is_enabled}
                          aria-label={`Test command "${cmd.display_name}"`}
                          onClick={() => onTestSkill(sampleTrigger)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          <Play className="h-3 w-3" />
                          <span>Test</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Edit command "${cmd.display_name}"`}
                          onClick={() => openEditForm(cmd)}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          aria-label={`Delete command "${cmd.display_name}"`}
                          onClick={() => void onDeleteSkill(cmd.id)}
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SECTION 2: Studied Books / Software / Courses Library */}
          {knowledge.length > 0 && (
            <section className="mt-7" aria-label="Studied books, software, and courses">
              <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-cyan-300">
                Studied Books, Software &amp; Courses ({knowledge.length})
              </h2>
              <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {knowledge.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border border-cyan-500/25 bg-[#0D1117] p-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-cyan-400 shrink-0" />
                            <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
                          </div>
                          <p className="mt-0.5 text-xs capitalize text-slate-400">
                            {item.kind} {item.goal ? `· Goal: ${item.goal}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete studied item "${item.title}"`}
                          onClick={() => void onDeleteKnowledge(item.id)}
                          className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-300" dir="auto">
                        {item.detailed_summary}
                      </p>
                      {item.action_plan.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                          {item.action_plan.slice(0, 3).map((step, i) => (
                            <li key={i} className="truncate">
                              {i + 1}. {step}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="mt-3 space-y-2 border-t border-slate-800/80 pt-2.5">
                      {onExecuteStudyTask && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            aria-label={`Task from ${item.title}`}
                            value={studyTaskDrafts[item.id] ?? ''}
                            onChange={(e) =>
                              setStudyTaskDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder="Is course mein se yeh kar do..."
                            className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#111827] px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={!(studyTaskDrafts[item.id] ?? '').trim()}
                            onClick={() => {
                              const prompt = (studyTaskDrafts[item.id] ?? '').trim();
                              if (!prompt) return;
                              setStudyTaskDrafts((prev) => ({ ...prev, [item.id]: '' }));
                              onExecuteStudyTask(item.id, prompt);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-45 whitespace-nowrap shrink-0"
                          >
                            <Play className="h-3 w-3" />
                            <span>Execute Task</span>
                          </button>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            onTestSkill(
                              `Explain the next practical step from "${item.title}"${
                                item.goal ? ` for my goal: ${item.goal}` : ''
                              }`
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                        >
                          <Play className="h-3 w-3" />
                          <span>Discuss in Chat</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SECTION 3: BUILT-IN SKILLS */}
          <section className="mt-7 pb-6" aria-label="Built-in Skills">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                Built-in Skills
              </h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {builtInSkills.length} active modules
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-2">
              {builtInSkills.map((skill) => {
                const sampleTrigger = skill.trigger_phrases[0] || skill.display_name;
                return (
                  <div
                    key={skill.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1117] p-5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-white">{skill.display_name}</h3>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                            <span>Built-in</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{skill.action_type}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={skill.is_enabled}
                          aria-label={`Toggle ${skill.display_name}`}
                          onClick={() => void onToggleSkill(skill.id, !skill.is_enabled)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                            skill.is_enabled
                              ? 'border-cyan-400 bg-cyan-400/20'
                              : 'border-slate-700 bg-slate-900'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                              skill.is_enabled
                                ? 'translate-x-5 bg-cyan-400'
                                : 'translate-x-1 bg-slate-500'
                            }`}
                          />
                        </button>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-300">{skill.description}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
                      <p className="truncate text-xs text-slate-500">
                        Triggers: {skill.trigger_phrases.join(' · ')}
                      </p>
                      <button
                        type="button"
                        disabled={!skill.is_enabled}
                        onClick={() =>
                          onTestSkill(
                            skill.skill_name === 'calculator'
                              ? 'calculate 24 * 15'
                              : skill.skill_name === 'notes_manager'
                                ? 'create note: Skill verification test'
                                : skill.skill_name === 'reminders_manager'
                                  ? 'remind me to check logs at 7pm'
                                  : skill.skill_name === 'app_launcher'
                                    ? 'Chrome kholo'
                                    : sampleTrigger
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 transition-colors hover:text-cyan-300 disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        <span>Test</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
