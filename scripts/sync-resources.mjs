#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function copy(source, destination) {
  const target = path.join(root, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, source), target);
}

// Single source of truth for warnOnce — copy into both process trees so the
// installed host/runner modules stay byte-identical and cannot drift.
copy('packages/shared/src/warn-once.ts', 'packages/host/src/warn-once.ts');
copy('packages/shared/src/warn-once.ts', 'packages/runner/src/warn-once.ts');
copy('packages/shared/src/warn-once.ts', 'skills/add-hosthooks/resources/host/warn-once.ts');
copy('packages/shared/src/warn-once.ts', 'skills/add-hosthooks/resources/runner/warn-once.ts');
copy('packages/host/src/hosthooks.ts', 'skills/add-hosthooks/resources/host/hosthooks.ts');
copy('packages/runner/src/hosthooks.ts', 'skills/add-hosthooks/resources/runner/hosthooks.ts');
console.log('Synced hosthooks resources');
