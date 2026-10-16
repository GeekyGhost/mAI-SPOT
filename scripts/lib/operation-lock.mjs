import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { safePath } from './update-files.mjs';

const alive = pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};

function writeLock(file, info, exclusive = false) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    // Publish only a complete record. Writing operation.json directly can leave it
    // empty if the launcher is interrupted between truncating and writing it.
    fs.writeFileSync(temp, JSON.stringify(info), { flag: 'wx', mode: 0o600 });
    if (exclusive) fs.linkSync(temp, file);
    else fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

export function portBusy(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Could not check whether the Spot is running. Close it and retry.')); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve(false) : reject(new Error(`Could not check the Spot port: ${error.code}`)));
  });
}

export function claimOperation(root, operation, { allowPending = false } = {}) {
  if (!allowPending && fs.existsSync(safePath(root, '.updates/pending.json'))) throw new Error('An interrupted update needs recovery. Run Update.bat --rollback or ./update.sh --rollback before launching.');
  const file = safePath(root, '.updates/operation.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const info = { pid: process.pid, child: null, operation, token: crypto.randomBytes(12).toString('hex') };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeLock(file, info, true);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          if (JSON.parse(fs.readFileSync(file, 'utf8')).token === info.token) fs.unlinkSync(file);
        } catch {}
        process.off('exit', release);
      };
      process.once('exit', release);
      return { token: info.token, release, child(pid) {
        if (released || JSON.parse(fs.readFileSync(file, 'utf8')).token !== info.token) throw new Error('The Spot operation lock was lost. Close the Spot and retry.');
        const next = { ...info, child: pid };
        writeLock(file, next);
        info.child = pid;
      } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous, text;
      try {
        text = fs.readFileSync(file, 'utf8'); previous = JSON.parse(text);
        if (!previous || !Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw new Error('Invalid lock owner');
      } catch (readError) {
        if (readError.code === 'ENOENT') continue;
        throw new Error('The operation lock (.updates/operation.json) is incomplete or damaged. Close all Spot and updater windows, remove only that file, then retry. Keep the rest of .updates for update recovery.');
      }
      if (alive(previous.pid) || alive(previous.child)) throw new Error(`The Spot is busy (${previous.operation || 'another operation'}). Close it before updating or starting another copy.`);
      try { if (fs.readFileSync(file, 'utf8') === text) fs.unlinkSync(file); }
      catch (readError) { if (readError.code !== 'ENOENT') throw readError; }
    }
  }
  throw new Error('Could not acquire the Spot operation lock. Please retry.');
}

// The launcher holds one lock across dependency setup, build and the running server.
export function childOperation(root, operation) {
  const file = safePath(root, '.updates/operation.json');
  try {
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (owner.token === process.env.MAISPOT_LAUNCH_LOCK && owner.pid === process.ppid && alive(owner.pid)) return () => {};
  } catch {}
  return claimOperation(root, operation).release;
}
