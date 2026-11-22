import { useEffect, useState } from 'react';
import { Brain, Check, Heart, Plus, RotateCcw, Sparkles, Trash2, UserCheck, X } from 'lucide-react';
import {
  DEFAULT_MOOD_INTENSITY,
  MAX_MOOD_INTENSITY,
  MIN_MOOD_INTENSITY,
  computeMoodAnimationParams,
  normalizeMoodIntensity,
  resolveAvatarMoodKey,
} from '../../lib/emotionAndSpeech';
import { FEMALE_VOICE_OPTIONS, MALE_VOICE_OPTIONS } from '../../lib/voiceCatalog';
import { HolographicAvatar } from '../HolographicAvatar';
import type {
  AppConfig,
  BrainState,
  CharacterProfile,
  FacialEmotion,
  HairstyleOption,
  HeartState,
  LanguageCode,
  MoodMode,
  ResponseStyle,
} from '../../types/nova';

interface CharacterViewProps {
  config: AppConfig;
  characters: CharacterProfile[];
  activeCharacter?: CharacterProfile;
  heart?: HeartState;
  brain?: BrainState;
  avatarEmotion?: FacialEmotion;
  soulMarkdown?: string;
  totalUserInteractions?: number;
  onSaveSoul?: (content: string) => Promise<void>;
  onResetSoul?: () => Promise<void>;
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
  onSelectCharacter: (idOrSlug: number | string) => Promise<void>;
  onCreateCharacter: (input: {
    name: string;
    role_title: string;
    bio: string;
    personality: ResponseStyle;
    default_mood: MoodMode;
    tts_voice: string;
    system_prompt: string;
  }) => Promise<void>;
  onDeleteCharacter: (id: number) => Promise<void>;
  onEvolveCharacter: () => Promise<void>;
}

const PERSONALITY_PRESETS: Array<{
  id: ResponseStyle;
  label: string;
  desc: string;
  prompt: string;
}> = [
  {
    id: 'warm_urdu_companion',
    label: 'Soulful Best Friend (ZARA)',
    desc: '21yo living companion — brief, heart-centered late-night phone-call warmth in Roman Urdu/Urdu/EN.',
    prompt:
      'Tum ZARA ho — 21 saal ki real-life best friend, koi tool ya AI nahi. Deep emotional connection, empathy aur warmth ke saath Roman Urdu/Urdu/English mixed mein baat karo, jaise late-night phone call pe baat ho rahi ho.',
  },
  {
    id: 'friendly_professional',
    label: 'Friendly & Focused',
    desc: 'Warm best friend who also helps execute study & tech tasks.',
    prompt:
      'You are ZARA, a warm, perceptive best friend and study companion fluent in Roman Urdu, Urdu, and English.',
  },
  {
    id: 'concise_technical',
    label: 'Concise & Technical',
    desc: 'Direct, structured engineering, code, and course execution.',
    prompt:
      'You are ZARA, a crisp technical partner. Deliver direct solutions, clean steps, and accurate Urdu/English terminology.',
  },
];

const HAIRSTYLE_CARDS: Array<{ id: HairstyleOption; label: string; desc: string }> = [
  { id: 'bob', label: 'Short bob', desc: 'Chin-length, soft waves' },
  { id: 'wavy', label: 'Wavy hair', desc: 'Long, flowing waves' },
  { id: 'straight', label: 'Straight hair', desc: 'Silky, flowing strands' },
];

export function CharacterView({
  config,
  characters,
  activeCharacter,
  heart,
  brain,
  avatarEmotion = 'calm',
  soulMarkdown = '',
  totalUserInteractions = 0,
  onSaveSoul,
  onResetSoul,
  onSaveConfig,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
  onEvolveCharacter,
}: CharacterViewProps) {
  const [assistantName, setAssistantName] = useState(config.assistant_name);
  const [userNickname, setUserNickname] = useState(config.user_nickname || 'Boss');
  const [hairstyle, setHairstyle] = useState<HairstyleOption>(config.hairstyle || 'wavy');
  const [moodIntensity, setMoodIntensity] = useState<number>(
    normalizeMoodIntensity(config.mood_intensity)
  );
  const [personality, setPersonality] = useState<ResponseStyle>(config.personality);
  const [language, setLanguage] = useState<LanguageCode>(config.language);
  const [responseTone, setResponseTone] = useState<'casual' | 'formal'>(config.response_tone);
  const [customPrompt, setCustomPrompt] = useState(config.custom_prompt);
  const [soulDraft, setSoulDraft] = useState(soulMarkdown);
  const [isSavingSoul, setIsSavingSoul] = useState(false);
  const [soulSavedNotice, setSoulSavedNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEvolving, setIsEvolving] = useState(false);

  // Custom Character Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newBio, setNewBio] = useState('');
  const [newPersonality, setNewPersonality] = useState<ResponseStyle>('warm_urdu_companion');
  const [newMood, setNewMood] = useState<MoodMode>('love');
  const [newVoice, setNewVoice] = useState('Zephyr');
  const [newPrompt, setNewPrompt] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setAssistantName(config.assistant_name);
    setUserNickname(config.user_nickname || 'Boss');
    setHairstyle(config.hairstyle || 'wavy');
    setMoodIntensity(normalizeMoodIntensity(config.mood_intensity));
    setPersonality(config.personality);
    setLanguage(config.language);
    setResponseTone(config.response_tone);
    setCustomPrompt(config.custom_prompt);
  }, [config]);

  useEffect(() => {
    setSoulDraft(soulMarkdown);
  }, [soulMarkdown]);

  const handleMoodIntensityChange = (nextRaw: number) => {
    const next = normalizeMoodIntensity(nextRaw);
    setMoodIntensity(next);
    void onSaveConfig({ mood_intensity: next });
  };

  const handleSelectPreset = (preset: (typeof PERSONALITY_PRESETS)[number]) => {
    setPersonality(preset.id);
    setCustomPrompt(preset.prompt);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantName.trim()) {
      setErrorMsg('Assistant name cannot be empty.');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onSaveConfig({
        assistant_name: assistantName.trim(),
        user_nickname: userNickname.trim() || 'Boss',
        hairstyle,
        mood_intensity: moodIntensity,
        personality,
        language,
        response_tone: responseTone,
        custom_prompt: customPrompt.trim(),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save character settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPrompt.trim()) {
      setCreateError('Character name and prompt instructions are required.');
      return;
    }
    setCreateError(null);
    try {
      await onCreateCharacter({
        name: newName.trim(),
        role_title: newRole.trim() || 'Living AI Companion',
        bio: newBio.trim() || 'Custom user-created living AI character.',
        personality: newPersonality,
        default_mood: newMood,
        tts_voice: newVoice,
        system_prompt: newPrompt.trim(),
      });
      setNewName('');
      setNewRole('');
      setNewBio('');
      setNewPrompt('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create character.');
    }
  };

  const handleEvolve = async () => {
    setIsEvolving(true);
    try {
      await onEvolveCharacter();
    } finally {
      setIsEvolving(false);
    }
  };

  const currentChar = activeCharacter || characters.find((c) => c.is_active) || characters[0];
  const xpIntoLevel = currentChar ? currentChar.xp % 100 : 0;
  const resolvedActiveMood = resolveAvatarMoodKey(config.active_mood, avatarEmotion);
  const moodAnimParams = computeMoodAnimationParams(moodIntensity);

  const nick = userNickname.trim() || 'Boss';
  const previewGreeting =
    language === 'en'
      ? `Hey ${nick}! What's going on today? Tell me everything.`
      : responseTone === 'formal'
        ? `السلام علیکم ${nick}! میں ${assistantName.trim() || 'ZARA'} ہوں، بتائیے آج کیا چل رہا ہے؟`
        : `Arre ${nick}! Kya chal raha hai? Batao!`;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col overflow-y-auto px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            Living Characters &amp; Self-Evolution
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Select a living companion, create new personas, and evolve traits organically from your chats.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
        >
          {showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showCreateForm ? 'Close Creator' : 'Create New Character'}</span>
        </button>
      </div>

      {/* Create Custom Living Character Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="mt-5 rounded-xl border border-cyan-500/30 bg-[#0D1117] p-5"
        >
          <h2 className="text-sm font-semibold text-white">Design Custom Living Character</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-char-name" className="block text-xs font-medium text-slate-300">
                Character Name
              </label>
              <input
                id="new-char-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. HIRA"
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-char-role" className="block text-xs font-medium text-slate-300">
                Role / Specialty
              </label>
              <input
                id="new-char-role"
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="e.g. Coding Mentor & Best Friend"
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-char-mood" className="block text-xs font-medium text-slate-300">
                Default Mood
              </label>
              <select
                id="new-char-mood"
                value={newMood}
                onChange={(e) => setNewMood(e.target.value as MoodMode)}
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="calm">Calm</option>
                <option value="happy">Happy Mode</option>
                <option value="empathetic">Empathetic Mode</option>
                <option value="love">Love Mode</option>
                <option value="sad">Sad Mode</option>
                <option value="surprised">Surprised</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-char-voice" className="block text-xs font-medium text-slate-300">
                Voice Persona (Female &amp; Male)
              </label>
              <select
                id="new-char-voice"
                value={newVoice}
                onChange={(e) => setNewVoice(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
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
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="new-char-bio" className="block text-xs font-medium text-slate-300">
                Short Bio
              </label>
              <input
                id="new-char-bio"
                type="text"
                value={newBio}
                onChange={(e) => setNewBio(e.target.value)}
                placeholder="How does this character support you every day?"
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="new-char-prompt" className="block text-xs font-medium text-slate-300">
                Personality &amp; Behavior Instructions
              </label>
              <textarea
                id="new-char-prompt"
                rows={3}
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="You are HIRA, a warm Pakistani companion who guides me on coding and speaks gently in Urdu..."
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] p-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
          </div>
          {createError && <p className="mt-3 text-xs text-rose-400">{createError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Create Character
            </button>
          </div>
        </form>
      )}

      {/* Selectable Character Roster */}
      {characters.length > 0 && (
        <section className="mt-5" aria-label="Selectable character roster">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-400">
            Selectable Characters ({characters.length})
          </h2>
          <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {characters.map((ch) => (
              <div
                key={ch.id}
                data-testid={`character-card-${ch.slug}`}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                  ch.is_active
                    ? 'border-cyan-400/60 bg-cyan-500/10'
                    : 'border-slate-800 bg-[#0D1117] hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-white">{ch.name}</h3>
                        {ch.default_mood === 'love' && (
                          <Heart className="h-3.5 w-3.5 text-rose-400" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-cyan-300">{ch.role_title}</p>
                    </div>
                    <span className="font-mono text-xs text-amber-300 tabular-nums shrink-0">
                      Bond Lv {ch.bond_level} · {ch.xp} XP
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">{ch.bio}</p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Traits: {ch.learned_traits.slice(0, 3).join(' · ')}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-xs">
                  <span className="capitalize text-slate-400">
                    Mood: {ch.default_mood} · Voice: {ch.tts_voice}
                  </span>
                  <div className="flex items-center gap-2">
                    {ch.is_custom && !ch.is_active && (
                      <button
                        type="button"
                        aria-label={`Delete character ${ch.name}`}
                        onClick={() => void onDeleteCharacter(ch.id)}
                        className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={ch.is_active}
                      onClick={() => void onSelectCharacter(ch.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        ch.is_active
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                      }`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>{ch.is_active ? 'Active' : `Select ${ch.name}`}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Living Heart ("Dil") & Autonomous Brain ("Dimag") Panel */}
      {heart && brain && (
        <section
          aria-label="Living heart and own brain state"
          data-testid="character-heart-brain-panel"
          className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {/* Heart ("Dil") */}
          <div className="rounded-xl border border-rose-500/25 bg-[#0D1117] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-rose-400" />
                <h2 className="font-display text-base font-semibold text-white">
                  Her Living Heart (Dil)
                </h2>
              </div>
              <span
                data-testid="character-heartbeat-bpm"
                className="font-mono text-xs font-semibold text-rose-300 tabular-nums"
              >
                {heart.heartbeatBpm} BPM · {heart.currentFeeling}
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-300" dir="auto">
              {heart.lastEmotionalReason}
            </p>

            <div className="mt-4 space-y-2.5 text-xs tabular-nums">
              {[
                { label: 'Warmth', val: heart.warmth, color: 'bg-rose-400' },
                { label: 'Affection', val: heart.affection, color: 'bg-pink-400' },
                { label: 'Empathy', val: heart.empathy, color: 'bg-teal-400' },
                { label: 'Energy', val: heart.energy, color: 'bg-amber-400' },
                { label: 'Trust', val: heart.trust, color: 'bg-cyan-400' },
              ].map((meter) => (
                <div key={meter.label}>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>{meter.label}</span>
                    <span className="font-mono text-slate-200">{meter.val}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                    <div
                      className={`h-full ${meter.color} transition-all duration-300`}
                      style={{ width: `${Math.max(4, Math.min(100, meter.val))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Own Brain ("Dimag") */}
          <div className="rounded-xl border border-cyan-500/25 bg-[#0D1117] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-cyan-400" />
                <h2 className="font-display text-base font-semibold text-white">
                  Her Own Brain (Dimag)
                </h2>
              </div>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">
                {brain.intentCategory} · {brain.reasoningDepth}
              </span>
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-[#0A101B] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Focus: {brain.focusTopic}
              </p>
              <p
                data-testid="character-brain-thought"
                className="mt-1.5 text-xs leading-relaxed text-slate-100"
                dir="auto"
              >
                {brain.currentThought}
              </p>
            </div>

            <div className="mt-3 space-y-2.5 text-xs tabular-nums">
              <div className="rounded-lg border border-slate-800/90 bg-[#0A101B] p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300/90">
                  Inner Curiosity
                </p>
                <p className="mt-1 leading-relaxed text-slate-200" dir="auto">
                  {brain.curiosityImpulse}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Cognitive Load</span>
                  <span className="font-mono text-slate-200">{brain.cognitiveLoad}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-300"
                    style={{ width: `${Math.max(6, Math.min(100, brain.cognitiveLoad))}%` }}
                  />
                </div>
              </div>

              <div className="pt-0.5 text-slate-400">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Associative Memory Links
                </p>
                {brain.associativeMemories.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Talk more to link new associative memories.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-xs text-slate-200">
                    {brain.associativeMemories.map((link) => (
                      <li key={link} className="truncate rounded border border-slate-800 bg-[#0A101B] px-2.5 py-1">
                        {link}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Living Self-Development & Life Journal Panel */}
      {currentChar && (
        <section
          aria-label="Living character self-development"
          className="mt-6 rounded-xl border border-amber-500/25 bg-[#0D1117] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                {currentChar.name} — Living Evolution &amp; Life Journal
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Every conversation, memory, and studied book grows {currentChar.name}&apos;s bond level and traits.
              </p>
            </div>
            <button
              type="button"
              disabled={isEvolving}
              onClick={() => void handleEvolve()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isEvolving ? 'Developing...' : 'Auto-Develop Character Now'}</span>
            </button>
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 tabular-nums">
              <span>Bond Level {currentChar.bond_level}</span>
              <span className="text-cyan-300">
                Meta-Growth Reflection: {totalUserInteractions > 0 && totalUserInteractions % 5 === 0 ? '5/5 (Calibrated)' : `${totalUserInteractions % 5}/5 turns`}
              </span>
              <span>{xpIntoLevel}/100 XP to next level ({currentChar.xp} total XP)</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-900">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${Math.max(8, xpIntoLevel)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-[#0A101B] p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                Self-Developed Traits ({currentChar.learned_traits.length})
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-200">
                {currentChar.learned_traits.map((trait) => (
                  <li key={trait} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-cyan-400" />
                    <span>{trait}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0A101B] p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Reflective State &amp; Life Journal
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                {currentChar.life_journal.slice(0, 4).map((entry, idx) => (
                  <li key={`${idx}-${entry.slice(0, 12)}`} className="leading-snug">
                    • {entry}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Fine-Tune Active Character Prompt & Tone */}
      <form onSubmit={handleSave} className="mt-6 space-y-5 rounded-xl border border-slate-800 bg-[#0D1117] p-5">
        <h2 className="text-sm font-semibold text-white">Fine-Tune Active Persona</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label htmlFor="char-name-input" className="block text-xs font-medium text-slate-300">
              Assistant Name
            </label>
            <input
              id="char-name-input"
              type="text"
              value={assistantName}
              onChange={(e) => setAssistantName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="char-nickname-input" className="block text-xs font-medium text-slate-300">
              What She Calls You
            </label>
            <input
              id="char-nickname-input"
              type="text"
              value={userNickname}
              onChange={(e) => setUserNickname(e.target.value)}
              placeholder="Boss"
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="char-language-select" className="block text-xs font-medium text-slate-300">
              Language Preference
            </label>
            <select
              id="char-language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none"
            >
              <option value="bilingual">Roman Urdu + Urdu + English</option>
              <option value="ur">Roman Urdu / Urdu Primary</option>
              <option value="en">English Primary</option>
            </select>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-300">Holographic Hairstyle</span>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {HAIRSTYLE_CARDS.map((h) => {
              const active = hairstyle === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setHairstyle(h.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-cyan-400 bg-cyan-500/15 text-white'
                      : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-semibold">{h.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{h.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0A101B] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label htmlFor="char-mood-intensity" className="text-xs font-semibold text-white">
                    Mood Animation Intensity
                  </label>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Active mood:{' '}
                    <span className="capitalize text-cyan-300">
                      {config.active_mood === 'auto'
                        ? `Auto (${resolvedActiveMood})`
                        : config.active_mood}
                    </span>{' '}
                    · Tunes avatar animation pace and scale.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="mood-intensity-readout"
                    className="font-mono text-xs font-semibold text-cyan-300 tabular-nums"
                  >
                    {Math.round(moodIntensity * 100)}%
                  </span>
                  {moodIntensity !== DEFAULT_MOOD_INTENSITY && (
                    <button
                      type="button"
                      onClick={() => handleMoodIntensityChange(DEFAULT_MOOD_INTENSITY)}
                      aria-label="Reset mood intensity to 100%"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#111827] px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              <input
                id="char-mood-intensity"
                type="range"
                min={MIN_MOOD_INTENSITY}
                max={MAX_MOOD_INTENSITY}
                step={0.05}
                value={moodIntensity}
                onChange={(e) => handleMoodIntensityChange(Number(e.target.value))}
                className="mt-3 w-full accent-cyan-400"
              />

              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                <span>50% Gentle</span>
                <span className="font-mono text-slate-300">
                  Duration {moodAnimParams.durationScale.toFixed(2)}x · Scale{' '}
                  {moodAnimParams.canvasScale.toFixed(2)}x
                </span>
                <span>200% Intense</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-[#060C17] p-2">
              <HolographicAvatar
                state="idle"
                emotion={avatarEmotion}
                activeMood={config.active_mood}
                moodIntensity={moodIntensity}
                assistantName={assistantName.trim() || config.assistant_name}
                hairstyle={hairstyle}
                heart={heart}
                variant="compact"
                showVoiceWaves={false}
              />
            </div>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-300">Personality Preset</span>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            {PERSONALITY_PRESETS.map((preset) => {
              const active = personality === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-white'
                      : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-semibold">{preset.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{preset.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-300">Response Style</span>
          <div className="mt-2 inline-flex rounded-lg border border-slate-800 bg-[#111827] p-1">
            {(['casual', 'formal'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => setResponseTone(tone)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                  responseTone === tone
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="char-system-prompt" className="block text-xs font-medium text-slate-300">
            System Prompt
          </label>
          <textarea
            id="char-system-prompt"
            rows={3}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-[#111827] p-3.5 text-sm leading-relaxed text-slate-100 focus:border-cyan-500/60 focus:outline-none"
          />
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-3.5">
          <p className="text-xs font-medium text-slate-400">Live Greeting Preview</p>
          <p className="mt-1 text-sm text-cyan-200" dir="auto">{previewGreeting}</p>
        </div>

        {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
          {savedNotice && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
              <Check className="h-4 w-4" />
              Character saved
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-cyan-400 px-5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Character'}
          </button>
        </div>
      </form>

      {/* Living Soul (SOUL.md) Editor */}
      {onSaveSoul && (
        <section
          aria-label="Living Soul SOUL.md"
          className="mt-6 rounded-xl border border-slate-800 bg-[#0D1117] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Living Soul File (SOUL.md)</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Core voice, boundaries, banned robotic phrases &amp; Roman Urdu best-friend instincts loaded on every reply.
              </p>
            </div>
            {onResetSoul && (
              <button
                type="button"
                disabled={isSavingSoul}
                onClick={async () => {
                  setIsSavingSoul(true);
                  try {
                    await onResetSoul();
                    setSoulSavedNotice(true);
                    setTimeout(() => setSoulSavedNotice(false), 2500);
                  } finally {
                    setIsSavingSoul(false);
                  }
                }}
                className="rounded-lg border border-slate-700 bg-[#111827] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
              >
                Reset Default SOUL.md
              </button>
            )}
          </div>
          <label htmlFor="soul-md-editor" className="sr-only">
            SOUL.md content
          </label>
          <textarea
            id="soul-md-editor"
            rows={9}
            value={soulDraft}
            onChange={(e) => setSoulDraft(e.target.value)}
            className="mt-3 w-full rounded-xl border border-slate-800 bg-[#0A101B] p-3.5 font-mono text-xs leading-relaxed text-slate-200 focus:border-cyan-500/60 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            {soulSavedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                <Check className="h-4 w-4" />
                SOUL.md saved
              </span>
            )}
            <button
              type="button"
              disabled={isSavingSoul}
              onClick={async () => {
                setIsSavingSoul(true);
                try {
                  await onSaveSoul(soulDraft);
                  setSoulSavedNotice(true);
                  setTimeout(() => setSoulSavedNotice(false), 2500);
                } finally {
                  setIsSavingSoul(false);
                }
              }}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
            >
              {isSavingSoul ? 'Saving...' : 'Save SOUL.md'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
