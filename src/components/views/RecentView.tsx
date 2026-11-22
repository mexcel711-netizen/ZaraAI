import { useEffect, useState } from 'react';
import { ArrowRight, Search, Trash2 } from 'lucide-react';
import type { ChatMessage, SessionSummary } from '../../types/nova';

interface RecentViewProps {
  assistantName?: string;
  sessions: SessionSummary[];
  activeSessionId: string;
  onResumeSession: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
}

export function RecentView({
  assistantName = 'ZARA',
  sessions,
  activeSessionId,
  onResumeSession,
  onDeleteSession,
}: RecentViewProps) {
  const [search, setSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    sessions[0]?.session_id ?? null
  );
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const filteredSessions = sessions.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.preview.toLowerCase().includes(q) || s.session_id.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].session_id);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setTranscript([]);
      return;
    }
    let cancelled = false;
    setLoadingTranscript(true);
    fetch(`/api/conversations/${encodeURIComponent(selectedSessionId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load transcript');
        return r.json();
      })
      .then((data: { messages?: ChatMessage[] }) => {
        if (!cancelled) {
          setTranscript(data.messages ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTranscript([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTranscript(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Recent Sessions</h1>
          <p className="mt-1 text-sm text-slate-400">
            Browse archived conversations from SQLite or resume any thread on the Home stage.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <label htmlFor="recent-search-input" className="sr-only">
            Search conversation history
          </label>
          <input
            id="recent-search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcripts..."
            className="w-60 rounded-lg border border-slate-800 bg-[#0D1117] py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Sessions List */}
        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-800 bg-[#0D1117] lg:col-span-5">
          {filteredSessions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-300">No sessions recorded</p>
              <p className="mt-1 text-xs text-slate-500">
                Start a conversation in Home to save sessions here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filteredSessions.map((sess) => {
                const isSelected = sess.session_id === selectedSessionId;
                const isCurrent = sess.session_id === activeSessionId;
                return (
                  <div
                    key={sess.session_id}
                    className={`flex items-start justify-between gap-3 p-4 transition-colors ${
                      isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(sess.session_id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-slate-100">
                        {sess.preview || 'Untitled Session'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span>{sess.message_count} turns</span>
                        <span aria-hidden="true">·</span>
                        <span>{sess.primary_language === 'ur' ? 'Urdu' : 'English'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(sess.last_message_at)}</span>
                        {isCurrent && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-cyan-400">Active</span>
                          </>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete session "${sess.preview || sess.session_id}"`}
                      onClick={async () => {
                        await onDeleteSession(sess.session_id);
                        if (selectedSessionId === sess.session_id) {
                          setSelectedSessionId(null);
                        }
                      }}
                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transcript Inspector */}
        <div className="flex min-h-0 flex-col rounded-xl border border-slate-800 bg-[#0D1117] lg:col-span-7">
          {selectedSessionId ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white">Session Transcript</h2>
                  <p className="truncate font-mono text-xs text-slate-500">{selectedSessionId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onResumeSession(selectedSessionId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap shrink-0"
                >
                  <span>Resume in Home</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {loadingTranscript ? (
                  <p className="text-xs text-slate-400">Loading transcript...</p>
                ) : transcript.length === 0 ? (
                  <p className="text-xs text-slate-500">No messages in this session.</p>
                ) : (
                  transcript.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-3.5 text-sm ${
                        msg.role === 'user'
                          ? 'border-cyan-500/20 bg-cyan-500/5 text-slate-100'
                          : 'border-slate-800 bg-[#111827] text-slate-200'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="font-medium text-slate-300">
                          {msg.role === 'user' ? 'You' : assistantName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(msg.timestamp)}</span>
                        {msg.thinkingUsed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sky-400">High Thinking</span>
                          </>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="text-sm text-slate-500">
                Select a conversation session on the left to inspect its transcript.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
