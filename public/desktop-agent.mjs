import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cpus, freemem, homedir, hostname, totalmem, uptime } from 'node:os';

const HOST = '127.0.0.1';
const PORT = Number(process.env.NOVA_BRIDGE_PORT || 3210);
const TOKEN = process.env.NOVA_BRIDGE_TOKEN || randomBytes(24).toString('hex');

function isOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.protocol === 'https:' && (u.hostname.endsWith('.workers.dev') || u.hostname.endsWith('.run.app') || u.hostname.endsWith('.pages.dev'))) {
      return true;
    }
    const extra = (process.env.NOVA_ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    return extra.includes(origin);
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

function resolveSafeHomePath(relativeOrNamed = 'home') {
  const home = homedir();
  const named = {
    desktop: join(home, 'Desktop'),
    downloads: join(home, 'Downloads'),
    documents: join(home, 'Documents'),
    pictures: join(home, 'Pictures'),
    music: join(home, 'Music'),
    videos: join(home, 'Videos'),
    home,
  };
  const key = String(relativeOrNamed || 'home').toLowerCase().trim();
  if (named[key]) return named[key];
  const resolved = resolve(home, String(relativeOrNamed));
  if (!resolved.startsWith(resolve(home))) {
    throw new Error('Path must stay inside your user home directory.');
  }
  return resolved;
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
        'known-folders', 'files-list', 'files-read', 'system-info',
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
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' }, origin);

  let raw = '';
  for await (const part of req) {
    raw += part;
    if (raw.length > 32000) return send(res, 413, { error: 'Request too large' }, origin);
  }
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'Invalid JSON' }, origin); }

  try {
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
    if (url.pathname === '/v1/files/read') {
      const target = resolveSafeHomePath(String(body.path || ''));
      const st = statSync(target);
      if (st.size > 150000) return send(res, 400, { error: 'File exceeds 150KB read limit.' }, origin);
      const content = readFileSync(target, 'utf8');
      return send(res, 200, { ok: true, path: target, content }, origin);
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
