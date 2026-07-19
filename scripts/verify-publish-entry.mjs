#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'dist/cli/bin.js',
  'api-contract.md',
  'skills/add-hosthooks/SKILL.md',
  'skills/add-hosthooks/resources/host/hosthooks.ts',
  'skills/add-hosthooks/resources/host/warn-once.ts',
  'skills/add-hosthooks/resources/runner/hosthooks.ts',
  'skills/add-hosthooks/resources/runner/warn-once.ts',
];
const missing = required.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
if (missing.length > 0) {
  console.error(`Missing publish artifacts: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Publish entry OK');
