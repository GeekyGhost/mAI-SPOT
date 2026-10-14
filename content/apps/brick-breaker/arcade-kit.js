// mAI Spot arcade kit: shared by the built-in games (each game folder has its own copy,
// because sandboxed games may only load files from their own folder).
//
//   Arcade.onBest(fn)    called with your best score (the Spot keeps it; games can't store anything)
//   Arcade.score(n)      report a finished game's score (higher is better)
//   Arcade.sfx(name)     little synth sounds: 'blip' 'pick' 'hit' 'boom' 'win' 'lose' 'jump' 'shoot'
//   Arcade.swipe(fn)     touch swipes → fn('up'|'down'|'left'|'right')
//   Esc opens the Spot's pause menu.
(function () {
  let best = 0;
  const fns = [];
  addEventListener('message', e => {
    if (e.data && e.data.type === 'ARCADE_INIT') {
      best = Number(e.data.best) || 0;
      fns.forEach(f => f(best));
    }
  });
  try { parent.postMessage({ type: 'ARCADE_READY' }, '*'); } catch (e) {}
  addEventListener('keydown', e => {
    if (e.key === 'Escape') parent.postMessage({ type: 'ARCADE_ESC' }, '*');
  });

  let ctx = null;
  const tone = (f, d, type = 'square', vol = 0.06, slide = 0) => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, ctx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), ctx.currentTime + d);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + d);
    } catch (e) {}
  };
  const SFX = {
    blip: () => tone(660, 0.05),
    pick: () => { tone(880, 0.06); setTimeout(() => tone(1320, 0.08), 50); },
    hit: () => tone(220, 0.08, 'triangle', 0.08),
    boom: () => tone(160, 0.35, 'sawtooth', 0.08, -120),
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.05), i * 90)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.07), i * 120)),
    jump: () => tone(400, 0.15, 'square', 0.05, 400),
    shoot: () => tone(900, 0.08, 'square', 0.04, -600)
  };
  let muted = false;
  addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') muted = !muted; });

  window.Arcade = {
    get best() { return best; },
    onBest(f) { fns.push(f); f(best); },
    score(n) {
      n = Math.max(0, Math.floor(n || 0));
      if (n > best) best = n;
      try { parent.postMessage({ type: 'ARCADE_SCORE', score: n }, '*'); } catch (e) {}
    },
    sfx(name) { if (!muted && SFX[name]) SFX[name](); },
    swipe(fn) {
      let sx = 0, sy = 0;
      addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return fn('tap');
        fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }, { passive: true });
    }
  };
})();
