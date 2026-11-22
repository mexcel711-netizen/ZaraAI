import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeUsbDriveRoot, resolveSafeHomePath } from './security.mjs';

const execFileAsync = promisify(execFile);
import { cpus, freemem, homedir, hostname, totalmem, uptime } from 'node:os';

const HOST = '127.0.0.1';
const PORT = Number(process.env.NOVA_BRIDGE_PORT || 3210);
const TOKEN = process.env.NOVA_BRIDGE_TOKEN || randomBytes(24).toString('hex');

function isOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) return true;

    const allowed = new Set([
      'https://nova-ai.mexcel711.workers.dev',
      ...(process.env.NOVA_ALLOWED_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean),
    ]);
    return allowed.has(origin);
  } catch {
    return false;
  }
}

function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin || 'null',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getChromeExecutable() {
  if (process.platform !== 'win32') return 'google-chrome';
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  return roots.flatMap((root) => [join(root, 'Google/Chrome/Application/chrome.exe'), join(root, 'Chromium/Application/chrome.exe')]).find(existsSync) || 'chrome.exe';
}

function launchChrome(args = []) {
  const child = spawn(getChromeExecutable(), args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function safeWebUrl(value) {
  const target = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Only safe HTTP/HTTPS web addresses are allowed.');
  }
  return target.href;
}

async function getRemovableUsbDrives() {
  if (process.platform !== 'win32') return [];

  // Static PowerShell only: never interpolate a caller-supplied path or command.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
    "$drives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter \"DriveType = 2\" | ForEach-Object { $label = if ($_.VolumeName) { [string]$_.VolumeName } else { [string]$_.DeviceID }; [PSCustomObject]@{ path = ([string]$_.DeviceID + [char]92); label = $label; freeBytes = [int64]$_.FreeSpace; sizeBytes = [int64]$_.Size } })",
    "ConvertTo-Json -InputObject $drives -Compress",
  ].join('; ');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 10000, maxBuffer: 256 * 1024, encoding: 'utf8' },
  );
  const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((drive) => normalizeUsbDriveRoot(drive?.path))
    .map((drive) => ({
      path: normalizeUsbDriveRoot(drive.path),
      label: String(drive.label || drive.path),
      freeBytes: Number.isFinite(Number(drive.freeBytes)) ? Number(drive.freeBytes) : undefined,
      sizeBytes: Number.isFinite(Number(drive.sizeBytes)) ? Number(drive.sizeBytes) : undefined,
    }));
}

function launchApp(app) {
  if (app === 'chrome') { launchChrome(); return; }
  if (app === 'vscode') {
    const child = spawn(process.platform === 'win32' ? 'code.cmd' : 'code', [], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return;
  }
  if (app === 'terminal') {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', 'cmd'], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
    const child = spawn(process.platform === 'darwin' ? 'open' : 'x-terminal-emulator', process.platform === 'darwin' ? ['-a', 'Terminal'] : [], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  if (app === 'explorer' || app === 'task-manager' || app === 'settings') {
    if (process.platform === 'win32') {
      const command = app === 'task-manager' ? 'taskmgr.exe' : 'explorer.exe';
      const args = app === 'settings' ? ['ms-settings:'] : [];
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return;
    }
    if (app === 'settings') throw new Error('Settings shortcut is currently Windows-only.');
    const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [app === 'explorer' ? homedir() : 'htop'], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const candidates = app === 'edge'
      ? roots.map((root) => join(root, 'Microsoft/Edge/Application/msedge.exe'))
      : app === 'notepad'
        ? [join(process.env.WINDIR || 'C:/Windows', 'System32/notepad.exe')]
        : app === 'calculator'
          ? [join(process.env.WINDIR || 'C:/Windows', 'System32/calc.exe')]
          : [];
    const executable = candidates.find(existsSync) || (app === 'edge' ? 'msedge.exe' : undefined);
    if (!executable) throw new Error('App not found on this Windows installation.');
    const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return;
  }
  const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [app], { detached: true, stdio: 'ignore' });
  child.unref();
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const allowedOrigin = isOriginAllowed(origin);
  if (req.method === 'OPTIONS') {
    if (!allowedOrigin) return send(res, 403, { error: 'Origin not allowed' }, 'null');
    return send(res, 204, {}, origin);
  }
  if (!allowedOrigin) return send(res, 403, { error: 'Origin not allowed' }, 'null');
  if (!authorized(req)) return send(res, 401, { error: 'Pairing token required' }, origin);

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/v1/health') {
    return send(res, 200, {
      ok: true,
      platform: process.platform,
      hostname: hostname(),
      capabilities: [
        'chrome', 'chrome-new-tab', 'chrome-search', 'edge', 'vscode', 'terminal',
        'notepad', 'calculator', 'explorer', 'task-manager', 'settings',
        'known-folders', 'files-list', 'system-info', 'usb-list', 'usb-transfer',
      ],
    }, origin);
  }
  if (req.method === 'GET' && url.pathname === '/v1/system/info') {
    return send(res, 200, {
      ok: true,
      hostname: hostname(),
      platform: process.platform,
      cpuCount: cpus().length,
      cpuModel: cpus()[0]?.model || 'CPU',
      totalMemoryGb: Math.round((totalmem() / (1024 ** 3)) * 10) / 10,
      freeMemoryGb: Math.round((freemem() / (1024 ** 3)) * 10) / 10,
      uptimeMinutes: Math.round(uptime() / 60),
      homeDir: homedir(),
    }, origin);
  }
  if (req.method === 'GET' && url.pathname === '/v1/usb/list') {
    try {
      const drives = await getRemovableUsbDrives();
      return send(res, 200, { ok: true, drives }, origin);
    } catch (error) {
      return send(res, 503, {
        error: error instanceof Error ? error.message : 'Unable to scan removable USB drives.',
      }, origin);
    }
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' }, origin);

  let raw = '';
  const maxRequestBytes = url.pathname === '/v1/usb/transfer' ? 10 * 1024 * 1024 : 32 * 1024;
  for await (const part of req) {
    raw += part;
    if (Buffer.byteLength(raw, 'utf8') > maxRequestBytes) {
      return send(res, 413, { error: 'Request too large' }, origin);
    }
  }
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'Invalid JSON' }, origin); }

  try {
    if (url.pathname === '/v1/usb/transfer') {
      if (process.platform !== 'win32') {
        return send(res, 501, { error: 'Direct removable USB transfer is currently supported on Windows only.' }, origin);
      }
      const requestedDrive = normalizeUsbDriveRoot(body.drivePath);
      if (!requestedDrive) return send(res, 400, { error: 'Select a valid removable USB drive.' }, origin);

      const drives = await getRemovableUsbDrives();
      const drive = drives.find((item) => normalizeUsbDriveRoot(item.path) === requestedDrive);
      if (!drive) return send(res, 400, { error: 'That drive is not currently detected as a removable USB drive.' }, origin);

      if (typeof body.jsonContent !== 'string' || typeof body.markdownContent !== 'string') {
        return send(res, 400, { error: 'JSON and Markdown backup content are both required.' }, origin);
      }
      const contentBytes =
        Buffer.byteLength(body.jsonContent, 'utf8') + Buffer.byteLength(body.markdownContent, 'utf8');
      if (contentBytes > 9 * 1024 * 1024) {
        return send(res, 413, { error: 'Memory backup exceeds the 9MB transfer limit.' }, origin);
      }

      const backupDirectory = join(drive.path, 'ZARA-Memory-Backup');
      mkdirSync(backupDirectory, { recursive: true });
      const filePath = join(backupDirectory, 'zara-memory-latest.json');
      const markdownPath = join(backupDirectory, 'zara-memory-latest.md');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      writeFileSync(filePath, body.jsonContent, 'utf8');
      writeFileSync(markdownPath, body.markdownContent, 'utf8');
      writeFileSync(join(backupDirectory, `zara-memory-${stamp}.json`), body.jsonContent, 'utf8');
      return send(res, 200, { ok: true, drivePath: drive.path, filePath, markdownPath }, origin);
    }
    if (url.pathname === '/v1/launch') {
      const app = String(body.app || '').toLowerCase();
      if (!['chrome', 'edge', 'vscode', 'terminal', 'notepad', 'calculator', 'explorer', 'task-manager', 'settings'].includes(app)) {
        return send(res, 400, { error: 'This app is not on the safe launch allowlist.' }, origin);
      }
      launchApp(app);
      return send(res, 200, { ok: true, action: 'launch', app }, origin);
    }
    if (url.pathname === '/v1/open-location') {
      const target = resolveSafeHomePath(String(body.location || 'home'));
      const child = spawn(process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return send(res, 200, { ok: true, action: 'open-location', location: target }, origin);
    }
    if (url.pathname === '/v1/files/list') {
      const target = resolveSafeHomePath(String(body.location || 'downloads'));
      const entries = readdirSync(target, { withFileTypes: true }).slice(0, 40).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
      }));
      return send(res, 200, { ok: true, path: target, entries }, origin);
    }
    if (url.pathname === '/v1/chrome/new-tab') {
      const target = body.url ? safeWebUrl(body.url) : 'chrome://newtab';
      launchChrome(['--new-tab', target]);
      return send(res, 200, { ok: true, action: 'chrome-new-tab', url: target }, origin);
    }
    if (url.pathname === '/v1/chrome/search') {
      const query = String(body.query || '').trim().slice(0, 300);
      if (!query) return send(res, 400, { error: 'Search query is required.' }, origin);
      const target = 'https://www.google.com/search?q=' + encodeURIComponent(query);
      launchChrome(['--new-tab', target]);
      return send(res, 200, { ok: true, action: 'chrome-search', url: target }, origin);
    }
    if (url.pathname === '/v1/open-url') {
      const target = safeWebUrl(body.url);
      if (process.platform === 'win32') launchChrome(['--new-tab', target]);
      else { const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' }); child.unref(); }
      return send(res, 200, { ok: true, action: 'open-url', url: target }, origin);
    }
    return send(res, 404, { error: 'Not found' }, origin);
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : 'Desktop action failed.' }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log('\nZARA Desktop Companion');
  console.log(`Listening only on http://${HOST}:${PORT}`);
  console.log(`Pairing token: ${TOKEN}`);
  console.log('Enter this token in ZARA > Desktop Bridge or Settings > Laptop & Installer.\n');
});
