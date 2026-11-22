(function (DL) {
  'use strict';

  const TAU = Math.PI * 2;
  const COL = DL.config.players;
  const P = DL.config.palette;
  const E = DL.Engine;
  const SFX = DL.Audio.sfx;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const DEFAULT_FONT = '"InterLocal","Inter","SF Pro Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif';
  const activeFont = () => (DL.UI && typeof DL.UI.activeFont === 'function' ? DL.UI.activeFont() : DEFAULT_FONT);
  const colorsNow = () => S && S.colors ? S.colors : COL;
  const colorFor = (p) => colorsNow()[p] || COL[p];
  const boardFor = (id) => DL.config.boardThemes[id] || DL.config.boardThemes.soft;
  const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ------------------------------------------------------------------ */
  /*  drawing helpers                                                    */
  /* ------------------------------------------------------------------ */

  function rrPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); rrPath(c, x, y, w, h, r); }

  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return 'rgb(' + [0, 1, 2].map((i) => Math.round(x[i] * (1 - t) + y[i] * t)).join(',') + ')';
  }
  function alpha(hex, a) { const x = rgb(hex); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }

  function shapePath(c, shape, x, y, r, ang) {
    c.beginPath();
    if (shape === 'circle') { c.arc(x, y, r, 0, TAU); return; }
    c.save();
    c.translate(x, y);
    if (shape === 'square') {
      c.rotate(ang);
      rrPath(c, -r * 0.95, -r * 0.95, r * 1.9, r * 1.9, r * 0.16);
    } else if (shape === 'diamond') {
      const k = r * 1.22;
      c.moveTo(0, -k); c.lineTo(k, 0); c.lineTo(0, k); c.lineTo(-k, 0); c.closePath();
    } else {
      const k = r * 1.25;
      for (let i = 0; i < 3; i++) {
        const a = ang + (i * TAU) / 3;
        const px = Math.cos(a) * k, py = Math.sin(a) * k;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath();
    }
    c.restore();
  }

  function star(c, x, y, r, fill) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 ? r * 0.45 : r;
      const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
    c.fillStyle = fill; c.fill();
  }
  function bolt(c, x, y, r, fill) {
    const pts = [[0.2, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.25, 1], [0.6, -0.25], [0.05, -0.25]];
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(x + p[0] * r, y + p[1] * r) : c.moveTo(x + p[0] * r, y + p[1] * r)));
    c.closePath();
    c.fillStyle = fill; c.fill();
  }
  function house(c, x, y, r, fill) {
    const pts = [[0, -1], [1, -0.12], [0.68, -0.12], [0.68, 0.88], [-0.68, 0.88], [-0.68, -0.12], [-1, -0.12]];
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(x + p[0] * r, y + p[1] * r) : c.moveTo(x + p[0] * r, y + p[1] * r)));
    c.closePath();
    c.fillStyle = fill; c.fill();
    c.fillStyle = '#fff';
    c.fillRect(x - r * 0.2, y + r * 0.2, r * 0.4, r * 0.68);
  }
  function chevron(c, x, y, a, k, color, w) {
    c.save();
    c.translate(x, y); c.rotate(a);
    c.beginPath();
    c.moveTo(-k * 0.35, -k * 0.55); c.lineTo(k * 0.35, 0); c.lineTo(-k * 0.35, k * 0.55);
    c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  static board (also used for menu previews)                         */
  /* ------------------------------------------------------------------ */

  function drawStatic(c, M, tf, mini, playerColors, boardTheme) {
    const colors = playerColors || COL;
    const B = boardFor(boardTheme || 'soft');
    const s = tf.s;
    const X = (x) => tf.ox + x * s;
    const Y = (y) => tf.oy + y * s;
    const r = M.tileR * s * 0.86;
    const b = M.bounds;
    const px = X(b.minX), py = Y(b.minY), pw = (b.maxX - b.minX) * s, ph = (b.maxY - b.minY) * s;
    const corner = Math.min(pw, ph) * 0.055;

    c.save();
    c.shadowColor = 'rgba(70,95,170,0.20)';
    c.shadowBlur = Math.max(8, r * 2.6);
    c.shadowOffsetY = r * 0.7;
    rr(c, px, py, pw, ph, corner);
    const g = c.createLinearGradient(px, py, px, py + ph);
    g.addColorStop(0, B.background1); g.addColorStop(1, B.background2);
    c.fillStyle = g; c.fill();
    c.restore();
    c.lineWidth = 1; c.strokeStyle = B.frame;
    rr(c, px, py, pw, ph, corner); c.stroke();
    const inset = r * 0.6;
    c.strokeStyle = B.inset;
    rr(c, px + inset, py + inset, pw - inset * 2, ph - inset * 2, Math.max(2, corner - inset * 0.6)); c.stroke();

    // road
    const road = new Path2D();
    M.dense.forEach((q, i) => {
      if (i % 4) return;
      if (i === 0) road.moveTo(X(q.x), Y(q.y)); else road.lineTo(X(q.x), Y(q.y));
    });
    road.closePath();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = B.road; c.lineWidth = r * 2.9; c.stroke(road);
    c.strokeStyle = B.roadLine; c.lineWidth = Math.max(1, r * 0.07);
    c.setLineDash([r * 0.5, r * 0.75]); c.stroke(road); c.setLineDash([]);

    // home lanes
    [0, 1].forEach((p) => {
      const e = M.pts[M.entry[p]];
      c.beginPath();
      c.moveTo(X(e.x), Y(e.y));
      M.lanes[p].forEach((q) => c.lineTo(X(q.x), Y(q.y)));
      c.strokeStyle = colors[p].light; c.lineWidth = r * 2.7; c.stroke();
      c.strokeStyle = colors[p].soft; c.lineWidth = r * 2.2; c.stroke();
    });

    // ring tiles
    for (let i = 0; i < M.n; i++) {
      if (M.junctionSkip && M.junctionSkip.has(i)) continue;
      const x = X(M.pts[i].x), y = Y(M.pts[i].y);
      const sp = M.start.indexOf(i);
      const gp = M.entry.indexOf(i);
      const isJ = M.junction.has(i);
      const shape = isJ ? 'diamond' : M.tile;

      shapePath(c, shape, x, y + r * 0.16, r, M.ang[i]);
      c.fillStyle = 'rgba(70,95,170,0.13)'; c.fill();

      shapePath(c, shape, x, y, r, M.ang[i]);
      c.fillStyle = sp >= 0 ? colors[sp].soft : isJ ? B.junction : '#FFFFFF';
      c.fill();
      c.lineJoin = 'round';
      c.lineWidth = Math.max(1.2, r * (sp >= 0 || gp >= 0 ? 0.13 : 0.09));
      c.strokeStyle = sp >= 0 ? colors[sp].main : gp >= 0 ? colors[gp].main : isJ ? '#BBA9FF' : '#DAE3F5';
      c.stroke();

      if (mini) continue;
      const gs = r * 0.52;
      if (sp >= 0) star(c, x, y, gs * 1.05, colors[sp].deep);
      else if (M.safe.has(i)) star(c, x, y, gs, B.safe);
      else if (M.boost.has(i)) bolt(c, x, y, gs * 1.05, B.boost);
      else if (gp >= 0) chevron(c, x, y, M.laneDir[gp], r * 0.9, colors[gp].deep, Math.max(1.6, r * 0.14));
      else if (isJ) {
        c.strokeStyle = '#A28DFF'; c.lineWidth = Math.max(1.2, r * 0.1);
        c.beginPath(); c.moveTo(x - gs * 0.7, y); c.lineTo(x + gs * 0.7, y); c.moveTo(x, y - gs * 0.7); c.lineTo(x, y + gs * 0.7); c.stroke();
      }
    }

    // lane tiles + home
    [0, 1].forEach((p) => {
      M.lanes[p].forEach((q, i) => {
        const x = X(q.x), y = Y(q.y);
        const last = i === M.lane - 1;
        if (last) {
          c.beginPath(); c.arc(x, y + r * 0.16, r * 1.38, 0, TAU); c.fillStyle = 'rgba(70,95,170,0.13)'; c.fill();
          c.beginPath(); c.arc(x, y, r * 1.38, 0, TAU); c.fillStyle = '#FFFFFF'; c.fill();
          c.lineWidth = Math.max(2, r * 0.16); c.strokeStyle = colors[p].main; c.stroke();
          c.beginPath(); c.arc(x, y, r * 0.98, 0, TAU); c.fillStyle = colors[p].soft; c.fill();
          if (!mini) house(c, x, y - r * 0.05, r * 0.5, colors[p].deep);
        } else {
          shapePath(c, M.tile, x, y + r * 0.12, r * 0.8, M.laneDir[p]);
          c.fillStyle = 'rgba(70,95,170,0.10)'; c.fill();
          shapePath(c, M.tile, x, y, r * 0.8, M.laneDir[p]);
          c.fillStyle = '#FFFFFF'; c.fill();
          c.lineWidth = Math.max(1.2, r * 0.1); c.strokeStyle = colors[p].main; c.stroke();
          if (!mini) chevron(c, x, y, M.laneDir[p], r * 0.7, colors[p].main, Math.max(1.4, r * 0.12));
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  tokens                                                             */
  /* ------------------------------------------------------------------ */

  function drawToken(c, x, y, r, col, o) {
    o = o || {};
    const R = r * (o.s || 1);
    const hop = o.hop || 0;
    c.save();
    c.fillStyle = 'rgba(38,43,66,' + clamp(0.22 - hop * 0.004, 0.06, 0.22) + ')';
    c.beginPath(); c.ellipse(x, y + R * 0.62, R * 0.9, R * 0.34, 0, 0, TAU); c.fill();

    const cy = y - hop - R * 0.12;
    if (o.glow) {
      const pu = (Math.sin(o.t / 170) + 1) / 2;
      c.lineWidth = 2.5;
      c.strokeStyle = alpha(col.main, 0.55 + pu * 0.35);
      c.beginPath(); c.arc(x, cy, R + 4 + pu * 3, 0, TAU); c.stroke();
    }
    // base
    c.fillStyle = col.deep;
    c.beginPath(); c.ellipse(x, cy + R * 0.5, R * 0.92, R * 0.4, 0, 0, TAU); c.fill();
    c.fillStyle = mix(col.deep, '#FFFFFF', 0.25);
    c.beginPath(); c.ellipse(x, cy + R * 0.42, R * 0.92, R * 0.36, 0, 0, TAU); c.fill();
    // body
    const g = c.createRadialGradient(x - R * 0.3, cy - R * 0.35, R * 0.05, x, cy, R * 0.95);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.28, col.light);
    g.addColorStop(0.62, col.main);
    g.addColorStop(1, col.deep);
    c.fillStyle = g;
    c.beginPath(); c.arc(x, cy, R * 0.82, 0, TAU); c.fill();
    c.lineWidth = Math.max(1, R * 0.06);
    c.strokeStyle = alpha(col.deep, 0.55);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.ellipse(x - R * 0.28, cy - R * 0.42, R * 0.22, R * 0.12, -0.6, 0, TAU); c.fill();
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  runtime                                                            */
  /* ------------------------------------------------------------------ */

  let host = null, cv = null, ctx = null;
  let S = null;
  let W = 0, H = 0, dpr = 1;
  let L = { ready: false };
  let disp = {};
  let fx = [];
  let rest = {};
  let hooks = {};
  let last = 0;
  let visualTime = 0;
  let frameHandle = 0;
  let dockSize = 56;
  let tr = 14;
  let animationPaused = false;
  let animationEpoch = 0;
  const ui = { turn: 0, phase: 'idle', legal: null, v: 0, hint: '', canRoll: false };
  const dice = { x: 0, y: 0, rot: 0, hop: 0, face: 1, owner: 0, moving: false, rolling: false, sx: 1, sy: 1 };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  function tween(o, to, ms, hopH) {
    if (reducedMotion()) { o.x = to.x; o.y = to.y; o.hop = 0; return Promise.resolve(true); }
    return new Promise((res) => {
      const sx = o.x, sy = o.y, epoch = animationEpoch;
      let elapsed = 0, lastTick = performance.now();
      function step(t) {
        if (epoch !== animationEpoch) { res(false); return; }
        if (!animationPaused) elapsed += t - lastTick;
        lastTick = t;
        const k = Math.min(1, elapsed / ms);
        const e = easeIO(k);
        o.x = sx + (to.x - sx) * e;
        o.y = sy + (to.y - sy) * e;
        o.hop = hopH ? Math.sin(Math.PI * k) * hopH : 0;
        if (k < 1) requestAnimationFrame(step);
        else { o.x = to.x; o.y = to.y; o.hop = 0; res(true); }
      }
      requestAnimationFrame(step);
    });
  }

  function cancelAnimations() {
    animationEpoch++;
    dice.moving = false;
    dice.rolling = false;
    dice.hop = 0;
    dice.sx = dice.sy = 1;
    disp = {};
    fx = [];
  }

  function init(canvas, h) {
    cv = canvas;
    ctx = cv.getContext('2d');
    host = cv.parentElement;
    hooks = h || {};
    if (globalThis.ResizeObserver) new ResizeObserver(() => layout()).observe(host);
    globalThis.addEventListener('resize', layout);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
  }

  function layout() {
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) { L.ready = false; return; }
    W = Math.floor(rect.width); H = Math.floor(rect.height);
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (!S) return;

    const portrait = H > W;
    if (S.portrait !== portrait) { S.map = DL.Maps.build(S.map.id, portrait); S.portrait = portrait; }
    const M = S.map;
    const pad = clamp(Math.min(W, H) * 0.018, 6, 16);
    const stripH = clamp(Math.min(H * 0.145, W * 0.17), H < 430 ? 42 : 52, 76);
    // The map frame is always square. Player docks attach flush to its top and bottom edges.
    const boardSize = Math.max(72, Math.min(W - pad * 2, H - pad * 2 - stripH * 2));
    const fullH = boardSize + stripH * 2;
    const boardX = (W - boardSize) / 2;
    const boardY = (H - fullH) / 2 + stripH;
    const bw = M.bounds.maxX - M.bounds.minX;
    const bh = M.bounds.maxY - M.bounds.minY;
    const s = Math.min(boardSize / bw, boardSize / bh);
    const ox = boardX + boardSize / 2 - ((M.bounds.minX + M.bounds.maxX) / 2) * s;
    const oy = boardY + boardSize / 2 - ((M.bounds.minY + M.bounds.maxY) / 2) * s;
    tr = clamp(M.tileR * s * 0.86, 5, stripH * 0.22);
    dockSize = clamp(stripH * 0.68, 32, 52);

    const strip = [
      { x: boardX, y: boardY + boardSize, w: boardSize, h: stripH },
      { x: boardX, y: boardY - stripH, w: boardSize, h: stripH }
    ];
    const dock = [
      { x: boardX + boardSize - dockSize / 2 - 7, y: strip[0].y + stripH / 2 },
      { x: boardX + dockSize / 2 + 7, y: strip[1].y + stripH / 2 }
    ];
    const tokenSpan = Math.max(0, boardSize - dockSize - 34 - tr * 2);
    const spacing = S.n > 1 ? Math.min(tr * 2.1, tokenSpan / (S.n - 1)) : 0;
    L = {
      ready: true, pad, stripH, strip, dock, s, ox, oy, spacing, portrait,
      board: { x: boardX, y: boardY, w: boardSize, h: boardSize },
      rowY: [strip[0].y + stripH * 0.32, strip[1].y + stripH * 0.68],
      nameY: [strip[0].y + stripH * 0.78, strip[1].y + stripH * 0.22]
    };

    const cache = document.createElement('canvas');
    cache.width = cv.width; cache.height = cv.height;
    const cc = cache.getContext('2d');
    cc.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(cc, M, { s, ox, oy }, false, colorsNow(), S.boardTheme);
    L.cache = cache;

    if (!dice.moving) { dice.x = dock[dice.owner].x; dice.y = dock[dice.owner].y; }
    startRender();
  }

  const pos = (p, prog) => { const q = E.posOf(S.map, p, prog); return { x: L.ox + q.x * L.s, y: L.oy + q.y * L.s }; };
  function slot(p, i) {
    const R = L.strip[p];
    const inset = 13 + tr;
    return p === 0
      ? { x: R.x + inset + i * L.spacing, y: L.rowY[0] }
      : { x: R.x + R.w - inset - i * L.spacing, y: L.rowY[1] };
  }

  /* ---- effects ---- */
  function burstFx(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.35 + Math.random() * 0.8);
      fx.push({ k: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.2, t: 0, max: 0.45 + Math.random() * 0.45, size: 2 + Math.random() * 3, color });
    }
  }
  function ripple(x, y, color, r1) { fx.push({ k: 'ring', x, y, t: 0, max: 0.5, r1, color }); }

  function drawFx(dt) {
    fx = fx.filter((f) => (f.t += dt) < f.max);
    fx.forEach((f) => {
      const k = f.t / f.max;
      if (f.k === 'ring') {
        ctx.strokeStyle = alpha(f.color, (1 - k) * 0.6);
        ctx.lineWidth = 2 * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r1 * (0.3 + k * 0.9), 0, TAU); ctx.stroke();
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 420 * dt;
        ctx.fillStyle = alpha(f.color, 1 - k);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); ctx.fill();
      }
    });
  }

  /* ---- frame ---- */
  function frame(now) {
    frameHandle = 0;
    const screen = document.getElementById('screen-game');
    if (!S || !screen || !screen.classList.contains('active')) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (!animationPaused && !reducedMotion()) visualTime += dt * 1000;
    draw(visualTime, animationPaused ? 0 : dt);
    frameHandle = requestAnimationFrame(frame);
  }
  function startRender() {
    if (!frameHandle && S) { last = performance.now(); frameHandle = requestAnimationFrame(frame); }
  }

  function computeRest() {
    const groups = {};
    const res = {};
    S.players.forEach((pl, p) => pl.tokens.forEach((t, ti) => {
      const key = p * 10 + ti;
      if (disp[key]) return;
      if (t < 0) { const q = slot(p, ti); res[key] = { x: q.x, y: q.y, s: 1 }; return; }
      const k = E.tileKey(S.map, p, t);
      (groups[k] = groups[k] || []).push([p, ti, t]);
    }));
    for (const k in groups) {
      const arr = groups[k];
      const n = arr.length;
      const base = pos(arr[0][0], arr[0][2]);
      arr.forEach(([p, ti], i) => {
        let ox = 0, oy = 0, sc = 1;
        if (n === 2) { ox = (i ? 1 : -1) * tr * 0.55; sc = 0.84; }
        else if (n > 2) {
          const a = (i / n) * TAU + 0.5;
          const rad = tr * (0.45 + n * 0.1);
          ox = Math.cos(a) * rad; oy = Math.sin(a) * rad; sc = 0.7;
        }
        res[p * 10 + ti] = { x: base.x + ox, y: base.y + oy, s: sc };
      });
    }
    return res;
  }

  function stripLabel(p, now) {
    const pl = S.players[p];
    const R = L.strip[p];
    const active = ui.turn === p && ui.phase !== 'over' && ui.phase !== 'idle';
    const fs = clamp(L.stripH * 0.2, 12, 17);
    const home = pl.tokens.filter((t) => t === S.map.home).length;
    const tail = active && ui.hint ? ui.hint : 'Home ' + home + '/' + S.n + '   Captures ' + pl.stats.captures;
    const y = L.nameY[p];
    const fontFamily = activeFont();
    ctx.textBaseline = 'middle';

    ctx.font = '700 ' + fs + 'px ' + fontFamily;
    const name = pl.bot && pl.name.toLowerCase() === 'robo' ? 'Robo' : pl.name + (pl.bot ? '  ROBO' : '');
    const nw = ctx.measureText(name).width;
    ctx.font = '500 ' + fs * 0.84 + 'px ' + fontFamily;
    const tw = ctx.measureText(tail).width;
    const dotR = fs * 0.3;
    const gap = fs * 0.8;
    const roomW = R.w - dockSize - 40;
    const showTail = nw + dotR * 2 + gap + tw < roomW;

    const draw = (x, align) => {
      ctx.textAlign = align;
      ctx.font = '700 ' + fs + 'px ' + fontFamily;
      ctx.fillStyle = '#252B3D';
      ctx.fillText(name, x, y);
    };
    if (p === 0) {
      let x = R.x + 18;
      ctx.fillStyle = colorFor(p).main; ctx.beginPath(); ctx.arc(x + dotR, y, dotR, 0, TAU); ctx.fill();
      x += dotR * 2 + fs * 0.5;
      draw(x, 'left');
      x += nw + gap;
      if (showTail) { ctx.textAlign = 'left'; ctx.font = '500 ' + fs * 0.84 + 'px ' + fontFamily; ctx.fillStyle = active && ui.hint ? colorFor(p).deep : P.muted; ctx.fillText(tail, x, y); }
    } else {
      let x = R.x + R.w - 18;
      ctx.fillStyle = colorFor(p).main; ctx.beginPath(); ctx.arc(x - dotR, y, dotR, 0, TAU); ctx.fill();
      x -= dotR * 2 + fs * 0.5;
      draw(x, 'right');
      x -= nw + gap;
      if (showTail) { ctx.textAlign = 'right'; ctx.font = '500 ' + fs * 0.84 + 'px ' + fontFamily; ctx.fillStyle = active && ui.hint ? colorFor(p).deep : P.muted; ctx.fillText(tail, x, y); }
    }
  }

  function drawStrips(now) {
    [0, 1].forEach((p) => {
      const R = L.strip[p];
      const c = colorFor(p);
      const active = ui.turn === p && ui.phase !== 'over' && ui.phase !== 'idle';
      ctx.save();
      ctx.shadowColor = active ? alpha(c.main, 0.24) : 'rgba(50,65,100,0.07)';
      ctx.shadowBlur = active ? 13 : 7;
      ctx.shadowOffsetY = p === 0 ? 2 : -2;
      rr(ctx, R.x, R.y, R.w, R.h, Math.min(13, R.h * 0.22));
      ctx.fillStyle = active ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.88)';
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = active ? 1.7 : 1;
      ctx.strokeStyle = active ? c.main : '#E5EAF3';
      rr(ctx, R.x, R.y, R.w, R.h, Math.min(13, R.h * 0.22)); ctx.stroke();

      for (let i = 0; i < S.n; i++) {
        const q = slot(p, i);
        ctx.beginPath(); ctx.arc(q.x, q.y, tr * 0.91, 0, TAU);
        ctx.fillStyle = alpha(c.main, 0.075); ctx.fill();
        ctx.lineWidth = 1.1; ctx.strokeStyle = alpha(c.main, 0.32); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      // The die sits directly in its owner's dock; no pulsing frame surrounds it.
      stripLabel(p, now);
    });
  }

  function drawDice(now) {
    const size = dockSize;
    const x = dice.x, y = dice.y;
    const hop = dice.hop;
    ctx.fillStyle = 'rgba(38,43,66,' + clamp(0.2 - hop / (size * 9), 0.05, 0.2) + ')';
    const sh = 1 - clamp(hop / (size * 4), 0, 0.5);
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.52, size * 0.46 * sh, size * 0.13 * sh, 0, 0, TAU); ctx.fill();

    ctx.save();
    ctx.globalAlpha = dice.opacity == null ? 1 : dice.opacity;
    ctx.translate(x, y - hop);
    ctx.rotate(dice.rot);
    ctx.scale(dice.sx, dice.sy);
    const h = size / 2;
    const modern = S.diceMode === 'drama';
    const ownerColor = colorFor(dice.owner);
    const radius = size * (modern ? 0.29 : 0.19);
    ctx.save();
    ctx.shadowColor = modern ? alpha(ownerColor.deep, 0.34) : 'rgba(70,95,170,0.22)';
    ctx.shadowBlur = size * 0.16; ctx.shadowOffsetY = size * 0.07;
    rr(ctx, -h, -h, size, size, radius);
    const g = ctx.createLinearGradient(-h, -h, h, h);
    if (modern) {
      g.addColorStop(0, ownerColor.light);
      g.addColorStop(0.52, ownerColor.main);
      g.addColorStop(1, ownerColor.deep);
    } else {
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#E7EAF1');
    }
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.lineWidth = modern ? 1.8 : 1.2;
    ctx.strokeStyle = modern ? ownerColor.deep : '#C7D0E1';
    rr(ctx, -h, -h, size, size, radius); ctx.stroke();
    ctx.lineWidth = size * 0.026;
    ctx.strokeStyle = modern ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)';
    rr(ctx, -h + size * 0.055, -h + size * 0.055, size * 0.89, size * 0.89, radius * 0.76); ctx.stroke();
    const o = size * 0.25;
    (PIPS[dice.face] || PIPS[1]).forEach((i) => {
      const px = (i % 3 - 1) * o, py = (Math.floor(i / 3) - 1) * o;
      ctx.beginPath(); ctx.arc(px, py, size * 0.078, 0, TAU);
      ctx.fillStyle = modern ? '#FFFFFF' : '#29344B'; ctx.fill();
    });
    ctx.restore();
  }

  function draw(now, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!S || !L.ready) return;

    ctx.drawImage(L.cache, 0, 0, W, H);
    drawStrips(now);

    // legal move markers
    const legalProgs = ui.phase === 'pick' && ui.legal ? new Set(ui.legal.map((i) => S.players[ui.turn].tokens[i])) : null;
    if (legalProgs) {
      const pu = (Math.sin(now / 220) + 1) / 2;
      ui.legal.forEach((i) => {
        const tk = S.players[ui.turn].tokens[i];
        const q = pos(ui.turn, tk < 0 ? 0 : tk + ui.v);
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = alpha(colorFor(ui.turn).deep, 0.6 + pu * 0.3);
        ctx.beginPath(); ctx.arc(q.x, q.y, tr * (1.25 + pu * 0.12), 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = alpha(colorFor(ui.turn).main, 0.18);
        ctx.fill();
      });
    }

    rest = computeRest();
    const items = [];
    S.players.forEach((pl, p) => pl.tokens.forEach((tk, ti) => {
      const key = p * 10 + ti;
      const d = disp[key];
      if (d) items.push({ p, ti, x: d.x, y: d.y, s: 1, hop: d.hop || 0, top: true });
      else if (rest[key]) items.push({ p, ti, x: rest[key].x, y: rest[key].y, s: rest[key].s, hop: 0 });
    }));
    items.sort((a, b) => (a.top ? 1 : 0) - (b.top ? 1 : 0) || a.y - b.y);
    items.forEach((it) => {
      const glow = legalProgs && it.p === ui.turn && legalProgs.has(S.players[it.p].tokens[it.ti]);
      drawToken(ctx, it.x, it.y, tr, colorFor(it.p), { s: it.s, hop: it.hop, glow, t: now });
    });

    drawFx(dt);
    drawDice(now);
  }

  /* ---- dice animation ---- */
  async function moveDiceTo(p) {
    dice.owner = p;
    dice.moving = false;
    dice.opacity = 1;
    dice.hop = 0;
    dice.sx = dice.sy = 1;
    if (L.ready) {
      const target = L.dock[p];
      dice.x = target.x;
      dice.y = target.y;
    }
  }

  async function rollDice(face, ms) {
    ms = reducedMotion() ? 1 : (ms || 950);
    dice.rolling = true;
    SFX.diceRoll(ms);
    const epoch = animationEpoch;
    let elapsed = 0, lastTick = performance.now();
    const startRot = dice.rot;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 1.4) * TAU;
    let lastFace = 0;
    await new Promise((res) => {
      function step(now) {
        if (epoch !== animationEpoch) { res(); return; }
        if (!animationPaused) elapsed += now - lastTick;
        lastTick = now;
        const k = Math.min(1, elapsed / ms);
        const e = 1 - Math.pow(1 - k, 3);
        dice.rot = startRot + spin * e;
        dice.hop = Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * dockSize * 0.95;
        dice.sx = 1 + 0.1 * Math.sin(k * Math.PI * 6) * (1 - k);
        dice.sy = 1 - 0.1 * Math.sin(k * Math.PI * 6) * (1 - k);
        if (now - lastFace > 45 + k * 120) { dice.face = 1 + Math.floor(Math.random() * 6); lastFace = now; }
        if (k < 1) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
    if (epoch !== animationEpoch) return;
    dice.face = face;
    dice.rot = Math.round(dice.rot / (Math.PI / 2)) * (Math.PI / 2);
    dice.hop = 0;
    dice.sx = 1.12; dice.sy = 0.88;
    await sleep(70);
    if (epoch !== animationEpoch) return;
    dice.sx = 0.97; dice.sy = 1.03;
    await sleep(70);
    dice.sx = 1; dice.sy = 1;
    dice.rolling = false;
    if (face === 6) SFX.six();
  }

  /* ---- token movement ---- */
  async function playMove(plan) {
    const key = plan.p * 10 + plan.ti;
    const epoch = animationEpoch;
    const col = colorFor(plan.p).main;
    const start = plan.from < 0 ? slot(plan.p, plan.ti) : pos(plan.p, plan.from);
    disp[key] = { x: start.x, y: start.y, hop: 0 };
    plan.caps.forEach((c) => { const q = pos(c.p, c.prog); disp[c.p * 10 + c.ti] = { x: q.x, y: q.y, hop: 0 }; });
    if (plan.entered) SFX.pop();

    let n = 0;
    for (let i = 0; i < plan.seq.length; i++) {
      const bs = plan.boosted && i >= plan.seq.length - 3;
      if (bs && i === plan.seq.length - 3) {
        SFX.boost();
        const q = pos(plan.p, plan.seq[i - 1]);
        burstFx(q.x, q.y, '#8E7CF0', 14, 150);
      }
      const to = pos(plan.p, plan.seq[i]);
      await tween(disp[key], to, bs ? 105 : 160, bs ? tr * 0.5 : tr * 0.95);
      if (epoch !== animationEpoch) return;
      SFX.step(n++);
      ripple(to.x, to.y, col, tr * 1.6);
      const cs = plan.caps.filter((c) => c.idx === i);
      if (cs.length) {
        SFX.capture();
        if (globalThis.navigator && navigator.vibrate && (!DL.UI || DL.UI.settings().vibration !== false)) navigator.vibrate(40);
        burstFx(to.x, to.y, colorFor(cs[0].p).main, 26, 230);
        ripple(to.x, to.y, '#FFFFFF', tr * 3);
        await Promise.all(cs.map(async (c) => {
          const k2 = c.p * 10 + c.ti;
          await tween(disp[k2], slot(c.p, c.ti), 620, tr * 3.2);
          if (epoch !== animationEpoch) return;
          delete disp[k2];
        }));
      }
    }
    SFX.land();
    if (plan.reachedHome) {
      const q = pos(plan.p, plan.to);
      SFX.home();
      burstFx(q.x, q.y, DL.config.palette.gold, 30, 220);
      burstFx(q.x, q.y, col, 18, 160);
    }
    delete disp[key];
  }

  /* ---- input ---- */
  function hit(px, py) {
    if (!S || !L.ready) return null;
    if (ui.canRoll && Math.hypot(px - dice.x, py - dice.y) < dockSize * 0.75) return { type: 'dice' };
    if (ui.phase === 'pick' && ui.legal) {
      // Only actual legal token indices are hit-tested. Stacked tokens remain individually selectable.
      for (const ti of ui.legal) {
        const r = rest[ui.turn * 10 + ti];
        if (r && Math.hypot(px - r.x, py - r.y) < tr * 1.6) return { type: 'token', ti };
      }
      for (const ti of ui.legal) {
        const t = S.players[ui.turn].tokens[ti];
        const q = pos(ui.turn, t < 0 ? 0 : t + ui.v);
        if (Math.hypot(px - q.x, py - q.y) < tr * 1.5) return { type: 'token', ti };
      }
    }
    return null;
  }

  const evPt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function onDown(e) { const h = hit(...evPt(e)); if (h && hooks.onTap) hooks.onTap(h); }
  function onMove(e) { cv.style.cursor = hit(...evPt(e)) ? 'pointer' : 'default'; }

  /* ---- public ---- */
  function setState(st) {
    cancelAnimations();
    S = st;
    disp = {}; fx = [];
    dice.owner = st.turn; dice.moving = false; dice.rolling = false; dice.face = 1; dice.rot = 0; dice.hop = 0; dice.opacity = 1;
    layout();
    if (L.ready) { dice.x = L.dock[dice.owner].x; dice.y = L.dock[dice.owner].y; }
    startRender();
  }
  function setUI(patch) { Object.assign(ui, patch); startRender(); }
  function setPaused(value) { animationPaused = !!value; }

  function drawPreview(canvas, mapId, appearance) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, rect.width), h = Math.max(10, rect.height);
    const d = Math.min(globalThis.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    const c = canvas.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    const M = DL.Maps.build(mapId, false);
    const bw = M.bounds.maxX - M.bounds.minX, bh = M.bounds.maxY - M.bounds.minY;
    const side = Math.min(w, h);
    const s = Math.min((side * 0.9) / bw, (side * 0.9) / bh);
    const tf = { s, ox: w / 2 - ((M.bounds.minX + M.bounds.maxX) / 2) * s, oy: h / 2 - ((M.bounds.minY + M.bounds.maxY) / 2) * s };
    const playerColors = appearance && appearance.colors ? appearance.colors : COL;
    const boardTheme = appearance && appearance.boardTheme ? appearance.boardTheme : 'soft';
    drawStatic(c, M, tf, w < 200, playerColors, boardTheme);
    [0, 1].forEach((p) => {
      const q = M.pts[M.start[p]];
      drawToken(c, tf.ox + q.x * s, tf.oy + q.y * s, M.tileR * s * 0.86, playerColors[p], { t: 0 });
    });
  }

  DL.Renderer = { init, setState, setUI, setPaused, cancelAnimations, refresh: layout, moveDiceTo, rollDice, playMove, drawPreview, isReady: () => L.ready };
})(globalThis.DL = globalThis.DL || {});
