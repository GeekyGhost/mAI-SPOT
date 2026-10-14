'use client';

import { useEffect } from 'react';
import type { Video } from '@/lib/types';
import { captureVideoFrame, uploadFile, api } from '@/lib/client';

const tried = new Set<string>();
let running = false;

/**
 * Videos dropped into content\video have no poster. Grab a frame in the browser (no ffmpeg needed
 * on your PC), save it as the thumbnail, and refresh once a batch is done.
 */
export function useAutoPosters(videos: Video[], onUpdated: () => void) {
  useEffect(() => {
    const todo = videos.filter(v => !v.thumbnail && !tried.has(v.id));
    if (!todo.length || running) return;
    running = true;
    (async () => {
      let changed = false;
      for (const v of todo) {
        tried.add(v.id);
        // First frame by default (skipping a black opening frame); can be changed in the video's editor.
        const blob = await captureVideoFrame(v.filePath, 0, { skipBlack: true });
        if (!blob) continue;
        try {
          const up = await uploadFile('thumbnail', blob, `poster_${v.id}.jpg`);
          await api('/api/videos', { method: 'PATCH', json: { id: v.id, thumbnail: up.url, posterMode: 'frame', posterTime: 0 } });
          changed = true;
        } catch {}
      }
      running = false;
      if (changed) onUpdated();
    })();
  }, [videos, onUpdated]);
}
