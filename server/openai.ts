import {
  extractEmotionAndCleanText,
  formatExpressiveSpeechPrompt,
} from '../src/lib/emotionAndSpeech';
import { getVoiceGender, resolveOpenAiVoiceForSelection, type OpenAiTtsVoice } from '../src/lib/voiceCatalog';
import { sanitizeBannedPhrases, stripAndExtractReflectiveBlocks } from '../src/lib/zaraPersona';
import type { ChatMessage, FacialEmotion, MemoryRecord } from '../src/types/nova';

export function hasOpenAiKey(): boolean {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(
    apiKey && !/^(MY_OPENAI_API_KEY|your_api_key_here|placeholder|sk-placeholder)$/i.test(apiKey)
  );
}

function getOpenAiKeyOrThrow(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!hasOpenAiKey() || !apiKey) {
    throw new Error('OpenAI API key is not configured in the server environment.');
  }
  return apiKey;
}

export function buildOpenAiTtsInstructions(params: {
  emotion: FacialEmotion;
  voiceName: string;
  language: 'en' | 'ur';
}): string {
  const gender = getVoiceGender(params.voiceName);
  const { styleInstruction } = formatExpressiveSpeechPrompt(
    '',
    params.emotion,
    gender,
    params.language
  );
  return styleInstruction;
}

export async function synthesizeOpenAiSpeech(params: {
  text: string;
  voiceName: string;
  emotion: FacialEmotion;
  language: 'en' | 'ur';
}): Promise<{ audioBase64: string; mimeType: string; voice: OpenAiTtsVoice; model: string }> {
  const apiKey = getOpenAiKeyOrThrow();
  const cleanText = params.text.trim();
  if (!cleanText) {
    throw new Error('Speech text is empty.');
  }
  if (cleanText.length > 4096) {
    throw new Error('Speech text exceeds OpenAI TTS 4096-character limit.');
  }

  const openAiVoice = resolveOpenAiVoiceForSelection(params.voiceName);
  const model = process.env.OPENAI_TTS_MODEL?.trim() || 'gpt-4o-mini-tts';
  const instructions = buildOpenAiTtsInstructions({
    emotion: params.emotion,
    voiceName: params.voiceName,
    language: params.language,
  });

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice: openAiVoice,
      input: cleanText,
      instructions,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI speech error (${response.status}): ${detail.slice(0, 320)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) {
    throw new Error('OpenAI speech returned empty audio.');
  }

  return {
    audioBase64: buffer.toString('base64'),
    mimeType: 'audio/mpeg',
    voice: openAiVoice,
    model,
  };
}

export async function generateOpenAiReply(params: {
  userMessage: string;
  history: ChatMessage[];
  systemInstruction: string;
  useDeepThinking: boolean;
  nickname: string;
}): Promise<{
  text: string;
  emotion: FacialEmotion;
  modelUsed: string;
  thinkingUsed: boolean;
  aiMemories: Array<{ category: MemoryRecord['category']; value: string }>;
  aiReflections: string[];
}> {
  const apiKey = getOpenAiKeyOrThrow();
  const model =
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    (params.useDeepThinking ? 'gpt-4o' : 'gpt-4o-mini');

  const messages = [
    { role: 'system' as const, content: params.systemInstruction },
    ...params.history.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
    { role: 'user' as const, content: params.userMessage },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1800,
      temperature: 0.72,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI request failed (HTTP ${response.status})`);
  }

  const rawText = data.choices?.[0]?.message?.content?.trim() || '';
  if (!rawText) {
    throw new Error('OpenAI returned an empty response.');
  }

  const { text: withoutMem, aiMemories, aiReflections } = stripAndExtractReflectiveBlocks(rawText);
  const { cleanText, emotion } = extractEmotionAndCleanText(withoutMem);

  return {
    text: sanitizeBannedPhrases(cleanText, params.nickname),
    emotion,
    modelUsed: model,
    thinkingUsed: params.useDeepThinking,
    aiMemories,
    aiReflections,
  };
}

export async function transcribeWithOpenAi(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const apiKey = getOpenAiKeyOrThrow();
  const cleanBase64 = params.audioBase64.replace(/^data:[^;]+;base64,/i, '');
  const bytes = Buffer.from(cleanBase64, 'base64');
  const ext = /mp4|m4a/i.test(params.mimeType)
    ? 'm4a'
    : /ogg/i.test(params.mimeType)
      ? 'ogg'
      : /wav/i.test(params.mimeType)
        ? 'wav'
        : 'webm';

  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: params.mimeType || 'audio/webm' }),
    `recording.${ext}`
  );
  form.append('model', 'gpt-4o-mini-transcribe');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(25000),
  });

  const data = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI transcription failed (HTTP ${response.status})`);
  }
  return (data.text || '').trim();
}
