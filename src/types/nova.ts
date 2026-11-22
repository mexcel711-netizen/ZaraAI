export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type FacialEmotion =
  | 'calm'
  | 'happy'
  | 'love'
  | 'sad'
  | 'surprised'
  | 'excited'
  | 'empathetic'
  | 'thoughtful'
  | 'confident'
  | 'angry'
  | 'curious';

export type MoodMode = 'auto' | 'happy' | 'love' | 'sad' | 'calm' | 'surprised' | 'empathetic';

export type SidebarPage =
  | 'home'
  | 'memory'
  | 'skills'
  | 'character'
  | 'recent'
  | 'settings';

export type LanguageCode = 'bilingual' | 'en' | 'ur';

export type ResponseStyle = 'friendly_professional' | 'concise_technical' | 'warm_urdu_companion';

export type AiProviderPreference = 'auto' | 'google-ai-studio' | 'cloudflare';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  spokenText?: string;
  emotion?: FacialEmotion;
  language: 'en' | 'ur';
  timestamp: string;
  modelUsed?: string;
  providerUsed?: string;
  thinkingUsed?: boolean;
  skillExecuted?: string;
  launchedUrl?: string;
}

export interface MemoryRecord {
  id: number;
  category: 'preference' | 'fact' | 'learning' | 'reminder' | 'note';
  key: string | null;
  value: string;
  source: 'user_stated' | 'ai_inferred' | 'manual';
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface CharacterProfile {
  id: number;
  slug: string;
  name: string;
  role_title: string;
  bio: string;
  personality: ResponseStyle;
  default_mood: MoodMode;
  tts_voice: string;
  system_prompt: string;
  learned_traits: string[];
  life_journal: string[];
  bond_level: number;
  xp: number;
  is_active: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export type KnowledgeKind = 'book' | 'software' | 'course';

export interface KnowledgeSource {
  id: number;
  kind: KnowledgeKind;
  title: string;
  goal: string;
  source_excerpt: string;
  detailed_summary: string;
  action_plan: string[];
  created_at: string;
}

export type SkillActionType =
  | 'launch'
  | 'url'
  | 'system'
  | 'ai'
  | 'note'
  | 'reminder'
  | 'calc'
  | 'study'
  | 'vision'
  | 'evolve'
  | 'desktop';

export interface SkillConfig {
  id: number;
  skill_name: string;
  display_name: string;
  description: string;
  trigger_phrases: string[];
  action_type: SkillActionType;
  action_value: string;
  is_enabled: boolean;
  is_custom: boolean;
  created_at: string;
}

export type VoiceCommandStatus = 'matched' | 'ai_fallback' | 'failed';
export type VoiceCommandSource = 'microphone' | 'retrigger';

export interface VoiceCommandLog {
  id: number;
  transcript: string;
  matched_skill_name: string | null;
  matched_display_name: string | null;
  action_type: SkillActionType | 'ai' | 'desktop' | null;
  status: VoiceCommandStatus;
  response_summary: string;
  source: VoiceCommandSource;
  language: 'en' | 'ur';
  volume_level: number;
  created_at: string;
}

export interface ReminderRecord {
  id: number;
  title: string;
  remind_at: string;
  is_done: boolean;
  created_at: string;
}

export interface NoteRecord {
  id: number;
  title: string | null;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  preview: string;
  primary_language: 'en' | 'ur';
}

export type HairstyleOption = 'bob' | 'wavy' | 'straight';

export type TtsEngineMode = 'auto' | 'gemini-studio' | 'edge-neural';

export interface HeartState {
  warmth: number;
  affection: number;
  empathy: number;
  energy: number;
  trust: number;
  heartbeatBpm: number;
  currentFeeling: FacialEmotion;
  emotionalMomentum: number;
  lastEmotionalReason: string;
  updatedAt: string;
}

export type BrainIntentCategory =
  | 'emotional_support'
  | 'casual_bond'
  | 'creative_brainstorm'
  | 'problem_solving'
  | 'memory_recall'
  | 'learning_study';

export type BrainReasoningDepth = 'intuitive' | 'reflective' | 'analytical';

export interface BrainState {
  focusTopic: string;
  currentThought: string;
  intentCategory: BrainIntentCategory;
  reasoningDepth: BrainReasoningDepth;
  curiosityImpulse: string;
  associativeMemories: string[];
  cognitiveLoad: number;
  lastInsight: string;
  updatedAt: string;
}

export interface AppConfig {
  assistant_name: string;
  personality: ResponseStyle;
  custom_prompt: string;
  language: LanguageCode;
  response_tone: 'casual' | 'formal';
  tts_voice: string;
  voice_locked: boolean;
  tts_engine_mode: TtsEngineMode;
  voice_speed: number;
  voice_volume: number;
  voice_activity_threshold: number;
  stt_model: 'base' | 'small' | 'medium';
  wake_word: string;
  wake_word_enabled: boolean;
  auto_speak: boolean;
  deep_thinking_mode: 'auto' | 'always' | 'manual';
  default_model: 'gemini-4-hydrogen' | 'gemini-4-carbon';
  ai_provider: AiProviderPreference;
  active_mood: MoodMode;
  mood_intensity: number;
  active_character_id: number;
  hands_free_mode: boolean;
  camera_awareness_enabled: boolean;
  hairstyle: HairstyleOption;
  user_name: string;
  user_nickname: string;
  assistant_age: string;
  onboarding_completed: boolean;
  whatsapp_number: string;
  referral_source: string;
  auto_usb_transfer: boolean;
  last_usb_sync_at: string;
  last_usb_drive_label: string;
}

export interface OnboardingPayload {
  userName: string;
  whatsappNumber: string;
  referralSource: string;
  characterGender: 'female' | 'male';
  characterPreset: string;
  hairstyle: HairstyleOption;
  assistantName: string;
  assistantAge: string;
  userNickname: string;
  answers: Array<{ question: string; answer: string }>;
}

export type CameraCommandMode =
  | 'look_now'
  | 'camera_on'
  | 'camera_off'
  | 'auto_watch_on'
  | 'auto_watch_off';

export interface SkillExecutionResult {
  matched: boolean;
  skillName?: string;
  actionType?: SkillActionType;
  responseText?: string;
  language?: 'en' | 'ur';
  emotion?: FacialEmotion;
  sideEffect?: {
    type:
      | 'open_url'
      | 'create_note'
      | 'create_reminder'
      | 'system_action'
      | 'switch_mood'
      | 'switch_character'
      | 'trigger_vision'
      | 'trigger_evolve'
      | 'open_study'
      | 'transfer_usb'
      | 'toggle_auto_usb'
      | 'check_usb'
      | 'navigate_page'
      | 'new_session'
      | 'list_memories'
      | 'list_notes'
      | 'list_reminders'
      | 'none';
    url?: string;
    cameraMode?: CameraCommandMode;
    noteTitle?: string;
    noteContent?: string;
    reminderTitle?: string;
    reminderAt?: string;
    systemCommand?: string;
    mood?: MoodMode;
    characterSlug?: string;
    studyTopic?: string;
    driveHint?: string;
    autoUsbEnabled?: boolean;
    navigatePage?: SidebarPage;
  };
}

export interface ChatApiResponse {
  reply: string;
  spokenText?: string;
  emotion: FacialEmotion;
  language: 'en' | 'ur';
  modelUsed: string;
  providerUsed: string;
  thinkingUsed: boolean;
  skillExecuted?: string;
  sideEffect?: SkillExecutionResult['sideEffect'];
  extractedMemories?: Array<{ category: MemoryRecord['category']; key: string; value: string }>;
  createdNotesCount?: number;
  createdRemindersCount?: number;
  studiedTitle?: string;
  characterUpdate?: {
    bondLevel: number;
    xp: number;
    newTrait?: string;
  };
  heart?: HeartState;
  brain?: BrainState;
  voiceLog?: VoiceCommandLog;
  warning?: string;
}

export interface ProviderStatus {
  activeProvider: 'cloudflare-binding' | 'cloudflare-rest' | 'google-ai-studio' | 'unconfigured';
  googleAiConfigured: boolean;
  cloudflareConfigured: boolean;
  cloudflareBindingActive: boolean;
}
