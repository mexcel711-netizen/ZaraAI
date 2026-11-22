import {
  getDesktopBridgeToken,
  listUsbDrives,
  transferMemoryToUsb as transferMemoryToCompanionUsb,
  type UsbDriveInfo,
} from './desktopBridge';
import type {
  AppConfig,
  CharacterProfile,
  KnowledgeSource,
  MemoryRecord,
  NoteRecord,
  ReminderRecord,
  SessionSummary,
} from '../types/nova';

export interface MemoryVaultBundle {
  exportedAt: string;
  version: number;
  assistantName: string;
  userName: string;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
  characters: Array<Pick<CharacterProfile, 'id' | 'slug' | 'name' | 'role_title' | 'bond_level' | 'xp' | 'learned_traits' | 'life_journal'>>;
  sessions: SessionSummary[];
  recentConversations?: Array<{
    session_id: string;
    role: string;
    content: string;
    language: string;
    timestamp: string;
  }>;
}

export interface UsbIntentMatch {
  action: 'transfer_now' | 'enable_auto' | 'disable_auto' | 'check_status';
  driveHint?: string;
}

/**
 * Pure boundary check ensuring a resolved path never escapes its root directory
 * (prevents sibling-prefix bypasses like /home/alice vs /home/ali).
 */
export function isPathSafelyInsideRoot(candidatePath: string, rootPath: string, sep = '/'): boolean {
  const normRoot = rootPath.replace(/[\\/]+$/, '') || sep;
  const normCand = candidatePath.replace(/[\\/]+$/, '') || sep;
  if (normCand === normRoot) return true;
  const prefix = normRoot.endsWith(sep) ? normRoot : normRoot + sep;
  return normCand.startsWith(prefix);
}

/**
 * Detects Urdu script, Roman Urdu, and English commands for USB transfer & auto-USB sync.
 */
export function detectUsbTransferIntent(rawText: string): UsbIntentMatch | null {
  const text = rawText.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  const mentionsUsb =
    /\busb\b|flash\s*drive|pen\s*drive|thumb\s*drive|removable\s*drive|external\s*drive|یو\s*ایس\s*بی|یوایس\s*بی|فلیش\s*ڈرائیو|پین\s*ڈرائیو/i.test(
      text
    );
  if (!mentionsUsb) return null;

  const isAuto =
    /\b(auto|automatic|automatically|khud\s*bakhud|khud\s*ba\s*khud|khud|har\s*(?:bar|dafa|waqt)|always|sync)\b|خود\s*بخود|خودکار|خود\s*ہی|ہر\s*بار|ہمیشہ/i.test(
      text
    );
  const isDisable =
    /\b(off|stop|disable|band|mat|nahi|na|cancel|pause)\b|بند\s*کر|روک\s*دو|مت\s*کر|نہ\s*کر/i.test(text);
  const isCheck =
    /\b(check|list|detect|show|konsi|kaun\s*si|status|connected|lagi|laga)\b|چیک\s*کر|کون\s*سی|دکھاؤ|لگی\s*ہوئی/i.test(
      text
    ) && !/\b(transfer|copy|save|backup|export|send|bhej|daal|dal|kar\s*do)\b|ٹرانسفر|کاپی|محفوظ|بیک\s*اپ|بھیج|ڈال/i.test(text);

  const driveLetterMatch = lower.match(/\b([d-z]):\\?/i);
  const driveHint = driveLetterMatch ? `${driveLetterMatch[1].toUpperCase()}:` : undefined;

  if (isAuto && isDisable) {
    return { action: 'disable_auto', driveHint };
  }
  if (isAuto) {
    return { action: 'enable_auto', driveHint };
  }
  if (isCheck) {
    return { action: 'check_status', driveHint };
  }

  const wantsTransfer =
    /\b(transfer|copy|save|backup|export|sync|move|send|write|dump|bhej|bhejo|daal|dal|rakh|kar|karo|kardo|kar\s*do|de|do)\b|ٹرانسفر|منتقل|کاپی|محفوظ|سیو|بیک\s*اپ|بھیج|ڈال|رکھ|کر\s*دو|کرو|دے/i.test(
      text
    );
  if (wantsTransfer || mentionsUsb) {
    return { action: 'transfer_now', driveHint };
  }
  return null;
}

export function buildMemoryVaultPayload(params: {
  config: Pick<AppConfig, 'assistant_name' | 'user_name'>;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
  characters: CharacterProfile[];
  sessions: SessionSummary[];
  recentConversations?: Array<{
    session_id: string;
    role: string;
    content: string;
    language: string;
    timestamp: string;
  }>;
}): MemoryVaultBundle {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    assistantName: params.config.assistant_name || 'ZARA',
    userName: params.config.user_name || 'Boss',
    memories: params.memories,
    notes: params.notes,
    reminders: params.reminders,
    knowledge: params.knowledge,
    characters: params.characters.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      role_title: c.role_title,
      bond_level: c.bond_level,
      xp: c.xp,
      learned_traits: c.learned_traits,
      life_journal: c.life_journal,
    })),
    sessions: params.sessions,
    recentConversations: params.recentConversations,
  };
}

export function formatMemoryVaultMarkdown(vault: MemoryVaultBundle): string {
  const lines: string[] = [
    `# ${vault.assistantName} Memory Vault Backup`,
    '',
    `- **Exported At**: ${vault.exportedAt}`,
    `- **User**: ${vault.userName}`,
    `- **Memories**: ${vault.memories.length}`,
    `- **Notes**: ${vault.notes.length}`,
    `- **Reminders**: ${vault.reminders.length}`,
    `- **Study Sources**: ${vault.knowledge.length}`,
    '',
    '## Recorded Memories',
  ];

  if (vault.memories.length === 0) {
    lines.push('_No recorded memories yet._');
  } else {
    for (const m of vault.memories) {
      lines.push(`- [${m.category}] ${m.value} (${m.created_at})`);
    }
  }

  lines.push('', '## Notes');
  if (vault.notes.length === 0) {
    lines.push('_No saved notes._');
  } else {
    for (const n of vault.notes) {
      lines.push(`- **${n.title || 'Quick Note'}**: ${n.content}`);
    }
  }

  lines.push('', '## Reminders');
  if (vault.reminders.length === 0) {
    lines.push('_No reminders._');
  } else {
    for (const r of vault.reminders) {
      lines.push(`- [${r.is_done ? 'x' : ' '}] ${r.title} (${r.remind_at})`);
    }
  }

  if (vault.knowledge.length > 0) {
    lines.push('', '## Studied Books, Software & Courses');
    for (const k of vault.knowledge) {
      lines.push(`- **${k.title}** (${k.kind}): ${k.detailed_summary.slice(0, 240)}`);
    }
  }

  if (vault.recentConversations && vault.recentConversations.length > 0) {
    lines.push('', '## Recent Conversations');
    for (const msg of vault.recentConversations.slice(-40)) {
      lines.push(`- **${msg.role}** (${msg.timestamp}): ${msg.content.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }

  return lines.join('\n') + '\n';
}

// --- Browser IndexedDB persistence for File System Access API USB Directory Handle ---

const IDB_NAME = 'nova-usb-storage';
const IDB_STORE = 'handles';
const IDB_KEY = 'usb-directory';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open USB handle store'));
  });
}

export async function getStoredUsbDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveUsbDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Unable to persist USB folder handle'));
  });
}

export async function clearStoredUsbDirectoryHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore cleanup failure
  }
}

export async function getLinkedUsbDirectoryName(): Promise<string | null> {
  const handle = await getStoredUsbDirectoryHandle();
  return handle?.name || null;
}

export async function linkUsbDirectoryHandle(): Promise<{ name: string }> {
  const pickerWin = window as DirectoryPickerWindow;
  if (!pickerWin.showDirectoryPicker) {
    throw new Error(
      'Direct browser USB folder picker is available in Chrome/Edge desktop or via the ZARA Desktop Companion.'
    );
  }
  const handle = await pickerWin.showDirectoryPicker({ mode: 'readwrite', id: 'zara-usb-backup' });
  await saveUsbDirectoryHandle(handle);
  return { name: handle.name || 'USB Drive' };
}

async function writeBundleToBrowserHandle(
  handle: FileSystemDirectoryHandle,
  jsonContent: string,
  markdownContent: string
): Promise<boolean> {
  const handleWithPerm = handle as FileSystemDirectoryHandle & {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  let perm: PermissionState = 'granted';
  if (handleWithPerm.queryPermission) {
    perm = await handleWithPerm.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && handleWithPerm.requestPermission) {
      perm = await handleWithPerm.requestPermission({ mode: 'readwrite' });
    }
  }
  if (perm !== 'granted') return false;

  const subDir = await handle.getDirectoryHandle('ZARA-Memory-Backup', { create: true });
  const writeTextFile = async (fileName: string, content: string) => {
    const fileHandle = await subDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await writeTextFile('zara-memory-latest.json', jsonContent);
  await writeTextFile('zara-memory-latest.md', markdownContent);
  await writeTextFile(`zara-memory-${stamp}.json`, jsonContent);
  return true;
}

export interface UsbTransferOutcome {
  ok: boolean;
  method: 'desktop-companion' | 'browser-folder' | 'download-fallback' | 'none';
  driveLabel: string;
  filePath?: string;
  message: string;
  drivesFound?: UsbDriveInfo[];
}

export async function fetchServerMemoryVault(): Promise<{
  vault: MemoryVaultBundle;
  markdown: string;
}> {
  const res = await fetch('/api/memory/export');
  if (!res.ok) {
    throw new Error('Memory vault export failed.');
  }
  return (await res.json()) as { vault: MemoryVaultBundle; markdown: string };
}

function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Transfers the full recorded memory vault to:
 * 1. Paired Desktop Companion real removable USB drive (if connected + USB attached),
 * 2. Linked browser USB folder handle (`FileSystemDirectoryHandle`),
 * 3. If `interactive` is true and neither USB target is active, saves a ready `.json` backup file cleanly.
 */
export async function performUsbMemoryTransfer(options: {
  interactive?: boolean;
  driveHint?: string;
} = {}): Promise<UsbTransferOutcome> {
  const { interactive = true, driveHint } = options;
  const { vault, markdown } = await fetchServerMemoryVault();
  const jsonContent = JSON.stringify(vault, null, 2);

  // 1) Try Desktop Companion USB transfer if paired
  if (getDesktopBridgeToken()) {
    try {
      const drives = await listUsbDrives();
      if (drives.length > 0) {
        const chosen =
          (driveHint
            ? drives.find(
                (d) =>
                  d.path.toLowerCase().includes(driveHint.toLowerCase()) ||
                  d.label.toLowerCase().includes(driveHint.toLowerCase())
              )
            : undefined) || drives[0];
        const result = await transferMemoryToCompanionUsb({
          drivePath: chosen.path,
          jsonContent,
          markdownContent: markdown,
        });
        return {
          ok: true,
          method: 'desktop-companion',
          driveLabel: chosen.label || chosen.path,
          filePath: result.filePath,
          drivesFound: drives,
          message: `Memory vault USB drive (${chosen.label || chosen.path}) mein save ho gaya: ${result.filePath}`,
        };
      }
    } catch {
      // Fall through to browser USB folder handle or download fallback
    }
  }

  // 2) Try stored FileSystemDirectoryHandle
  const storedHandle = await getStoredUsbDirectoryHandle();
  if (storedHandle) {
    try {
      const written = await writeBundleToBrowserHandle(storedHandle, jsonContent, markdown);
      if (written) {
        return {
          ok: true,
          method: 'browser-folder',
          driveLabel: storedHandle.name || 'Linked USB',
          filePath: `${storedHandle.name}/ZARA-Memory-Backup/zara-memory-latest.json`,
          message: `Memory vault linked USB folder (${storedHandle.name}) mein transfer ho gaya.`,
        };
      }
    } catch {
      // Fall through if USB was unplugged or permission revoked
    }
  }

  // 3) Interactive manual trigger: offer directory picker if supported & no handle yet, else download portable backup
  if (interactive) {
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `zara-memory-usb-backup-${stamp}.json`;
    triggerFileDownload(filename, jsonContent, 'application/json');
    return {
      ok: true,
      method: 'download-fallback',
      driveLabel: 'Portable Backup File',
      filePath: filename,
      message: `Koi mounted USB drive directly connected nahi mila, is liye complete memory backup (${filename}) download kar diya hai — isay seedha USB mein copy kar lein ya Memory tab se apna USB folder link kar dein.`,
    };
  }

  return {
    ok: false,
    method: 'none',
    driveLabel: '',
    message: 'Auto-USB sync waiting: link a USB folder in Memory tab or attach USB with Desktop Companion.',
  };
}
