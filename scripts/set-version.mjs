// Sets one version on all packages, and on the links between them.
// Usage: npm run set-version -- 0.2.0
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version || '')) {
  console.error('Give a version, for example: npm run set-version -- 0.2.0');
  process.exit(1);
}

const dir = new URL('../packages/', import.meta.url).pathname;
const files = readdirSync(dir).map((p) => join(dir, p, 'package.json'));
const names = new Set(files.map((f) => JSON.parse(readFileSync(f, 'utf8')).name));
// A peer range accepts the patch and minor versions of one 0.x line, or one major line.
const [major, minor] = version.split('.');
const peer = major === '0' ? `^0.${minor}.0` : `^${major}.0.0`;

for (const f of files) {
  const pkg = JSON.parse(readFileSync(f, 'utf8'));
  pkg.version = version;
  for (const name of Object.keys(pkg.dependencies || {})) if (names.has(name)) pkg.dependencies[name] = version;
  for (const name of Object.keys(pkg.peerDependencies || {})) if (names.has(name)) pkg.peerDependencies[name] = peer;
  writeFileSync(f, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${pkg.name}@${version}`);
}
console.log('Run `npm install` to update package-lock.json.');
