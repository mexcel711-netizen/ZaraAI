import { useState } from 'react';
import { CheckCircle2, FolderOpen, Link2, Monitor, Play, Terminal, Unplug, Usb } from 'lucide-react';

import {
  fetchDesktopSystemInfo,
  getDesktopBridgeToken,
  listDesktopFiles,
  listUsbDrives,
  openChromeNewTab,
  openDesktopLocation,
  runDesktopApp,
  TOKEN_KEY,
} from '../lib/desktopBridge';

export function DesktopBridgePanel() {
  const [token, setToken] = useState(() => getDesktopBridgeToken());
  const [status, setStatus] = useState<'idle' | 'connected' | 'offline'>('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fileListing, setFileListing] = useState<string[]>([]);

  const connect = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('http://127.0.0.1:3210/v1/health', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      const data = (await response.json()) as { error?: string; capabilities?: string[] };
      if (!response.ok) throw new Error(data.error || 'Companion not reachable');
      localStorage.setItem(TOKEN_KEY, token.trim());
      setToken(token.trim());
      setStatus('connected');
      setMessage(`Connected · ${(data.capabilities || []).length} capabilities`);
    } catch (error) {
      setStatus('offline');
      setMessage(error instanceof Error ? error.message : 'Companion unavailable');
    } finally {
      setBusy(false);
    }
  };

  const newTab = async () => {
    setBusy(true);
    setMessage('');
    try {
      await openChromeNewTab();
      setStatus('connected');
      setMessage('Chrome new tab opened');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Chrome tab action failed');
      setStatus('offline');
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async (folder: string) => {
    setBusy(true);
    setMessage('');
    try {
      await openDesktopLocation(folder);
      setStatus('connected');
      setMessage(`${folder} folder opened`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder action failed');
      setStatus('offline');
    } finally {
      setBusy(false);
    }
  };

  const launch = async (app: string) => {
    setBusy(true);
    setMessage('');
    try {
      await runDesktopApp(app);
      setStatus('connected');
      setMessage(`${app} launch request sent`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
      setStatus('offline');
    } finally {
      setBusy(false);
    }
  };

  const inspectSys = async () => {
    setBusy(true);
    setMessage('');
    try {
      const info = await fetchDesktopSystemInfo();
      setStatus('connected');
      setMessage(
        `${info.hostname} · ${info.platform} · ${info.cpuCount} CPUs · ${info.freeMemoryGb}/${info.totalMemoryGb} GB RAM free`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'System info failed');
      setStatus('offline');
    } finally {
      setBusy(false);
    }
  };

  const inspectDownloads = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await listDesktopFiles('downloads');
      setStatus('connected');
      setFileListing(
        res.entries.slice(0, 6).map((e) => `${e.type === 'dir' ? '[DIR]' : '[FILE]'} ${e.name}`)
      );
      setMessage(`Listed ${res.entries.length} entries in ${res.path}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder list failed');
      setStatus('offline');
    } finally {
      setBusy(false);
    }
  };

  const inspectUsbDrives = async () => {
    setBusy(true);
    setMessage('');
    try {
      const drives = await listUsbDrives();
      setStatus('connected');
      setFileListing(drives.map((d) => `[USB] ${d.label} (${d.path})`));
      setMessage(
        drives.length > 0
          ? `Detected ${drives.length} removable USB drive(s)`
          : 'No removable USB drive detected on companion laptop'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'USB scan failed');
      setStatus('offline');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="mt-4 w-full rounded-xl border border-cyan-500/20 bg-slate-950/70 p-3 text-left shadow-[0_0_28px_rgba(0,190,230,0.05)]"
      aria-label="Desktop Bridge"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Monitor className="h-4 w-4 text-cyan-300" /> Laptop Desktop Bridge
        </div>
        <span
          className={`px-2 py-0.5 text-[11px] font-medium ${
            status === 'connected'
              ? 'text-emerald-300'
              : status === 'offline'
                ? 'text-rose-300'
                : 'text-slate-400'
          }`}
        >
          {status === 'connected' ? 'Connected' : status === 'offline' ? 'Offline' : 'Not paired'}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Desktop companion pairing token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste pairing token from companion terminal"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy || !token.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5" /> Pair
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void newTab()}
          disabled={busy || !token.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200 hover:border-cyan-400 disabled:opacity-40"
        >
          <Play className="h-3 w-3" /> Chrome Tab
        </button>
        {(
          ['chrome', 'vscode', 'terminal', 'notepad', 'calculator', 'explorer', 'task-manager', 'settings'] as const
        ).map((app) => (
          <button
            key={app}
            type="button"
            onClick={() => void launch(app)}
            disabled={busy || !token.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
          >
            <Terminal className="h-3 w-3" />{' '}
            {app === 'task-manager'
              ? 'Task Mgr'
              : app === 'vscode'
                ? 'VS Code'
                : app[0].toUpperCase() + app.slice(1)}
          </button>
        ))}
        {(['downloads', 'desktop', 'documents'] as const).map((folder) => (
          <button
            key={folder}
            type="button"
            onClick={() => void openFolder(folder)}
            disabled={busy || !token.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
          >
            <FolderOpen className="h-3 w-3" /> {folder[0].toUpperCase() + folder.slice(1)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void inspectSys()}
          disabled={busy || !token.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
        >
          Sys Info
        </button>
        <button
          type="button"
          onClick={() => void inspectDownloads()}
          disabled={busy || !token.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
        >
          List Downloads
        </button>
        <button
          type="button"
          onClick={() => void inspectUsbDrives()}
          disabled={busy || !token.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
        >
          <Usb className="h-3 w-3" /> Scan USB
        </button>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(TOKEN_KEY);
            setToken('');
            setStatus('idle');
            setFileListing([]);
            setMessage('Pairing token cleared from this browser');
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-rose-300"
        >
          <Unplug className="h-3 w-3" /> Unpair
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-300">
          {status === 'connected' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          {message}
        </p>
      )}
      {fileListing.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-lg border border-slate-800 bg-slate-900/70 p-2 font-mono text-[11px] text-slate-300">
          {fileListing.map((f) => (
            <li key={f} className="truncate">
              {f}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Install the local companion from Settings &rarr; Laptop &amp; Installer so anyone can run ZARA on Windows, macOS, or Linux.
      </p>
    </section>
  );
}
