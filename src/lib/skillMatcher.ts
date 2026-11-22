import type { CameraCommandMode, SidebarPage, SkillConfig, SkillExecutionResult } from '../types/nova';
import { resolveCharacterSwitchCommand, resolveMoodSwitchCommand } from './characterEngine';
import { detectUsbTransferIntent } from './usbTransfer';

export const CAMERA_MODE_OPTIONS: Array<{
  id: CameraCommandMode;
  label: string;
  description: string;
}> = [
  {
    id: 'look_now',
    label: 'Look Now (Snapshot Vision)',
    description: 'Turns camera on if needed, captures a live frame, and describes what ZARA sees.',
  },
  {
    id: 'camera_on',
    label: 'Camera Preview On',
    description: 'Opens the live webcam preview card without running an immediate snapshot prompt.',
  },
  {
    id: 'camera_off',
    label: 'Camera Preview Off',
    description: 'Turns off live webcam capture and stops Auto-Watch mode.',
  },
  {
    id: 'auto_watch_on',
    label: 'Auto-Watch Gesture On',
    description: 'Enables continuous webcam gesture/wave detection for hands-free reaction.',
  },
  {
    id: 'auto_watch_off',
    label: 'Auto-Watch Gesture Off',
    description: 'Disables continuous gesture monitoring while keeping manual Look Now available.',
  },
];

const CAMERA_MODE_SET = new Set<string>(CAMERA_MODE_OPTIONS.map((m) => m.id));

export function isValidCameraMode(value: string): value is CameraCommandMode {
  return CAMERA_MODE_SET.has(value);
}

export function getCameraModeLabel(mode: string): string {
  return CAMERA_MODE_OPTIONS.find((m) => m.id === mode)?.label ?? 'Look Now (Snapshot Vision)';
}

export function isValidSkillHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Safely evaluates basic arithmetic expressions (+, -, *, /, %, parentheses)
 * without using eval or Function.
 */
export function evaluateSafeArithmetic(expr: string): number | null {
  const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').trim();
  if (!/^[0-9+\-*/().%\s]+$/.test(cleaned)) {
    return null;
  }

  let pos = 0;
  const skipWs = () => {
    while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos++;
  };

  const parseExpression = (): number => {
    let val = parseTerm();
    while (true) {
      skipWs();
      const ch = cleaned[pos];
      if (ch === '+') {
        pos++;
        val += parseTerm();
      } else if (ch === '-') {
        pos++;
        val -= parseTerm();
      } else {
        break;
      }
    }
    return val;
  };

  const parseTerm = (): number => {
    let val = parseFactor();
    while (true) {
      skipWs();
      const ch = cleaned[pos];
      if (ch === '*') {
        pos++;
        val *= parseFactor();
      } else if (ch === '/') {
        pos++;
        const denom = parseFactor();
        if (denom === 0) throw new Error('Division by zero');
        val /= denom;
      } else if (ch === '%') {
        pos++;
        const mod = parseFactor();
        if (mod === 0) throw new Error('Modulo by zero');
        val %= mod;
      } else {
        break;
      }
    }
    return val;
  };

  const parseFactor = (): number => {
    skipWs();
    if (cleaned[pos] === '+') {
      pos++;
      return parseFactor();
    }
    if (cleaned[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    if (cleaned[pos] === '(') {
      pos++;
      const val = parseExpression();
      skipWs();
      if (cleaned[pos] !== ')') {
        throw new Error('Mismatched parentheses');
      }
      pos++;
      return val;
    }

    const start = pos;
    let hasDot = false;
    while (pos < cleaned.length) {
      const ch = cleaned[pos];
      if (ch >= '0' && ch <= '9') {
        pos++;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        pos++;
      } else {
        break;
      }
    }
    if (start === pos) {
      throw new Error('Expected number');
    }
    const num = Number(cleaned.slice(start, pos));
    if (!Number.isFinite(num)) {
      throw new Error('Invalid number');
    }
    return num;
  };

  try {
    const result = parseExpression();
    skipWs();
    if (pos !== cleaned.length || !Number.isFinite(result)) {
      return null;
    }
    return Math.round(result * 1_000_000) / 1_000_000;
  } catch {
    return null;
  }
}

export function detectUrduIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[\u0600-\u06FF]/.test(text)) return true;
  const romanUrduTokens = [
    'kholo',
    'batao',
    'waqt',
    'kya',
    'mera',
    'meri',
    'mujhe',
    'aaj',
    'yaad',
    'likho',
    'band',
    'chalu',
    'karo',
    'karein',
    'kaise',
    'assalam',
    'shukriya',
    'madad',
    'tareekh',
    'samjhao',
    'dekho',
    'pyaar',
    'udaas',
    'khush',
    'kitaab',
    'salam',
    'bhai',
    'haan',
    'theek',
    'kaisa',
    'hoon',
    'hain',
    'hai',
    'yaar',
    'raha',
    'rahi',
    'chai',
    'baat',
  ];
  return romanUrduTokens.some((tok) => new RegExp(`\\b${tok}\\b`, 'i').test(lower));
}

const KNOWN_APPS: Record<string, { label: string; url: string }> = {
  chrome: { label: 'Google Chrome', url: 'https://www.google.com' },
  browser: { label: 'Web Browser', url: 'https://www.google.com' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com' },
  github: { label: 'GitHub', url: 'https://github.com' },
  gmail: { label: 'Gmail', url: 'https://mail.google.com' },
  calendar: { label: 'Google Calendar', url: 'https://calendar.google.com' },
  maps: { label: 'Google Maps', url: 'https://maps.google.com' },
  vscode: { label: 'VS Code Web', url: 'https://vscode.dev' },
  notion: { label: 'Notion', url: 'https://www.notion.so' },
};

/**
 * Matches user utterance against enabled skills (custom skills first, then built-ins).
 */
export function matchSkillCommand(
  rawInput: string,
  skills: SkillConfig[],
  now: Date = new Date(),
  characters: Array<{ slug: string; name: string }> = [
    { slug: 'nova', name: 'NOVA' },
    { slug: 'zara', name: 'ZARA' },
    { slug: 'ayesha', name: 'AYESHA' },
    { slug: 'sara', name: 'SARA' },
  ]
): SkillExecutionResult {
  const input = rawInput.trim();
  if (!input) return { matched: false };

  const lower = input.toLowerCase();
  const isUrdu = detectUrduIntent(input);

  // 1. Custom Command List entries take priority when enabled (longest matching phrase wins)
  const customCandidates: Array<{ skill: SkillConfig; phraseLen: number; exact: boolean }> = [];
  for (const skill of skills) {
    if (!skill.is_enabled || !skill.is_custom || skill.action_type === 'ai') continue;
    for (const phrase of skill.trigger_phrases) {
      const p = phrase.trim().toLowerCase();
      if (!p) continue;
      if (lower === p || lower.includes(p)) {
        customCandidates.push({
          skill,
          phraseLen: p.length,
          exact: lower === p,
        });
      }
    }
  }
  customCandidates.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return b.phraseLen - a.phraseLen;
  });

  const bestCustom = customCandidates[0]?.skill;
  if (bestCustom) {
    if (bestCustom.action_type === 'url' || bestCustom.action_type === 'launch') {
      return {
        matched: true,
        skillName: bestCustom.skill_name,
        actionType: bestCustom.action_type,
        language: isUrdu ? 'ur' : 'en',
        emotion: 'happy',
        responseText: isUrdu
          ? `${bestCustom.display_name} khol diya hai Boss!`
          : `Opening ${bestCustom.display_name} now.`,
        sideEffect: { type: 'open_url', url: bestCustom.action_value },
      };
    }
    if (bestCustom.action_type === 'vision') {
      const cameraMode: CameraCommandMode = isValidCameraMode(bestCustom.action_value)
        ? bestCustom.action_value
        : 'look_now';
      const cameraReplies: Record<CameraCommandMode, { ur: string; en: string; emotion: 'curious' | 'calm' | 'happy' }> = {
        look_now: {
          ur: `${bestCustom.display_name}: abhi camera se dekh rahi hoon Boss!`,
          en: `${bestCustom.display_name}: scanning your camera view now.`,
          emotion: 'curious',
        },
        camera_on: {
          ur: `${bestCustom.display_name}: camera preview on kar diya hai.`,
          en: `${bestCustom.display_name}: live camera preview is now on.`,
          emotion: 'happy',
        },
        camera_off: {
          ur: `${bestCustom.display_name}: camera band kar diya hai.`,
          en: `${bestCustom.display_name}: camera preview turned off.`,
          emotion: 'calm',
        },
        auto_watch_on: {
          ur: `${bestCustom.display_name}: Auto-Watch gesture mode on ho gaya hai!`,
          en: `${bestCustom.display_name}: Auto-Watch gesture monitoring is now active.`,
          emotion: 'curious',
        },
        auto_watch_off: {
          ur: `${bestCustom.display_name}: Auto-Watch gesture mode band kar diya hai.`,
          en: `${bestCustom.display_name}: Auto-Watch gesture monitoring disabled.`,
          emotion: 'calm',
        },
      };
      const entry = cameraReplies[cameraMode];
      return {
        matched: true,
        skillName: bestCustom.skill_name,
        actionType: 'vision',
        language: isUrdu ? 'ur' : 'en',
        emotion: entry.emotion,
        responseText: isUrdu ? entry.ur : entry.en,
        sideEffect: {
          type: 'trigger_vision',
          cameraMode,
        },
      };
    }
    if (bestCustom.action_type === 'note') {
      return {
        matched: true,
        skillName: bestCustom.skill_name,
        actionType: 'note',
        language: isUrdu ? 'ur' : 'en',
        emotion: 'happy',
        responseText: isUrdu
          ? `"${bestCustom.display_name}" ke zariye note save kar liya hai Boss.`
          : `Saved note via "${bestCustom.display_name}".`,
        sideEffect: {
          type: 'create_note',
          noteTitle: bestCustom.display_name,
          noteContent: bestCustom.action_value || input,
        },
      };
    }
    return {
      matched: true,
      skillName: bestCustom.skill_name,
      actionType: bestCustom.action_type,
      language: isUrdu ? 'ur' : 'en',
      emotion: 'happy',
      responseText: bestCustom.action_value || `Executed ${bestCustom.display_name}.`,
      sideEffect: {
        type: 'system_action',
        systemCommand: bestCustom.action_value,
      },
    };
  }

  // 1.5. USB Memory Transfer & Auto-Sync Commands (Urdu script, Roman Urdu, English)
  const usbIntent = detectUsbTransferIntent(input);
  if (usbIntent) {
    const hasUrduScript = /[\u0600-\u06FF]/.test(input);
    if (usbIntent.action === 'enable_auto') {
      return {
        matched: true,
        skillName: 'usb_memory_sync',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        emotion: 'happy',
        responseText: hasUrduScript
          ? 'آٹو یو ایس بی میموری سنک آن کر دیا گیا ہے۔ اب آپ کی ہر نئی یادداشت خود بخود یو ایس بی میں محفوظ ہوتی رہے گی!'
          : isUrdu
            ? 'Auto-USB memory transfer on kar diya gaya hai! Ab har nayi memory khud bakhud USB mein transfer hoti rahegi.'
            : 'Auto-USB memory sync enabled. Newly recorded memories will automatically back up to your USB drive.',
        sideEffect: {
          type: 'toggle_auto_usb',
          autoUsbEnabled: true,
          driveHint: usbIntent.driveHint,
        },
      };
    }
    if (usbIntent.action === 'disable_auto') {
      return {
        matched: true,
        skillName: 'usb_memory_sync',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        emotion: 'calm',
        responseText: hasUrduScript
          ? 'آٹو یو ایس بی ٹرانسفر بند کر دیا گیا ہے۔ جب آپ کہیں گی تب ہی مینوئل ٹرانسفر ہو گا۔'
          : isUrdu
            ? 'Auto-USB transfer band kar diya gaya hai. Jab aap bolein gi tab manual transfer hoga.'
            : 'Auto-USB memory sync disabled. You can still transfer manually anytime.',
        sideEffect: {
          type: 'toggle_auto_usb',
          autoUsbEnabled: false,
        },
      };
    }
    if (usbIntent.action === 'check_status') {
      return {
        matched: true,
        skillName: 'usb_memory_sync',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        emotion: 'curious',
        responseText: hasUrduScript
          ? 'میں ابھی USB ڈرائیو چیک کر رہی ہوں۔'
          : isUrdu
            ? 'Abhi connected USB drive check kar rahi hoon.'
            : 'Checking connected USB storage drives now.',
        sideEffect: {
          type: 'check_usb',
          driveHint: usbIntent.driveHint,
        },
      };
    }
    return {
      matched: true,
      skillName: 'usb_memory_sync',
      actionType: 'system',
      language: isUrdu ? 'ur' : 'en',
      emotion: 'happy',
      responseText: hasUrduScript
        ? 'جی، میں آپ کی تمام ریکارڈ شدہ میموری ابھی یو ایس بی میں ٹرانسفر کر رہی ہوں۔'
        : isUrdu
          ? 'Ji, aap ki tamam recorded memory abhi USB mein transfer kar rahi hoon.'
          : 'Transferring your full recorded memory vault to USB now.',
      sideEffect: {
        type: 'transfer_usb',
        driveHint: usbIntent.driveHint,
      },
    };
  }

  // 1.6. UI Navigation, New Session & Memory/Note Listing Commands
  const navTargets: Array<{ page: SidebarPage; pattern: RegExp; labelUr: string; labelEn: string }> = [
    { page: 'memory', pattern: /^(?:open|show|go to)\s+memor(?:y|ies)$|^(?:memory|memories)\s+(?:kholo|dikhao|open(?:\s+karo)?)$|^(?:میموری)\s*(?:کھولو|دکھاؤ)$/i, labelUr: 'میموری صفحہ کھول دیا گیا ہے۔', labelEn: 'Opened the Memory vault page.' },
    { page: 'skills', pattern: /^(?:open|show|go to)\s+skills?$|^(?:skills?)\s+(?:kholo|dikhao|open(?:\s+karo)?)$|^(?:اسکلز|مہارتیں)\s*(?:کھولو|دکھاؤ)$/i, labelUr: 'اسکلز صفحہ کھول دیا گیا ہے۔', labelEn: 'Opened the Skills page.' },
    { page: 'character', pattern: /^(?:open|show|go to)\s+character$|^(?:character)\s+(?:kholo|dikhao|open(?:\s+karo)?)$|^(?:کریکٹر)\s*(?:کھولو|دکھاؤ)$/i, labelUr: 'کریکٹر اسٹوڈیو کھول دیا گیا ہے۔', labelEn: 'Opened the Character Studio.' },
    { page: 'recent', pattern: /^(?:open|show|go to)\s+(?:recent|history)$|^(?:recent|history)\s+(?:kholo|dikhao|open(?:\s+karo)?)$|^(?:ریسنٹ|ہسٹری)\s*(?:کھولو|دکھاؤ)$/i, labelUr: 'حالیہ گفتگو کا صفحہ کھول دیا گیا ہے۔', labelEn: 'Opened Recent conversations.' },
    { page: 'settings', pattern: /^(?:open|show|go to)\s+settings?$|^(?:settings?)\s+(?:kholo|dikhao|open(?:\s+karo)?)$|^(?:سیٹنگز)\s*(?:کھولو|دکھاؤ)$/i, labelUr: 'سیٹنگز کھول دی گئی ہیں۔', labelEn: 'Opened Settings.' },
    { page: 'home', pattern: /^(?:open|go to)\s+home$|^(?:home)\s+(?:kholo|jao)$|^(?:ہوم)\s*(?:کھولو|جاؤ)$/i, labelUr: 'ہوم اسکرین پر آ گئے ہیں۔', labelEn: 'Returned to Home.' },
  ];
  for (const nav of navTargets) {
    if (nav.pattern.test(input)) {
      const hasUrduScript = /[\u0600-\u06FF]/.test(input);
      return {
        matched: true,
        skillName: 'ui_navigation',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        emotion: 'happy',
        responseText: hasUrduScript || isUrdu ? nav.labelUr : nav.labelEn,
        sideEffect: { type: 'navigate_page', navigatePage: nav.page },
      };
    }
  }

  if (
    /^(?:new\s+chat|start\s+new\s+chat|fresh\s+chat|naya\s+chat|nayi\s+baat|نئی چیٹ|نیا چیٹ)$/i.test(input)
  ) {
    return {
      matched: true,
      skillName: 'new_session',
      actionType: 'system',
      language: isUrdu ? 'ur' : 'en',
      emotion: 'happy',
      responseText: isUrdu ? 'نیا چیٹ سیشن شروع ہو گیا ہے۔' : 'Started a fresh chat session.',
      sideEffect: { type: 'new_session' },
    };
  }

  if (
    /^(?:show|list|read)\s+(?:my\s+)?memor(?:y|ies)$|^(?:meri\s+)?memor(?:y|ies)\s+(?:batao|sunao)$|^(?:میری\s+)?(?:میموری|یادداشتیں)\s*(?:بتاؤ|سناؤ)$/i.test(
      input
    )
  ) {
    return {
      matched: true,
      skillName: 'memory_recall',
      actionType: 'system',
      language: isUrdu ? 'ur' : 'en',
      emotion: 'happy',
      responseText: isUrdu ? 'آپ کی محفوظ یادداشتیں نکال رہی ہوں۔' : 'Reading your recorded memories.',
      sideEffect: { type: 'list_memories' },
    };
  }

  const isEnabled = (name: string) => {
    const found = skills.find((s) => s.skill_name === name);
    return found ? found.is_enabled : true;
  };

  // 2. Mood Switcher Skill (Happy / Love / Sad / Calm / Surprised)
  if (isEnabled('mood_switcher')) {
    const moodSwitch = resolveMoodSwitchCommand(input);
    if (moodSwitch) {
      const moodReplies: Record<string, { ur: string; en: string; emotion: 'happy' | 'love' | 'sad' | 'calm' | 'surprised' }> = {
        love: {
          ur: 'لو موڈ آن ہو گیا ہے۔ اب میں دل سے، پیار اور محبت بھرے انداز میں آپ کے ساتھ بات کروں گی۔',
          en: 'Love Mode activated. I am right here with warmth and heartfelt care.',
          emotion: 'love',
        },
        sad: {
          ur: 'سیڈ موڈ آن ہے۔ کوئی بات نہیں، میں آپ کی بات سکون اور ہمدردی سے سن رہی ہوں۔',
          en: 'Sad Mode activated. Take your time — I am listening gently.',
          emotion: 'sad',
        },
        happy: {
          ur: 'ہیپی موڈ آن ہو گیا ہے! آج ہم مل کر زبردست کام کریں گے۔',
          en: 'Happy Mode activated! Ready to bring great energy to everything we build.',
          emotion: 'happy',
        },
        surprised: {
          ur: 'حیران موڈ آن ہے! بتائیے آج کیا نیا کمال دیکھنا چاہتے ہیں؟',
          en: 'Surprised Mode activated! Ready for something extraordinary.',
          emotion: 'surprised',
        },
        calm: {
          ur: 'پرسکون موڈ آن ہے۔',
          en: 'Calm Mode activated.',
          emotion: 'calm',
        },
        auto: {
          ur: 'آٹو ایموشن موڈ آن ہے — اب میں گفتگو کے مطابق اپنے تاثرات خود بدلوں گی۔',
          en: 'Auto Emotion Mode activated — I will adapt expressions naturally.',
          emotion: 'calm',
        },
      };
      const entry = moodReplies[moodSwitch] || moodReplies.calm;
      return {
        matched: true,
        skillName: 'mood_switcher',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        emotion: entry.emotion,
        responseText: isUrdu ? entry.ur : entry.en,
        sideEffect: {
          type: 'switch_mood',
          mood: moodSwitch,
        },
      };
    }
  }

  // 3. Character Switcher Skill
  if (isEnabled('character_switcher')) {
    const charMatch = resolveCharacterSwitchCommand(input, characters);
    if (charMatch) {
      return {
        matched: true,
        skillName: 'character_switcher',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        emotion: 'happy',
        responseText: isUrdu
          ? `${charMatch.name} اب ایکٹو ہے — چلو نئے انداز میں بات کرتے ہیں۔`
          : `Switched active character to ${charMatch.name}. What's up?`,
        sideEffect: {
          type: 'switch_character',
          characterSlug: charMatch.slug,
        },
      };
    }
  }

  // 4. Camera Vision Awareness Skill
  if (
    isEnabled('vision_awareness') &&
    (/\b(look at me|see me|what am i holding|check camera|inspect camera|watch my gesture)\b/i.test(lower) ||
      /\b(mujhe dekho|camera dekho|mera ishara dekho|tasveer dekho)\b/i.test(lower) ||
      /(مجھے دیکھو|کیمرہ دیکھو|میرا اشارہ دیکھو)/.test(input))
  ) {
    return {
      matched: true,
      skillName: 'vision_awareness',
      actionType: 'vision',
      language: isUrdu ? 'ur' : 'en',
      emotion: 'curious',
      responseText: isUrdu
        ? 'جی، میں ابھی آپ کے کیمرے سے آپ کو اور آپ کے اشارے کو دیکھ رہی ہوں۔'
        : 'Scanning your camera feed now to understand what you are showing me.',
      sideEffect: {
        type: 'trigger_vision',
      },
    };
  }

  // 5. Self-Development Trigger Skill
  if (
    isEnabled('self_evolve') &&
    (/\b(develop yourself|self develop|evolve yourself|upgrade your character)\b/i.test(lower) ||
      /\b(khud ko develop|khud ko upgrade|apna character barhao)\b/i.test(lower) ||
      /(خود کو ڈویلپ|خود کو اپگریڈ)/.test(input))
  ) {
    return {
      matched: true,
      skillName: 'self_evolve',
      actionType: 'evolve',
      language: isUrdu ? 'ur' : 'en',
      emotion: 'confident',
      responseText: isUrdu
        ? 'بہترین! میں آپ کی تمام گفتگو اور یادداشتوں کا جائزہ لے کر خود کو مزید بہتر اور ذہین بنا رہی ہوں۔'
        : 'Analyzing our conversations and memories to evolve my traits and skills now.',
      sideEffect: {
        type: 'trigger_evolve',
      },
    };
  }

  // 6. Study / Book / Software / Course Reader Intent (when user asks to open Study Lab without body text)
  if (
    isEnabled('study_mentor') &&
    input.length < 110 &&
    (/\b(open study|study lab|read a book|read a course|read software)\b/i.test(lower) ||
      /^(?:yeh |ye )?(?:book|kitaab|course|software) read (?:karo|kar lo)$/i.test(lower) ||
      /(اسٹڈی لیب کھولو|کتاب پڑھو|کورس پڑھو)/.test(input))
  ) {
    return {
      matched: true,
      skillName: 'study_mentor',
      actionType: 'study',
      language: isUrdu ? 'ur' : 'en',
      emotion: 'curious',
      responseText: isUrdu
        ? 'اسٹڈی اینڈ کورس لیب کھل گئی ہے۔ آپ اپنی کتاب، سافٹ ویئر یا کورس کی فائل اپلوڈ کریں یا ٹیکسٹ پیسٹ کریں، میں تفصیل سے سمجھا کر آپ کا پلان بنا دوں گی۔'
        : 'Study & Code Lab is open. Upload or paste your book, software docs, or course syllabus and I will break it down step by step.',
      sideEffect: {
        type: 'open_study',
        studyTopic: input,
      },
    };
  }

  // 7. Time & Date skill
  if (
    isEnabled('time_date') &&
    (/\b(what time|current time|time is it|tell me the time|what'?s the time)\b/i.test(lower) ||
      /\b(waqt|time kya|kya time|aaj ki tareekh|what date|today'?s date)\b/i.test(lower) ||
      /(وقت|تاریخ)/.test(input))
  ) {
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const hasUrduScript = /[\u0600-\u06FF]/.test(input);
    return {
      matched: true,
      skillName: 'time_date',
      actionType: 'system',
      language: isUrdu ? 'ur' : 'en',
      responseText: hasUrduScript
        ? `اس وقت ${timeStr} بج رہے ہیں، اور آج ${dateStr} ہے۔`
        : isUrdu
          ? `Abhi waqt ${timeStr} hai, aur aaj ${dateStr} hai.`
          : `It is currently ${timeStr} on ${dateStr}.`,
      sideEffect: { type: 'none' },
    };
  }

  // 8. Calculator skill
  if (isEnabled('calculator')) {
    const calcMatch = input.match(
      /(?:^|\b)(?:calc(?:ulate)?|compute|what is|kitna hota hai|hisaab|حساب)\s+([0-9+\-*/().%\s×÷,]+)(?:\?|$)/i
    );
    const candidate = calcMatch ? calcMatch[1].replace(/\?+$/, '').trim() : input;
    if (/[+\-*/%×÷]/.test(candidate) && /\d/.test(candidate)) {
      const value = evaluateSafeArithmetic(candidate);
      if (value !== null) {
        return {
          matched: true,
          skillName: 'calculator',
          actionType: 'calc',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu
            ? `${candidate} ka jawab ${value} hai.`
            : `${candidate} equals ${value}.`,
          sideEffect: { type: 'none' },
        };
      }
    }
  }

  // 9. Create Note skill (English + Roman Urdu + Urdu script)
  if (isEnabled('notes_manager')) {
    const noteMatch =
      input.match(/^(?:create\s+a?\s*note|take\s+a?\s*note|add\s+a?\s*note|save\s+a?\s*note|note\s+that|note)\s*[:\-]?\s+(.+)$/i) ||
      input.match(/^(?:note\s+likho|note\s+banao|note\s+save\s+karo|likho)\s*[:\-]?\s+(.+)$/i) ||
      input.match(/^(?:نوٹ\s+لکھو|نوٹ\s+بناؤ|نوٹ\s+محفوظ\s+کرو|نوٹ\s+سیو\s+کرو|نوٹ\s+رکھو|لکھو)\s*[:\-]?\s+(.+)$/);
    if (noteMatch && noteMatch[1].trim().length > 0) {
      const content = noteMatch[1].trim();
      const title = content.split(/[.!?\n۔]/)[0].slice(0, 48).trim();
      return {
        matched: true,
        skillName: 'notes_manager',
        actionType: 'note',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? `Note save ho gaya hai: "${content}"`
          : `I've saved your note: "${content}"`,
        sideEffect: {
          type: 'create_note',
          noteTitle: title || 'Quick Note',
          noteContent: content,
        },
      };
    }
  }

  // 10. Reminder skill (English + Roman Urdu + Urdu script)
  if (isEnabled('reminders_manager')) {
    const reminderMatch =
      input.match(/^remind\s+me\s+(?:to\s+)?(.+?)(?:\s+(?:at|on|in)\s+(.+))?$/i) ||
      input.match(/^(?:set\s+a?\s*reminder|add\s+a?\s*reminder)\s*(?:to|for)?\s*[:\-]?\s+(.+)$/i) ||
      input.match(/^(?:yaad\s+dila(?:na|o)|yaad\s+dehani\s+(?:lagao|banao)|reminder\s+(?:lagao|banao|set\s+karo))\s*[:\-]?\s+(.+)$/i) ||
      input.match(/^(?:یاد\s+دلاؤ|یاد\s+دلانا|یاد\s+دہانی\s+(?:لگاؤ|بناؤ|رکھو|سیٹ\s+کرو)|ریمائنڈر\s+(?:لگاؤ|بناؤ|سیٹ\s+کرو))\s*[:\-]?\s+(.+)$/);
    if (reminderMatch && reminderMatch[1].trim().length > 0) {
      const title = reminderMatch[1].trim();
      const whenRaw = reminderMatch[2]?.trim();
      const remindAt =
        whenRaw ||
        new Date(now.getTime() + 60 * 60 * 1000).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      return {
        matched: true,
        skillName: 'reminders_manager',
        actionType: 'reminder',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? `Reminder set kar diya gaya hai: "${title}" (${remindAt}).`
          : `Reminder set for "${title}" (${remindAt}).`,
        sideEffect: {
          type: 'create_reminder',
          reminderTitle: title,
          reminderAt: remindAt,
        },
      };
    }
  }

  // 11. Web search skill
  if (isEnabled('web_search')) {
    const searchMatch =
      input.match(/^(?:search(?:\s+for)?|google|look\s+up)\s+(.+)$/i) ||
      input.match(/^(.+?)\s+(?:search\s+karo|dhundo)$/i) ||
      input.match(/^(.+?)\s+(?:سرچ\s+کرو|تلاش\s+کرو|ڈھونڈو)$/);
    if (searchMatch && searchMatch[1].trim().length > 1) {
      const q = searchMatch[1].trim();
      const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      return {
        matched: true,
        skillName: 'web_search',
        actionType: 'url',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? `"${q}" ke liye web search tayyar hai.`
          : `Searching the web for "${q}".`,
        sideEffect: { type: 'open_url', url },
      };
    }
  }

  // 12. App / Website Launcher skill
  if (isEnabled('app_launcher')) {
    const openEn = input.match(/^(?:open|launch|start)\s+([a-z0-9.\-_ ]+)$/i);
    const openUr = input.match(/^([a-z0-9.\-_ ]+?)\s+(?:kholo|chalu\s+karo|open\s+karo)$/i);
    const openUrScript = input.match(/^(یوٹیوب|گوگل|جی میل|گٹ ہب|میپس|کیلنڈر|کروم|نوٹیشن)\s+(?:کھولو|چالو کرو)$/);
    const urAppMap: Record<string, string> = {
      'یوٹیوب': 'youtube',
      'گوگل': 'chrome',
      'کروم': 'chrome',
      'جی میل': 'gmail',
      'گٹ ہب': 'github',
      'میپس': 'maps',
      'کیلنڈر': 'calendar',
      'نوٹیشن': 'notion',
    };
    const target = (openEn?.[1] || openUr?.[1] || (openUrScript ? urAppMap[openUrScript[1]] : undefined))
      ?.trim()
      .toLowerCase();
    if (target) {
      const known = KNOWN_APPS[target];
      if (known) {
        return {
          matched: true,
          skillName: 'app_launcher',
          actionType: 'launch',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu ? `${known.label} khul gaya hai.` : `Launching ${known.label}.`,
          sideEffect: { type: 'open_url', url: known.url },
        };
      }
      if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(target)) {
        return {
          matched: true,
          skillName: 'app_launcher',
          actionType: 'url',
          language: isUrdu ? 'ur' : 'en',
          responseText: isUrdu ? `${target} khol raha hun.` : `Opening ${target}.`,
          sideEffect: { type: 'open_url', url: `https://${target}` },
        };
      }
    }
  }

  // 13. System control skill (mute, unmute, voice on/off, volume/brightness)
  if (isEnabled('system_control')) {
    if (
      /\b(volume\s+(?:up|down)|mute|unmute|brightness\s+(?:up|down)|awaaz\s+(?:kam|zyada|band|chalu))\b/i.test(
        lower
      ) ||
      /(آواز بند|آواز کھولو|چپ ہو جاؤ|بولنا بند|بولنا شروع)/.test(input)
    ) {
      const cmdNormalized = /(آواز بند|چپ ہو جاؤ|بولنا بند|awaaz band)/.test(input)
        ? 'mute'
        : /(آواز کھولو|بولنا شروع|awaaz chalu)/.test(input)
          ? 'unmute'
          : lower;
      return {
        matched: true,
        skillName: 'system_control',
        actionType: 'system',
        language: isUrdu ? 'ur' : 'en',
        responseText: isUrdu
          ? 'Audio aur display control command execute kar di gayi hai.'
          : 'System audio/display control adjusted.',
        sideEffect: { type: 'system_action', systemCommand: cmdNormalized },
      };
    }
  }

  return { matched: false };
}

/**
 * Determines whether a prompt is a complex reasoning, architecture, debugging,
 * book/course synthesis, or multi-step planning query suitable for Deep Thinking (gemini-4-carbon).
 */
export function isComplexThinkingQuery(text: string): boolean {
  const lower = text.toLowerCase();
  if (text.trim().length >= 160) return true;
  const complexKeywords = [
    'architect',
    'architecture',
    'analyze',
    'analysis',
    'compare',
    'trade-off',
    'tradeoff',
    'debug',
    'root cause',
    'strategy',
    'plan',
    'roadmap',
    'algorithm',
    'complexity',
    'optimize',
    'proof',
    'derive',
    'explain in detail',
    'step by step',
    'step-by-step',
    'tafsil',
    'tafseel',
    'samjhao',
    'design a system',
    'write a full',
    'security audit',
    'book',
    'course',
    'software',
    'syllabus',
  ];
  return complexKeywords.some((kw) => lower.includes(kw));
}
