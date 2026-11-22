import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'desktop-companion/agent.mjs');
const securitySource = resolve(root, 'desktop-companion/security.mjs');
const destination = resolve(root, 'public/desktop-agent.mjs');
const securityDestination = resolve(root, 'public/security.mjs');

if (!existsSync(source) || !existsSync(securitySource)) {
  throw new Error('desktop-companion/agent.mjs and security.mjs are required to build the desktop installer.');
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
copyFileSync(securitySource, securityDestination);
console.log('Synced desktop companion and security helper into the Worker static assets.');
