import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'desktop-companion/agent.mjs');
const destination = resolve(root, 'public/desktop-agent.mjs');

if (!existsSync(source)) {
  throw new Error('desktop-companion/agent.mjs is required to build the desktop installer.');
}
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log('Synced desktop companion into the Worker static assets.');
