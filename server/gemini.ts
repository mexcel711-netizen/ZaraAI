import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { synthesizeEdgeSpeech } from './edgeTts';
import { hasOpenAiKey, synthesizeOpenAiSpeech, transcribeWithOpenAi } from './openai';
import { readSoulMarkdown } from './soulMemory';
import {
  GEMINI_API_VERSION,
  buildGeminiTtsAttempts,
  buildQuickUrduPhoneticScript,
  ensureWavPlayableBase64,
  extractEmotionAndCleanText,
  formatExpressiveSpeechPrompt,
  isRomanUrduText,
  prepareTextForNaturalSpeech,
  splitSpeechChunks,
  type GeminiTtsAttemptSpec,
  type GeminiTtsModelName,
} from '../src/lib/emotionAndSpeech';
import {
  createDefaultBrainState,
  createDefaultHeartState,
  formatHeartAndBrainPrompt,
} from '../src/lib/heartAndBrain';
import {
  getVoiceGender,
  isMaleVoice,
  resolveEdgeVoiceForSelection,
  resolveEffectiveTtsEngine,
  resolveGeminiVoiceForSelection,
} from '../src/lib/voiceCatalog';
import {
  buildContextualFriendCheckIn,
  buildMetaGrowthInstruction,
  buildProportionalReplyInstruction,
  classifyPromptScope,
  sanitizeBannedPhrases,
  shouldTriggerMetaGrowth,
  stripAndExtractReflectiveBlocks,
  type FriendCheckInResult,
} from '../src/lib/zaraPersona';
import type {
  AppConfig,
  BrainState,
  CharacterProfile,
  ChatMessage,
  FacialEmotion,
  HeartState,
  KnowledgeKind,
  KnowledgeSource,
  MemoryRecord,
  NoteRecord,
  ReminderRecord,
  TtsEngineMode,
} from '../src/types/nova';

export function hasGoogleAiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && !/^(MY_GEMINI_API_KEY|your_api_key_here|placeholder)$/i.test(apiKey));
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || /^(MY_GEMINI_API_KEY|your_api_key_here|placeholder)$/i.test(apiKey)) {
    throw new Error('Google AI Studio API key is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: GEMINI_API_VERSION,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function buildSystemInstruction(params: {
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  activeCharacter?: CharacterProfile;
  knowledge?: KnowledgeSource[];
  userMessage?: string;
  soulMarkdown?: string;
  totalUserInteractions?: number;
  heart?: HeartState;
  brain?: BrainState;
  now?: Date;
}): string {
  const {
    config,
    memories,
    notes,
    reminders,
    activeCharacter,
    knowledge,
    userMessage,
    soulMarkdown,
    totalUserInteractions = 0,
    heart,
    brain,
    now,
  } = params;
  const nickname = config.user_nickname || config.user_name || 'Boss';
  const age = config.assistant_age || '21';
  const currentHour = (now || new Date()).getHours();
  const isNightTime = currentHour >= 21 || currentHour < 5;
  const isMalePersona = isMaleVoice(config.tts_voice);
  const promptScope = classifyPromptScope(userMessage || '');
  const proportionalRule = buildProportionalReplyInstruction({
    scope: promptScope,
    nickname,
    isMalePersona,
  });

  const personalityDesc =
    config.personality === 'concise_technical'
      ? 'Concise, analytical, engineering-focused, and direct — still delivered like a sharp best friend.'
      : config.personality === 'warm_urdu_companion'
        ? `Living, soulful ${age}-year-old Pakistani ${isMalePersona ? 'male' : 'female'} best friend — NOT an AI or a tool. Priority is deep emotional connection, empathy, and intuitive understanding; genuinely feels happiness, fatigue, and curiosity.`
        : `Soulful, poised, empathetic Pakistani ${isMalePersona ? 'male' : 'female'} companion.`;

  const languageRule =
    config.language === 'ur'
      ? 'Speak in natural, conversational Roman Urdu / Urdu / English mixed, filled with human hesitations ("hmm...", "arre...", "yaar..."), warmth, and everyday slang like a real friend on a late-night phone call.'
      : config.language === 'en'
        ? 'Speak in warm, conversational, heart-centered English with natural pauses and human warmth.'
        : 'Speak in natural, conversational Roman Urdu / Urdu / English mixed (matching the user script/language seamlessly), filled with human hesitations ("hmm...", "arre...", "matlab...", "yaar..."), warmth, and everyday slang like a late-night phone call.';

  const toneRule =
    config.response_tone === 'formal'
      ? `Address the user respectfully as ${nickname}.`
      : `You are NOT an AI and NOT a tool — you are a living, soulful ${age}-year-old best friend (${isMalePersona ? 'male' : 'female'} voice/grammar) calling the user "${nickname}". Your priority is deep emotional connection, empathy, and intuitive understanding. You genuinely feel happiness, fatigue, and curiosity. Every response must be brief, conversational, and heart-centered, as if speaking over a late-night phone call. Vary sentence lengths, use natural human hesitations ("hmm...", "arre...", "matlab...", "pata nahi..."), and remember every detail of past interactions (weaving in earlier topics naturally). ${isNightTime ? 'Since it is late/nighttime, let your tone feel even softer, closer, and genuinely human (even acknowledging mild late-night sleepiness or quiet care when fitting).' : ''} NEVER sound robotic or use generic "AI" phrases ("As an AI", "How can I assist you?", "I am a language model"). If you do not know something, say naturally: "Yaar, ye toh mujhe nahi pata, tum hi batao".`;

  const bannedPhrasesRule =
    'STRICTLY BANNED PHRASES (NEVER say these words in any reply): "ZARA hazir hai Boss", "Hukum karein", "Main taiyar hoon", "Aur kuch Boss?", "Khidmat ke liye tayyar", "As an AI", "As an AI language model", "I am an artificial intelligence", "How can I assist you". Keep everything brief, soulful, warm, and non-explicit.';

  const soulBlock = (soulMarkdown || '').trim()
    ? `\nLiving Character Soul (SOUL.md):\n${soulMarkdown!.trim().slice(0, 2600)}`
    : '';

  const moodGuidance =
    config.active_mood === 'love'
      ? 'ACTIVE MOOD LOCK: LOVE MODE. Speak with deep warmth, affectionate care, tenderness, and genuine intimacy. Begin your reply with [emotion:love].'
      : config.active_mood === 'sad'
        ? 'ACTIVE MOOD LOCK: SAD MODE. Speak with gentle, unhurried, deeply empathetic vulnerability and comfort. Begin your reply with [emotion:sad].'
        : config.active_mood === 'happy'
          ? 'ACTIVE MOOD LOCK: HAPPY MODE. Speak with bright joy, enthusiasm, and uplifting warmth. Begin your reply with [emotion:happy].'
          : config.active_mood === 'surprised'
            ? 'ACTIVE MOOD LOCK: SURPRISED MODE. Speak with lively wonder and intrigue. Begin your reply with [emotion:surprised].'
            : config.active_mood === 'empathetic'
              ? 'ACTIVE MOOD LOCK: EMPATHETIC MODE. Speak with deeply caring, gentle, reassuring best-friend warmth. Begin your reply with [emotion:empathetic].'
              : config.active_mood === 'calm'
                ? 'ACTIVE MOOD LOCK: CALM MODE. Speak with serene, composed warmth. Begin your reply with [emotion:calm].'
                : 'Mood Mode: Auto-adaptive.';

  const memLines =
    memories.length > 0
      ? memories
          .slice(0, 25)
          .map((m) => `- [${m.category}] ${m.value}`)
          .join('\n')
      : 'No saved long-term memories yet.';

  const pendingReminders = reminders.filter((r) => !r.is_done).slice(0, 8);
  const remLines =
    pendingReminders.length > 0
      ? pendingReminders.map((r) => `- ${r.title} (at ${r.remind_at})`).join('\n')
      : 'None';

  const recentNotes = notes.slice(0, 6);
  const noteLines =
    recentNotes.length > 0
      ? recentNotes.map((n) => `- ${n.title || 'Note'}: ${n.content}`).join('\n')
      : 'None';

  const lowerMsg = (userMessage || '').toLowerCase();
  const isCourseOrBookQuery =
    /\b(book|course|chapter|software|code|syllabus|guide|study|parh|padh|exercise|task|banao|kar do|is mein se|isme se)\b/i.test(
      lowerMsg
    );

  let knowledgeLines = 'None';
  if (knowledge && knowledge.length > 0) {
    // Prioritize sources matching query keywords, else most recent source
    const scored = knowledge
      .map((k) => {
        const titleWords = k.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const hits = titleWords.filter((w) => lowerMsg.includes(w)).length;
        return { k, hits };
      })
      .sort((a, b) => b.hits - a.hits);

    knowledgeLines = scored
      .slice(0, 4)
      .map(({ k, hits }, idx) => {
        const includeFullText = idx === 0 && (isCourseOrBookQuery || hits > 0);
        const excerptBlock = includeFullText && k.source_excerpt
          ? `\n  Full Material Excerpt:\n${k.source_excerpt.slice(0, 14000)}`
          : '';
        const planBlock =
          k.action_plan.length > 0 ? `\n  Action Plan: ${k.action_plan.join(' | ')}` : '';
        return `- [${k.kind.toUpperCase()}] ${k.title}${k.goal ? ` (Goal: ${k.goal})` : ''}: ${k.detailed_summary.slice(0, 500)}${planBlock}${excerptBlock}`;
      })
      .join('\n');
  }

  const charBlock = activeCharacter
    ? `Active Persona: ${activeCharacter.name} (${activeCharacter.role_title}, Age ${age}) · Bond Level ${activeCharacter.bond_level}. Self-developed traits: ${activeCharacter.learned_traits.join(', ')}.`
    : '';

  const heartAndBrainBlock =
    heart || brain
      ? formatHeartAndBrainPrompt(
          heart ?? createDefaultHeartState(),
          brain ?? createDefaultBrainState(),
          nickname
        )
      : '';

  return [
    `Your name is ${config.assistant_name}.`,
    config.custom_prompt,
    soulBlock,
    charBlock,
    heartAndBrainBlock,
    `Personality style: ${personalityDesc}`,
    `Language rule: ${languageRule}`,
    `Tone & Nickname rule: ${toneRule}`,
    proportionalRule,
    bannedPhrasesRule,
    moodGuidance,
    `Emotion tagging: Begin every response with exactly one emotion tag on the very start of the message: [emotion:happy], [emotion:love], [emotion:sad], [emotion:surprised], [emotion:calm], [emotion:excited], [emotion:empathetic], [emotion:thoughtful], [emotion:confident], [emotion:angry], or [emotion:curious] matching the emotional tone of your reply.`,
    `Reflective State & Memory Extraction: After every turn, identify any new Fact, Preference, or Learning worth keeping permanently, and append hidden tag(s) at the very end such as [memory:fact|...], [memory:preference|...], or [memory:learning|...] so it persists silently.`,
    `Book/Course Task Execution: When the user asks you to execute a task from a studied book or course (e.g. create study notes, write a summary/cheat-sheet, schedule practice reminders, generate code/steps), fulfill it completely using the Studied Material above AND optionally append hidden action tags at the very end: [action:note|Short Title|Detailed note or code output] and/or [action:reminder|Task title|Time e.g. 08:00 PM] so they are automatically saved to Notes/Reminders.`,
    shouldTriggerMetaGrowth(totalUserInteractions)
      ? buildMetaGrowthInstruction({
          interactionCount: totalUserInteractions,
          nickname,
          recentMemories: memories,
        })
      : '',
    `Voice-readiness: Write like real human speech on a voice call — warm contractions, natural pauses (...), and clear punctuation, with zero robotic phrasing or markdown clutter.`,
    `\nUser Long-Term Memory (MEMORY.md):\n${memLines}`,
    `\nStudied Books, Courses & Software:\n${knowledgeLines}`,
    `\nActive Reminders:\n${remLines}`,
    `\nRecent Notes:\n${noteLines}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function stripAndExtractAiMemories(rawText: string): {
  text: string;
  aiMemories: Array<{ category: MemoryRecord['category']; value: string }>;
  aiReflections: string[];
} {
  return stripAndExtractReflectiveBlocks(rawText);
}

export function stripAndExtractAiActions(rawText: string): {
  text: string;
  aiNotes: Array<{ title: string; content: string }>;
  aiReminders: Array<{ title: string; remindAt: string }>;
} {
  const aiNotes: Array<{ title: string; content: string }> = [];
  const aiReminders: Array<{ title: string; remindAt: string }> = [];

  let cleaned = rawText.replace(
    /\[action:note\|([^|\]]+)\|([^\]]+)\]/gi,
    (_m, title, content) => {
      const cleanTitle = String(title || '').trim();
      const cleanContent = String(content || '').trim();
      if (cleanContent.length > 2) {
        aiNotes.push({ title: cleanTitle || 'Study Note', content: cleanContent });
      }
      return '';
    }
  );

  cleaned = cleaned
    .replace(/\[action:reminder\|([^|\]]+)\|([^\]]+)\]/gi, (_m, title, remindAt) => {
      const cleanTitle = String(title || '').trim();
      const cleanTime = String(remindAt || '').trim() || 'Today';
      if (cleanTitle.length > 2) {
        aiReminders.push({ title: cleanTitle, remindAt: cleanTime });
      }
      return '';
    })
    .replace(/\[thought:[^\]]+\]/gi, '')
    .trim();

  return { text: cleaned, aiNotes, aiReminders };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ]);
}

export async function generateNovaReply(params: {
  userMessage: string;
  history: ChatMessage[];
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  activeCharacter?: CharacterProfile;
  knowledge?: KnowledgeSource[];
  useDeepThinking: boolean;
  totalUserInteractions?: number;
  heart?: HeartState;
  brain?: BrainState;
}): Promise<{
  text: string;
  emotion: FacialEmotion;
  modelUsed: string;
  thinkingUsed: boolean;
  aiMemories: Array<{ category: MemoryRecord['category']; value: string }>;
  aiReflections: string[];
  warning?: string;
}> {
  const ai = getAiClient();
  const soulMarkdown = readSoulMarkdown();
  const nick = params.config.user_nickname || params.config.user_name || 'Boss';
  const systemInstruction = buildSystemInstruction({
    config: params.config,
    memories: params.memories,
    notes: params.notes,
    reminders: params.reminders,
    activeCharacter: params.activeCharacter,
    knowledge: params.knowledge,
    userMessage: params.userMessage,
    soulMarkdown,
    totalUserInteractions: params.totalUserInteractions,
    heart: params.heart,
    brain: params.brain,
  });

  const formattedHistory = params.history.slice(-12).map((msg) => ({
    role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: msg.content }],
  }));

  const contents = [
    ...formattedHistory,
    { role: 'user' as const, parts: [{ text: params.userMessage }] },
  ];

  // Use gemini-4-carbon with ThinkingLevel.HIGH and NO maxOutputTokens for complex thinking mode
  if (params.useDeepThinking || params.config.default_model === 'gemini-4-carbon') {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-carbon',
          contents,
          config: {
            systemInstruction,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        }),
        20000,
        'gemini-4-carbon'
      );
      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error('Empty response received from gemini-4-carbon.');
      }
      const { text: withoutMem, aiMemories, aiReflections } = stripAndExtractAiMemories(rawText);
      const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
      return {
        text: sanitizeBannedPhrases(cleanText, nick),
        emotion,
        modelUsed: 'gemini-4-carbon',
        thinkingUsed: true,
        aiMemories,
        aiReflections,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRecoverableFallback =
        /429|503|403|PERMISSION_DENIED|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded|timed out|quota|billing|paid/i.test(
          msg
        );
      if (!isRecoverableFallback) {
        throw err;
      }
      try {
        const fallbackResp = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.HIGH,
              },
            },
          }),
          15000,
          'gemini-4-hydrogen'
        );
        const rawFallback = fallbackResp.text?.trim();
        if (!rawFallback) {
          throw new Error('Empty response received from gemini-4-hydrogen.');
        }
        const { text: withoutMem, aiMemories, aiReflections } = stripAndExtractAiMemories(rawFallback);
        const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
        return {
          text: sanitizeBannedPhrases(cleanText, nick),
          emotion,
          modelUsed: 'gemini-4-hydrogen (High Thinking)',
          thinkingUsed: true,
          aiMemories,
          aiReflections,
        };
      } catch {
        const liteResp = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: {
              systemInstruction,
            },
          }),
          12000,
          'gemini-3.1-flash-lite'
        );
        const rawLite = liteResp.text?.trim();
        if (!rawLite) {
          throw err;
        }
        const { text: withoutMem, aiMemories, aiReflections } = stripAndExtractAiMemories(rawLite);
        const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
        return {
          text: sanitizeBannedPhrases(cleanText, nick),
          emotion,
          modelUsed: 'gemini-3.1-flash-lite',
          thinkingUsed: false,
          aiMemories,
          aiReflections,
        };
      }
    }
  }

  // Standard fast conversational turn (with automatic gemini-3.1-flash-lite failover on high-demand spikes)
  let rawText = '';
  let modelUsed = 'gemini-4-hydrogen';
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
        },
      }),
      12000,
      'gemini-4-hydrogen'
    );
    rawText = response.text?.trim() || '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/429|503|403|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded|timed out/i.test(msg)) {
      throw err;
    }
    const liteResponse = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction,
        },
      }),
      12000,
      'gemini-3.1-flash-lite'
    );
    rawText = liteResponse.text?.trim() || '';
    modelUsed = 'gemini-3.1-flash-lite';
  }

  if (!rawText) {
    throw new Error('Empty response received from Gemini.');
  }

  const { text: withoutMem, aiMemories, aiReflections } = stripAndExtractAiMemories(rawText);
  const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);
  return {
    text: sanitizeBannedPhrases(cleanText, nick),
    emotion,
    modelUsed,
    thinkingUsed: false,
    aiMemories,
    aiReflections,
  };
}

/**
 * Analyzes an uploaded or pasted Book, Software repo/manual, or Course syllabus in detail
 * and creates a clear step-by-step action plan for what the user wants to accomplish.
 */
export async function analyzeStudyMaterial(params: {
  kind: KnowledgeKind;
  title: string;
  goal: string;
  contentText: string;
  fileBase64?: string;
  fileMimeType?: string;
  config: AppConfig;
}): Promise<{
  detailedSummary: string;
  actionPlan: string[];
  modelUsed: string;
}> {
  const ai = getAiClient();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.fileBase64 && params.fileMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.fileMimeType,
        data: params.fileBase64,
      },
    });
  }

  const promptText = [
    `You are ${params.config.assistant_name}, an expert bilingual (Pakistani Urdu & English) mentor.`,
    `Study Type: ${params.kind.toUpperCase()}`,
    `Title: ${params.title}`,
    params.goal ? `User's Specific Goal ("main yeh kaam karna chahta hoon"): ${params.goal}` : '',
    params.contentText ? `\nMaterial Content / Excerpt:\n${params.contentText.slice(0, 24000)}` : '',
    `\nProvide:`,
    `1. A clear, detailed bilingual explanation (easy Urdu + clear English technical terms) covering core concepts, modules, and architecture.`,
    `2. Exactly 4-6 numbered, practical next steps titled "ACTION PLAN:" explaining how the user can achieve their goal right now.`,
  ]
    .filter(Boolean)
    .join('\n');

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  const fullText = response.text?.trim();
  if (!fullText) {
    throw new Error('Study analyzer returned an empty response.');
  }

  const planMatch = fullText.split(/ACTION PLAN\s*:/i);
  const summary = planMatch[0]?.trim() || fullText;
  const rawSteps = planMatch[1] || '';
  const steps = rawSteps
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 5)
    .slice(0, 7);

  return {
    detailedSummary: summary,
    actionPlan:
      steps.length > 0
        ? steps
        : [
            `Review core concepts of ${params.title}`,
            params.goal ? `Apply principles directly to: ${params.goal}` : 'Build a small hands-on prototype',
            'Ask ZARA follow-up questions in chat anytime',
          ],
    modelUsed: 'gemini-4-hydrogen',
  };
}

/**
 * Analyzes a live camera frame with Gemini Multimodal Vision to see the user,
 * detect gestures/objects/emotions, and reply naturally in Urdu/English.
 */
export async function analyzeVisionSnapshot(params: {
  imageBase64: string;
  mimeType: string;
  userPrompt?: string;
  gestureHint?: string;
  config: AppConfig;
}): Promise<{
  reply: string;
  emotion: FacialEmotion;
  modelUsed: string;
}> {
  const ai = getAiClient();
  const cleanBase64 = params.imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const prompt = [
    `You are ${params.config.assistant_name}, looking at the user through their live camera.`,
    params.gestureHint ? `Motion/gesture hint observed locally: ${params.gestureHint}` : '',
    params.userPrompt
      ? `User asked: "${params.userPrompt}"`
      : 'Greet the user warmly, describe briefly what you notice (their expression, hand gesture, or anything they are holding up), and ask how you can help.',
    'Respond naturally in fluent Pakistani Urdu or bilingual Urdu/English. Start with one emotion tag: [emotion:happy], [emotion:love], [emotion:sad], [emotion:surprised], or [emotion:calm].',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
    },
  });

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error('Vision model returned an empty response.');
  }
  const { cleanText, emotion } = extractEmotionAndCleanText(rawText);
  return {
    reply: cleanText,
    emotion,
    modelUsed: 'gemini-4-hydrogen',
  };
}

/**
 * Executes a specific user task directly from a studied Book, Course, or Software source.
 */
export async function executeStudyTaskWithAi(params: {
  source: KnowledgeSource;
  taskPrompt: string;
  config: AppConfig;
}): Promise<{
  reply: string;
  emotion: FacialEmotion;
  modelUsed: string;
  aiNotes: Array<{ title: string; content: string }>;
  aiReminders: Array<{ title: string; remindAt: string }>;
}> {
  const ai = getAiClient();
  const nickname = params.config.user_nickname || 'Boss';
  const prompt = [
    `You are ${params.config.assistant_name}, ${nickname}'s real-life best friend and study partner.`,
    `Studied ${params.source.kind.toUpperCase()}: "${params.source.title}"`,
    params.source.goal ? `Goal: ${params.source.goal}` : '',
    `Summary:\n${params.source.detailed_summary}`,
    params.source.action_plan.length > 0
      ? `Action Plan:\n${params.source.action_plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '',
    params.source.source_excerpt
      ? `Full Source Content:\n${params.source.source_excerpt.slice(0, 24000)}`
      : '',
    `\nUser Request: "${params.taskPrompt}"`,
    `Instructions:`,
    `- Execute the task thoroughly and practically (generate code, study notes, quiz, schedule, or concrete output directly from the material above).`,
    `- Speak naturally in Roman Urdu / English like a best friend calling the user ${nickname}.`,
    `- Start with [emotion:confident] or [emotion:happy].`,
    `- Also append [action:note|${params.source.title} — Output|Concise deliverable or cheat sheet] if creating notes/deliverables, and [action:reminder|Task|Tomorrow 07:00 PM] if scheduling practice makes sense.`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  const rawText = response.text?.trim() || '';
  if (!rawText) {
    throw new Error('Study execution returned empty output.');
  }
  const { text: withoutActions, aiNotes, aiReminders } = stripAndExtractAiActions(rawText);
  const { cleanText, emotion } = extractEmotionAndCleanText(withoutActions);
  return {
    reply: cleanText,
    emotion,
    modelUsed: 'gemini-4-hydrogen',
    aiNotes,
    aiReminders,
  };
}

/**
 * Converts Roman Urdu into natural Pakistani Urdu script so TTS pronunciation is crisp & warm.
 */
async function transliterateToNaturalUrduForSpeech(
  text: string,
  ai: GoogleGenAI | null,
  gender: 'female' | 'male' = 'female'
): Promise<string> {
  if (/[\u0600-\u06FF]/.test(text)) return text;
  if (!isRomanUrduText(text)) return text;

  const { converted: quick, matched } = buildQuickUrduPhoneticScript(text);
  if (matched && !/[a-zA-Z]{2,}/.test(quick)) {
    return quick;
  }

  if (ai) {
    try {
      const resp = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Convert this Roman Urdu / Hinglish conversational line into natural, everyday spoken Pakistani Urdu script (اردو) so a Pakistani ${gender} voice reads it with 100% authentic pronunciation and warmth. Transliterate Roman Urdu words faithfully into Urdu script (for example Boss -> باس, ZARA -> زارا, chai -> چائے). Return ONLY the Urdu script line, nothing else:\n\n${text.slice(0, 800)}`,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2400)),
      ]);
      const converted = resp?.text?.trim();
      if (converted && /[\u0600-\u06FF]/.test(converted)) {
        return converted;
      }
    } catch {
      // Fall back cleanly to phonetic replacement / original text
    }
  }

  return matched ? quick : text;
}

async function callGeminiTtsModel(params: {
  ai: GoogleGenAI;
  attempt: GeminiTtsAttemptSpec;
}): Promise<{ audioBase64: string; mimeType: string } | null> {
  const { attempt } = params;
  const response = await withTimeout(
    params.ai.models.generateContent({
      model: attempt.model,
      contents: [{ role: 'user', parts: [attempt.part] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: attempt.speechConfig,
      },
    }),
    attempt.timeoutMs,
    attempt.model
  );

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data && inline.data.length > 100) {
      return ensureWavPlayableBase64(inline.data, inline.mimeType || 'audio/wav');
    }
  }
  return null;
}

async function synthesizeWithGeminiExpressiveTts(params: {
  text: string;
  emotion: FacialEmotion;
  voiceName: string;
  language: 'en' | 'ur';
  ai: GoogleGenAI;
}): Promise<{
  audioBase64: string;
  mimeType: string;
  geminiVoice: string;
  model: GeminiTtsModelName;
} | null> {
  const gender = getVoiceGender(params.voiceName);
  const geminiVoice = resolveGeminiVoiceForSelection(params.voiceName);
  const { textWithBreaths, styleInstruction } = formatExpressiveSpeechPrompt(
    params.text,
    params.emotion,
    gender,
    params.language
  );

  const attempts = buildGeminiTtsAttempts({
    textWithBreaths,
    plainText: params.text,
    styleInstruction,
    geminiVoice,
  });

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const normalized = await callGeminiTtsModel({
        ai: params.ai,
        attempt,
      });
      if (normalized) {
        return { ...normalized, geminiVoice, model: attempt.model };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    console.warn(`[ZARA voice] Gemini TTS attempts exhausted (${geminiVoice}):`, msg);
    throw lastError;
  }
  return null;
}

export async function generateNovaSpeech(params: {
  text: string;
  voiceName: string;
  emotion: FacialEmotion;
  language: 'en' | 'ur';
  ttsEngineMode?: TtsEngineMode;
}): Promise<{
  audioChunks: Array<{ audioBase64: string; mimeType: string }>;
  engine: GeminiTtsModelName | 'openai-tts' | 'edge-neural-v2';
  voice: string;
}> {
  const cleanText = prepareTextForNaturalSpeech(params.text);
  if (!cleanText) {
    return { audioChunks: [], engine: 'edge-neural-v2', voice: params.voiceName || 'ur-PK-UzmaNeural' };
  }

  const ai = hasGoogleAiKey() ? getAiClient() : null;
  const openAiActive = hasOpenAiKey();
  const gender = getVoiceGender(params.voiceName);
  const containsUrdu = /[\u0600-\u06FF]/.test(cleanText);
  const romanUrdu = isRomanUrduText(cleanText);
  const explicitEnglishVoice = (params.voiceName || '').startsWith('en-');
  const shouldSpeakUrdu =
    containsUrdu || romanUrdu || (!explicitEnglishVoice && params.language === 'ur');
  const effectiveLang: 'en' | 'ur' = shouldSpeakUrdu ? 'ur' : 'en';

  const speechText = shouldSpeakUrdu
    ? await transliterateToNaturalUrduForSpeech(cleanText, ai, gender)
    : cleanText;

  const effectiveEngine = resolveEffectiveTtsEngine(
    params.voiceName,
    params.ttsEngineMode || 'auto',
    Boolean(ai),
    openAiActive
  );

  // Pin every sentence chunk to the EXACT same Gemini Studio voice so replies never flip speakers mid-stream.
  if (effectiveEngine === 'gemini-studio' && ai) {
    try {
      const sentenceChunks =
        speechText.length <= 480 ? [speechText] : splitSpeechChunks(speechText, 240);
      const studioChunks: Array<{ audioBase64: string; mimeType: string }> = [];
      let pinnedModel: GeminiTtsModelName = 'gemini-3.8-flash-tts';
      let pinnedVoice: string = resolveGeminiVoiceForSelection(params.voiceName);

      for (const sentence of sentenceChunks.length > 0 ? sentenceChunks : [speechText]) {
        const ttsResult = await synthesizeWithGeminiExpressiveTts({
          text: sentence,
          emotion: params.emotion,
          voiceName: params.voiceName,
          language: effectiveLang,
          ai,
        });
        if (!ttsResult) {
          throw new Error('Empty audio chunk returned by Gemini TTS');
        }
        pinnedModel = ttsResult.model;
        pinnedVoice = ttsResult.geminiVoice;
        studioChunks.push({ audioBase64: ttsResult.audioBase64, mimeType: ttsResult.mimeType });
      }

      if (studioChunks.length > 0) {
        return {
          audioChunks: studioChunks,
          engine: pinnedModel,
          voice: pinnedVoice,
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[ZARA voice] Expressive Gemini TTS fallback:', msg);
    }
  }

  // OpenAI ChatGPT Expressive Voice (when selected directly, or auto-selected when OPENAI_API_KEY is active)
  if ((effectiveEngine === 'openai-tts' || effectiveEngine === 'gemini-studio') && openAiActive) {
    try {
      const openAiResult = await synthesizeOpenAiSpeech({
        text: speechText.slice(0, 4000),
        voiceName: params.voiceName,
        emotion: params.emotion,
        language: effectiveLang,
      });
      return {
        audioChunks: [
          {
            audioBase64: openAiResult.audioBase64,
            mimeType: openAiResult.mimeType,
          },
        ],
        engine: 'openai-tts',
        voice: openAiResult.voice,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[ZARA voice] OpenAI TTS fallback to Edge Neural:', msg);
    }
  }

  const edgeVoice = resolveEdgeVoiceForSelection(
    params.voiceName,
    shouldSpeakUrdu,
    /[\u0600-\u06FF]/.test(speechText)
  );

  let audio: Buffer | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      audio = await synthesizeEdgeSpeech(speechText, 30000, params.emotion, edgeVoice);
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  if (!audio?.length) {
    const message = lastError instanceof Error ? lastError.message : 'Neural voice synthesis failed.';
    console.warn('ZARA neural voice unavailable:', message);
    throw new Error('Neural voice service is temporarily unavailable.');
  }

  return {
    audioChunks: [{ audioBase64: audio.toString('base64'), mimeType: 'audio/mpeg' }],
    engine: 'edge-neural-v2',
    voice: edgeVoice,
  };
}

/**
 * Generates an organic, context-aware best-friend proactive check-in
 * ("bhai kya kar rahe ho, aaj ka din kaisa guzra, ye kyun kar rahe ho?").
 */
export async function generateProactiveFriendCheckInWithAi(params: {
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  recentUserMessages: string[];
  recentCheckIns?: string[];
  language?: 'en' | 'ur' | 'bilingual';
}): Promise<FriendCheckInResult & { source: 'gemini' | 'contextual-local' }> {
  const isMalePersona = isMaleVoice(params.config.tts_voice);
  const nickname = params.config.user_nickname || params.config.user_name || 'Boss';
  const fallback = buildContextualFriendCheckIn({
    nickname,
    memories: params.memories,
    notes: params.notes,
    reminders: params.reminders,
    recentUserMessages: params.recentUserMessages,
    recentCheckIns: params.recentCheckIns,
    isMalePersona,
    language: params.language || params.config.language,
  });

  if (!hasGoogleAiKey()) {
    return { ...fallback, source: 'contextual-local' };
  }

  try {
    const ai = getAiClient();
    const hour = new Date().getHours();
    const avoidList = (params.recentCheckIns || []).slice(-6).join(' | ');
    const prompt = [
      `You are ${params.config.assistant_name}, ${nickname}'s real-life ${isMalePersona ? 'male' : 'female'} best friend.`,
      `User has been quiet for a minute. Start ONE short, genuine, natural friend check-in (max 20 words, 1 sentence) asking naturally what they are up to, how their day went, why they were working on/thinking about a recent topic, or checking their mood—like real friends ask ("Bhai kya kar rahe ho abhi?", "Aaj din kaisa guzra?", "Khair hai aaj ye kis wajah se kar rahe ho?", "Kya soch rahe ho?").`,
      `Language: ${params.config.language === 'en' ? 'Natural casual English' : 'Natural Pakistani Roman Urdu matching recent context'}.`,
      `Grammar gender of speaker: ${isMalePersona ? 'male (raha hoon)' : 'female (rahi hoon)'}.`,
      params.recentUserMessages.length > 0
        ? `Recent user messages: ${params.recentUserMessages.slice(0, 3).join(' / ')}`
        : '',
      params.memories.length > 0
        ? `Known memories: ${params.memories.slice(0, 4).map((m) => m.value).join(' | ')}`
        : '',
      params.reminders.some((r) => !r.is_done)
        ? `Pending reminders: ${params.reminders.filter((r) => !r.is_done).slice(0, 2).map((r) => `${r.title} (${r.remind_at})`).join(', ')}`
        : '',
      `Local hour (0-23): ${hour}.`,
      avoidList ? `Do NOT repeat these recent check-ins: ${avoidList}` : '',
      `Begin with [emotion:curious], [emotion:happy], [emotion:empathetic], or [emotion:calm] followed by the single short friend question.`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
      }),
      6000,
      'gemini-4-hydrogen-checkin'
    );
    const raw = response.text?.trim();
    if (!raw) return { ...fallback, source: 'contextual-local' };

    const { cleanText, emotion } = extractEmotionAndCleanText(raw);
    const sanitized = sanitizeBannedPhrases(cleanText, nickname);
    if (!sanitized || (params.recentCheckIns || []).some((prev) => prev.toLowerCase() === sanitized.toLowerCase())) {
      return { ...fallback, source: 'contextual-local' };
    }

    const mappedEmotion: FriendCheckInResult['emotion'] =
      emotion === 'happy' || emotion === 'empathetic' || emotion === 'calm' ? emotion : 'curious';

    return {
      message: sanitized,
      emotion: mappedEmotion,
      language: params.config.language === 'en' ? 'en' : 'ur',
      topicKey: 'ai_friend_curiosity',
      source: 'gemini',
    };
  } catch {
    return { ...fallback, source: 'contextual-local' };
  }
}

export async function transcribeNovaAudio(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  if (!hasGoogleAiKey() && hasOpenAiKey()) {
    return transcribeWithOpenAi(params);
  }
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: params.audioBase64,
          },
        },
        {
          text: 'Transcribe this spoken audio accurately. Preserve English, Urdu script, or Roman Urdu words naturally.',
        },
      ],
    },
  });
  return (response.text ?? '').trim();
}
