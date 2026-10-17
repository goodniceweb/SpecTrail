#!/usr/bin/env node
// The same CLI as @spectrail/core, so `npx spectrail` works with the meta package only.
import { main } from '@spectrail/core/cli';

process.exitCode = await main(process.argv.slice(2));
