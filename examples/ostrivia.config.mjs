// A trial config for spectrail development: it uses the config of the
// Ostrivia monorepo, but writes the site into this repo (.example-build/),
// so the Ostrivia working tree does not change.
// Usage: OSTRIVIA_ROOT=/path/to/ostrivia_monorepo npm run example:dev
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.OSTRIVIA_ROOT;
if (!ROOT) throw new Error('Set OSTRIVIA_ROOT to the path of the Ostrivia monorepo.');

const { default: config } = await import(pathToFileURL(join(ROOT, 'spectrail', 'spectrail.config.mjs')).href);

export default {
  ...config,
  // A config file sets the root to its own folder by default; this file is in another repo.
  root: ROOT,
  workDir: new URL('../.example-build/ostrivia', import.meta.url).pathname,
};
