// Reads the OpenSpec state through the CLI of the project, so the dashboard
// shows the same numbers as `openspec view`.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// openspecBin(root) -> [command, ...args] that starts the OpenSpec CLI.
// It prefers the copy in the project, then an `openspec` on the PATH.
function openspecBin(root) {
  try {
    const req = createRequire(join(root, 'package.json'));
    const pkgFile = req.resolve('@fission-ai/openspec/package.json');
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.openspec;
    const file = join(dirname(pkgFile), bin);
    if (existsSync(file)) return [process.execPath, file];
  } catch {
    // Not installed in the project.
  }
  return ['openspec'];
}

async function json(root, args) {
  const [cmd, ...pre] = openspecBin(root);
  try {
    const { stdout } = await run(cmd, [...pre, ...args, '--json'], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('The OpenSpec CLI is not installed. Run: npm i -D @fission-ai/openspec');
    }
    throw new Error(`openspec ${args.join(' ')} failed: ${err.stderr || err.message}`);
  }
}

// loadOpenspec(root) -> { changes: [{ name, completedTasks, totalTasks, lastModified,
//   status, artifacts }], specs: [{ id, requirementCount }] }
// status is `no-tasks`, `in-progress` or `complete`, as `openspec list` gives it.
export async function loadOpenspec(root) {
  const [list, specs] = await Promise.all([
    json(root, ['list']),
    json(root, ['list', '--specs']),
  ]);
  const changes = list.changes || [];
  await Promise.all(
    changes.map(async (c) => {
      try {
        const st = await json(root, ['status', '--change', c.name]);
        c.schema = st.schemaName;
        c.artifacts = (st.artifacts || []).map((a) => ({ id: a.id, status: a.status }));
      } catch {
        c.artifacts = [];
      }
    }),
  );
  return { changes, specs: specs.specs || [] };
}
