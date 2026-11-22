import type {
  CharacterProfile,
  KnowledgeSource,
  MemoryRecord,
  MoodMode,
} from '../types/nova';
import { buildFallbackMetaGrowthJournal, shouldTriggerMetaGrowth } from './zaraPersona';

export interface EvolutionOutcome {
  nextXp: number;
  nextBondLevel: number;
  leveledUp: boolean;
  metaGrowthTriggered: boolean;
  newTraits: string[];
  journalEntry: string;
  suggestedSkill?: {
    display_name: string;
    description: string;
    trigger_phrases: string[];
    action_type: 'note' | 'system';
    action_value: string;
  };
}

export function computeBondLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

/**
 * Computes organic character growth from conversations, memories, and studied materials.
 */
export function computeEvolutionProgress(params: {
  character: CharacterProfile;
  xpGain: number;
  recentUserMessages: string[];
  memories: MemoryRecord[];
  knowledge: KnowledgeSource[];
  totalUserInteractions?: number;
  nickname?: string;
}): EvolutionOutcome {
  const {
    character,
    xpGain,
    recentUserMessages,
    memories,
    knowledge,
    totalUserInteractions = 0,
    nickname = 'Boss',
  } = params;
  const nextXp = character.xp + Math.max(5, xpGain);
  const nextBondLevel = computeBondLevel(nextXp);
  const leveledUp = nextBondLevel > character.bond_level;
  const metaGrowthTriggered = shouldTriggerMetaGrowth(totalUserInteractions);

  const combinedText = recentUserMessages.join(' ').toLowerCase();
  const existing = new Set(character.learned_traits.map((t) => t.toLowerCase()));
  const newTraits: string[] = [];

  const candidateTraits: Array<{ test: RegExp; trait: string }> = [
    {
      test: /\b(code|programming|software|react|python|typescript|api|app|developer)\b/i,
      trait: 'Technical Builder & Software Architect',
    },
    {
      test: /\b(book|kitaab|course|learn|study|parhna|samjhao)\b/i,
      trait: 'Patient Book & Course Mentor',
    },
    {
      test: /\b(urdu|assalam|shukriya|pyaar|dost|yaad|khush|udaas)\b|[\u0600-\u06FF]/i,
      trait: 'Culturally Tuned Pakistani Urdu Companion',
    },
    {
      test: /\b(love|mohabbat|care|heart|jaan|dil|miss)\b/i,
      trait: 'Deeply Affectionate & Empathetic Bond',
    },
    {
      test: /\b(laptop|desktop|chrome|downloads|file|system|install)\b/i,
      trait: 'Hands-On Laptop & System Operator',
    },
  ];

  for (const cand of candidateTraits) {
    if (cand.test.test(combinedText) && !existing.has(cand.trait.toLowerCase())) {
      newTraits.push(cand.trait);
      existing.add(cand.trait.toLowerCase());
    }
  }

  if (knowledge.length > 0 && !existing.has('Knowledge-Driven Study Partner'.toLowerCase())) {
    newTraits.push('Knowledge-Driven Study Partner');
  }

  if (metaGrowthTriggered && !existing.has('Warmth & Support Meta-Calibrated'.toLowerCase())) {
    newTraits.push('Warmth & Support Meta-Calibrated');
  }

  const memHint = memories[0]?.value ? `Latest context: "${memories[0].value.slice(0, 60)}"` : 'Deepening conversational bond';
  const journalEntry = leveledUp
    ? `Reached Bond Level ${nextBondLevel} (${character.name}). ${memHint}`
    : metaGrowthTriggered
      ? buildFallbackMetaGrowthJournal({
          interactionCount: totalUserInteractions,
          nickname,
          recentUserMessages,
          latestMemory: memories[0],
        })
      : `Reflected on ${recentUserMessages.length} recent turns & ${knowledge.length} studied sources. ${memHint}`;

  let suggestedSkill: EvolutionOutcome['suggestedSkill'];
  if (
    recentUserMessages.some((m) => /\b(daily briefing|subah ka plan|routine|schedule)\b/i.test(m))
  ) {
    suggestedSkill = {
      display_name: 'Morning Briefing Mode',
      description: 'Auto-evolved routine that reviews memories, notes, and active mood in Urdu/English.',
      trigger_phrases: ['morning briefing', 'aaj ka plan', 'subah briefing'],
      action_type: 'system',
      action_value: 'Assalamualaikum! Aaj ke goals, notes aur active reminders check kar liye hain — bataiye kis kaam se shuru karein?',
    };
  }

  return {
    nextXp,
    nextBondLevel,
    leveledUp,
    metaGrowthTriggered,
    newTraits,
    journalEntry,
    suggestedSkill,
  };
}

export function resolveMoodSwitchCommand(input: string): MoodMode | null {
  const lower = input.toLowerCase().trim();
  if (
    /\b(love\s*mode|love\s*mood|pyaar\s*mode|mohabbat\s*mode|romantic\s*mode)\b/i.test(lower) ||
    /(لو موڈ|پیار موڈ|محبت موڈ)/.test(input)
  ) {
    return 'love';
  }
  if (
    /\b(sad\s*mode|sad\s*mood|udaas\s*mode|udaas\s*mood)\b/i.test(lower) ||
    /(سیڈ موڈ|اداس موڈ)/.test(input)
  ) {
    return 'sad';
  }
  if (
    /\b(happy\s*mode|happy\s*mood|khush\s*mode|khushi\s*mode)\b/i.test(lower) ||
    /(ہیپی موڈ|خوش موڈ)/.test(input)
  ) {
    return 'happy';
  }
  if (
    /\b(surprised\s*mode|surprised\s*mood|hairan\s*mode)\b/i.test(lower) ||
    /(حیران موڈ)/.test(input)
  ) {
    return 'surprised';
  }
  if (
    /\b(empathetic\s*mode|empathetic\s*mood|empathy\s*mode|caring\s*mode|hamdard\s*mode)\b/i.test(lower) ||
    /(ہمدرد موڈ)/.test(input)
  ) {
    return 'empathetic';
  }
  if (
    /\b(calm\s*mode|calm\s*mood|normal\s*mode|auto\s*mood|auto\s*mode)\b/i.test(lower) ||
    /(نارمل موڈ|پرسکون موڈ)/.test(input)
  ) {
    return /\bauto\b/i.test(lower) ? 'auto' : 'calm';
  }
  return null;
}

export function resolveCharacterSwitchCommand(
  input: string,
  characters: Array<{ slug: string; name: string }>
): { slug: string; name: string } | null {
  const lower = input.toLowerCase();
  const explicit =
    /\b(select|switch(?:\s+to)?|activate|choose|use|bano|karo|baat\s+karni)\b/i.test(lower) ||
    /(منتخب|سلیکٹ|بنو|بات کرنی)/.test(input);
  if (!explicit) return null;

  for (const ch of characters) {
    const nameLower = ch.name.toLowerCase();
    const slugLower = ch.slug.toLowerCase();
    if (
      new RegExp(`\\b${escapeRegex(slugLower)}\\b`, 'i').test(lower) ||
      new RegExp(`\\b${escapeRegex(nameLower)}\\b`, 'i').test(lower)
    ) {
      return ch;
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
