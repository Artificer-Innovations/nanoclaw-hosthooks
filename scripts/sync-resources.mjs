#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  ['packages/host/src/hosthooks.ts', 'skills/add-hosthooks/resources/host/hosthooks.ts'],
  ['packages/runner/src/hosthooks.ts', 'skills/add-hosthooks/resources/runner/hosthooks.ts'],
];

for (const [source, destination] of copies) {
  const target = path.join(root, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, source), target);
}
console.log('Synced hosthooks resources');
