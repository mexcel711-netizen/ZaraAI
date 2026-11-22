import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, FileText, FolderSync, HardDriveDownload, Plus, RefreshCw, Search, Trash2, Usb } from 'lucide-react';
import { filterMemories, isTodayIso } from '../../lib/memoryExtractor';
import { getLinkedUsbDirectoryName, type UsbTransferOutcome } from '../../lib/usbTransfer';
import type { KnowledgeSource, MemoryRecord, NoteRecord, ReminderRecord } from '../../types/nova';
import { ConfirmDialog } from '../ConfirmDialog';

interface MemoryViewProps {
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  knowledge: KnowledgeSource[];
  memoryMarkdown?: string;
  onRefreshMemoryMarkdown?: () => Promise<void>;
  autoUsbTransfer: boolean;
  lastUsbSyncAt: string;
  lastUsbDriveLabel: string;
  onToggleAutoUsb: (enabled: boolean) => Promise<void>;
  onTransferToUsb: () => Promise<UsbTransferOutcome>;
  onLinkUsbFolder: () => Promise<{ name: string }>;
  onAddMemory: (input: {
    category: MemoryRecord['category'];
    key: string;
    value: string;
  }) => Promise<void>;
  onDeleteMemory: (id: number) => Promise<void>;
  onClearAllMemories: () => Promise<void>;
  onAddNote: (title: string, content: string) => Promise<void>;
  onDeleteNote: (id: number) => Promise<void>;
  onAddReminder: (title: string, remindAt: string) => Promise<void>;
  onToggleReminder: (id: number, isDone: boolean) => Promise<void>;
  onDeleteReminder: (id: number) => Promise<void>;
  onDeleteKnowledge: (id: number) => Promise<void>;
}

type MemoryTab = 'all' | 'today' | 'notes' | 'reminders' | 'studied' | 'markdown';

export function MemoryView({
  memories,
  notes,
  reminders,
  knowledge,
  memoryMarkdown = '',
  onRefreshMemoryMarkdown,
  autoUsbTransfer,
  lastUsbSyncAt,
  lastUsbDriveLabel,
  onToggleAutoUsb,
  onTransferToUsb,
  onLinkUsbFolder,
  onAddMemory,
  onDeleteMemory,
  onClearAllMemories,
  onAddNote,
  onDeleteNote,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  onDeleteKnowledge,
}: MemoryViewProps) {
  const [activeTab, setActiveTab] = useState<MemoryTab>('all');
  const [refreshingMd, setRefreshingMd] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbStatusMsg, setUsbStatusMsg] = useState<string | null>(null);
  const [linkedFolderName, setLinkedFolderName] = useState<string | null>(null);

  useEffect(() => {
    void getLinkedUsbDirectoryName().then(setLinkedFolderName);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MemoryRecord['category']>('all');

  // New Memory Form
  const [newMemValue, setNewMemValue] = useState('');
  const [newMemCategory, setNewMemCategory] = useState<MemoryRecord['category']>('fact');
  const [memError, setMemError] = useState<string | null>(null);

  // New Note Form
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  // New Reminder Form
  const [newRemTitle, setNewRemTitle] = useState('');
  const [newRemTime, setNewRemTime] = useState('05:00 PM');
  const [remError, setRemError] = useState<string | null>(null);

  // Confirmation Dialog state
  const [pendingDelete, setPendingDelete] = useState<
    | { type: 'memory'; id: number; label: string }
    | { type: 'clear_all' }
    | null
  >(null);

  const visibleMemories = useMemo(() => {
    const base =
      activeTab === 'today' ? memories.filter((m) => isTodayIso(m.created_at)) : memories;
    return filterMemories(base, searchQuery, categoryFilter);
  }, [memories, activeTab, searchQuery, categoryFilter]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        (n.title?.toLowerCase().includes(q) ?? false) ||
        n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const filteredReminders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reminders;
    return reminders.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.remind_at.toLowerCase().includes(q)
    );
  }, [reminders, searchQuery]);

  const filteredKnowledge = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return knowledge;
    return knowledge.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.detailed_summary.toLowerCase().includes(q) ||
        k.goal.toLowerCase().includes(q)
    );
  }, [knowledge, searchQuery]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemValue.trim()) {
      setMemError('Please enter a fact or preference to remember.');
      return;
    }
    setMemError(null);
    await onAddMemory({
      category: newMemCategory,
      key: newMemCategory,
      value: newMemValue.trim(),
    });
    setNewMemValue('');
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) {
      setNoteError('Note content is required.');
      return;
    }
    setNoteError(null);
    await onAddNote(newNoteTitle.trim() || 'Quick Note', newNoteContent.trim());
    setNewNoteTitle('');
    setNewNoteContent('');
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemTitle.trim()) {
      setRemError('Reminder title is required.');
      return;
    }
    setRemError(null);
    await onAddReminder(newRemTitle.trim(), newRemTime.trim() || 'Today');
    setNewRemTitle('');
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'clear_all') {
      await onClearAllMemories();
    } else {
      await onDeleteMemory(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Memory Vault</h1>
          <p className="mt-1 text-sm text-slate-400">
            Continuously records facts, notes, reminders &amp; study history — ready to transfer or auto-sync to USB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={usbBusy}
            onClick={async () => {
              setUsbBusy(true);
              try {
                const res = await onTransferToUsb();
                setUsbStatusMsg(res.message);
              } catch (err) {
                setUsbStatusMsg(err instanceof Error ? err.message : 'USB transfer failed.');
              } finally {
                setUsbBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
            <span>{usbBusy ? 'Transferring...' : 'Transfer to USB'}</span>
          </button>

          <button
            type="button"
            disabled={usbBusy}
            onClick={async () => {
              try {
                const linked = await onLinkUsbFolder();
                setLinkedFolderName(linked.name);
                setUsbStatusMsg(`USB folder "${linked.name}" linked for 1-click & automatic sync.`);
              } catch (err) {
                setUsbStatusMsg(err instanceof Error ? err.message : 'Unable to link USB folder.');
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0D1117] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/40 hover:text-white whitespace-nowrap shrink-0"
          >
            <FolderSync className="h-3.5 w-3.5 text-cyan-400" />
            <span>{linkedFolderName ? `USB: ${linkedFolderName}` : 'Link USB Folder'}</span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={autoUsbTransfer}
            onClick={() => void onToggleAutoUsb(!autoUsbTransfer)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              autoUsbTransfer
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-slate-700 bg-[#0D1117] text-slate-300 hover:border-slate-600'
            }`}
          >
            <Usb className="h-3.5 w-3.5" />
            <span>Auto-Transfer USB: {autoUsbTransfer ? 'ON' : 'OFF'}</span>
          </button>

          {memories.length > 0 && (
            <button
              type="button"
              onClick={() => setPendingDelete({ type: 'clear_all' })}
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 whitespace-nowrap shrink-0"
            >
              Clear All Memories
            </button>
          )}
        </div>
      </div>

      {(usbStatusMsg || lastUsbSyncAt) && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/25 bg-cyan-950/20 px-3.5 py-2 text-xs text-cyan-100"
        >
          <span>{usbStatusMsg || `Last USB backup: ${lastUsbDriveLabel || 'USB Vault'}`}</span>
          {lastUsbSyncAt && (
            <span className="font-mono text-[11px] text-cyan-300/80 tabular-nums">
              Synced {new Date(lastUsbSyncAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Tabs + Search */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#0D1117] p-1">
          {(
            [
              { id: 'all', label: `All Memories (${memories.length})` },
              { id: 'today', label: 'Short-Term Today' },
              { id: 'notes', label: `Notes (${notes.length})` },
              { id: 'reminders', label: `Reminders (${reminders.length})` },
              { id: 'studied', label: `Studied (${knowledge.length})` },
              { id: 'markdown', label: 'MEMORY.md' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === tab.id
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <label htmlFor="memory-search-input" className="sr-only">
              Search memories, notes, or reminders
            </label>
            <input
              id="memory-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by keyword..."
              className="w-56 rounded-lg border border-slate-800 bg-[#0D1117] py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          {(activeTab === 'all' || activeTab === 'today') && (
            <div>
              <label htmlFor="memory-category-filter" className="sr-only">
                Filter by category
              </label>
              <select
                id="memory-category-filter"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as 'all' | MemoryRecord['category'])
                }
                className="rounded-lg border border-slate-800 bg-[#0D1117] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="all">All Categories</option>
                <option value="fact">Facts</option>
                <option value="preference">Preferences</option>
                <option value="learning">Learnings</option>
                <option value="note">Note Refs</option>
                <option value="reminder">Reminder Refs</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Tab Body */}
      <div className="mt-5 flex-1 overflow-y-auto pr-1">
        {(activeTab === 'all' || activeTab === 'today') && (
          <div className="space-y-4">
            <form
              onSubmit={handleCreateMemory}
              className="rounded-xl border border-slate-800 bg-[#0D1117] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label htmlFor="new-memory-category" className="sr-only">
                  Memory Category
                </label>
                <select
                  id="new-memory-category"
                  value={newMemCategory}
                  onChange={(e) =>
                    setNewMemCategory(e.target.value as MemoryRecord['category'])
                  }
                  className="rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-xs text-slate-200 focus:border-cyan-500/60 focus:outline-none"
                >
                  <option value="fact">Fact</option>
                  <option value="preference">Preference</option>
                  <option value="learning">Learning</option>
                </select>
                <label htmlFor="new-memory-value" className="sr-only">
                  Fact, preference, or learning to remember
                </label>
                <input
                  id="new-memory-value"
                  type="text"
                  value={newMemValue}
                  onChange={(e) => setNewMemValue(e.target.value)}
                  placeholder="Add a persistent fact, preference, or learning (e.g. Learned React useMemo pattern)"
                  className="flex-1 rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save Memory</span>
                </button>
              </div>
              {memError && <p className="mt-2 text-xs text-rose-400">{memError}</p>}
            </form>

            {visibleMemories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-[#0D1117]/50 px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-300">No memories match your view</p>
                <p className="mt-1 text-xs text-slate-500">
                  Add a fact above or tell ZARA about your preferences in chat.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-[#0D1117]">
                {visibleMemories.map((mem) => (
                  <div
                    key={mem.id}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-100">{mem.value}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="capitalize text-cyan-400">{mem.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>Source: {mem.source.replace('_', ' ')}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(mem.created_at)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete memory "${mem.value}"`}
                      onClick={() =>
                        setPendingDelete({ type: 'memory', id: mem.id, label: mem.value })
                      }
                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <form
              onSubmit={handleCreateNote}
              className="space-y-3 rounded-xl border border-slate-800 bg-[#0D1117] p-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="note-title-input" className="sr-only">
                    Note Title
                  </label>
                  <input
                    id="note-title-input"
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <label htmlFor="note-content-input" className="sr-only">
                    Note Content
                  </label>
                  <input
                    id="note-content-input"
                    type="text"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Write a note..."
                    className="flex-1 rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Note</span>
                  </button>
                </div>
              </div>
              {noteError && <p className="text-xs text-rose-400">{noteError}</p>}
            </form>

            {filteredNotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-[#0D1117]/50 px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-300">No notes saved yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Add a note above or say &quot;create note: ...&quot; in chat.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1117] p-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-white">
                          {note.title || 'Quick Note'}
                        </h3>
                        <button
                          type="button"
                          aria-label={`Delete note "${note.title || note.content}"`}
                          onClick={() => onDeleteNote(note.id)}
                          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">{note.content}</p>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 tabular-nums">
                      Saved {formatDate(note.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reminders' && (
          <div className="space-y-4">
            <form
              onSubmit={handleCreateReminder}
              className="rounded-xl border border-slate-800 bg-[#0D1117] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label htmlFor="reminder-title-input" className="sr-only">
                  Reminder Title
                </label>
                <input
                  id="reminder-title-input"
                  type="text"
                  value={newRemTitle}
                  onChange={(e) => setNewRemTitle(e.target.value)}
                  placeholder="What should ZARA remind you about?"
                  className="flex-1 rounded-lg border border-slate-800 bg-[#111827] px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />
                <label htmlFor="reminder-time-input" className="sr-only">
                  Reminder Time
                </label>
                <input
                  id="reminder-time-input"
                  type="text"
                  value={newRemTime}
                  onChange={(e) => setNewRemTime(e.target.value)}
                  placeholder="Time (e.g. 05:00 PM)"
                  className="w-40 rounded-lg border border-slate-800 bg-[#111827] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Reminder</span>
                </button>
              </div>
              {remError && <p className="mt-2 text-xs text-rose-400">{remError}</p>}
            </form>

            {filteredReminders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-[#0D1117]/50 px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-300">No reminders scheduled</p>
                <p className="mt-1 text-xs text-slate-500">
                  Add a reminder above or say &quot;remind me to call Ali at 6pm&quot;.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-[#0D1117]">
                {filteredReminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleReminder(rem.id, !rem.is_done)}
                      aria-label={`Mark reminder "${rem.title}" as ${rem.is_done ? 'incomplete' : 'complete'}`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {rem.is_done ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm ${
                            rem.is_done ? 'text-slate-500 line-through' : 'text-slate-100'
                          }`}
                        >
                          {rem.title}
                        </p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          Scheduled: {rem.remind_at}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete reminder "${rem.title}"`}
                      onClick={() => onDeleteReminder(rem.id)}
                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'studied' && (
          <div className="space-y-3">
            {filteredKnowledge.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-[#0D1117]/50 px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-300">No studied sources yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  Open Home &rarr; Neural Hub &rarr; Study &amp; Code to let ZARA read any book, software, or course.
                </p>
              </div>
            ) : (
              filteredKnowledge.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-[#0D1117] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                      <p className="mt-0.5 text-xs uppercase tracking-wide text-cyan-400">
                        {item.kind} {item.goal ? `· Goal: ${item.goal}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete studied item "${item.title}"`}
                      onClick={() => void onDeleteKnowledge(item.id)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-300" dir="auto">
                    {item.detailed_summary}
                  </p>
                  {item.action_plan.length > 0 && (
                    <ol className="mt-3 space-y-1 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
                      {item.action_plan.map((step, idx) => (
                        <li key={idx}>
                          {idx + 1}. {step}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'markdown' && (
          <div className="rounded-xl border border-slate-800 bg-[#0D1117] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-cyan-400" />
                <div>
                  <h2 className="text-sm font-semibold text-white">Synced MEMORY.md Vault</h2>
                  <p className="text-xs text-slate-400">
                    Live Markdown mirror of your memories, notes, reminders &amp; study logs on disk.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onRefreshMemoryMarkdown && (
                  <button
                    type="button"
                    disabled={refreshingMd}
                    onClick={async () => {
                      setRefreshingMd(true);
                      try {
                        await onRefreshMemoryMarkdown();
                      } finally {
                        setRefreshingMd(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#111827] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshingMd ? 'animate-spin' : ''}`} />
                    <span>Sync Now</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={!memoryMarkdown}
                  onClick={() => {
                    const blob = new Blob([memoryMarkdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'MEMORY.md';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  <HardDriveDownload className="h-3.5 w-3.5" />
                  <span>Download MEMORY.md</span>
                </button>
              </div>
            </div>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-[#0A101B] p-4 font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
              {memoryMarkdown || '- [System] ZARA Memory System Initialized.'}
            </pre>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.type === 'clear_all'
            ? 'Clear all stored memories?'
            : 'Delete this memory?'
        }
        description={
          pendingDelete?.type === 'clear_all'
            ? 'Kya aap saari memories delete karna chahte hain? This permanently clears long-term facts and preferences from SQLite.'
            : `Kya aap ye memory delete karna chahte hain? "${pendingDelete && pendingDelete.type === 'memory' ? pendingDelete.label : ''}"`
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
