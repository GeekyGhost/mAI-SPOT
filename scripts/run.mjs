import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { claimOperation, portBusy } from './lib/operation-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let lock, child, stopping = false;
try {
  lock = claimOperation(root, 'running or preparing the Spot');
  const port = Number(process.env.PORT || 8088);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  if (await portBusy(port)) throw new Error(`Port ${port} is already in use. Close the existing Spot before launching another copy.`);
  const env = { ...process.env, MAISPOT_LAUNCH_LOCK: lock.token };
  const dev = process.argv.includes('--dev') ? ['--dev'] : [];
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    stopping = true;
    // Windows delivers console Ctrl+C to both processes. kill(SIGINT) would terminate
    // the child immediately there, skipping its normal data flush and shutdown.
    if (!(process.platform === 'win32' && signal === 'SIGINT')) child?.kill(signal);
  });
  const run = script => new Promise((resolve, reject) => {
    child = spawn(process.execPath, [script, ...dev], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    let failure;
    child.once('error', error => { failure = error; });
    child.once('close', code => {
      try { lock.child(null); } catch (error) { failure ||= error; }
      if (failure) reject(failure);
      else resolve(code ?? 1);
    });
    try { lock.child(child.pid || null); }
    catch (error) {
      // Retain the parent lock until the child is gone if recording its PID fails.
      failure = error;
      child.kill();
    }
  });
  const setup = await run('scripts/preflight.mjs');
  if (setup !== 0 || stopping) process.exitCode = setup || 1;
  else {
    let opener;
    if (process.argv.includes('--open')) {
      opener = setTimeout(() => {
        const port = Number(process.env.PORT || 8088);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return;
        const url = `http://localhost:${port}`;
        const command = process.platform === 'win32' ? 'powershell.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        const args = process.platform === 'win32' ? ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process '${url}'`] : [url];
        const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
        browser.on('error', () => {}); browser.unref();
      }, 5000);
    }
    process.exitCode = await run('server.mjs');
    clearTimeout(opener);
  }
} catch (error) {
  console.error(`[mAI Spot] ${error.message}`);
  process.exitCode = 1;
} finally { lock?.release(); }
