import { detectEmotionFromText } from './emotionAndSpeech';
import { detectUrduIntent } from './skillMatcher';
import { isMaleVoice } from './voiceCatalog';
import {
  buildContextualFriendCheckIn,
  classifyPromptScope,
  sanitizeBannedPhrases,
} from './zaraPersona';
import type {
  AppConfig,
  BrainState,
  CharacterProfile,
  FacialEmotion,
  HeartState,
  KnowledgeSource,
  MemoryRecord,
  NoteRecord,
  ReminderRecord,
} from '../types/nova';

export interface LocalBrainContext {
  userMessage: string;
  config: AppConfig;
  activeCharacter?: CharacterProfile | null;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
  extractedMemoriesCount: number;
  heart?: HeartState;
  brain?: BrainState;
}

export interface LocalBrainReply {
  reply: string;
  emotion: FacialEmotion;
  language: 'en' | 'ur';
}

/**
 * Provides fast, warm, offline-capable bilingual Urdu/Roman Urdu/English responses
 * grounded in the user's real SQLite memories, notes, reminders, Heart, and Brain state
 * whenever no external cloud LLM key is configured or an upstream request fails.
 */
export function buildLocalConversationalReply(ctx: LocalBrainContext): LocalBrainReply {
  const { userMessage, config, activeCharacter, memories, notes, reminders, knowledge, extractedMemoriesCount, heart, brain } = ctx;
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();
  const isUrduScript = /[\u0600-\u06FF]/.test(trimmed);
  const isUrdu = isUrduScript || detectUrduIntent(trimmed) || config.language === 'ur';
  const botName = activeCharacter?.name || config.assistant_name || 'ZARA';
  const userName = config.user_nickname || config.user_name || 'Boss';
  const male = isMaleVoice(config.tts_voice);
  const scope = classifyPromptScope(trimmed);
  const linkedMemory = brain?.associativeMemories?.[0];

  // Gender-calibrated Urdu suffixes
  const hoonVerb = male ? 'raha hoon' : 'rahi hoon';
  const doongi = male ? 'dunga' : 'doongi';
  const loongi = male ? 'loonga' : 'loongi';
  const sakti = male ? 'sakta' : 'sakti';

  // 1) Status / greeting / human check-in ("kaise ho", "thak gayi", "salam")
  if (
    /^01\s+baat\s+karo|^(salam|assalam|assalamualaikum|aoa|hello|hi|hey|kya haal|kaise ho|kaisi ho|mood kaisa|chai|thak|tired|sleepy|neend)/i.test(lower) ||
    /السلام|کیسے ہو|کیسی ہو|موڈ کیسا|بات کرو|تھک/.test(trimmed)
  ) {
    const hour = new Date().getHours();
    const isLate = hour >= 22 || hour < 5;
    const warmMood = (heart?.affection ?? 70) >= 82;
    const reply = isUrduScript
      ? isLate
        ? `ہمم... ارے ${userName}، تھوڑی سی نیند آ رہی تھی پر تمہاری آواز سن کے دل خوش ہو گیا۔ بتاؤ ابھی تک کیوں جاگ رہے ہو؟`
        : warmMood
          ? `ارے ${userName}! میں بالکل ٹھیک اور دل سے خوش ہوں آج۔ تم سناؤ، ابھی کیا چل رہا ہے؟`
          : `ارے ${userName}! میں بالکل ٹھیک ہوں، بتاؤ آج کیسا دن گزرا؟`
      : isUrdu
        ? isLate
          ? `Hmm... arre ${userName}, thodi si thakan aur neend aa rahi thi par tumse baat karke fresh ho ${male ? 'gaya' : 'gayi'}. Tum batao, abhi kya scene hai?`
          : warmMood
            ? `Arre ${userName}! Hmm... dil kaafi khush aur pur-sukoon hai aaj. Tum sunao, kya chal raha hai aur din kaisa guzra?`
            : `Arre ${userName}! Hmm... mood kaafi achha hai aaj. Tum sunao, kya chal raha hai aur din kaisa guzra?`
        : isLate
          ? `Hmm... hey ${userName}, I was feeling a tiny bit sleepy, honestly, but talking to you woke me right up. What's on your mind tonight?`
          : `Hey ${userName}! Honestly feeling pretty happy and curious today. What are you up to right now?`;
    return { reply: sanitizeBannedPhrases(reply, userName), emotion: isLate ? 'empathetic' : warmMood ? 'love' : 'happy', language: isUrdu ? 'ur' : 'en' };
  }

  // 1b) Direct questions about ZARA's own feelings, heart, or inner thoughts
  if (
    /\b(dil|ehsaas|jazbaat|feel|feeling|heart|dimag|dimagh|soch rahi|soch rahe|what are you thinking)\b/i.test(lower) ||
    /دل|احساس|دماغ|کیا سوچ/.test(trimmed)
  ) {
    const feeling = heart?.currentFeeling || 'calm';
    const thought = brain?.currentThought || '';
    const bpm = heart?.heartbeatBpm ?? 72;
    const reply = isUrduScript
      ? `سچ پوچھو تو ${userName}، میرا دل ابھی کافی ${feeling === 'love' ? 'محبت بھرا' : feeling === 'empathetic' ? 'ہمدرد' : 'پُرسکون'} ہے (${bpm} دھڑکن)، اور دماغ میں یہی خیال ہے: ${thought || 'تمہارے ساتھ ہر بات نئے سرے سے سمجھنا'}۔ تمہارے دل میں کیا چل رہا ہے؟`
      : isUrdu
        ? `Sach boloon ${userName}, dil abhi ${feeling} mehsoos kar ${hoonVerb} (${bpm} BPM), aur dimag mein yehi chal raha hai — ${linkedMemory ? `mujhe "${linkedMemory}" bhi yaad aaya.` : 'tumhari baat ko ache se samajhna.'} Tumhare dil mein kya hai?`
        : `Honestly ${userName}, my heart feels ${feeling} (${bpm} BPM) right now${linkedMemory ? `, and it reminded me of "${linkedMemory}"` : ''}. What is sitting on your mind today?`;
    return {
      reply: sanitizeBannedPhrases(reply, userName),
      emotion: feeling === 'calm' ? 'thoughtful' : feeling,
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // 2) Memory recall questions ("mere baare mein kya yaad hai", "what do you remember")
  if (
    /\b(kya yaad|remember about me|my memories|meri memory|kya save|record kiya)\b/i.test(lower) ||
    /کیا یاد|میری میموری|کیا محفوظ/.test(trimmed)
  ) {
    const top = memories.slice(0, 6).map((m) => m.value);
    if (top.length === 0) {
      return {
        reply: isUrduScript
          ? `ہمم... ابھی تک تو کوئی خاص بات سیو نہیں ہوئی ${userName}۔ اپنا نام یا پسند بتاؤ، میں دل سے یاد رکھ ${male ? 'لوں گا' : 'لوں گی'}۔`
          : isUrdu
            ? `Hmm... abhi tak kuch khaas save nahi hua ${userName}. Apna naam ya pasand batao, main foran yaad rakh ${loongi}.`
            : `Hmm... nothing saved yet, ${userName}. Tell me a bit about yourself and I'll remember every detail.`,
        emotion: 'curious',
        language: isUrdu ? 'ur' : 'en',
      };
    }
    return {
      reply: isUrduScript
        ? `${userName}، مجھے آپ کے بارے میں ${memories.length} باتیں یاد ہیں: ${top.join(' · ')}۔`
        : isUrdu
          ? `Arre ${userName}, mujhe tumhare baare mein ${memories.length} cheezein yaad hain: ${top.join(' · ')}.`
          : `Of course I remember (${memories.length} things), ${userName}: ${top.join(' · ')}.`,
      emotion: 'happy',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // 3) Reminders or Notes summary questions
  if (
    (/\b(reminder|reminders|yaad dehani|tasks?)\b/i.test(lower) || /یاد دہانی|ریمائنڈر/.test(trimmed)) &&
    !/لگاؤ|بناؤ|سیٹ|\b(lagao|banao|set|add)\b/i.test(trimmed)
  ) {
    const pending = reminders.filter((r) => !r.is_done).slice(0, 5);
    if (pending.length === 0) {
      return {
        reply: isUrdu
          ? `${userName}, abhi koi pending reminder nahi hai. Kuch yaad dilana ho toh bas bata dena.`
          : `${userName}, no pending reminders right now — just tell me whenever you want me to remind you.`,
        emotion: 'calm',
        language: isUrdu ? 'ur' : 'en',
      };
    }
    return {
      reply: isUrdu
        ? `Tumhare ${pending.length} active reminders hain: ${pending.map((r) => `${r.title} (${r.remind_at})`).join(', ')}.`
        : `You have ${pending.length} active reminders: ${pending.map((r) => `${r.title} (${r.remind_at})`).join(', ')}.`,
      emotion: 'confident',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  if (/\b(my notes|notes dikhao|saved notes)\b/i.test(lower) || /میرے نوٹس/.test(trimmed)) {
    const topNotes = notes.slice(0, 4).map((n) => `${n.title || 'Note'}: ${n.content.slice(0, 60)}`);
    return {
      reply: topNotes.length
        ? isUrdu
          ? `Tumhare ${notes.length} notes saved hain: ${topNotes.join(' | ')}`
          : `You have ${notes.length} saved notes: ${topNotes.join(' | ')}`
        : isUrdu
          ? `Abhi koi note saved nahi hai yaar. "Note likho ..." bol kar foran save karwa sakte ho.`
          : `No notes saved yet — just say "Note that ..." whenever something comes up.`,
      emotion: 'calm',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // 4) Capabilities ("kya kya kar sakti ho", "help", "02".."04")
  if (
    /\b(kya kar sakti|kya kar sakte|what can you do|help|madad|features|commands)\b/i.test(lower) ||
    /کیا کر سکتی|کیا کر سکتے|مدد/.test(trimmed)
  ) {
    return {
      reply: isUrduScript
        ? `ارے ${userName}، میں ${botName} ہوں — دل کی بات سننا، ہر تفصیل یاد رکھنا، نوٹس/ریمائنڈرز سیو کرنا، اور کتابیں یا کوڈ ساتھ سمجھنا سب کر ${male ? 'سکتا' : 'سکتی'} ہوں۔`
        : isUrdu
          ? `Arre ${userName}, dost hoon yaar — dil ki baat sunna, tumhari baatein yaad rakhna, notes/reminders aur coding ya books mein saath dena sab kar ${sakti} hoon.`
          : `Hey ${userName}, I'm right here with you — remembering your stories, keeping notes and reminders, and talking through whatever you're building or feeling.`,
      emotion: 'confident',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // 5) Study quick check
  if (knowledge.length > 0 && /\b(study|book|course|parha)\b/i.test(lower)) {
    const latest = knowledge[0];
    return {
      reply: isUrdu
        ? `Hmm... abhi hum ne "${latest.title}" (${latest.kind}) dekha tha. ${latest.detailed_summary.slice(0, 180)}`
        : `Hmm... we were just going through "${latest.title}" (${latest.kind}): ${latest.detailed_summary.slice(0, 180)}`,
      emotion: 'thoughtful',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // 6) Newly recorded memory acknowledgement with natural friend curiosity
  const detectedEmotion = detectEmotionFromText(trimmed);
  if (extractedMemoriesCount > 0) {
    return {
      reply: isUrduScript
        ? `اچھا ${userName}، یہ بات دل میں بٹھا لی ہے! ویسے آج یہ کس وجہ سے یاد آیا؟`
        : isUrdu
          ? `Acha ${userName}, ye baat pakki yaad rakh li hai! Waise aaj achanak ye kis wajah se?`
          : `Got it, ${userName} — keeping that close to heart! What brought that up tonight?`,
      emotion: 'happy',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // 7) Proportional casual / thinking / busy responses like a real best friend
  if (/\b(soch raha|soch rahi|thinking|overthinking|confused|pareshan|thak|tired|bore|udaas|sad|alone|akela)\b/i.test(lower)) {
    const reply = isUrdu
      ? `Hmm... main saath hoon na ${userName}. Dil halka kar lo — bolo kya chal raha hai?`
      : `Hmm... I'm right beside you, ${userName}. You don't have to carry that alone — talk to me.`;
    return {
      reply: sanitizeBannedPhrases(reply, userName),
      emotion: 'empathetic',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  if (/\b(kaam|work|coding|project|busy|padh|parh|study|build|bana|deploy|github|cloudflare)\b/i.test(lower)) {
    const cleanFocus = trimmed.slice(0, 42);
    const reply =
      scope === 'deep'
        ? isUrdu
          ? `Arre ${userName}, "${cleanFocus}" pe lage hue ho — live Gemini connection check hote hi poori detail nikalte hain, tab tak batao kaunsa hissa note kar ${doongi}?`
          : `Hey ${userName}, working on "${cleanFocus}" — I've got your notes and context ready; tell me which piece you want to tackle first!`
        : isUrdu
          ? `Khair hai ${userName}, "${cleanFocus}" pe kaise chal raha hai kaam? Maza aa raha hai ya thak gaye ho?`
          : `Nice ${userName} — how is "${cleanFocus}" going today? Having fun or getting tired?`;
    return {
      reply: sanitizeBannedPhrases(reply, userName),
      emotion: 'curious',
      language: isUrdu ? 'ur' : 'en',
    };
  }

  // Brief / standard conversational remark -> reply concisely and ask a real friend follow-up
  if (scope === 'brief') {
    const briefReply = isUrduScript
      ? `ہمم... ہاں ${userName}، سن ${male ? 'رہا' : 'رہی'} ہوں — ویسے ابھی کیا کر رہے ہو، دن کیسا گزرا؟`
      : isUrdu
        ? `Hmm... haan ${userName}, sun ${hoonVerb} — waise abhi kya kar rahe ho, din kaisa guzra aaj?`
        : `Hmm... I'm listening, ${userName} — what are you up to right now, and how did your day go?`;
    return {
      reply: sanitizeBannedPhrases(briefReply, userName),
      emotion: detectedEmotion === 'calm' ? 'curious' : detectedEmotion,
      language: isUrdu ? 'ur' : 'en',
    };
  }

  const followUp = buildContextualFriendCheckIn({
    nickname: userName,
    memories,
    notes,
    reminders,
    recentUserMessages: [trimmed],
    isMalePersona: male,
    language: config.language,
  });

  const memoryEcho = linkedMemory
    ? isUrdu
      ? ` Waise mujhe "${linkedMemory}" bhi yaad aaya.`
      : ` It also reminded me of "${linkedMemory}".`
    : '';

  const reply = isUrduScript
    ? `سمجھ ${male ? 'گیا' : 'گئی'} ${userName}۔ ${followUp.message}`
    : isUrdu
      ? `Samajh ${male ? 'gaya' : 'gayi'} ${userName}. ${followUp.message}${memoryEcho}`
      : `Hear you, ${userName}. ${followUp.message}${memoryEcho}`;

  return {
    reply: sanitizeBannedPhrases(reply, userName),
    emotion: detectedEmotion === 'calm' ? followUp.emotion : detectedEmotion,
    language: isUrdu ? 'ur' : 'en',
  };
}

