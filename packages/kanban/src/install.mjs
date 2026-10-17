// Writes the `/opsx:idea` command for Claude Code into the project.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'idea.md');
const TARGET = ['.claude', 'commands', 'opsx', 'idea.md'];

// installIdeaCommand(ctx, { ideasDir, force }) -> exit code.
// `openspec update` deletes only the command files of its own workflows, so this file stays.
export function installIdeaCommand(ctx, { ideasDir, force = false }) {
  const content = readFileSync(TEMPLATE, 'utf8').replaceAll('{{IDEAS_DIR}}', ideasDir);
  const target = join(ctx.root, ...TARGET);
  if (existsSync(target)) {
    if (readFileSync(target, 'utf8') === content) {
      console.log(`[kanban] ${TARGET.join('/')} is up to date`);
      return 0;
    }
    if (!force) {
      console.error(`[kanban] ${TARGET.join('/')} exists and is different. Add --force to replace it.`);
      return 1;
    }
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`[kanban] wrote ${TARGET.join('/')} (ideas folder: ${ideasDir}/)`);
  return 0;
}
