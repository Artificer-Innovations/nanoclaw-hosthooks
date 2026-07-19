#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNanoclawRoot } from './paths.js';
import {
  printInstallNextSteps,
  runInstall,
  runUninstall,
  runUpgrade,
  runVerify,
  syncSkillToFork,
} from './install.js';

export function parseArgs(argv: string[]): { command: string; path?: string } {
  const args = argv.slice(2);
  const command = args[0] ?? 'help';
  let pathArg: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--path' && args[index + 1]) {
      pathArg = args[index + 1];
      index += 1;
    }
  }
  return { command, path: pathArg };
}

export function runCommand(argv: string[]): number {
  const { command, path: root } = parseArgs(argv);
  try {
    switch (command) {
      case 'install': {
        printInstallNextSteps(runInstall(root));
        return 0;
      }
      case 'upgrade': {
        printInstallNextSteps(runUpgrade(root), { upgraded: true });
        return 0;
      }
      case 'sync-skill': {
        const nanoclawRoot = root ?? findNanoclawRoot();
        console.log(`Synced skill → ${syncSkillToFork(nanoclawRoot)}`);
        return 0;
      }
      case 'verify': {
        const result = runVerify(root);
        if (!result.ok) {
          console.error('Verification failed:');
          for (const issue of result.issues) console.error(`  - ${issue}`);
          return 1;
        }
        console.log(`Verification passed for ${result.root}`);
        return 0;
      }
      case 'uninstall': {
        const result = runUninstall(root);
        console.log(`Removed hosthooks from ${result.root}`);
        console.log(`Restored ${result.changed.length} files; removed ${result.removed.length} resources.`);
        console.log('\nOptional: pnpm remove nanoclaw-hosthooks');
        console.log('Then: pnpm run build && ./container/build.sh && restart host');
        return 0;
      }
      default:
        console.log(`Usage: nanoclaw-hosthooks <command> [--path <nanoclaw-root>]

Commands:
  install      Install all host and runner hook call sites atomically
  upgrade      Re-apply the idempotent installer
  sync-skill   Copy the bundled skill to .claude/skills/add-hosthooks/
  verify       Verify all six capabilities and copied registries
  uninstall    Restore stock call sites and remove registry modules
`);
        return command === 'help' ? 0 : 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

export function isCliEntry(entryPath: string, argv: string[]): boolean {
  if (!argv[1]) return false;
  try {
    return realpathSync(entryPath) === realpathSync(path.resolve(argv[1]));
  } catch {
    return entryPath === argv[1];
  }
}

export function main(): void {
  process.exit(runCommand(process.argv));
}

/* v8 ignore start */
if (isCliEntry(fileURLToPath(import.meta.url), process.argv)) main();
/* v8 ignore stop */
