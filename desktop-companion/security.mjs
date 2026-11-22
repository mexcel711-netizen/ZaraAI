import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function isPathSafelyInsideRoot(candidatePath, rootPath) {
  const root = resolve(rootPath);
  const candidate = resolve(candidatePath);
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function resolveSafeHomePath(location = 'home', homeDirectory = process.env.USERPROFILE || process.env.HOME || '.') {
  const folders = {
    desktop: 'Desktop',
    downloads: 'Downloads',
    documents: 'Documents',
    pictures: 'Pictures',
    music: 'Music',
    videos: 'Videos',
    home: '',
  };
  const key = String(location || 'home').trim().toLowerCase();
  if (!Object.hasOwn(folders, key)) {
    throw new Error('Only known folders inside your home directory can be opened.');
  }

  const home = resolve(homeDirectory);
  const target = resolve(home, folders[key]);
  if (!isPathSafelyInsideRoot(target, home)) {
    throw new Error('Requested folder is outside your home directory.');
  }

  // Resolve existing symlinks as well: a harmless-looking folder inside Home must
  // not be allowed to redirect file listing outside Home.
  try {
    const realHome = realpathSync(home);
    const realTarget = realpathSync(target);
    if (!isPathSafelyInsideRoot(realTarget, realHome)) {
      throw new Error('Requested folder resolves outside your home directory.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return target;
}

export function normalizeUsbDriveRoot(value) {
  const candidate = String(value || '').trim();
  return candidate.length === 3 && /^[a-z]:/i.test(candidate) && candidate.charCodeAt(2) === 92
    ? candidate.toUpperCase()
    : null;
}
