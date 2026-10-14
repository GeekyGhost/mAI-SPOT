'use client';

// Small browser-side helpers shared by the UI.

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Request failed (${res.status})`);
  }
  if (!res.ok || data?.success === false) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export type UploadKind = 'audio' | 'video' | 'thumbnail' | 'book' | 'app' | 'picture';

/** Stream a file to the node with progress (0..1). Resolves with the server's JSON. */
export function uploadFile(
  kind: UploadKind,
  file: File | Blob,
  name: string,
  meta: Record<string, unknown> = {},
  onProgress?: (p: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const album = typeof meta.album === 'string' ? `&album=${encodeURIComponent(meta.album)}` : '';
    xhr.open('POST', `/api/upload?kind=${kind}&name=${encodeURIComponent(name)}${album}`);
    xhr.setRequestHeader('x-meta', encodeURIComponent(JSON.stringify(meta)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400 || data.success === false) reject(new Error(data.error || `Upload failed (${xhr.status})`));
        else resolve(data);
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

export function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const s = Math.floor(secs % 60);
  const m = Math.floor((secs / 60) % 60);
  const h = Math.floor(secs / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDuration(secs: number): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (secs < 60) return `${Math.round(secs)}s`;
  return `${m}m`;
}

/** Deterministic gradient for things without artwork. */
export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 50 + (h % 90)) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 32%), hsl(${b} 75% 18%))`;
}

export function safeLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Grab a frame from a video URL as a JPEG blob.
 * `time` is in seconds (0 = the very first frame). With `skipBlack`, an almost-black frame
 * (common at the start of films) is replaced by one from ~10% in.
 */
export function captureVideoFrame(url: string, time = 0, opts: { skipBlack?: boolean } = {}): Promise<Blob | null> {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = url;
    let done = false;
    let retried = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), 20000);
    const seekTo = (t: number) => {
      const d = isFinite(v.duration) ? v.duration : 0;
      // Seeking to exactly 0 doesn't always fire "seeked"; a hair after works everywhere.
      v.currentTime = Math.min(Math.max(0.001, t), Math.max(0.001, d - 0.05));
    };
    v.onloadeddata = () => seekTo(time);
    v.onseeked = () => {
      try {
        const w = Math.min(1280, v.videoWidth || 1280);
        const h = Math.round(w * ((v.videoHeight || 720) / (v.videoWidth || 1280)));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(v, 0, 0, w, h);
        if (opts.skipBlack && !retried) {
          const px = ctx.getImageData(0, 0, w, h).data;
          let sum = 0;
          let n = 0;
          for (let i = 0; i < px.length; i += 4 * 97) {
            sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
            n++;
          }
          if (sum / n < 14 && isFinite(v.duration) && v.duration > 2) {
            retried = true;
            seekTo(v.duration * 0.1);
            return;
          }
        }
        c.toBlob(b => finish(b), 'image/jpeg', 0.85);
      } catch {
        finish(null);
      }
    };
    v.onerror = () => finish(null);
  });
}
