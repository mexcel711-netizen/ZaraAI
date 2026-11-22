import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPathSafelyInsideRoot, normalizeUsbDriveRoot, resolveSafeHomePath } from './security.mjs';

test('home path boundary rejects sibling-prefix and parent traversal escapes', () => {
  assert.equal(isPathSafelyInsideRoot('/home/alice/Documents', '/home/alice'), true);
  assert.equal(isPathSafelyInsideRoot('/home/alice', '/home/alice'), true);
  assert.equal(isPathSafelyInsideRoot('/home/alice-evil/secret', '/home/alice'), false);
  assert.equal(isPathSafelyInsideRoot('/etc/passwd', '/home/alice'), false);
});

test('only named home folders can be resolved', () => {
  const home = join(tmpdir(), 'zara-safe-home');
  assert.equal(resolveSafeHomePath('documents', home), join(home, 'Documents'));
  assert.equal(resolveSafeHomePath('home', home), home);
  assert.throws(() => resolveSafeHomePath('../outside', home), /known folders/);
  assert.throws(() => resolveSafeHomePath(join(home, 'Documents'), home), /known folders/);
});

test('an existing home-folder symlink cannot escape the home directory', (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'zara-path-test-'));
  const home = join(parent, 'home');
  const outside = join(parent, 'outside');
  mkdirSync(home);
  mkdirSync(outside);
  try {
    try {
      symlinkSync(outside, join(home, 'Documents'), 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        t.skip('This Windows account cannot create directory symlinks.');
        return;
      }
      throw error;
    }
    assert.throws(() => resolveSafeHomePath('documents', home), /outside your home directory/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
test('USB drive paths must be exact Windows drive roots', () => {
  const slash = String.fromCharCode(92);
  assert.equal(normalizeUsbDriveRoot(`e:${slash}`), `E:${slash}`);
  assert.equal(normalizeUsbDriveRoot(`E:${slash}folder`), null);
  assert.equal(normalizeUsbDriveRoot(`${slash}${slash}server${slash}share`), null);
  assert.equal(normalizeUsbDriveRoot('E:'), null);
});
