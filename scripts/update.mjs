import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { update } from './lib/updater.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
try {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true;
    else if (args[i] === '--rollback') options.undo = true;
    else if (args[i] === '--file' && args[i + 1]) options.file = args[++i];
    else throw new Error('Usage: Update.bat [--check | --rollback | --file <release.zip>]');
  }
  if ([options.check, options.undo, !!options.file].filter(Boolean).length > 1) throw new Error('Choose one of --check, --rollback or --file');
  await update(root, options);
} catch (error) {
  console.error(`[update] ${error.message}`);
  process.exitCode = 1;
}
