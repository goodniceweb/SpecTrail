#!/usr/bin/env node
// spectrail <command> [--config <file>] [--port <n>] [--force]
//   dev      build the site, serve it, and rebuild on each change
//   build    write the static site to <workDir>/dist
//   check    run the plugin checks; exit code 1 on an error
//   prepare  run the slow plugin steps only (for example the screen export)
import { main } from '../src/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
