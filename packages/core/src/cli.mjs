import { build, check, dev, prepare } from './commands.mjs';
import { loadConfig } from './config.mjs';
import { createContext } from './context.mjs';

const USAGE = `Usage: spectrail <dev|build|check|prepare> [--config <file>] [--port <n>] [--force]`;

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

// pluginCommand(ctx, command, args) -> the exit code of a command that a plugin adds, or null.
// A plugin adds commands with `commands: { name: { describe, run(ctx, args) } }`.
async function pluginCommand(ctx, command, args) {
  const owner = ctx.config.plugins.find((p) => p.commands?.[command]);
  if (!owner) return null;
  return (await owner.commands[command].run(ctx, args.slice(1))) || 0;
}

// unknownCommand(ctx, command) -> exit code 1, after a message with the plugin commands.
function unknownCommand(ctx, command) {
  const extra = ctx.config.plugins.flatMap((p) =>
    Object.entries(p.commands || {}).map(([name, c]) => `  ${name.padEnd(22)} ${c.describe || ''} (${p.name})`));
  console.error(`Unknown command: ${command}\n${USAGE}${extra.length ? `\nPlugin commands:\n${extra.join('\n')}` : ''}`);
  return 1;
}

// runCommand(ctx, args) -> exit code of the command in args[0].
async function runCommand(ctx, args) {
  const command = args[0];
  const force = args.includes('--force');
  switch (command) {
    case 'dev':
      await dev(ctx, { port: Number(option(args, '--port') || process.env.PORT || 0) || undefined });
      return 0;
    case 'build':
      await build(ctx, { force });
      return 0;
    case 'check':
      return await check(ctx, { force });
    case 'prepare':
      await prepare(ctx, { force });
      return 0;
    default:
      return (await pluginCommand(ctx, command, args)) ?? unknownCommand(ctx, command);
  }
}

// main(args) -> exit code. The dev command keeps the process open.
export async function main(args) {
  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  try {
    const ctx = createContext(await loadConfig(option(args, '--config')));
    return await runCommand(ctx, args);
  } catch (err) {
    console.error(`[spectrail] ERROR: ${err.message}`);
    return 1;
  }
}
