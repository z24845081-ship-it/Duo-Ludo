(function (DL) {
  'use strict';

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let echo = null;
  let noise = null;
  let muted = false;
  let musicTimer = null;
  let sfxVolume = 0.8;
  let musicVolume = 0.45;
  let gestureHooked = false;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function ensure() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxVolume;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicVolume;
      musicBus.connect(master);

      echo = ctx.createDelay(1);
      echo.delayTime.value = 0.2;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      echo.connect(fb); fb.connect(echo);
      echo.connect(wet); wet.connect(master);

      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch (e) { /* ignore resume errors before user gesture */ }
    }
    if (!gestureHooked && typeof document !== 'undefined') {
      gestureHooked = true;
      const resumeOnGesture = () => {
        if (ctx && ctx.state === 'suspended') {
          try {
            const p = ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) { /* ignore */ }
        }
      };
      document.addEventListener('pointerdown', resumeOnGesture, { passive: true });
      document.addEventListener('keydown', resumeOnGesture, { passive: true });
    }
    return true;
  }

  function tone(o) {
    const t = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const vol = o.vol == null ? 0.2 : o.vol;
    const att = o.att == null ? 0.004 : o.att;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.echo) g.connect(echo);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  function burst(o) {
    const t = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type || 'bandpass';
    filt.frequency.setValueAtTime(o.f, t);
    if (o.to) filt.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    filt.Q.value = o.q == null ? 1 : o.q;
    const g = ctx.createGain();
    const vol = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.att || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filt); filt.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 0.5, o.dur + 0.05);
  }

  const guard = (fn) => (...a) => { if (muted || !ensure()) return; fn(...a); };
  const PENT = [0, 2, 4, 7, 9];

  const sfx = {
    click: guard(() => {
      tone({ f: 880, to: 620, dur: 0.05, vol: 0.09, type: 'triangle' });
      burst({ f: 3200, dur: 0.02, vol: 0.05, q: 1.5 });
    }),
    pop: guard(() => {
      tone({ f: 420, to: 900, dur: 0.1, vol: 0.14, type: 'sine' });
    }),
    whoosh: guard(() => {
      burst({ f: 500, to: 1800, dur: 0.22, vol: 0.09, q: 0.8, att: 0.06 });
      tone({ f: 320, to: 480, dur: 0.14, vol: 0.05 });
    }),
    diceRoll: guard((ms) => {
      const total = ms / 1000;
      let t = 0;
      let gap = 0.04;
      while (t < total - 0.08) {
        const fade = 1 - (t / total) * 0.45;
        burst({ at: t, f: 1500 + Math.random() * 2200, dur: 0.05, vol: 0.25 * fade, q: 2.8 });
        tone({ at: t, f: 150 + Math.random() * 70, to: 70, dur: 0.07, vol: 0.2 * fade, type: 'triangle' });
        t += gap;
        gap *= 1.12;
      }
      tone({ at: total - 0.04, f: 120, to: 44, dur: 0.22, vol: 0.32 });
      burst({ at: total - 0.04, f: 380, dur: 0.16, vol: 0.13, type: 'lowpass' });
    }),
    step: guard((n) => {
      const k = n % 10;
      const f = midi(67 + PENT[k % 5] + 12 * Math.floor(k / 5));
      tone({ f, dur: 0.11, vol: 0.2, type: 'triangle' });
      tone({ f: 190, to: 95, dur: 0.07, vol: 0.24 });
      burst({ f: 3400, dur: 0.02, vol: 0.1, q: 2 });
    }),
    land: guard(() => {
      tone({ f: 150, to: 70, dur: 0.12, vol: 0.24 });
      burst({ f: 700, dur: 0.07, vol: 0.12, type: 'lowpass' });
    }),
    capture: guard(() => {
      burst({ f: 1100, to: 140, dur: 0.38, vol: 0.34, type: 'lowpass', q: 0.7 });
      tone({ f: 330, to: 52, dur: 0.42, vol: 0.23, type: 'sawtooth' });
      tone({ f: 740, to: 200, dur: 0.16, vol: 0.14, type: 'square' });
      tone({ at: 0.14, f: midi(60), dur: 0.3, vol: 0.12, type: 'triangle', echo: true });
      tone({ at: 0.28, f: midi(55), dur: 0.4, vol: 0.12, type: 'triangle', echo: true });
    }),
    boost: guard(() => {
      burst({ f: 300, to: 4200, dur: 0.5, vol: 0.25, q: 1.1, att: 0.1 });
      tone({ f: 220, to: 1100, dur: 0.45, vol: 0.14, type: 'sawtooth' });
      tone({ at: 0.4, f: midi(84), dur: 0.25, vol: 0.14, echo: true });
    }),
    six: guard(() => {
      [72, 76, 79, 84, 88].forEach((n, i) => tone({ at: i * 0.055, f: midi(n), dur: 0.35, vol: 0.14, type: 'triangle', echo: true }));
    }),
    extra: guard(() => {
      tone({ f: midi(79), dur: 0.16, vol: 0.14, type: 'triangle', echo: true });
      tone({ at: 0.1, f: midi(86), dur: 0.28, vol: 0.14, type: 'triangle', echo: true });
    }),
    home: guard(() => {
      [72, 76, 79, 84, 88].forEach((n, i) => tone({ at: i * 0.085, f: midi(n), dur: 0.5, vol: 0.18, echo: true }));
      burst({ at: 0.35, f: 6000, dur: 0.4, vol: 0.06, type: 'highpass', q: 0.5 });
    }),
    nomove: guard(() => {
      tone({ f: 260, to: 170, dur: 0.22, vol: 0.14, type: 'triangle' });
    }),
    win: guard(() => {
      const chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]];
      chords.forEach((c, i) => c.forEach((n) => {
        tone({ at: i * 0.22, f: midi(n), dur: i === 3 ? 1.6 : 0.4, vol: 0.12, type: 'triangle', echo: true });
        tone({ at: i * 0.22, f: midi(n - 12), dur: i === 3 ? 1.6 : 0.4, vol: 0.06 });
      }));
      burst({ at: 0.66, f: 5000, dur: 0.9, vol: 0.08, type: 'highpass' });
    })
  };

  /* ---- result music: a gentle generative loop ---- */
  const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]];
  const BAR = 2.4;

  function playBar(bar, at) {
    const rel = at - ctx.currentTime;
    const c = CHORDS[bar % CHORDS.length];
    c.forEach((n) => tone({ at: rel, f: midi(n - 12), dur: BAR + 0.3, vol: 0.05, att: 0.5, bus: musicBus }));
    tone({ at: rel, f: midi(c[0] - 24), dur: BAR * 0.5, vol: 0.13, bus: musicBus });
    tone({ at: rel + BAR / 2, f: midi(c[0] - 24), dur: BAR * 0.5, vol: 0.1, bus: musicBus });
    const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
    pattern.forEach((idx, i) => {
      tone({ at: rel + (i * BAR) / 8, f: midi(c[idx] + 12), dur: 0.5, vol: 0.085, type: 'triangle', bus: musicBus, echo: true });
    });
    if (bar % 4 === 3) tone({ at: rel + BAR * 0.75, f: midi(c[3] + 24), dur: 0.9, vol: 0.06, bus: musicBus, echo: true });
  }

  function startMusic() {
    if (muted || musicTimer || !ensure()) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(musicVolume, ctx.currentTime + 1.5);
    let next = ctx.currentTime + 0.1;
    let bar = 0;
    const pump = () => {
      while (next < ctx.currentTime + 1.5) { playBar(bar++, next); next += BAR; }
    };
    pump();
    musicTimer = setInterval(pump, 400);
  }

  function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer);
    musicTimer = null;
    if (ctx) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03);
    if (muted) stopMusic();
  }

  function setVolumes(sfx, music) {
    sfxVolume = Math.max(0, Math.min(1, Number(sfx) || 0));
    musicVolume = Math.max(0, Math.min(1, Number(music) || 0));
    if (ctx && sfxBus && musicBus) {
      sfxBus.gain.setTargetAtTime(sfxVolume, ctx.currentTime, 0.04);
      if (!musicTimer) musicBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.04);
    }
  }

  function suspend() {
    if (ctx && ctx.state === 'running') {
      try {
        const res = ctx.suspend();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch (e) { /* ignore */ }
    }
  }

  function resumeIfNeeded() {
    if (!muted && ctx && ctx.state === 'suspended') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch (e) { /* ignore */ }
    }
  }

  DL.Audio = {
    sfx,
    unlock: ensure,
    startMusic,
    stopMusic,
    setMuted,
    setVolumes,
    suspend,
    resumeIfNeeded,
    isMuted: () => muted
  };
})(globalThis.DL = globalThis.DL || {});
