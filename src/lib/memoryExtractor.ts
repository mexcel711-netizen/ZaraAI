import type { MemoryRecord } from '../types/nova';

export interface ExtractedMemoryCandidate {
  category: MemoryRecord['category'];
  key: string;
  value: string;
  source: 'user_stated' | 'ai_inferred';
  confidence: number;
}

/**
 * Continuously extracts user facts, goals, professions, study topics, and preferences
 * from English, Roman Urdu, and Urdu script conversations.
 */
export function extractMemoriesFromUtterance(text: string): ExtractedMemoryCandidate[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 4) return [];

  const candidates: ExtractedMemoryCandidate[] = [];

  // Name patterns (English + Roman Urdu + Urdu script)
  const nameEn = trimmed.match(
    /\bmy name is\s+([a-zA-Z][a-zA-Z'-]{1,24}(?:\s+(?!and\b|aur\b|from\b|i\b|calculate\b)[a-zA-Z][a-zA-Z'-]{1,24})?)/i
  );
  const nameUr = trimmed.match(
    /\bmera naam\s+([a-zA-Z'-]{2,24}(?:\s+(?!hai\b|aur\b|and\b)[a-zA-Z'-]{2,24})?)\s+hai\b/i
  );
  const nameUrScript = trimmed.match(/میرا نام\s+([^\s۔!؟]{2,24})\s+ہے/);
  const rawName = nameEn?.[1] || nameUr?.[1] || nameUrScript?.[1];
  if (rawName) {
    candidates.push({
      category: 'fact',
      key: 'user_name',
      value: `User's name is ${rawName.trim()}`,
      source: 'user_stated',
      confidence: 0.98,
    });
  }

  // Location patterns (English + Roman Urdu + Urdu script)
  const locEn = trimmed.match(/\bi (?:live|am based|work|stay) in\s+([a-zA-Z\s,.-]{2,40})/i);
  const locUr = trimmed.match(/\b(?:mein|main)\s+([a-zA-Z\s,.-]{2,35})\s+(?:mein|main|se)\s+(?:rehta|rehti|rahta|rahti|hoon|hun)\b/i);
  const locUrScript = trimmed.match(/میں\s+([^\s۔!؟,،]{2,30})\s+(?:میں|سے)\s+(?:رہتا|رہتی|ہوں)/);
  const rawLoc = locEn?.[1] || locUr?.[1] || locUrScript?.[1];
  if (rawLoc) {
    const cleanLoc = rawLoc.replace(/[.!?۔]+$/, '').trim();
    if (cleanLoc.length >= 2) {
      candidates.push({
        category: 'fact',
        key: 'user_location',
        value: `Located in ${cleanLoc}`,
        source: 'user_stated',
        confidence: 0.92,
      });
    }
  }

  // Profession / Role / Study patterns
  const roleEn = trimmed.match(/\bi am an?\s+([a-zA-Z0-9\s-]{2,40}?)(?:\s+(?:and|aur|who|working|living)\b|[.!?,]|$)/i);
  const roleUr = trimmed.match(/\b(?:mein|main)\s+aik?\s+([a-zA-Z0-9\s-]{2,40}?)\s+(?:hoon|hun)\b/i);
  const roleUrScript = trimmed.match(/(?:میرا پیشہ|میرا کام)\s+([^\n۔!؟]{2,45})\s+(?:ہے|ہوں)/);
  const rawRole = roleEn?.[1] || roleUr?.[1] || roleUrScript?.[1];
  if (rawRole && !/\b(feeling|sure|happy|sad|tired|good)\b/i.test(rawRole)) {
    candidates.push({
      category: 'fact',
      key: 'user_role',
      value: `User role: ${rawRole.trim()}`,
      source: 'ai_inferred',
      confidence: 0.86,
    });
  }

  // Project / Goal / Learning Intent ("I want to build...", "mein ... banana chahta hun")
  const goalEn = trimmed.match(/\bi want to\s+(?:build|create|learn|study|make)\s+([^.!?]{3,80})/i);
  const goalUr = trimmed.match(/\b(?:mein|main)\s+([^.!?]{3,75}?)\s+(?:banana chahta|seekhna chahta|karna chahta)\b/i);
  const goalUrScript = trimmed.match(/میں\s+([^\n۔!؟]{4,75}?)\s+(?:بنانا چاہتا|سیکھنا چاہتا|کرنا چاہتا)/);
  const rawGoal = goalEn?.[1] || goalUr?.[1] || goalUrScript?.[1];
  if (rawGoal) {
    candidates.push({
      category: 'fact',
      key: 'user_goal',
      value: `Goal: ${rawGoal.trim()}`,
      source: 'ai_inferred',
      confidence: 0.87,
    });
  }

  // Preference / Dislike patterns (English + Roman Urdu + Urdu script)
  const dislikeEn = trimmed.match(/\bi (?:hate|dislike|don't like)\s+([^.!?]{3,65})/i);
  const dislikeUr = trimmed.match(/\bmujhe\s+([^.!?]{3,60}?)\s+pasand nahi\b/i);
  const dislikeUrScript = trimmed.match(/مجھے\s+([^\n۔!؟]{2,60}?)\s+پسند نہیں/);
  const rawDislike = dislikeEn?.[1] || dislikeUr?.[1] || dislikeUrScript?.[1];
  if (rawDislike) {
    candidates.push({
      category: 'preference',
      key: 'user_dislike',
      value: `Dislikes ${rawDislike.trim()}`,
      source: 'user_stated',
      confidence: 0.9,
    });
  } else {
    const prefEn = trimmed.match(/\bi (?:prefer|love|like|always use)\s+([^.!?]{3,70})/i);
    const prefUr = trimmed.match(/\bmujhe\s+([^.!?]{3,60}?)\s+(?:pasand hai|achha lagta hai|bohat pasand)\b/i);
    const prefUrScript = trimmed.match(/مجھے\s+([^\n۔!؟]{2,60}?)\s+(?:پسند ہے|اچھا لگتا ہے)/);
    const rawPref = prefEn?.[1] || prefUr?.[1] || prefUrScript?.[1];
    if (rawPref) {
      candidates.push({
        category: 'preference',
        key: 'user_preference',
        value: `Prefers ${rawPref.trim()}`,
        source: 'user_stated',
        confidence: 0.88,
      });
    }
  }

  // Study / Reading / Course interest
  const studyInterest =
    trimmed.match(/\b(?:i am studying|i'm learning|studying|reading)\s+([^.!?]{3,70})/i) ||
    trimmed.match(/\b(?:mein|main)\s+([^.!?]{3,65}?)\s+(?:parh raha|seekh raha|parh rahi|seekh rahi)\b/i) ||
    trimmed.match(/میں\s+([^\n۔!؟]{3,65}?)\s+(?:پڑھ رہا|سیکھ رہا|پڑھ رہی|سیکھ رہی)/);
  if (studyInterest && studyInterest[1].trim().length > 2) {
    candidates.push({
      category: 'fact',
      key: 'study_focus',
      value: `Currently studying/learning: ${studyInterest[1].trim()}`,
      source: 'ai_inferred',
      confidence: 0.89,
    });
  }

  // Explicit learning / takeaway ("Today I learned...", "Maine aaj seekha...", "آج میں نے سیکھا...")
  const learningMatch =
    trimmed.match(/\b(?:today\s+)?i\s+(?:just\s+)?(?:learned|learnt|discovered|figured\s+out)\s+(?:that\s+)?([^.!?]{4,95})/i) ||
    trimmed.match(/\b(?:aaj\s+)?(?:maine|main ne|mein ne)\s+(?:ye\s+|yeh\s+)?(?:seekha|sikha|samjha)\s+(?:ke|keh)?\s*([^.!?]{4,90})/i) ||
    trimmed.match(/(?:آج\s+)?میں\s+نے\s+(?:یہ\s+)?(?:سیکھا|سمجھا)\s*(?:کہ)?\s*([^\n۔!؟]{4,90})/);
  if (learningMatch && learningMatch[1].trim().length > 3) {
    candidates.push({
      category: 'learning',
      key: 'user_learning',
      value: `Learned: ${learningMatch[1].trim()}`,
      source: 'ai_inferred',
      confidence: 0.91,
    });
  }

  // Daily routine / late-night / mood patterns
  if (/\b(late at night|raat ko|neend nahi|subah jaldi|chaai|chai|coffee)\b/i.test(trimmed) || /(رات کو|نیند نہیں|چائے|کافی)/.test(trimmed)) {
    const routineSnippet = trimmed.slice(0, 110);
    candidates.push({
      category: 'preference',
      key: 'daily_habit',
      value: `Habit/context shared: ${routineSnippet}`,
      source: 'ai_inferred',
      confidence: 0.82,
    });
  }

  // Explicit "remember that ..." / "memory mein record karo ..." command
  const explicitMem =
    trimmed.match(/^(?:remember(?:\s+that)?|keep in mind(?:\s+that)?|save\s+(?:this\s+)?(?:in|to)\s+memory\s*[:\-]?|record\s+(?:this\s+)?(?:in|to)\s+memory\s*[:\-]?)\s*(.+)$/i) ||
    trimmed.match(/^(?:yaad\s+rakh(?:o|na)(?:\s+ke)?|memory\s+mein\s+(?:save|record|likh)\s*(?:karo|kar\s*do)?\s*[:\-]?)\s*(.+)$/i) ||
    trimmed.match(/^(?:یاد رکھو|یاد رکھنا|میموری میں (?:محفوظ|ریکارڈ|سیو) (?:کرو|کر دو))\s*(?:کہ)?\s*[:\-]?\s*(.+)$/);
  if (explicitMem && explicitMem[1].trim().length > 2) {
    candidates.push({
      category: 'fact',
      key: 'remembered_fact',
      value: explicitMem[1].trim(),
      source: 'user_stated',
      confidence: 1.0,
    });
  }

  return candidates;
}

export function filterMemories(
  memories: MemoryRecord[],
  query: string,
  category: 'all' | MemoryRecord['category']
): MemoryRecord[] {
  const q = query.trim().toLowerCase();
  return memories.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return (
      item.value.toLowerCase().includes(q) ||
      (item.key?.toLowerCase().includes(q) ?? false) ||
      item.category.toLowerCase().includes(q)
    );
  });
}

export function isTodayIso(isoDateStr: string, now: Date = new Date()): boolean {
  const parsed = new Date(isoDateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}
