'use client';

import React, { useEffect, useRef } from 'react';
import type { VisualizerMode } from '@/lib/types';

export const VISUALIZER_MODES: { id: VisualizerMode; label: string }[] = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'scope', label: 'Oscilloscope' },
  { id: 'radial', label: 'Radial' },
  { id: 'horizon', label: 'Horizon' }
];

interface Props {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  mode: VisualizerMode;
  /** Main colour; defaults to the station accent. */
  color?: string;
  className?: string;
  /** Darker LCD-style background for the PulseAmp skin. */
  lcd?: boolean;
  coverUrl?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [46, 232, 247];
}

/** Canvas visualizer driven by the engine's AnalyserNode. Sizes itself to its container. */
export const Visualizer: React.FC<Props> = ({ analyser, isPlaying, mode, color, className = '', lcd, coverUrl }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaks = useRef<number[]>([]);
  const coverImg = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!coverUrl) {
      coverImg.current = null;
      return;
    }
    const img = new Image();
    img.src = coverUrl;
    img.onload = () => (coverImg.current = img);
  }, [coverUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const accent =
      color ||
      getComputedStyle(document.documentElement).getPropertyValue('--spot-accent').trim() ||
      '#2ee8f7';
    const [r, g, b] = hexToRgb(accent);
    const freq = new Uint8Array(analyser ? analyser.frequencyBinCount : 1024);
    const wave = new Uint8Array(analyser ? analyser.fftSize : 2048);
    let raf = 0;
    let t = 0;

    const bandValue = (i: number, n: number) => {
      // Log-spaced bands so bass and treble both get room.
      const minBin = 2;
      const maxBin = Math.floor(freq.length * 0.7);
      const lo = Math.floor(minBin * Math.pow(maxBin / minBin, i / n));
      const hi = Math.max(lo + 1, Math.floor(minBin * Math.pow(maxBin / minBin, (i + 1) / n)));
      let s = 0;
      for (let k = lo; k < hi; k++) s += freq[k];
      return s / (hi - lo) / 255;
    };

    const draw = () => {
      t += 1;
      const active = !!analyser && isPlaying;
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(wave);
      }
      if (!active) {
        freq.fill(0);
        wave.fill(128);
      }
      ctx.clearRect(0, 0, w, h);
      if (lcd) {
        ctx.fillStyle = '#050d07';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0,60,25,0.35)';
        ctx.lineWidth = 1;
        for (let y = 4; y < h; y += 4) {
          ctx.beginPath();
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(w, y + 0.5);
          ctx.stroke();
        }
      }

      if (mode === 'spectrum') {
        const n = Math.max(12, Math.min(64, Math.floor(w / 9)));
        const gap = 2;
        const bw = (w - gap * (n - 1)) / n;
        if (peaks.current.length !== n) peaks.current = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          const v = active ? bandValue(i, n) : 0.02 + 0.015 * Math.sin(t / 20 + i / 2);
          const bh = Math.max(2, v * h * 0.95);
          const x = i * (bw + gap);
          const grad = ctx.createLinearGradient(0, h, 0, h - bh);
          if (lcd) {
            grad.addColorStop(0, '#00ff66');
            grad.addColorStop(0.6, '#ffb000');
            grad.addColorStop(1, '#ff3333');
          } else {
            grad.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},1)`);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x, h - bh, bw, bh);
          peaks.current[i] = Math.max(peaks.current[i] - 0.6, bh);
          ctx.fillStyle = lcd ? '#d6ffe4' : `rgba(255,255,255,0.85)`;
          ctx.fillRect(x, h - peaks.current[i] - 3, bw, 2);
        }
      } else if (mode === 'scope') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = lcd ? '#00ff73' : `rgb(${r},${g},${b})`;
        ctx.shadowColor = ctx.strokeStyle as string;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(wave.length / w));
        for (let x = 0, i = 0; i < wave.length; i += step, x += w / (wave.length / step)) {
          const y = (wave[i] / 255) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (mode === 'radial') {
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.22;
        const n = 96;
        let bass = 0;
        for (let i = 0; i < 6; i++) bass += freq[i + 2];
        bass = active ? bass / 6 / 255 : 0;
        const radius = base * (1 + bass * 0.18);
        if (coverImg.current) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.92, 0, Math.PI * 2);
          ctx.clip();
          ctx.translate(cx, cy);
          ctx.rotate(isPlaying ? t / 240 : 0);
          ctx.drawImage(coverImg.current, -radius, -radius, radius * 2, radius * 2);
          ctx.restore();
        }
        ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * radius) / n - 1.5);
        for (let i = 0; i < n; i++) {
          const v = active ? bandValue(i % (n / 2), n / 2) : 0.03;
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const len = v * Math.min(w, h) * 0.26 + 2;
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.45 + v * 0.55})`;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
          ctx.lineTo(cx + Math.cos(a) * (radius + len), cy + Math.sin(a) * (radius + len));
          ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Horizon: synthwave sun that breathes with the bass, a scrolling grid, and the spectrum as mountains.
        const horizon = h * 0.62;
        let bass = 0;
        for (let i = 0; i < 6; i++) bass += freq[i + 2];
        bass = active ? bass / 6 / 255 : 0.1;
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#05010f');
        sky.addColorStop(1, '#2a0838');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, horizon);
        const sunR = Math.min(w, h) * (0.2 + bass * 0.06);
        const sun = ctx.createLinearGradient(0, horizon - sunR * 2, 0, horizon);
        sun.addColorStop(0, '#ffcf33');
        sun.addColorStop(1, '#ff2e6e');
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(w / 2, horizon, sunR, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#05010f';
        for (let k = 0; k < 6; k++) {
          const y = horizon - sunR * (0.12 + k * 0.15);
          ctx.fillRect(w / 2 - sunR, y, sunR * 2, 2 + k * 0.7);
        }
        // mountains
        const n = 48;
        ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.beginPath();
        ctx.moveTo(0, horizon);
        for (let i = 0; i <= n; i++) {
          const idx = i < n / 2 ? i : n - i;
          const v = active ? bandValue(idx, n / 2) : 0.05;
          ctx.lineTo((i / n) * w, horizon - v * h * 0.45);
        }
        ctx.lineTo(w, horizon);
        ctx.closePath();
        ctx.fill();
        // floor grid
        ctx.fillStyle = '#07020e';
        ctx.fillRect(0, horizon, w, h - horizon);
        ctx.strokeStyle = `rgba(255,46,110,${0.5 + bass * 0.5})`;
        ctx.lineWidth = 1;
        const scroll = (t * (0.6 + bass * 2)) % 20;
        for (let k = 0; k < 14; k++) {
          const p = (k * 20 + scroll) / 280;
          const y = horizon + Math.pow(p, 2) * (h - horizon) * 1.05;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let k = -12; k <= 12; k++) {
          ctx.beginPath();
          ctx.moveTo(w / 2 + k * 14, horizon);
          ctx.lineTo(w / 2 + k * w * 0.18, h);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, isPlaying, mode, color, lcd]);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block absolute inset-0" />
    </div>
  );
};
