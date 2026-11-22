import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SOUL_MARKDOWN, formatMemoryMarkdown } from '../src/lib/zaraPersona';
import type {
  KnowledgeSource,
  MemoryRecord,
  NoteRecord,
  ReminderRecord,
} from '../src/types/nova';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SOUL_PATH = path.join(DATA_DIR, 'SOUL.md');
const MEMORY_PATH = path.join(DATA_DIR, 'MEMORY.md');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function ensureSoulFile(): string {
  ensureDataDir();
  if (!fs.existsSync(SOUL_PATH)) {
    fs.writeFileSync(SOUL_PATH, DEFAULT_SOUL_MARKDOWN, 'utf8');
    console.log('[Bootstrap] Created SOUL.md');
  }
  return fs.readFileSync(SOUL_PATH, 'utf8');
}

export function readSoulMarkdown(): string {
  return ensureSoulFile();
}

export function writeSoulMarkdown(content: string): string {
  ensureDataDir();
  const clean = content.trim() ? `${content.trim()}\n` : DEFAULT_SOUL_MARKDOWN;
  fs.writeFileSync(SOUL_PATH, clean, 'utf8');
  console.log('[Bootstrap] Updated SOUL.md');
  return clean;
}

export function resetSoulMarkdown(): string {
  ensureDataDir();
  fs.writeFileSync(SOUL_PATH, DEFAULT_SOUL_MARKDOWN, 'utf8');
  console.log('[Bootstrap] Reset default SOUL.md');
  return DEFAULT_SOUL_MARKDOWN;
}

export function ensureMemoryFile(syncParams?: {
  assistantName?: string;
  userName?: string;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
}): string {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_PATH)) {
    const initial = syncParams
      ? formatMemoryMarkdown(syncParams)
      : '- [System] ZARA Memory System Initialized.\n';
    fs.writeFileSync(MEMORY_PATH, initial, 'utf8');
    console.log('[Bootstrap] Created default MEMORY.md');
    return initial;
  }
  return fs.readFileSync(MEMORY_PATH, 'utf8');
}

export function readMemoryMarkdown(): string {
  return ensureMemoryFile();
}

export function syncMemoryMarkdown(params: {
  assistantName?: string;
  userName?: string;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
}): string {
  ensureDataDir();
  const markdown = formatMemoryMarkdown(params);
  fs.writeFileSync(MEMORY_PATH, markdown, 'utf8');
  return markdown;
}
